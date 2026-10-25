"""Writes mg_trenchwarfare.vmap: terrain, trenches, no man's land, mortar pits, airfields, forest, lobby, lighting, fog,
script/HUD entities, teleports, clips and vis hints. Everything generated is in vis group "tw_gen"; re-running on a map
edited in Hammer replaces only that group.

usage: make_map.py <template_or_current.vmap> <out.vmap> <addon_content_out>
"""
import os, sys, json, math, copy
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
import dmx
from dmx import T_STRING, T_VEC3
import vmaplib
from vmaplib import ent
import vmesh
import layout as LY
from noise import fbm, hash01

SRC, OUTPATH, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
GROUP = 'tw_gen'
NAME = 'mg_trenchwarfare'
rng = np.random.RandomState(1916)

d = dmx.DMX.load(SRC)
root = d.root
world = root.get('world')
vmaplib.init(d, OUT)

# ---------------------------------------------------------------- template entities to clone (full key sets)
TPL = {}
for c in world.get('children'):
    if c.type == 'CMapEntity':
        cls = c.get('entity_properties').get('classname')
        TPL.setdefault(cls, c)


def clone(cls, origin, angles=(0, 0, 0), **keys):
    e = ent(cls, origin, angles, group=GROUP)
    if cls in TPL:
        src = TPL[cls].get('entity_properties')
        props = e.get('entity_properties')
        have = {a[0] for a in props.attrs}
        for a in src.attrs:
            if a[0] not in have and a[0] != 'targetname': props.attrs.append([a[0], a[1], a[2]])
        for k, v in keys.items():
            props.set(k, T_STRING, str(v))
    return e


def setscale(e, s):
    e.attr('scales')[2] = tuple(float(x) for x in s)


MATS = dict(
    mud_wet='materials/de_ancient/hr_ancient_ground_mud_03_wet.vmat', mud2='materials/de_ancient/hr_ancient_ground_mud_01_wet.vmat',
    mud_base='materials/de_ancient/hr_ancient_ground_mud_03_base.vmat', dirt2='materials/de_ancient/hr_ancient_ground_dirt_02_wet.vmat',
    dirt3='materials/de_ancient/hr_ancient_ground_dirt_03_wet.vmat', dirt1='materials/de_ancient/hr_ancient_ground_dirt_01_base.vmat',
    dirt4='materials/de_ancient/hr_ancient_ground_dirt_04_base.vmat', grass1='materials/de_ancient/hr_ancient_ground_grass_01_base.vmat',
    grass2='materials/de_ancient/hr_ancient_ground_grass_02_wet.vmat', moss='materials/de_ancient/hr_ancient_ground_moss_02_base.vmat',
    grassw='materials/de_ancient/hr_ancient_ground_grass_01_wet.vmat')
NODRAW = 'materials/tools/toolsnodraw.vmat'; PCLIP = 'materials/tools/toolsplayerclip.vmat'; SKY = 'materials/tools/toolsskybox.vmat'
WATER = 'materials/de_aztec/hr_aztec/hr_aztec_water_shallow.vmat'
for m in MATS.values(): vmesh.TEX_SIZE[m] = (1024, 1024)


BLEND_BATTLE = 'materials/de_ancient/hr_ancient_blend_groundmud03-groundgrass_01_wet.vmat'   # A mud, B grass
BLEND_FOREST = 'materials/de_ancient/hr_ancient_blend_groundgrass01-grounddirt01-wet.vmat'    # A grass, B dirt
for m in (BLEND_BATTLE, BLEND_FOREST): vmesh.TEX_SIZE[m] = (1024, 1024)


def in_battle(x, y):
    return (abs(x) < 4096) & (abs(y) < 4608)


def terrain_paint(X, Y, Z, D=None):
    """per-vertex blend weight (x channel) and tint; battle zone: 0 mud -> 1 grass, forest: 0 grass -> 1 dirt"""
    X = np.asarray(X, float); Y = np.asarray(Y, float)
    ax, ay = np.abs(X), np.abs(Y)
    n1 = fbm(X / 900.0, Y / 900.0, 0.3, 4, seed=21); n2 = fbm(X / 220.0, Y / 220.0, 1.3, 3, seed=22)
    # distance outside the churned core (no man's land + trenches + mortar line)
    dx = np.maximum(ax - 2500, 0); dy = np.maximum(ay - 3350, 0)
    core = np.sqrt(dx ** 2 + dy ** 2)
    pits = np.full(X.shape, 1e9)
    for s in (-1, 1):
        for my in LY.MORTAR_Y:
            pits = np.minimum(pits, np.hypot(X - s * LY.MORTAR_X, Y - my))
    g = np.clip(core / 1100.0 + 0.35 * n1 + 0.15 * n2, 0, 1)
    g = g * np.clip((pits - 180) / 300.0, 0, 1)
    g = np.where((ax > 3700) | (ay > 4300), np.maximum(g, np.clip(((np.maximum(ax - 3700, 0) + np.maximum(ay - 4300, 0)) / 300.0), 0, 1)), g)
    if D is not None: g = np.where(D < 48, 0.0, g)
    # forest: dirt patches and tracks, the airfield stays grass
    f = np.clip((n1 - 0.05) * 2.2 + 0.6 * n2, 0, 1)
    air = (ax > 4300) & (ax < 6950) & (ay < 1150)
    f = np.where(air, np.clip(0.25 * n2, 0, 1), f)
    f = np.where((ax < 4400) & (ay < 4900), np.minimum(f, np.clip(((np.maximum(ax - 4096, 0)) + np.maximum(ay - 4608, 0)) / 300.0, 0, 1)), f)
    w = np.where(in_battle(X, Y), g, f)
    t = np.clip(0.86 + 0.12 * n1 + 0.06 * n2, 0.7, 1.0)
    t = np.where(in_battle(X, Y) & (w < 0.3), t * 0.94, t)
    paint = np.stack([w, np.zeros_like(w), np.full(w.shape, 0.35), np.zeros_like(w)], -1)
    tint = np.stack([t, t, t, np.ones_like(t)], -1)
    return paint, tint


# ---------------------------------------------------------------- terrain tiles (open sheets), crack-free LOD seams
TILE = 512
def tile_res(cx, cy):
    ax, ay = abs(cx), abs(cy)
    if ax - TILE / 2 < 2560 and ay - TILE / 2 < 3500: return 32
    for s in (-1, 1):
        for my in LY.MORTAR_Y:
            if abs(cx - s * LY.MORTAR_X) < 520 and abs(cy - my) < 520: return 32
    if ax - TILE / 2 < 4400 and ay - TILE / 2 < 4600: return 64
    return 128

tiles = {}
for tx in range(-LY.MAP_X, LY.MAP_X, TILE):
    for ty in range(-LY.MAP_Y, LY.MAP_Y, TILE):
        tiles[(tx, ty)] = tile_res(tx + TILE / 2, ty + TILE / 2)

