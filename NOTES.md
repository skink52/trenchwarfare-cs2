# Working notes (AI session log)

Read this first when resuming. Newest state at the top.

## State 2026-10-26 ~13:15 ACDT (tw8_content_01.zip radar, tw8_game.zip overview)

- Radar: `tools/make_radar.py <vmap> <addon> <game>` - 1024 px, pos -4300/4700, scale 8.40 (was: 2048 px painted trench map of x,y +-6800, scale
  13.2812): hillshade + contours, churned no man's land, crater and trench pools (clipped to the floor), revetted trenches with sandbag
  lips and duckboards, shelters, mortar pits, wire, wrecks, every tree crown with shadow, both aerodromes with hangars and parked
  aircraft, skirmish fence + exit ladders, labels, compass, scale bar; areas players can't walk are dimmed. BC7. Built from the
  user's latest vmap (out/user_1300.vmap). render_top.py still makes the mortar targeting screens (its old radar output is superseded).

## State 2026-10-26 ~13:05 ACDT (tw7_content_01.zip: banner, HUD role cards, script)

- unpack_mg_trenchwarfare.bat now applies each zip once (logs\mg_trenchwarfare_applied.txt, pre-seeded with tw3..tw6) - a re-run no
  longer overwrites the user's Hammer edits with an older map. Map changes from now on must be regenerated from the user's latest vmap.
