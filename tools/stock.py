"""Stock CS2 tiling materials for the procedural props: which Valve material each chart material maps to and how its UVs are laid out.
Faces on these charts skip the atlas bake and get real-scale tiling UVs (per face corner) instead.

modes: plank  - board parts (part frame x = length, y = width, z = thickness) mapped onto one board strip of a boards texture
       box    - model-space box projection, S units per texture tile
       cyl    - around the part's long axis (posts, trunks), S units per tile
"""
import os
import numpy as np

STOCK = {
    'boards': dict(vmat='materials/de_train/hr_train_s2/wood/hrts2_wood_floor_boards_02_wet.vmat', mode='plank', strips=4, tex=(1024, 512), box_S=64.0),
    'rust': dict(vmat='materials/de_overpass/metal/rusty_metal_1.vmat', mode='box', S=96.0),
    'mud': dict(vmat='materials/de_ancient/hr_ancient_ground_mud_03_wet.vmat', mode='box', S=160.0),
    'bark': dict(vmat='materials/models/tw/stock/bark_maple.vmat', mode='cyl', S=72.0),
}

# chart material -> stock key, per prop (prefix match on the prop name)
ASSIGN = [
    ('revet_', {'wood': 'boards', 'bark': 'bark', 'earth': 'mud', 'galv': 'rust'}),
    ('firestep', {'wood': 'boards', 'bark': 'bark'}),
    ('duckboard', {'wood': 'boards'}),
    ('ladder', {'wood': 'boards'}),
    ('shelter', {'wood': 'boards', 'earth': 'mud', 'galv': 'rust'}),
    ('hangar', {'wood': 'boards'}),
    ('plotting_table', {'wood': 'boards'}),
    ('tree_shattered', {'bark': 'bark'}),
    ('stump_', {'bark': 'bark'}),
    ('log_fallen', {'bark': 'bark', 'earth': 'mud'}),
    ('cheval', {'bark': 'bark'}),
]


def assign(name):
    for pre, m in ASSIGN:
        if name.startswith(pre): return m
    return {}


def _face_data(mesh, fsel):
    F = mesh.F[fsel]; P = mesh.V[F]                      # (n,3,3)
    n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return F, P, n


def _rng_off(k, salt):
    r = np.random.RandomState((k * 7919 + salt) % (2 ** 31))
    return r.rand(), r.rand(), r.randint(1 << 16)


def uv_for(mesh, fsel, key):
    """per-corner uv (n,3,2) in image convention (v from the top) for the selected faces"""
    cfg = STOCK[key]
    idx = np.nonzero(fsel)[0]
    out = np.zeros((len(idx), 3, 2))
    F, P, N = _face_data(mesh, fsel)
    parts = mesh.FP[fsel]
    for p in np.unique(parts):
        sel = parts == p
        part = mesh.parts[p]
        R = np.asarray(part['R'], float); o = np.asarray(part['o'], float)
        ou, ov, ri = _rng_off(int(p), len(mesh.V))
        if cfg['mode'] == 'plank' and 'grain' in part:
            L = (P[sel] - o) @ R                           # local coords per corner
            nl = N[sel] @ R
            ext = L.reshape(-1, 3); lo, hi = ext.min(0), ext.max(0)
            w = max(hi[1] - lo[1], 1e-3); th = max(hi[2] - lo[2], 1e-3)
            k = ri % cfg['strips']; s0 = (k + 0.04) / cfg['strips']; s1 = (k + 0.96) / cfg['strips']
            ppu = (s1 - s0) * cfg['tex'][1] / w            # texture px per unit across the board
            us = ppu / cfg['tex'][0]
            u = L[..., 0] * us + ou
            ax = np.abs(nl).argmax(1)
            v = np.where(ax[:, None] == 2, s0 + (L[..., 1] - lo[1]) / w * (s1 - s0),
                         np.where(ax[:, None] == 1, s0 + (L[..., 2] - lo[2]) / w * (s1 - s0),
                                  s0 + (L[..., 1] - lo[1]) / w * (s1 - s0)))
            u = np.where(ax[:, None] == 0, (L[..., 2] - lo[2]) * us + ou, u)
            out[sel] = np.stack([u, v], -1)
        elif cfg['mode'] == 'cyl':
            Q = P[sel].reshape(-1, 3)
            c = Q.mean(0); _, _, vt = np.linalg.svd(Q - c, full_matrices=False); a = vt[0]
            b1 = np.cross(a, [0, 0, 1.0] if abs(a[2]) < 0.9 else [1.0, 0, 0]); b1 /= np.linalg.norm(b1); b2 = np.cross(a, b1)
            D = P[sel] - c
            h = D @ a; ang = np.arctan2(D @ b2, D @ b1)
            r = np.sqrt((D @ b1) ** 2 + (D @ b2) ** 2).mean()
            # unwrap per face so no face straddles the seam
            ang = np.where(ang - ang[:, :1] > np.pi, ang - 2 * np.pi, np.where(ang - ang[:, :1] < -np.pi, ang + 2 * np.pi, ang))
            S = cfg['S']
            out[sel] = np.stack([ang * max(r, 2.0) / S + ou, h / S + ov], -1)
        else:
            S = cfg.get('S', cfg.get('box_S', 64.0))
            ax = np.abs(N[sel]).argmax(1)
            Q = P[sel]
            uu = np.where(ax[:, None] == 0, Q[..., 1], Q[..., 0])
            vv = np.where(ax[:, None] == 2, Q[..., 1], -Q[..., 2])
            out[sel] = np.stack([uu / S + ou, vv / S + ov], -1)
    return out