nquads = 0
for (tx, ty), r in tiles.items():
    n = TILE // r
    xs = tx + np.arange(n + 1) * r; ys = ty + np.arange(n + 1) * r
    X, Y = np.meshgrid(xs.astype(float), ys.astype(float), indexing='ij')
    Z = LY.height(X, Y)
    # match coarser neighbours along the shared edge (linear between their vertices)
    for (dx, dy, edge) in ((-1, 0, 'x0'), (1, 0, 'x1'), (0, -1, 'y0'), (0, 1, 'y1')):
        nb = tiles.get((tx + dx * TILE, ty + dy * TILE))
        if nb is None or nb <= r: continue
        k = nb // r
        if edge in ('x0', 'x1'):
            i = 0 if edge == 'x0' else n
            col = Z[i].copy()
            for j in range(n + 1):
                j0 = (j // k) * k; j1 = min(j0 + k, n); t = (j - j0) / k if j1 > j0 else 0
                col[j] = Z[i, j0] * (1 - t) + Z[i, j1] * t
            Z[i] = col
        else:
            j = 0 if edge == 'y0' else n
            row = Z[:, j].copy()
            for i in range(n + 1):
                i0 = (i // k) * k; i1 = min(i0 + k, n); t = (i - i0) / k if i1 > i0 else 0
                row[i] = Z[i0, j] * (1 - t) + Z[i1, j] * t
            Z[:, j] = row
    dd, _ = LY.trench_dist(X, Y)
    PA, TI = terrain_paint(X, Y, Z, dd)
    def fm(i, j, X=X, Y=Y):
        cx = (X[i, j] + X[i + 1, j + 1]) / 2; cy = (Y[i, j] + Y[i + 1, j + 1]) / 2
        return BLEND_BATTLE if in_battle(cx, cy) else BLEND_FOREST
    verts, faces, mats, (pa, ti) = vmesh.grid_sheet(X, Y, Z, fm, vert_attr=(PA, TI))
    vmesh.mesh_node(vmesh.polymesh_open(verts, faces, mats, paint=pa, tint=ti), GROUP, bake=True, shadows=True)
    nquads += len(faces)
print('terrain: %d tiles, %d quads' % (len(tiles), nquads))


def surf_z(x, y, pad=24.0):
    """highest terrain-mesh vertex within pad of (x, y): spawn points sit above it so nobody starts inside the earth"""
    best = -1e9
    for qx in (x - pad, x, x + pad):
        for qy in (y - pad, y, y + pad):
            tx = int(math.floor(qx / TILE) * TILE); ty = int(math.floor(qy / TILE) * TILE)
            r = tiles.get((tx, ty))
            if r is None: continue
            x0 = tx + math.floor((qx - tx) / r) * r; y0 = ty + math.floor((qy - ty) / r) * r
            cx_ = np.array([x0, x0 + r, x0, x0 + r], float); cy_ = np.array([y0, y0, y0 + r, y0 + r], float)
            z00, z10, z01, z11 = LY.height(cx_, cy_)
            u, v = (qx - x0) / r, (qy - y0) / r
            zb = z00 * (1 - u) * (1 - v) + z10 * u * (1 - v) + z01 * (1 - u) * v + z11 * u * v
            best = max(best, float(zb) + 0.25 * float(max(z00, z10, z01, z11) - zb))   # quads are split either way
    return best

# ---------------------------------------------------------------- parapet / parados layer over the trench banks
def fix_pinches(valid):
    v = valid.copy()
    for _ in range(4):
        a = v[:-1, :-1]; b = v[1:, :-1]; c = v[:-1, 1:]; dd_ = v[1:, 1:]
        pinch1 = a & dd_ & ~b & ~c
        pinch2 = b & c & ~a & ~dd_
        if not (pinch1.any() or pinch2.any()): break
        ii, jj = np.nonzero(pinch1); v[ii + 1, jj] = True
        ii, jj = np.nonzero(pinch2); v[ii, jj] = True
    return v

pq = 0
for s in (-1, 1):
    for y0 in np.arange(LY.RY0, LY.RY1, 800):
        xs = np.arange(LY.RX0, LY.RX1 + 0.1, 16.0) * s
        ys = np.arange(y0, min(y0 + 800, LY.RY1) + 0.1, 16.0)
        X, Y = np.meshgrid(xs, ys, indexing='ij')
        Z, D = LY.parapet(X, Y)
        ok = (D >= 2) & (D <= 116)
        valid = ok[:-1, :-1] & ok[1:, :-1] & ok[:-1, 1:] & ok[1:, 1:]
        valid = fix_pinches(valid)
        if not valid.any(): continue
        if s < 0:
            # keep counter-clockwise faces when mirrored: flip the x order
            X = X[::-1]; Y = Y[::-1]; Z = Z[::-1]; valid = valid[::-1]
        n2 = fbm(X / 120.0, Y / 120.0, 2.0, 3, seed=23)
        PA = np.stack([np.clip(0.15 + 0.35 * n2, 0, 0.6), np.zeros_like(X), np.full(X.shape, 0.35), np.zeros_like(X)], -1)
        tt = np.clip(0.9 + 0.1 * n2, 0.75, 1.0); TI = np.stack([tt, tt, tt, np.ones_like(tt)], -1)
        verts, faces, mats, (pa, ti) = vmesh.grid_sheet(X, Y, Z, lambda i, j: BLEND_BATTLE, valid, vert_attr=(PA, TI))
        vmesh.mesh_node(vmesh.polymesh_open(verts, faces, mats, paint=pa, tint=ti), GROUP)
        pq += len(faces)
print('parapets: %d quads' % pq)

# ---------------------------------------------------------------- prop helper
props_placed = {}
def prop(name, x, y, z, yaw=0.0, pitch=0.0, roll=0.0, scale=(1, 1, 1), stock=None, solid='6', shadows='0', **kw):
    model = stock or 'models/tw/%s/%s.vmdl' % (name, name)
    e = ent('prop_static', (x, y, z), (pitch, yaw, roll), group=GROUP, model=model, rendercolor='255 255 255', skin='default',
            solid=solid, bakelighting='1', disableshadows=shadows, lodlevel='-1', baketoworld='0', rendertocubemaps='1', **kw)
    if tuple(scale) != (1, 1, 1): setscale(e, scale)
    props_placed[model] = props_placed.get(model, 0) + 1
    return e


def yaw_for(nx, ny):
    """yaw so the prop's local +y points along -n (into the earth) given the wall's inward normal n"""
    return math.degrees(math.atan2(nx, -ny))


def gz(x, y):
    return LY.ground_at(x, y)


R = LY.raster()
WALLS = R.walls()
RECTS = LY.rects()

def kind_at(x, y):
    """trench kind containing CT-side point"""
    best = None
    for (x0, y0, x1, y1, k) in RECTS:
        if x0 <= x <= x1 and y0 <= y <= y1:
            if k == 'step': return 'step'
            best = best or k
    return best

# ---------------------------------------------------------------- trenches: revetments, fire-steps, duckboards, sandbags, clip
REVETS = ['revet_planks_a'] * 4 + ['revet_planks_b'] * 4 + ['revet_iron'] * 3 + ['revet_planks_broken'] * 2
for s in (-1, 1):
    for (p0, p1, n) in WALLS:
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        if L < 1: continue
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        kin = kind_at(mid[0] + n[0] * 10, mid[1] + n[1] * 10) or 'fire'
        front = n[0] > 0.5            # CT: trench lies at +x of the wall -> earth toward no man's land
        g = float(LY.ground_low(np.array([mid[0]]), np.array([mid[1]]))[0])
        floor = g - LY.DEPTH
        top = g + (6 if front else 18)
        base = top - 96
        unit = 128.0 if L >= 96 else 64.0
        cnt = max(1, int(math.ceil(L / unit - 0.15)))
        sc = L / (cnt * unit)
        dx, dy = (p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L
        nx, ny = n[0] * s, n[1]
        yaw = yaw_for(nx, ny)
        for k in range(cnt):
            t = (k + 0.5) * L / cnt
            px, py = p0[0] + dx * t, p0[1] + dy * t
            name = REVETS[rng.randint(len(REVETS))] + ('_128' if unit > 64 else '')
            if kin == 'niche': continue          # the shelter mound lines the niche
            prop(name, s * px, py, base, yaw, scale=(sc * (1.0 + 0.01 * rng.rand()), 1, 1), shadows='0')
            if kin in ('fire', 'step') and (front or rng.rand() < 0.85):
                if unit > 64: sb = 'sandbag_low_128' if front else 'sandbag_wall_128'
                else: sb = 'sandbag_low' if front else ['sandbag_wall_a', 'sandbag_wall_b', 'sandbag_wall_c'][rng.randint(3)]
                prop(sb, s * px - nx * 1.0, py - ny * 1.0, top + 0.5 - (1.5 if front else 0), yaw + rng.uniform(-1.5, 1.5), scale=(sc, 1, 1))
        # player clip: a 4-unit slab behind the wall face, from fire-step height up
        cx0, cy0, cx1, cy1 = sorted((p0[0], p1[0])) + sorted((p0[1], p1[1]))
        cx0, cx1 = sorted((p0[0], p1[0])); cy0, cy1 = sorted((p0[1], p1[1]))
        if abs(n[0]) > 0.5:
            xa = p0[0] - n[0] * 4 if n[0] > 0 else p0[0]; xb = p0[0] if n[0] > 0 else p0[0] - n[0] * 4
            box = (xa, cy0, xb, cy1)
        else:
            ya = p0[1] - n[1] * 4 if n[1] > 0 else p0[1]; yb = p0[1] if n[1] > 0 else p0[1] - n[1] * 4
            box = (cx0, ya, cx1, yb)
        bx0, by0, bx1, by1 = box
        if s < 0: bx0, bx1 = -bx1, -bx0
        vmesh.mesh_node(vmesh.box_mesh(bx0, by0, floor + 38, bx1, by1, g + 420, PCLIP), GROUP, bake=False, shadows=False, visexclude=True)
    # fire-steps
    for (xw, ya, yb) in LY.firesteps():
        L = yb - ya; cnt = max(1, int(round(L / 64.0))); sc = L / (cnt * 64.0)
        g = float(LY.ground_low(np.array([xw]), np.array([(ya + yb) / 2]))[0])
        for k in range(cnt):
            y = ya + (k + 0.5) * L / cnt
            prop('firestep', s * xw, y, g - LY.DEPTH, yaw_for(1 * s, 0), scale=(sc, 1, 1))
    # duckboards along the centre lines
    for (a, b, kind) in LY.segments():
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 8: continue
        dx, dy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        yaw = math.degrees(math.atan2(dy, dx * s))
        unit = 128.0 if L >= 96 else 64.0
        cnt = max(1, int(round(L / unit)))
        for k in range(cnt):
            t = (k + 0.5) * L / cnt
            x, y = a[0] + dx * t, a[1] + dy * t
            if kind == 'niche': continue
            g = float(LY.ground_low(np.array([x]), np.array([y]))[0])
            prop('duckboard_128' if unit > 64 else 'duckboard', s * x, y, g - LY.DEPTH - 0.5, yaw + rng.uniform(-2, 2), scale=(L / (cnt * unit), 1, 1))
    # heal shelters (elephant iron) in the niches, with dressing station dressing
    for k, y in enumerate(LY.SHELTER_Y):
        xs_ = LY.XS + LY.HW + 4 + 48          # arch mouth 4 units clear of the support trench
        g = float(LY.ground_low(np.array([xs_]), np.array([y]))[0])
        prop('shelter', s * xs_, y, g - LY.DEPTH, 0 if s > 0 else 180)
        prop('crate_medical', s * (xs_ + 30), y, g - LY.DEPTH, rng.uniform(-3, 3))
        prop('stretcher', s * (xs_ - 3), y - 25, g - LY.DEPTH + 0.5, rng.uniform(-3, 3))
        prop('sign_dressing_gb' if s > 0 else 'sign_dressing_de', s * (LY.XS + 34), y + 44, g - LY.DEPTH, 90 if s > 0 else 270)
    # trench signs at the communication trench junctions
    for k, y in enumerate(LY.COMM_Y):
        g = float(LY.ground_low(np.array([LY.XB]), np.array([y]))[0])
        prop('sign_mortars_gb' if s > 0 else 'sign_mortars_de', s * (LY.XB + 30), y + 30, g - LY.DEPTH, 180 if s > 0 else 0)
        prop('sign_firetrench_gb' if s > 0 else 'sign_firetrench_de', s * (LY.XS - 30), y + 100, g - LY.DEPTH, 0 if s > 0 else 180)
    prop('sign_piccadilly' if s > 0 else 'sign_unter_den_linden', s * (LY.XS - 30), -60, float(LY.ground_low(np.array([LY.XS]), np.array([0.0]))[0]) - LY.DEPTH, 0 if s > 0 else 180)
    # clutter in the trenches
    for i in range(LY.NBAY):
        y = LY.Y0 + i * LY.P + rng.uniform(40, 220)
        g = float(LY.ground_low(np.array([LY.XF]), np.array([y]))[0])
        r = rng.rand()
        if r < 0.25: prop('crate_long', s * (LY.XF + 18), y, g - LY.DEPTH + 4, rng.uniform(80, 100))
        elif r < 0.45: prop('helmet_brodie' if s > 0 else 'helmet_stahl', s * (LY.XF + 20), y, g - LY.DEPTH + 4.5, rng.uniform(0, 360))
        elif r < 0.6: prop('ladder', s * (LY.XF - LY.HW - 26), y + 60, g - LY.DEPTH + 40, 90 if s > 0 else 270, pitch=-14)
print('trenches: %d walls per side' % len(WALLS))

# ---------------------------------------------------------------- no man's land
def free(x, y, r=90):
    d_, _ = LY.trench_dist(np.array([x]), np.array([y]))
    return d_[0] > r

for s in (-1, 1):
    # wire belts: a fence line and a coil line in front of each fire trench, with gaps cut by shellfire
    for (xw, kind, gap) in ((1390, 'fence', 0.16), (1235, 'coil', 0.25)):
        y = -3100.0
        while y < 3100:
            if rng.rand() > gap:
                x = xw + rng.uniform(-14, 14)
                name = (('wire_fence_a', 'wire_fence_b')[rng.randint(2)]) if kind == 'fence' else 'wire_coil'
                prop(name, s * x, y, gz(s * x, y) - 2, yaw_for(s, 0) + rng.uniform(-7, 7), solid='0')
            y += 128
    for k in range(9):
        x = rng.uniform(1050, 1460); y = rng.uniform(-3000, 3000)
        prop('cheval', s * x, y, gz(s * x, y) - 1, rng.uniform(0, 360), roll=rng.uniform(-6, 6))
wrecks = [('wreck_tank', -380, 860, 34, 7, -5, -14), ('wreck_tank', 520, -1720, 205, -6, 4, -12),
          ('wreck_fieldgun', -880, -620, 300, 0, 7, -3), ('wreck_fieldgun', 1080, 2360, 140, 3, -9, -4),
          ('wreck_wheel', -840, -700, 20, 0, 0, -2), ('wreck_wheel', 300, 2900, 130, 0, 0, -2)]
for (nm, x, y, yaw, pitch, roll, sink) in wrecks:
    prop(nm, x, y, gz(x, y) + sink, yaw, pitch, roll)
# downloaded models (CC-BY, see CREDITS.txt): knocked-out tanks, guns, battlefield clutter
EXT = lambda n: 'models/tw/ext/%s/%s.vmdl' % (n, n)
for (nm, x, y, yaw, pitch, roll, sink) in (('tank_a7v', 760, 1420, 70, 5, -7, -16), ('tank_renault_ft', -1040, -2350, 230, -6, 9, -10),
                                           ('gun_75mm', -2660, 900, 20, 0, 3, -3), ('howitzer_bl8', 2700, -2300, 160, 0, 0, -2)):
    prop(None, x, y, gz(x, y) + sink, yaw, pitch, roll, stock=EXT(nm))
scatter_ext = [('stump_burnt', 26, (0, 1500)), ('helmet_brodie_ext', 10, (200, 1450)), ('helmet_stahl_ext', 10, (200, 1450))]
for nm, n, xr in scatter_ext:
    for _ in range(n):
        x = rng.choice([-1, 1]) * rng.uniform(*xr); y = rng.uniform(-3300, 3300)
        if not free(x, y, 90): continue
        sc = rng.uniform(0.8, 1.3) if nm == 'stump_burnt' else 1.0
        prop(None, x, y, gz(x, y) - (6 if nm == 'stump_burnt' else 0.5), rng.uniform(0, 360), rng.uniform(-5, 5), rng.uniform(-5, 5), scale=(sc, sc, sc), stock=EXT(nm))
TREES = ['tree_shattered_a', 'tree_shattered_b', 'tree_shattered_c', 'tree_shattered_d']
placed_pts = []
def scatter(n, xr, yr, names, min_d=110, mirror=True, zoff=-6, tilt=6, wall_clear=110, scale_r=(0.85, 1.2)):
    c = 0; tries = 0
    while c < n and tries < n * 40:
        tries += 1
        x = rng.uniform(*xr); y = rng.uniform(*yr)
        s = (1 if rng.rand() < 0.5 else -1) if mirror else 1
        x *= s
        if not free(x, y, wall_clear): continue
        if any((x - px) ** 2 + (y - py) ** 2 < min_d ** 2 for px, py in placed_pts[-400:]): continue
        placed_pts.append((x, y))
        sc = rng.uniform(*scale_r)
        prop(names[rng.randint(len(names))], x, y, gz(x, y) + zoff, rng.uniform(0, 360), rng.uniform(-tilt, tilt), rng.uniform(-tilt, tilt), scale=(sc, sc, sc))
        c += 1
scatter(46, (0, 1500), (-3400, 3400), TREES, min_d=260)
scatter(70, (1450, 2700), (-3300, 3300), TREES + ['tree_shattered_c'], min_d=200)
scatter(150, (0, 2800), (-3500, 3500), ['stump_a', 'stump_b', 'stump_a'], min_d=120, zoff=-8)
scatter(24, (0, 2600), (-3400, 3400), ['log_fallen'], min_d=300, zoff=-4, tilt=3)
scatter(40, (0, 1450), (-3300, 3300), ['helmet_brodie', 'helmet_stahl'], min_d=60, zoff=-1, tilt=25, wall_clear=60, scale_r=(1, 1))
scatter(14, (0, 1450), (-3300, 3300), ['casings', 'shell_pile', 'crate_shells'], min_d=200, zoff=-2, tilt=8, scale_r=(1, 1))
# muddy water in the bigger craters of no man's land
nw = 0
for (cx, cy, r, dep) in sorted(LY.CRATERS.tolist(), key=lambda c: -c[2]):
    if abs(cx) > 1380 or r < 62 or nw >= 110: continue
    if not free(cx, cy, r + 40): continue
    xs = cx + np.linspace(-r * 0.5, r * 0.5, 9); ys = cy + np.linspace(-r * 0.5, r * 0.5, 9)
    Xg, Yg = np.meshgrid(xs, ys)
    hz = LY.height(Xg, Yg)
    wl = float(hz.min()) + dep * r * 0.28
    rr = r * 0.62
    pts = [(cx + math.cos(a) * rr * (1 + 0.15 * math.sin(a * 3 + cx)), cy + math.sin(a) * rr * (1 + 0.15 * math.cos(a * 2 + cy))) for a in np.linspace(0, 2 * math.pi, 13)[:-1]]
    top = [(px, py, wl) for px, py in pts]; bot = [(px, py, wl - 30) for px, py in pts]
    verts = top + bot; n = len(pts)
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))] + [[(k + 1) % n, k, k + n, (k + 1) % n + n] for k in range(n)]
    # top must face up: pts are counter-clockwise -> fine; sides face out
    fm = [WATER, NODRAW] + [NODRAW] * n
    vmesh.mesh_node(vmesh.polymesh_open(verts, faces, fm), GROUP, bake=True)
    nw += 1
