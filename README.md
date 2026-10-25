# mg_trenchwarfare (CS2) - generator source

> **AI-generated code.** Everything here (map generator, procedural props and textures, HUD and the cs_script) was written by an AI
> agent (Claude) for skink52's mg_trenchwarfare addon.

Needs Python 3 with numpy, scipy, Pillow; Node 18+ for the tests.

| Step | Command |
|---|---|
| props (procedural, baked PBR) | `python3 tools/build_all_props.py [names]` -> `out/addon/models/tw`, `materials/models/tw`, previews in `preview/` |
| downloaded glb models | `python3 tools/glb2cs2_multi.py <file.glb> out/addon <name> --length <units>` -> `models/tw/ext/<name>` |
| map | `python3 tools/make_map.py <current .vmap> out/addon/maps/mg_trenchwarfare.vmap out/addon` (terrain is in the map itself, ~47 MB vmap; everything generated is in vis group `tw_gen`, so re-running on a map edited in Hammer only replaces that group) |
| targeting screens, radar, paper map | `python3 tools/render_top.py out/addon out/game` |
| HUD | `python3 tools/tw_hud.py out/addon` |
| sounds | `python3 tools/sounds.py out/addon <template soundevents_addon.vsndevts>` |
| script | `src/mg_trenchwarfare.js` -> `out/addon/maps/scripts/` |
| entity dump for tests | `python3 tools/dump_entities.py out/addon/maps/mg_trenchwarfare.vmap out/entities.json` |
| tests | `node test/mock.mjs 32 120` (mock cs_script run), `cd test && tsc -p tsconfig.json` (types) |

Layout constants (trench lines, mortar pits, hangars...) live in `tools/layout.py` and are shared by the map, the renders and the script data.
