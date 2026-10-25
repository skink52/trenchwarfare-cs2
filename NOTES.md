# Working notes (AI session log)

Read this first when resuming. Newest state at the top.

## State 2026-10-26 ~00:00 ACDT

Done this session (since the first delivery):
- Prefabs collapsed: terrain + parapets are in `mg_trenchwarfare.vmap` again (47 MB). Terrain uses Valve blend materials with vertex paint
  (`VertexPaintBlendParams.x` = layer B weight, `VertexPaintTintColor`), stream layout copied from `content/csgo/maps/editor/zoo/ancient_zoo.vmap`:
  battle zone `hr_ancient_blend_groundmud03-groundgrass_01_wet` (mud -> grass away from the churned core), forest `hr_ancient_blend_groundgrass01-grounddirt01-wet`.
- No man's land water: up to 110 flooded craters (was 34).
- Shelter (`p_trench.shelter`): arch double-sided, earth face closes the mouth, back closed, entrance sandbags removed (they blocked the support
  trench), sandbag header on the mound. Placed 4 u clear of the support trench; niche lengthened to XS+150; no revetments on niche walls.
  `SHELTER_Y[0]` moved -1344 -> -1056 (was on a support-trench dog-leg).
- Stretchers side by side in the shelter (y -25 / +25), medical crate at the back.
- Teleports: all `info_teleport_destination` (Hammer shows the player hull). z = bilinear terrain-mesh height (`surf_z`) + clearance.
  The script teleports pawns to entity origin + 4 z (it never fires point_teleport inputs), so any point entity works.
- Mortar pits: radius ~190, breastwork 2 courses of sandbag walls + capping row (~50 u above the ground, ~72 above the pit floor),
  pit floor carve `22 * (1-(r/198)^16)` (flat to ~r160), duckboards, stock `models/generic/ammo_artillery_01` bombs. Clip box +-230.
  Crew seats: a = 38 behind the plotting table, b = 44 behind the ammo box.
- Mortars at real size: French 58 mm No.2 re-converted without the 4 sample bombs (`--drop material.002`), 84 u long / 58 tall.
  New procedural German leichter Minenwerfer 7.58 cm n.A. (`tools/p_minenwerfer.py`, model `models/tw/minenwerfer`) for T, x1.4 scale, 61 u tall.
- Stock texture browser: `tools/vpkdir.py` (VPK dir index) + `tools/vtexread.py` (vtex_c -> PNG, LZ4 mips, BCn via Pillow DDS) to look at
  Valve materials before using them. pak01 archives are staged from the PC on demand (~100 MB each).
- 3D skybox map exists: `maps/mg_trenchwarfare_3dskybox.vmap` (user-made: light_environment, env_sky clone, sky_camera at 0 scale 16,
  mapUsageType skybox). Main map needs a `skybox_reference` (targetMapName maps/mg_trenchwarfare_3dskybox.vmap).

## Decisions / constraints
- Weapons are built by a separate session (see `docs/weapons_handover.md`): T = weapon_awp (Gewehr 98) + weapon_glock (Luger),
  CT = weapon_ssg08 (Lee-Enfield) + weapon_hkp2000 (Colt). Streak upgrade: T weapon_g3sg1 (Mondragon), CT weapon_scar20 (Lewis).
  Magazines come from vdata, so the script's RIFLE_MAG emulation is to be removed.
- Biplanes later replace jets; helicopters dropped. Flight volume must stay inside the main map (3D skybox content is drawn behind
  everything, so nothing a plane can fly near may live in the skybox). Planned air box x +-6400, y +-5400, z <= 5000; sky shell is at
  MAP_X/Y + 256, z -700..6400.
- Bots: infantry only.