print('no man\'s land: %d puddles' % nw)

# ---------------------------------------------------------------- mortar pits
for s in (-1, 1):
    for k, (cx, cy) in enumerate(LY.mortar_pits(s)):
        g = gz(cx + s * 150, cy)
        # breastwork: two courses of sandbag walls and a capping row, staggered, inner face ~185 from the tube
        NB = 17
        for lvl, (rad, dz, names) in enumerate(((194, -3, ['sandbag_wall_a', 'sandbag_wall_b', 'sandbag_wall_c']),
                                                 (192, 15.5, ['sandbag_wall_b', 'sandbag_wall_c', 'sandbag_wall_a']),
                                                 (190, 34.0, ['sandbag_low']))):
            for q in range(NB):
                a = 2 * math.pi * (q + 0.5 * (lvl % 2)) / NB + 0.04 * k
                rx, ry = math.cos(a), math.sin(a)
                x, y = cx + rx * rad, cy + ry * rad
                prop(names[rng.randint(len(names))], x, y, gz(cx + rx * 194, cy + ry * 194) + dz, math.degrees(math.atan2(-rx, ry)) + rng.uniform(-2, 2),
                     scale=(1.0, 1, 1 if lvl < 2 else 1.1))
        st = LY.mortar_stations(s, k)
        tx, ty = st['table']; ax, ay = st['ammo']
        prop('plotting_table', tx, ty, gz(tx, ty), 90 if s > 0 else 270)
        prop('ammo_box_mortar', ax, ay, gz(ax, ay), rng.uniform(-20, 20))
        for j in range(2):
            x, y = cx + s * rng.uniform(40, 110), cy + rng.uniform(-110, 110)
            prop(['shell_pile', 'crate_shells', 'casings', 'crate_german' if s < 0 else 'crate_long'][rng.randint(4)], x, y, gz(x, y), rng.uniform(0, 360))
        prop('casings', cx - s * rng.uniform(55, 75), cy + rng.uniform(-40, 40), gz(cx, cy), rng.uniform(0, 360))
        if s > 0: prop(None, cx, cy, gz(cx, cy), 180, stock='models/tw/ext/mortar_58mm/mortar_58mm.vmdl')     # French 58 mm No.2
        else: prop('minenwerfer', cx, cy, gz(cx, cy) - 0.5, 0)                                                       # German 7.58 cm leMW
        # pit floor: duckboards to the stations, bombs ready by the tube
        for (bx, by, byaw) in ((cx + s * 70, cy - 30, 90), (cx + s * 70, cy + 34, 90), (cx - s * 10, cy - 90, 0)):
            prop('duckboard', bx, by, gz(bx, by) - 0.5, byaw + rng.uniform(-4, 4))
        for j in range(3):
            bx, by = cx + s * rng.uniform(-30, 10), cy + (-1) ** j * rng.uniform(48, 70)
            prop(None, bx, by, gz(bx, by), rng.uniform(0, 360), stock='models/generic/ammo_artillery_01/ammo_artillery_small_0%s.vmdl' % ('1' if j % 2 else '1b'))
        # crew enclosure
        h = 230; zb = gz(cx, cy) - 60; zt = zb + 480
        for (x0, y0, x1, y1) in ((cx - h, cy - h, cx + h, cy - h + 4), (cx - h, cy + h - 4, cx + h, cy + h), (cx - h, cy - h, cx - h + 4, cy + h), (cx + h - 4, cy - h, cx + h, cy + h)):
            vmesh.mesh_node(vmesh.box_mesh(x0, y0, zb, x1, y1, zt, PCLIP), GROUP, bake=False, shadows=False, visexclude=True)
        ent('info_target', (cx, cy, gz(cx, cy)), group=GROUP, targetname='mortarpit_%s_%d' % ('ct' if s > 0 else 't', k + 1))
        for tag, (px, py) in (('a', (tx + s * 38, ty)), ('b', (ax + s * 44, ay))):
            ang = (0, 180 if s > 0 else 0, 0)
            ent('info_teleport_destination', (px, py, surf_z(px, py, pad=16) + 8), ang, group=GROUP, targetname='mortarcrew_%s_%d_%s' % ('ct' if s > 0 else 't', k + 1, tag))
    prop('sign_mortars_gb' if s > 0 else 'sign_mortars_de', s * (LY.MORTAR_X - 260), -1200, gz(s * (LY.MORTAR_X - 260), -1200), 0 if s > 0 else 180)