- Banner (user's wording): THE WESTERN FRONT / hold the line / rewards and glory / !roles / !swap / Slime Servers discord.
- Chat !infantry / !mortar / !air show a role orders card (HUD #tw_info, right of centre, 9 s) and set the preference; !roles shows
  all roles with team counts. Card text is the user's.
- User's Hammer edits since tw6 (vmap at 13:00, copied to out/user_1300.vmap; not yet regenerated): skirmish ladders moved to y 2904
  near-vertical (pitch -4) with their own toolsinvisibleladder meshes outside tw_gen, skybox_reference at (0,0,0), two skirmish trees
  moved, 10 wire coils + 10 wire fences added along the track/rim. Generator updated to match (ladder pose, no generated climb
  volume, skybox_reference at 0,0,0; ladders no longer exempt from edit preservation). Next regen: make_map.py user_1300.vmap ... gen_tw6.vmap.

## State 2026-10-26 ~11:40 ACDT (tw6_content_01.zip + tw6_map_main.zip; unpack_mg_trenchwarfare.bat applies tw2..tw9 in order)

- Regenerate from the user's Hammer-edited map: `make_map.py <user vmap> <out> <addon> <previous generated vmap>` (here
  out/gen_tw4.vmap; the generated output of each delivery is kept as out/gen_twN.vmap). Generated objects the user moved/added are
  re-tagged vis group `tw_user` (kept, and registered as placer obstacles); the generated originals they replaced are skipped via
  out/user_edits.json. Matching tolerates Hammer's float/angle re-save. User edits so far: 12 revetments on the shelter niche walls,
  a moved field telephone, two widened no man's land puddles; their own explosions/logic_auto/logic_timer are outside tw_gen.
- Ladders adopted from the user's edit: base on the trench floor at x = +-(xw + 49), sunk 7, pitch -29.
- Woods skirmish: north wall of the last fire-trench traverse (x +-1716, y 2916) has a gap in the trench clip, no sandbags, a leaning
  ladder (solid off) and a `toolsinvisibleladder_wood` climb volume, plus TO THE WOOD / ZUM WALD signs. A fenced track (110 wide,
  player-clip slabs + barbed-wire panels with gaps) runs north-west to a shared clearing in the wood (x +-1210, y 3450-4415) with
  mirrored cover (logs, stumps, broken trees, sandbag scrapes, stores). Minimap boundary and battle-zone probe extended to y 4500.
- vmdl hull bug fixed in weather_ext (tw5).

## State 2026-10-26 ~08:00 ACDT (update 4: tw4_map_main.zip + update4_mg_trenchwarfare.bat, apply after update 3)

- Trench water: pools now never overlap (two sheets z-fought where the old planner picked the same basin twice), are capped at 5 u deep,
  and each sheet extends one cell past its shoreline except next to a separate lower basin, so no sheet edge hangs above the floor
  (make_map prints "rim cells below the water": 0). 21 pools.
- Next: in-game check of update 3/4 (plane angles, pawn hiding, decals, stock materials); optional walk-up/taxi take-off; more dressing
  in the mortar pits and airfield.

## State 2026-10-26 ~05:30 ACDT (update 3 delivered: tw3_content_01..05.zip, tw3_map_main.zip, update3_mg_trenchwarfare.bat)

- HD textures: every procedural prop now uses CS2 game textures where one fits (`tools/stock.py`). New custom csgo_complex vmats exported
  from the game files into `materials/models/tw/stock/` (`export_custom`, `CUSTOM` table): hessian a/b/c (pbr_defaults cloth001, tinted),
  canvas / canvas_dark, paint_feldgrau / khaki / dark / white (metalhull003a chipped plate: paint applied to the neutral grey, rust kept,
  roughness derived), brass / steel (de_mirage metal_basic_1), rope (rope_braid_1), boards_dark / boards_warm (train boards 02, tinted).
  Stock vmats used directly: train boards 02 wet, rusty_metal_1, metal_rust_001, ancient mud 03 wet. Modes: plank / box / cyl / chart
  (the chart's own unwrap at real scale), `swap` turns the tile 90 degrees. ASSIGN values may be lists = variants picked per part
  (sandbags mix 3 hessian shades, revetments mix 3 board shades). Unique art stays baked: decals, map table, coals, water, glass.
- Decals: `geo.decal(img_id, origin, u, v, size)` quads + `spec['decal_imgs']` -> alpha-tested `<prop>_decal` atlas (crate stencils,
  red crosses, sign lettering). `tools/clean_stale.py` drops material files no vmdl references any more.
- Aircraft (`tools/weather_ext.py`, source kept in `out/ext_src/`): the Sketchfab models were yawed ~30 deg off their axis - now rotated
  nose +x and centred; ~50 materials -> one 4096 atlas per plane (planar charts, min-area rects), baked with original colours + cloth /
  wood / metal detail + object-space wear (castor oil + soot aft of the engine, wheel mud, faded dope, worn edges, repair patches,
  bullet holes), compound physics hulls (wings, fuselage, tail). SPAD prop-blur disc replaced with real 2-blade prop + hub.
  Script: MODEL_YAW 0, PITCH_SIGN -1, ROLL_SIGN 1 (Source pitch + = nose down); pilot pawn hidden in flight (SetModelScale 0.02 +
  alpha 0, restored on landing/reset), PILOT/COCKPIT offsets moved to the real cockpit (x ~ +46).
- Map: signs on the revetments (post against the wall, face to the walkway, niche walls excluded), no sandbag scraps on wall stubs
  < 40 u, weeds check overlaps, parked planes yaw fixed for nose +x, banner rewritten (roles, controls, chat commands).
- Gameplay check (theory): infantry eye on the fire-step clears the parapet by ~27 u; clips keep infantry in the trench system by design;
  mortar seats/table/box/tube reachable inside the pit clip; pilots drawn every 30 s and air-spawned 1100 above their field (no walk-up yet).

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

- tw9 (26 Oct): mine tunnels under the south (rear) ends of both trenches (`LY.tunnels()`, mirrored). Sap from each trench's
  south end ramps from the trench floor to z -260, landing, two parallel galleries + cross-cuts, listening posts, centre charge chamber
  (shell crates). Closed 16-u grid mesh (mud_wet floor, board roof, dirt2 walls), terrain cells over the sap cut by corner height
  (parapet layer covers the opening), revet/sandbags/clip skipped at the portal. Dressing: tunnel_set timber every 48, duckboards,
  26 lamps (light_omni2), sap signs `sign_sap_gb/de`, tunnel_probe. Radar shows galleries (dark band, dashed timber edge, lamp dots).
  Generated output kept as out/gen_tw9.vmap (pass as argv[4] next time with the user's newest vmap as argv[1]).

- tw10 (26 Oct): saps moved to the south end of the SUPPORT trench (x 2096-2192, portal y -2816; `LY.TUN_SAP_XC`, `TUN_LANDING`),
  galleries extended to x 2032, extra cross-cut (1376) and listening post (1680). Tunnel lamps unshadowed (CS2 4-slot shadow limit;
  `tun_lamp` caps range by distance to the surface, max 130), only the chamber keeps 2 shadowed lamps. tunnel_set cap/sill yaw fixed
  (euler(90,0,0)). Agents: script SetModel on OnPlayerReset (T Guerrilla Warfare f2/f/a/b/c, CT Gendarmerie b/a/d, by slot), precached by
  prop_dynamic `tw_agent_N` below the lobby. Next: recolour (khaki/feldgrau) + Brodie/Stahlhelm pass on copies of those agents.
  Generated output: out/gen_tw10.vmap.

- tw11 (26 Oct, from the user's 14:22 vmap, prev gen_tw10): vis hints refit (Low: trenches+saps y -3600..3300 z -300, skirmish track,
  mortar pits, galleries, wood clearing; Lower: no man's land above the galleries; Lowest over all). Lightmap player-space volumes
  (`toolslightmapres.vmat`): one closed shell on a 64 grid over the walkable band (trench floors to parapet +128, NML, skirmish outline,
  mortar pits), a box per tunnel rect, the lobby. Generated output: out/gen_tw11.vmap.

- tw12 (26 Oct, from the user's 14:46 vmap): bake charting stalled on "26669 unique meshes" (every prop forced bakelighting=1, x LODs).
  Now foliage, wire and props < 40 u are light-probed (bakelighting 0, `probed()`): 3356 probed / 2752 lightmapped. Far probe strips
  (`far_probe_N`, voxel 108, z -140..900) around bf_probe cover the outer forest; aerodrome probes extended down to the ground.

- tw13 (26 Oct, first playtest fixes): no periodic air draw - pilots posted on respawn (AIR_CHANCE + merit, !air preference first) or
  immediately by !air/!mortar/!infantry (`requestRole`, queued if full). Planes died on spawn: groundZ() traced into the player's own
  plane (now ignores all aircraft). OnModifyPlayerDamage guard: pilots only take enemy/crash damage, mortar crews in their pit only enemy
  damage; blocked hits logged as "[tw] blocked ..." (crew died on firing, cause not found in script - check console). Clips lowered
  (trench walls g+110, skirmish +128, mortar enclosures +220). Fog lighter (cubemap 400-7500 max 0.85, volumetric 0.6, 3 fog banks,
  15 ground patches). `!agents` toggles SetModel agents (suspect for oversized first-person weapons). Weapons: copy bat
  `copy_ww1_weapons_mg_trenchwarfare.bat` brings weapons.vdata + models/materials ww1 from the testing addon.

- tw14: giant first-person weapon (stock AWP too, !agents made no difference) - suspect hidePawn's SetColor on every reset (render mode
  change draws the local third-person body/weapon). hidePawn now only scales, and only un-hides a pawn it hid. testing weapons.vdata
  needs no edits for this addon (same model paths; loadout classes match the map script).

- tw15: aircraft effects. `tools/fx_models.py <addon>` builds models/tw/fx: tw_bomb (lit), tw_tracer / tw_bombsight / tw_gunsight
  (self-illum, csgo_vertexlitgeneric F_SELF_ILLUM). Per plane prop_dynamics parked at z -3600: tw_bomb_<tg>_1..2, tw_tracer_<tg>_1..6,
  tw_bombsight_<tg>, tw_gunsight_<tg>. Script: bombs ride their entity, every 3rd round a tracer streak flies at 9000 u/s to the hit
  point, gun-sight pip 1600 ahead (or at the first obstacle), bomb-sight ring at the predicted ballistic landing point (visible to all).
  Gun sound: tw.plane_gun = m249_01..03 (pitch 0.96-1.04), 3 point_soundevents per plane (gun, gun2, gun3) round-robin every 2nd round.

- tw16/17: agent models removed entirely (SetModel drew the local body/head in first person; user: disable custom agents altogether),
  agent precache props removed. Shelter (dressing station) had no hull: now one convex hull over the earth mound.

- tw18: minimap misaligned - cs_minimap_boundary corners were (-2900,-3500)/(2900,4500) while the radar image/overview txt cover
  +-6800: boundaries now at the image corners (-6800,6800)/(6800,-6800); radar vtex capped at 1024 (as the validated cs2port radar.py).
  (Unconfirmed which of the two CS2 reads.) Planes: no automatic pull-up any more - touching the ground/world = crash (kill + explosion),
  "PULL UP" warning below 320 u. Mortars: the loader (c.loader, set when loading) deals a non-lethal share first (>= 55 where the victim
  has the health) so CS2 counts an assist; the firer deals the rest and gets the kill.

- tw19: cs_minimap_boundary removed (CS2 drew its own top-down minimap of the lobby from them instead of the radar png).
- tw20 (from the user's 16:58 vmap): full regeneration reshuffled ~450 generated objects (user edits now act as placer obstacles ->
  rng cascade), so this delivery is `tools/patch_vmap.py` applied straight onto the user's vmap: removes minimap boundaries, adds the
  propellers. Propellers: `tools/split_props.py <addon>` splits them out of the weathered plane SMDs (pristine copies in out/ext_full;
  re-run after weather_ext.py) into plane_X_prop models (origin on the hub, out/prop_hubs.json); tw_prop_<tg> prop_dynamics spun by the
  script (roll += 900-2400 deg/s with throttle, Source AngleVectors basis for the hub offset), static ones on the hangar planes.
  Mortar sight map: render_top.py now crops make_radar's unlabelled render (out/radar_clean.png), EXT 4600 (= CONFIG.TARGET_EXT)
  so the wood is on it. Unpack bat fixed: applied-list lines had a trailing space so findstr /x never matched and every zip from
  tw7 on was re-extracted on every run; now /b match, (echo x)>>file, loop tw2..tw99.
  TODO generator: per-section rng so user obstacles don't cascade; until then prefer patch_vmap.py-style deltas on the user's map.

- tw21: radar rebuilt from scratch on the validated cs2port conventions: 1024 png, vtex template (max 1024, no lod, clamp), overview
  txt template (material overviews/<map>_radar, pos = top-left corner, scale %.2f, CT/T spawn fractions). Region fitted to the ground play
  space: pos_x -4300, pos_y 4700, scale 8.40 (span 8601.6; aerodromes off the map). 16x16 lettered grid; `!pos` prints position + grid
  square (CONFIG.RADAR) to check alignment in game. Adds ladders, dressing-station crosses, sap entrances. out/radar_region.json feeds
  render_top.py (mortar sight). If still off in game: compare a `!pos` square with where the dot is drawn.

- tw22: LOD pops visible at ~300 u: all LOD switch thresholds x4 (modelio.LOD_SCALE = 4 applied to every prop's lod_thresholds;
  the 54 existing vmdls patched in place: 12->48, 20->80, 25->100, 30->120, 60->240). Stock Valve foliage keeps its own LODs.

- tw23: plank revetments jumped on LOD swap: p_trench.revetment_planks spaced planks with a LOD-dependent gap (x0.5 in LOD1), so
  LOD1 planks sat lower. Gap now identical in every LOD; the 6 plank revet models rebuilt (bounds LOD0 vs LOD1 within 0.4 u).

- tw24: LOD pops still very noticeable. Measured LOD0-vs-LOD1 shape deviation for every prop (p95 of nearest-surface distance):
  shattered trees 20-48 u, tunnel_set 10, hangar 9, stumps 7-8, log 6, shelter/wire_coil/wreck_tank ~2 -> these ship LOD0 only
  (modelio.SINGLE_LOD). Everything else (revets ~1.2-1.7, sandbags ~0.7, crates ~0.1) keeps LOD1 but LOD_SCALE is now 16
  (thresholds 192-480). Existing vmdls patched in place. Proper fix later: derive LOD1 from LOD0 (decimation) instead of a second generation.

## Next
- Wait for the user's in-game feedback (flight angles/roll sign, skybox, vertex paint, stock materials on props).
- Done 03:12: shelter candles + baked warm light, wreck/crater smoke, distant smoke columns, damaged-plane smoke (HP <= 45).
- Polish ideas: telephone wire on posts, periscopes, more varied revetments (wattle/hurdle),
  bomb/shell craters decals, smoke columns from wrecks, distant flashes on the horizon at night-ish skies, plane damage smoke.
2. Fill the 3D skybox (distant terrain ring, tree lines beyond the map edge) + skybox_reference in the main map.
3. Script: weapons per team (above), arcade biplane flight.
4. More detail pass; verify (check_mesh, previews, mock, tsc); zip + bat to `C:\source1\cs2port\assets\tw\`; update project doc.