def export_bark(outdir):
    """writes materials/models/tw/stock/bark_maple.vmat + textures decoded from the game's maple bark (csgo_complex, no wind)"""
    import vtexread as V
    from PIL import Image
    rel = 'materials/models/tw/stock'
    d = os.path.join(outdir, rel); os.makedirs(d, exist_ok=True)
    base = 'models/foliage/trees/maple/maple_01/'
    refs = V.refs(V.vpk_read(base + 'maple_tree_bark_1.vmat_c'))
    got = {}
    for r in refs:
        for k in ('color', 'normal', 'ao'):
            if '_%s_' % k in r: got[k] = r
    col = V.decode_vtex(V.vpk_read(got['color'] + '_c')).convert('RGB')
    col.save(os.path.join(d, 'bark_maple_color.png'))
    nrm = np.asarray(V.decode_vtex(V.vpk_read(got['normal'] + '_c')).convert('RGBA'), np.float32) / 255.0
    x, y = nrm[..., 0] * 2 - 1, nrm[..., 1] * 2 - 1
    z = np.sqrt(np.clip(1 - x * x - y * y, 0, 1))
    Image.fromarray((np.stack([x, y, z], -1) * 127.5 + 127.5).clip(0, 255).astype(np.uint8)).save(os.path.join(d, 'bark_maple_normal.png'))
    if 'ao' in got: V.decode_vtex(V.vpk_read(got['ao'] + '_c')).convert('L').save(os.path.join(d, 'bark_maple_ao.png'))
    lines = ['// maple bark from the CS2 game files (Valve), re-used without wind animation for mg_trenchwarfare posts and trunks', '',
             'Layer0', '{', '\tshader "csgo_complex.vfx"', '\tF_SPECULAR 1',
             '\tTextureColor "%s/bark_maple_color.png"' % rel, '\tTextureNormal "%s/bark_maple_normal.png"' % rel,
             '\tTextureRoughness "[0.900000 0.900000 0.900000 0.000000]"', '\tg_flMetalness "0.000"']
    if 'ao' in got: lines += ['\tTextureAmbientOcclusion "%s/bark_maple_ao.png"' % rel]
    lines += ['\tg_vColorTint "[0.820000 0.800000 0.760000 0.000000]"', '}']
    open(os.path.join(d, 'bark_maple.vmat'), 'w', newline='\n').write('\n'.join(lines) + '\n')