# ---------------------------------------------------------------- airfields (biplanes later): hangar, signs, spawn markers
for s in (-1, 1):
    hx = s * LY.HANGAR_X
    prop('hangar', hx, 0, gz(hx, 0) - 2, 0 if s > 0 else 180)
    prop('sign_airfield_gb' if s > 0 else 'sign_airfield_de', s * (LY.HANGAR_X - 520), 420, gz(s * (LY.HANGAR_X - 520), 420), 0 if s > 0 else 180)
    for j in range(4):
        x, y = s * (LY.HANGAR_X + rng.uniform(-300, 300)), rng.choice([-1, 1]) * rng.uniform(380, 460)
        prop(['crate_long', 'crate_german', 'crate_shells'][rng.randint(3)], x, y, gz(x, y), rng.uniform(0, 360))
    pl = 'plane_spad7' if s > 0 else 'plane_dr1'
    for j, (px, py) in enumerate(((s * (LY.HANGAR_X + 40), -150), (s * (LY.HANGAR_X - 120), 160))):
        prop(None, px, py, gz(px, py), (180 if s > 0 else 0) + rng.uniform(-6, 6), stock='models/tw/ext/%s/%s.vmdl' % (pl, pl))
    for j in range(5):
        x, y = s * (LY.HANGAR_X + rng.uniform(-340, 340)), rng.uniform(-280, 280)
        prop(None, x, y, gz(x, y), rng.uniform(0, 360), stock='models/tw/ext/petrol_can/petrol_can.vmdl')
    for k, y in enumerate(LY.SHELTER_Y):
        xs_ = LY.XS + LY.HW + 4 + 48
        prop(None, s * (xs_ - 3), y + 25, float(LY.ground_low(np.array([xs_]), np.array([y]))[0]) - LY.DEPTH + 0.5, rng.uniform(-3, 3), stock=EXT('stretcher_ext'))
    for i, (px, py) in enumerate(LY.plane_spawns(s)):
        ent('info_teleport_destination', (px, py, surf_z(px, py) + 10), (0, 180 if s > 0 else 0, 0), group=GROUP, targetname='plane_%s_%d' % ('ct' if s > 0 else 't', i + 1))

