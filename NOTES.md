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

## Next
1. HQ textures on fabricated props: map chart materials to stock Valve vmats (tiling UVs from chart w/h), keep baked atlases only for
   decals/unique parts. Candidates being inspected with vtexread.
2. Fill the 3D skybox (distant terrain ring, tree lines beyond the map edge) + skybox_reference in the main map.
3. Script: weapons per team (above), arcade biplane flight.
4. More detail pass; verify (check_mesh, previews, mock, tsc); zip + bat to `C:\source1\cs2port\assets\tw\`; update project doc.
