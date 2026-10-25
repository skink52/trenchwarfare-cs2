"""Renders part of the generated map (terrain + parapets + our props with their baked textures) to check placement.
usage: preview_scene.py <vmap> <out.png> cx cy radius eye_x eye_y eye_z [target_z]"""
import os, sys, json, math
import numpy as np
from PIL import Image
import dmx, layout as LY, geo, render

VMAP, OUTP = sys.argv[1], sys.argv[2]
cx, cy, rad, ex, ey, ez = map(float, sys.argv[3:9]); tz = float(sys.argv[9]) if len(sys.argv) > 9 else 0
ADDON = os.path.join(os.path.dirname(VMAP), '..')
d = dmx.DMX.load(VMAP)
cache = {}
def load_model(model):
    if model in cache: return cache[model]
    rel = model[:-5]
    name = os.path.basename(rel)
    smd = os.path.join(ADDON, rel + '_lod0.smd')
    if not os.path.exists(smd): smd = os.path.join(ADDON, rel + '.smd')
    if not os.path.exists(smd): cache[model] = None; return None
    V, N, T = [], [], []
    with open(smd) as f:
        tri = False
        for line in f:
            if line.startswith('triangles'): tri = True; continue
            if not tri or line.startswith('end'): continue
            p = line.split()
            if len(p) < 9: continue
            V.append((-float(p[2]), float(p[1]), float(p[3]))); N.append((-float(p[5]), float(p[4]), float(p[6]))); T.append((float(p[7]), 1 - float(p[8])))
    m = geo.Mesh(); m.V = np.array(V); m.N = np.array(N); m.T = np.zeros((len(V), 2))
    m.F = np.arange(len(V)).reshape(-1, 3)
    uv = np.array(T)
    md = os.path.join(ADDON, 'materials', os.path.dirname(rel).replace('models/', 'models/', 1))
    tdir = os.path.join(ADDON, 'materials', rel.replace('models/', 'models/', 1).rsplit('/', 1)[0])
    def ld(suffix, default, mode='RGB'):
        p = os.path.join(tdir, '%s_%s.png' % (name, suffix))
        if not os.path.exists(p): return default
        a = np.asarray(Image.open(p).convert(mode).resize((512, 512)), np.float32) / 255.0
        return a
    bk = dict(color=ld('color', np.full((4, 4, 3), 0.5)), normal=ld('normal', None), rough=ld('rough', np.full((4, 4), 0.8), 'L'),
              ao=ld('ao', np.ones((4, 4)), 'L'), metal=ld('metal', np.zeros((4, 4)), 'L'))
    if bk['normal'] is None: bk['normal'] = np.tile([0.5, 0.5, 1.0], (4, 4, 1))
    bk['normal'] = bk['normal'] * 2 - 1
    for k in ('color', 'rough', 'ao', 'metal', 'normal'):
        a = bk[k]
        if a.shape[0] != 512: bk[k] = np.asarray(Image.fromarray((np.clip(a if k != 'normal' else a * 0.5 + 0.5, 0, 1) * 255).astype(np.uint8)).resize((512, 512)), np.float32) / 255 if a.ndim == 3 else np.full((512, 512), float(a.mean()))
        if k == 'normal' and bk[k].max() > 0.99 and a.shape[0] != 512: bk[k] = bk[k] * 2 - 1
    cache[model] = (m, uv, bk)
    return cache[model]

scene = []
for c in d.root.get('world').get('children'):
    if c.type != 'CMapEntity': continue
    ep = c.get('entity_properties')
    if ep.get('classname') != 'prop_static': continue
    o = c.get('origin')
    if abs(o[0] - cx) > rad or abs(o[1] - cy) > rad: continue
    mdl = load_model(ep.get('model'))
    if mdl is None: continue
    m, uv, bk = mdl
    a = c.get('angles'); s = c.get('scales')
    R = geo.euler(a[1], a[0], a[2]) @ np.diag(s)
    mm = geo.Mesh(); mm.V = m.V @ R.T + np.array(o); mm.N = m.N @ geo.euler(a[1], a[0], a[2]).T; mm.F = m.F; mm.T = m.T
    scene.append((mm, uv, bk))
# terrain + parapets
xs = np.arange(cx - rad, cx + rad + 1, 16.0); ys = np.arange(cy - rad, cy + rad + 1, 16.0)
X, Y = np.meshgrid(xs, ys, indexing='ij')
for layer in ('main', 'par'):
    if layer == 'main': Z = LY.height(X, Y); valid = np.ones((len(xs) - 1, len(ys) - 1), bool)
    else:
        Z, D = LY.parapet(X, Y); ok = (D >= 2) & (D <= 116); valid = ok[:-1, :-1] & ok[1:, :-1] & ok[:-1, 1:] & ok[1:, 1:]
    V = np.stack([X, Y, Z], -1).reshape(-1, 3)
    idx = np.arange(len(V)).reshape(X.shape)
    F = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            if not valid[i, j]: continue
            a_, b_, c_, d_ = idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1]
            F += [(a_, b_, c_), (a_, c_, d_)]
    if not F: continue
    m = geo.Mesh(); m.V = V; m.F = np.array(F); m.T = np.zeros((len(V), 2)); m.recompute_normals(weld=False)
    col = np.full((8, 8, 3), (0.33, 0.27, 0.21) if layer == 'main' else (0.38, 0.31, 0.24))
    bk = dict(color=col, normal=np.tile([0, 0, 1.0], (8, 8, 1)), rough=np.full((8, 8), 0.9), ao=np.ones((8, 8)), metal=np.zeros((8, 8)))
    scene.append((m, np.zeros((len(V), 2)), bk))
for pe in os.environ.get('PLAYERS', '').split(';'):
    if not pe: continue
    px, py, pz = map(float, pe.split(','))
    b = geo.rbox(32, 32, 72, r=2, seg=1, center=(px, py, pz + 36))
    b.T = np.zeros((len(b.V), 2))
    scene.append((b, np.zeros((len(b.V), 2)), dict(color=np.full((8, 8, 3), (0.2, 0.35, 0.8)), normal=np.tile([0, 0, 1.0], (8, 8, 1)), rough=np.full((8, 8), 0.6), ao=np.ones((8, 8)), metal=np.zeros((8, 8)))))
img = render.render(scene, (ex, ey, ez), (cx, cy, tz), 1280, 760, fov=60)
Image.fromarray(img).save(OUTP)
print('rendered %d objects' % len(scene))