# ---------------------------------------------------------------- living woodland (stock CS2 foliage) and undergrowth
FULL = ['models/foliage/trees/maple/maple_01/maple_tree_01.vmdl', 'models/foliage/trees/maple/maple_01/maple_tree_02.vmdl',
        'models/foliage/trees/poplar/tree_poplar_mature_01.vmdl', 'models/foliage/trees/poplar/tree_poplar_mature_02.vmdl',
        'models/foliage/trees/poplar/tree_poplar_adult_01.vmdl', 'models/foliage/trees/poplar/tree_poplar_adult_02.vmdl',
        'models/props/de_nuke/hr_nuke/foliage/tree_small_beech_01.vmdl', 'models/props/de_nuke/hr_nuke/foliage/tree_small_beech_03.vmdl',
        'models/props/de_nuke/hr_nuke/foliage/tree_small_beech_05.vmdl']
VISTA = ['models/foliage/trees/poplar/tree_poplar_mature_01_vista.vmdl', 'models/foliage/trees/poplar/tree_poplar_mature_02_vista.vmdl',
         'models/foliage/trees/poplar/tree_poplar_adult_01_vista.vmdl', 'models/foliage/trees/poplar/tree_poplar_adult_02_vista.vmdl']
BUSH = ['models/foliage/bushes/dogwood/dogwood_adult_01.vmdl', 'models/foliage/bushes/dogwood/shrub_dogwood_mature_01.vmdl',
        'models/foliage/bushes/dogwood/shrub_dogwood_juvenile_02.vmdl', 'models/props/de_nuke/hr_nuke/foliage/bushes_viburnum_01.vmdl']