- HQ textures (done for trench props): `tools/stock.py` maps chart materials to stock Valve materials per prop (`ASSIGN`); those faces
  skip the bake and get real-scale tiling UVs per face corner (plank strips / box / cylindrical). In use:
  boards = `hrts2_wood_floor_boards_02_wet` (4 board strips), rust = `de_overpass/metal/rusty_metal_1`, mud = `hr_ancient_ground_mud_03_wet`,
  bark = maple bark exported from the game files into `materials/models/tw/stock/bark_maple*` (the stock vmat has wind animation).
  Still baked: sandbags (no good stock hessian), crates/signs/medical crate (stencils), wrecks, helmets, wire, stretcher canvas.
  Rejected: palletwood/kasbah planks/cloth01 (legacy vertexlitgeneric, flat normals), maple_tree_bark_1 (F_VERTEX_ANIMATION).

- 3D skybox: `tools/make_skybox.py <user skybox vmap> out/addon/maps/mg_trenchwarfare_3dskybox.vmap` (terrain ring beyond the map edge
  at 1/16, ~4000 vista poplars/maples). Main map gets `skybox_reference` at (0,0,-12000) -> maps/mg_trenchwarfare_3dskybox.vmap (generated).
- Script (WIP, NOT yet run through test/mock.mjs or tsc): per-team weapons, RIFLE_MAG emulation removed, arcade flight added
  (startFlight/endFlight/tickAir/tickBombs, OnBulletImpact on `tw_plane_<t|ct>_N` prop_dynamics, CustomCamera FOLLOW_POSITION chase cam).
  Still to do for flight: map entities `tw_plane_<tag>_1..5` (prop_dynamic, `_dyn.vmdl` copies of the ext plane models with
  model_archetype "" ; nose is model -x), mock stubs (Move, GetCustomCamera, OnBulletImpact, ground-aware TraceLine), then tests.

- Flight done + mock-tested (no crashes in 240 s with 24 players): yaw/pitch steered separately (slerp flipped through the vertical),
  A/D roll (bank boosts the mouse turn, held bank turns on its own), soft box + hard clamp at box+600, ground avoidance,
  500-round belt, 2 bombs (rearm 18 s), engine loop (`sounds/tw/plane_engine.wav`, smpl+cue loop markers) and gun sounds on
  point_soundevents `tw_plane_eng|gun_<tag>_N` (SetSourceEntity -> plane). Chase view only (user: cockpit overlay looked silly);
  instruments are dark-faced brass dials bottom-centre (`tools/tw_cockpit.py`): bank, airspeed, compass, altimeter, rpm, ammo counter, bomb lamps.
- Upgraded infantry: SHIFT+E or `!swap` toggles streak weapon <-> scoped rifle (ammo kept). Iron-sight zoom for the Lewis/Mondragon is a
  vdata job for the weapons session: keep 1 zoom level (FOV ~55), `m_bHideViewModelWhenZoomed false` (no scope overlay).
- Ambience: cosmetic NML shell bursts every 4-13 s >= 550 u from players (script), soundscape children rifles/MG/distant shells/bullet whiz.
- Planes: `tw_plane_<tag>_1..5` prop_dynamic (`plane_spad7_dyn` / `plane_dr1_dyn`, archetype ""), parked on the strip (spacing 360).

- Delivered 03:10 26 Oct: tw2_content_01..10.zip (<20 MB each; 25+ MB uploads fail), tw2_map_main/skybox.zip, tw2_game.zip + new bat.
  Packaging: stale prop textures removed (only files referenced by vmdl remaps / vmats kept). Detail pass 1: trench clutter, flooded
  trench stretches, NML metal debris, airfield stores.

## Next
- Wait for the user's in-game feedback (flight angles/roll sign, skybox, vertex paint, stock materials on props).
- Polish ideas: dugout lanterns/lights in shelters, telephone wire on posts, periscopes, more varied revetments (wattle/hurdle),
  bomb/shell craters decals, smoke columns from wrecks, distant flashes on the horizon at night-ish skies, plane damage smoke.
2. Fill the 3D skybox (distant terrain ring, tree lines beyond the map edge) + skybox_reference in the main map.
3. Script: weapons per team (above), arcade biplane flight.
4. More detail pass; verify (check_mesh, previews, mock, tsc); zip + bat to `C:\source1\cs2port\assets\tw\`; update project doc.