WEED = ['models/props/de_nuke/hr_nuke/foliage/weed_cluster_01.vmdl', 'models/props/de_nuke/hr_nuke/foliage/weed_cluster_03.vmdl',
        'models/props/de_nuke/hr_nuke/foliage/tall_weeds_01.vmdl', 'models/foliage/weeds/ground_tall_grass_01a.vmdl',
        'models/foliage/weeds/ground_mid_grass_01a.vmdl', 'models/foliage/ground/ground_leaves_1.vmdl']


def woodland_ok(x, y):
    ax, ay = abs(x), abs(y)
    if ax < 3550 and ay < 3500: return False                    # battle zone (shattered trees only)
    if 4300 < ax < 6950 and ay < 1150: return False             # airfield clearing
    if abs(ax - LY.MORTAR_X) < 420 and ay < 2000: return False
    return True


def near_play(x, y):
    ax, ay = abs(x), abs(y)
    dx = max(0, ax - 3700); dy = max(0, ay - 3500)
    da = max(0, max(4200 - ax, ax - 7000, 0)) if ay < 1300 else 9999
    return min(math.hypot(dx, dy), da + max(0, ay - 1150))

nt = 0
grid = 230.0
for gx in np.arange(-LY.MAP_X + 100, LY.MAP_X - 100, grid):
    for gy in np.arange(-LY.MAP_Y + 100, LY.MAP_Y - 100, grid):
        x = gx + rng.uniform(-90, 90); y = gy + rng.uniform(-90, 90)
        if not woodland_ok(x, y): continue
        if fbm(x / 1500.0, y / 1500.0, 7.7, 2, seed=31) < -0.35: continue       # glades
        dp = near_play(x, y)
        sc = rng.uniform(0.85, 1.25)
        model = FULL[rng.randint(len(FULL))] if dp < 1400 else VISTA[rng.randint(len(VISTA))]
        prop(None, x, y, gz(x, y) - 4, rng.uniform(0, 360), scale=(sc, sc, sc), stock=model, shadows='0')
        nt += 1
        if dp < 1600 and rng.rand() < 0.45:
            bx, by = x + rng.uniform(-110, 110), y + rng.uniform(-110, 110)
            prop(None, bx, by, gz(bx, by) - 2, rng.uniform(0, 360), stock=BUSH[rng.randint(len(BUSH))], solid='0')
        if dp < 700 and rng.rand() < 0.6:
            for _ in range(1):
                wx, wy = x + rng.uniform(-115, 115), y + rng.uniform(-115, 115)
                prop(None, wx, wy, gz(wx, wy) - 1, rng.uniform(0, 360), stock=WEED[rng.randint(len(WEED))], solid='0')
# the battle zone's edge: a few surviving trees and lots of weeds between the mortar line and the trenches
for _ in range(160):
    x = rng.choice([-1, 1]) * rng.uniform(2650, 3550); y = rng.uniform(-3400, 3400)
    if abs(abs(x) - LY.MORTAR_X) < 360 and abs(y) < 2000: continue
    if rng.rand() < 0.3:
        prop(None, x, y, gz(x, y) - 4, rng.uniform(0, 360), stock=FULL[rng.choice([2, 3, 4, 5])], shadows='0')
    else:
        prop(None, x, y, gz(x, y) - 1, rng.uniform(0, 360), stock=WEED[rng.randint(len(WEED))], solid='0')
for _ in range(160):
    x = rng.choice([-1, 1]) * rng.uniform(1500, 3600); y = rng.uniform(-3500, 3500)
    if not free(x, y, 70): continue
    prop(None, x, y, gz(x, y) - 1, rng.uniform(0, 360), stock=WEED[rng.choice([0, 1, 2])], solid='0')
print('woodland: %d trees' % nt)

# ---------------------------------------------------------------- fog banks drifting over no man's land
for x in (-1024.0, 0.0, 1024.0):
    for y in np.arange(-3072, 3073, 1024.0):
        ent('info_particle_system', (x + rng.uniform(-120, 120), y + rng.uniform(-120, 120), gz(x, y) + 40), group=GROUP,
            effect_name='particles/maps/gg_vietnam/vietnam_fog_volume_1024.vpcf', start_active='1')
for _ in range(30):
    x = rng.uniform(-1450, 1450); y = rng.uniform(-3300, 3300)
    ent('info_particle_system', (x, y, gz(x, y) + 8), group=GROUP, effect_name='particles/maps/gg_vietnam/vietnam_fog_ground.vpcf', start_active='1')

# ---------------------------------------------------------------- infantry spawns (teleport destinations) and heal points
for s in (-1, 1):
    tag = 'ct' if s > 0 else 't'
    for i, (x, y) in enumerate(LY.infantry_spawns(s)):
        z = max(float(LY.ground_low(np.array([x]), np.array([y]))[0]) - LY.DEPTH + 4.5, surf_z(x, y, pad=16)) + 10   # duckboards top out ~4 above the floor
        ent('info_teleport_destination', (x, y, z), (0, 180 if s > 0 else 0, 0), group=GROUP, targetname='trench_%s_%d' % (tag, i + 1))
    for i, (x, y) in enumerate(LY.heal_points(s)):
        z = float(LY.ground_low(np.array([x]), np.array([y]))[0]) - LY.DEPTH
        ent('info_target', (x, y, z + 8), group=GROUP, targetname='heal_%s_%d' % (tag, i + 1))

# ---------------------------------------------------------------- lobby (spawn room) with the briefing banner
LZ = -2900.0
LW, LD, LH = 1536.0, 1152.0, 352.0
WOODW = 'materials/de_ancient/hr_ancient_ceiling_wood_01_base.vmat'
FLOORM = 'materials/cs_italy/wood/wood_boards_worn_1.vmat'
for m in (WOODW, FLOORM): vmesh.TEX_SIZE[m] = (1024, 1024)
vmesh.mesh_node(vmesh.box_mesh(-LW / 2, -LD / 2, LZ, LW / 2, LD / 2, LZ + LH, dict(bottom=FLOORM, top=WOODW, side=WOODW), inward=True), GROUP)
# banner: a picture on the north wall (unlit material made below)
bw, bh = 1100.0, 260.0
by = LD / 2 - 2
verts = [(-bw / 2, by, LZ + 60), (bw / 2, by, LZ + 60), (bw / 2, by, LZ + 60 + bh), (-bw / 2, by, LZ + 60 + bh),
         (-bw / 2, by + 1, LZ + 60), (bw / 2, by + 1, LZ + 60), (bw / 2, by + 1, LZ + 60 + bh), (-bw / 2, by + 1, LZ + 60 + bh)]
BANNER = 'materials/tw/briefing_banner.vmat'
vmesh.TEX_SIZE[BANNER] = (int(bw * 4), int(bh * 4))
bm = vmesh.polymesh_open(verts, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]],
                         [BANNER, NODRAW, NODRAW, NODRAW, NODRAW, NODRAW], scale=0.25)
# exact uv for the banner face: u along x, v down
fvd = bm.get('faceVertexData'); tex = fvd.get('streams')[0].get('data')
E_dest = bm.get('edgeVertexIndices'); E_face = bm.get('edgeFaceIndices')
for i, f in enumerate(E_face):
    if f == 0:
        vx, vy, vz = verts[E_dest[i]]
        tex[i] = ((vx + bw / 2) / bw, 1 - (vz - LZ - 60) / bh)
vmesh.mesh_node(bm, GROUP, bake=False, shadows=False)
for i in range(32):
    x = -560 + (i % 8) * 160; y = -420 + (i // 8) * 80
    ent('info_player_terrorist', (x - 40, y, LZ + 8), (0, 90, 0), group=GROUP, enabled='1', priority='0')
    ent('info_player_counterterrorist', (x + 40, y + 340, LZ + 8), (0, 90, 0), group=GROUP, enabled='1', priority='0')
for (lx, ly) in ((-400, -250), (400, -250), (-400, 250), (400, 250)):
    ent('light_omni2', (lx, ly, LZ + LH - 40), (90, 0, 0), group=GROUP, brightness_units='1', brightness_lumens='9000', brightness='2',
        color='255 214 160', range='1100', directlight='3', castshadows='0', colormode='0', enabled='1', bouncescale='1.0', shape='0')
clone('env_combined_light_probe_volume', (0, 0, LZ + LH / 2), box_mins='%g %g %g' % (-LW / 2, -LD / 2, -LH / 2), box_maxs='%g %g %g' % (LW / 2, LD / 2, LH / 2),
      voxel_size='48.0', targetname='lobby_probe')
for cls, pos, ang in (('counterterrorist_team_intro', (300, 300, LZ + 64), (0, 90, 0)), ('terrorist_team_intro', (-300, 300, LZ + 64), (0, 90, 0)),
                      ('team_select', (0, -300, LZ + 64), (0, 90, 0)), ('end_of_match', (0, 0, LZ + 64), (0, 90, 0))):
    clone(cls, pos, ang)

# ---------------------------------------------------------------- script, HUD and effect pools
SPOT = (0, 0, LZ + 100)
ent('point_script', SPOT, group=GROUP, targetname='tw_script', cs_script='maps/scripts/%s.vjs' % NAME)
ent('custom_hud_layout', (32, 0, LZ + 100), group=GROUP, targetname='tw_hud', layout='panorama/layout/custom_game/%s.vxml' % NAME, observable='1')
ent('info_map_parameters', (-32, 0, LZ + 100), group=GROUP, targetname='tw_params', buying='3', usenormalspawnsfordm='1', disableautogenerateddmspawns='1')
for i in range(12):
    p = (-600 + i * 60, -500, LZ + 120)
    ent('info_particle_system', p, group=GROUP, targetname='tw_boom_fx_%d' % (i + 1), effect_name='particles/explosions_fx/explosion_basic.vpcf', start_active='0')
    ent('info_particle_system', (p[0], p[1] + 30, p[2]), group=GROUP, targetname='tw_dirt_fx_%d' % (i + 1), effect_name='particles/ambient_fx/impact_dirt.vpcf', start_active='0')
    ent('point_soundevent', (p[0], p[1] + 60, p[2]), group=GROUP, targetname='tw_boom_snd_%d' % (i + 1), soundName='tw.mortar_impact',
        startOnSpawn='0', toLocalPlayer='0', stopOnNew='0', saveAndRestore='0')
    ent('point_soundevent', (p[0], p[1] + 90, p[2]), group=GROUP, targetname='tw_whistle_snd_%d' % (i + 1), soundName='tw.mortar_whistle',
        startOnSpawn='0', toLocalPlayer='0', stopOnNew='0', saveAndRestore='0')
    ent('env_shake', (p[0], p[1] + 120, p[2]), group=GROUP, targetname='tw_shake_%d' % (i + 1), amplitude='7', radius='900', duration='1.2', frequency='40', spawnflags='0')
for s in (-1, 1):
    for k, (cx, cy) in enumerate(LY.mortar_pits(s)):
        tag = '%s_%d' % ('ct' if s > 0 else 't', k + 1)
        ent('point_soundevent', (cx, cy, gz(cx, cy) + 30), group=GROUP, targetname='tw_launch_snd_' + tag, soundName='tw.mortar_launch',
            startOnSpawn='0', toLocalPlayer='0', stopOnNew='0', saveAndRestore='0')
        ent('info_particle_system', (cx, cy, gz(cx, cy) + 50), group=GROUP, targetname='tw_launch_fx_' + tag,
            effect_name='particles/ambient_fx/impact_dirt_child_smoke_puff.vpcf', start_active='0')
ent('point_soundevent', (0, 0, LZ + 200), group=GROUP, targetname='tw_ambience', soundName='tw.amb.front', startOnSpawn='1', toLocalPlayer='0', stopOnNew='0', saveAndRestore='0')

# ---------------------------------------------------------------- environment: sun, sky, fog, probes, post, soundscape
clone('light_environment', (0, 0, 2000), (55, 145, 0), targetname='tw_sun', color='196 202 210', brightness='1.6', castshadows='1', directlight='3',
      skycolor='150 160 175', skyintensity='1.6', fog='1', fogstrength='0.6')
clone('env_sky', (64, 0, 2000), targetname='sky', skyname='materials/skybox/sky_overcast_01.vmat', tint_color='190 196 205', brightnessscale='0.9')
clone('env_cubemap_fog', (128, 0, 2000), cubemapfogstartdistance='250', cubemapfogenddistance='6200', cubemapfogfalloffexponent='1.25',
      cubemapheightfog='1', cubemapfogheightstart='300.0', cubemapfogheightend='2600.0', cubemapfogheightexponent='1.0', cubemapfogmaxopacity='0.93',
      cubemapfogskyentity='sky')
ent('env_volumetric_fog_controller', (192, 0, 2000), group=GROUP, targetname='tw_vfog', IsMaster='1', FogStrength='1.4', TintColor='205 210 215',
    DrawDistance='1600', FadeInStart='40', FadeInEnd='300', FadeSpeed='2', IndirectEnabled='1', IndirectStrength='1.0', IndirectVoxelDim='256',
    NoiseSpeed='0.15', NoiseStrength='0.55', NoiseScale='.004 .004 .01', volume_depth_override='0', volume_first_slice_thickness='0')
clone('post_processing_volume', (256, 0, 2000), postprocessing='postprocess/%s.vpost' % NAME, master='1', minexposure='0.6', maxexposure='1.8',
      enableexposure='1', fadetime='1.0', spawnflags='4097')
clone('env_combined_light_probe_volume', (0, 0, 120), box_mins='-3900 -3700 -260', box_maxs='3900 3700 520', voxel_size='64.0', targetname='bf_probe')
for s in (-1, 1):
    clone('env_combined_light_probe_volume', (s * LY.HANGAR_X, 0, 200), box_mins='-700 -800 -120', box_maxs='700 800 420', voxel_size='64.0',
          targetname='air_probe_%d' % (s + 1))
clone('env_soundscape', (0, 0, 300), radius='12000', soundscape='Nothing', enablesoundevent='1', soundevent='tw.amb.front')

# ---------------------------------------------------------------- 3D skybox (maps/mg_trenchwarfare_3dskybox.vmap, sky_camera at its origin, scale 16)
ent('skybox_reference', (0, 0, -12000), group=GROUP, targetname='tw_skybox', targetMapName='maps/%s_3dskybox.vmap' % NAME,
    fixupNames='1', worldGroupID='skyboxWorldGroup0')

# ---------------------------------------------------------------- sky shell, vis hints, nav seeds, minimap bounds
SX, SY = LY.MAP_X + 256, LY.MAP_Y + 256
vmesh.mesh_node(vmesh.box_mesh(-SX, -SY, LY.SKY_Z0, SX, SY, LY.SKY_Z1, SKY, inward=True), GROUP, bake=False, shadows=False)

def hint(box, kind):
    x0, y0, z0, x1, y1, z1 = box
    c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); h = ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
    ent('visibility_hint', c, group=GROUP, hintType=str(kind), box_mins='%g %g %g' % (-h[0], -h[1], -h[2]), box_maxs='%g %g %g' % (h[0], h[1], h[2]))
for s in (-1, 1):
    a, b = sorted((s * 1290, s * 2620))
    hint((a, -3300, -220, b, 3300, 360), 3)
    a, b = sorted((s * 2900, s * 3500))
    hint((a, -1900, -160, b, 1900, 320), 3)
hint((-1280, -3700, -180, 1280, 3700, 460), 8)
hint((-LW / 2 - 64, -LD / 2 - 64, LZ - 64, LW / 2 + 64, LD / 2 + 64, LZ + LH + 64), 3)
hint((-SX - 64, -SY - 64, LZ - 128, SX + 64, SY + 64, LY.SKY_Z1 + 64), 9)
ent('cs_minimap_boundary', (-2900, -3500, 0), group=GROUP)
ent('cs_minimap_boundary', (2900, 3500, 0), group=GROUP)

# ---------------------------------------------------------------- banner and material files
def banner_png():
    W, H = 2048, int(2048 * bh / bw)
    im = Image.new('RGB', (W, H), (34, 31, 26))
    dr = ImageDraw.Draw(im)
    f1 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 74)
    f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf', 34)
    f3 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf', 28)
    dr.rectangle((14, 14, W - 15, H - 15), outline=(170, 150, 110), width=6)
    t = 'THE WESTERN FRONT'
    bb = dr.textbbox((0, 0), t, font=f1); dr.text(((W - bb[2]) / 2, 30), t, fill=(224, 210, 176), font=f1)
    cols = [('INFANTRY', ['Bolt-action rifle, P250, knife.', 'Hold the fire trench - you respawn.', 'Kill streaks earn an AWP or auto-rifle.', 'Dressing stations heal you.']),
            ('TRENCH MORTARS', ['5 crews of 2 per side, behind the lines.', 'Plot the target at the map table,', 'fetch a bomb from the ammo box,', 'load and fire the mortar.']),
            ('AIRCRAFT', ['Coming soon: biplanes.', 'Earned by kills and chance.', 'Limited lives, then back', 'to the ground war.'])]
    cw = (W - 120) / 3
    for i, (h, lines) in enumerate(cols):
        x = 60 + i * cw
        dr.text((x, 150), h, fill=(214, 178, 96), font=f2)
        for j, l in enumerate(lines): dr.text((x, 200 + j * 38), l, fill=(214, 206, 188), font=f3)
    t = 'Wait here - your orders arrive in a moment.'
    bb = dr.textbbox((0, 0), t, font=f2); dr.text(((W - bb[2]) / 2, H - 70), t, fill=(190, 182, 160), font=f2)
    arr = np.asarray(im, np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    grain = fbm(xx / 60.0, yy / 60.0, 1.0, 3, seed=4)[..., None]
    arr = arr * (0.9 + 0.12 * grain)
    p = os.path.join(OUT, 'materials/tw'); os.makedirs(p, exist_ok=True)
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(p, 'briefing_banner_color.png'))
    open(os.path.join(p, 'briefing_banner.vmat'), 'w', newline='\n').write(
        '// mg_trenchwarfare briefing banner (generated)\nLayer0\n{\n\tshader "csgo_unlitgeneric.vfx"\n\tF_BLEND_MODE 0\n'
        '\tTextureColor "materials/tw/briefing_banner_color.png"\n\tg_vColorTint "[1.000000 1.000000 1.000000 0.000000]"\n}\n')
banner_png()

# ---------------------------------------------------------------- swap into the world
kids = world.attr('children')
kept = []
for c in kids[2]:
    if c.get('customVisGroup', '') == GROUP: continue
    if c.type in ('CMapMesh',) and not c.get('customVisGroup', ''): continue          # template sample geometry
    if c.type == 'CMapEntity':
        cls = c.get('entity_properties').get('classname')
        if cls in ('point_worldtext', 'func_buyzone', 'info_player_start', 'light_environment', 'env_sky', 'env_cubemap_fog', 'env_combined_light_probe_volume',
                   'post_processing_volume', 'env_soundscape', 'counterterrorist_team_intro', 'terrorist_team_intro', 'team_select', 'end_of_match',
                   'cs_minimap_boundary', 'point_nav_walkable', 'info_player_terrorist', 'info_player_counterterrorist'):
            continue
    kept.append(c)
kids[2] = kept + vmaplib.new_children
counts = {}
for c in kids[2]:
    if c.type == 'CMapEntity':
        cls = c.get('entity_properties').get('classname'); counts[cls] = counts.get(cls, 0) + 1
pre = {a[0]: a for a in d.prefix[0]}
refs = pre['map_asset_references'][2]
for m in list(vmaplib.materials_used) + sorted(props_placed):
    if m not in refs: refs.append(m)
names = sorted(counts)
if 'map_subasset_reference_types' in pre:
    pre['map_subasset_reference_types'][2] = ['entity'] * len(names)
    pre['map_subasset_reference_names'][2] = names
    pre['map_subasset_reference_counts'][2] = [counts[n] for n in names]
d.elements = [root]
d.save(OUTPATH)
print('vmap: %d entities (%d prop_static), %d meshes -> %s (%.1f MB)' % (sum(counts.values()), counts.get('prop_static', 0),
      sum(1 for c in kids[2] if c.type == 'CMapMesh'), OUTPATH, os.path.getsize(OUTPATH) / 1e6))
json.dump({k: v for k, v in sorted(props_placed.items())}, open(os.path.join(os.path.dirname(OUTPATH), 'props_used.json'), 'w'), indent=1)
