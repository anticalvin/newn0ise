# n0ise World: South Africa

Core can open a streamed, geographically grounded world. Open it from the Core start sheet (**South Africa**) or `core.html?start=world` (`&lat=&lon=` to choose a place, `&resume=1` to continue). The island (COAST_001) and the blank scene are untouched: **Island** in the world HUD (or `{"cmd":"world.close"}`) returns to them.

## What you can do today

- Start in Cape Town (Adderley Street area, Table Mountain behind). Walk (WASD, Shift, Space), drive (F next to your car; W S A D, Space handbrake, R puts it back on the road).
- Press **M** or **Map** for the national map: relief, coast, trunk roads, cities, detailed regions. Click Cape Town for streets; click anywhere else in South Africa to stand on coarse national relief.
- Buildings gain detail as you approach (skyline, district, street facades with windows, doors and lit windows at night). One shop (the nearest mapped store with a usable footprint) has a real interior built from the existing `retail.convenience` prefab: walk in, F for the door and shelves.
- Traffic drives on the left on OSM roads; pedestrians use pavements. They keep their identity when you leave and come back.
- Everything you change (road closures, placed props, door and shelf state, your position, your car, actor positions, time of day) is saved separately from the map data and survives reload.

## Architecture (src/core/geo)

| Module | Responsibility |
| --- | --- |
| `georef.js` | WGS84 ↔ UTM (Krüger series, explicit zone). `RegionFrame` = a region's local metres (x east, z south). Doubles in, floats out. |
| `data.js` | `DataProvider` (manifest, national index, coarse DEM, abortable tile fetch, LRU) and `Storage` (player-authored state). |
| `terrain.js` | Tile height grids sharing edge samples, 3 mesh LODs with skirts, land colour from height, slope and land use. |
| `ocean.js` | `GeoOcean`: Core's Gerstner `Water` (waves, shoaling, foam, swash, CPU `heightAt`) driven by the shared Environment (wind angle, sea, tide). Ground depth comes from an 8 km camera-centred window sampled from `GeoWorld.heightAt`, rebuilt after 1.5 km of travel. The old flat plane stays as cheap far water. |
| `roads.js` | Vertex-level road graph (exact decimetre keys, so tiles join), A* routing, procedural road/pavement/centre-line meshes, lane inference. |
| `buildings.js` | Footprint → extruded building with roof form, facade shader, dithered fade-in, spatial index for collision, street furniture. |
| `sim.js` | Persistent actors, three tiers (near every frame, medium 4 Hz interpolated, far frozen and fast-forwarded). |
| `vehicle.js` | Walker and one drivable car (kinematic, 4-wheel ground sampling for suspension). |
| `manager.js` | `GeoWorld`: region frame, floating origin, streaming (async, cancellable, budgeted), LOD with hysteresis, store interior, persistence, HUD, `world.*` commands. |
| `map.js` | The overview sheet (2D canvas over the Core viewport). |

Reused from Core as is: Three.js renderer, sky/light (`Environment`), the stand-in character, `Entities` + the `retail.convenience` prefab, `Core.exec` and its undo history, the MCP bridge, telemetry.

### Coordinates and the floating origin
Global positions are double-precision metres in the region's UTM frame; tile geometry is stored relative to its own tile corner and the scene is positioned relative to a movable origin (`GeoWorld.origin`). The origin rebases when the player is more than 1.5 km from it (not while a store interior is active, because entity coordinates must stay within ±1000 m). Different UTM zones are handled per region; crossing regions goes through lat/lon.

### Resource budgets (`BUDGET` in manager.js)
Load radius 1.7 km, unload 2.3 km, max 26 tiles resident, 3 concurrent fetches, 5 ms per frame of mesh building, 700 actors, 400 edits.

## Data pipeline (tools/world)

```
pip install osmium numpy pillow
python3 tools/world/import.py --pbf south-africa-latest.osm.pbf --out data/world/za [--region capetown]
node tools/world/check_geo.mjs      # JS and Python projections agree
```

The raw PBF and the DEM downloads are **not** in git (`*.pbf`, `tmp/world-cache/` are ignored). The importer reads the PBF once (about 3.5 minutes for the whole country), keeps roads, buildings, land use, water, POIs for each configured region, and a national index (simplified coastline, motorway/trunk/primary roads, cities and towns). Elevation comes from AWS Terrain Tiles (Terrarium), not OSM. Output: `data/world/za/manifest.json` (counts, sha256 of every file, source versions), `national.json`, `national_dem.bin` (0.025° grid), and 1 km tiles `capetown/t_<x>_<z>.json` (40×40 height grid, roads cut exactly at tile edges, buildings, areas, POIs). Cape Town pilot: about 8 km × 10 km, 16,225 road ways, 22,540 buildings, 6.8 MB.

Every building carries its OSM id; heights have a source (`hs`): `tag` (mapped), `levels` (levels × 3.2 m) or `inferred` (deterministic guess from building type and id). Inferred heights, roofs and lane counts are labelled as such by `world.building.inspect` and `world.road.inspect` and are never presented as survey data.

### Licence
OpenStreetMap data is ODbL 1.0: © OpenStreetMap contributors. The HUD and the map show the attribution. The committed `data/world/za` files are a Produced/Derived database from OSM; if you redistribute them, keep the attribution and make the derived database available under ODbL (see https://opendatacommons.org/licenses/odbl/). Elevation: AWS Terrain Tiles, see https://github.com/tilezen/joerd/blob/master/docs/attribution.md . Review before any public release.

## Commands (`Core.exec`)

`world.open`, `world.close`, `world.goto`, `world.region.describe`, `world.region.load`, `world.region.generate` (explains the offline step), `world.road.inspect`, `world.road.edit` (closed, speed, name; `dryRun`; undoable), `world.building.inspect`, `world.building.populate` (`dryRun`; undoable), `world.assets.place` (`dryRun`; undoable), `world.simulation.inspect`, `world.performance.report`, `world.save`, `world.mode` (play|edit), `world.view.god` (Edit only). Errors are `{ok:false, code, msg, path}`. `describe` lists them with the limits.

## Play, Edit and God view
- **Play** is the default: walk, drive (F), enter the shop, open the map (M). Only the essentials are on screen.
- **Edit** (press E, then E or Enter to confirm, Esc to stay; E again returns to Play at once) adds: God view (G), time of day and day cycle, go to a city, place props, close or slow the nearest road, add a crowd, put a car beside you, car boost, undo.
- **God view** flies a free camera from street level up to 4,200 km. Above 45 km the streamed ground is hidden and a full-size relief mesh of South Africa (about 1,750 x 1,550 km at true scale, hillshaded, height exaggerated 6x, 30 city labels, a marker where you stand) takes over. Enter or "Drop here" puts you at that spot anywhere in the country.

## The rest of the country (`wilds.js`)
Outside a detailed region the ground is generated, not surveyed: national DEM (about 2.7 km grid) plus deterministic fractal detail keyed to lat/lon, OSM trunk, primary and motorway centrelines (41k polylines) as drivable roads, sparse trees by rough climate, and towns and cities as clusters of simple buildings sized by population. 1 km chunks stream within 6.5 km, share edge samples (no seams), and the frame re-projects (new UTM zone) when you are more than 3.3 degrees from its central meridian. Real streets, buildings, traffic and the shop interior exist only in Cape Town until more regions are imported.

## Roads and ground
Roads sit on the highest ground across their width plus pavements, are smoothed along their length, and have a 1.2 m bank on both sides so they never float on a slope or let land poke through. Bridges follow a straight line between their ends but never below the ground. Coarse terrain LODs use the lowest nearby sample so they stay under roads and buildings.

## Tests

`npm run test:world` (projection check + 12 browser tests: streaming, seams, road continuity, origin rebasing, LOD hysteresis, resource release, store interior, NPC identity, save/reload, command validation, island still works). `npm run test:core` runs everything.

## Honest status and known limits

- **Verified:** the tests above in headless Chrome (software GL), plus manual runs in the Claude browser pane. Frame rates on software GL are a floor, not a target; **no real-GPU or phone profiling has been done**, and 60 FPS is unproven. Visible geometry in the pilot is about 350k triangles at once.
- **Vehicle:** a kinematic arcade car, not a Rapier raycast vehicle. A Rapier benchmark was not done.
- **Buildings:** LOD 0 (skyline), 1 (extrusion + roof), 2 (shader facade, doors, windows, street furniture) work. LOD 3 interiors exist for **one** store, built from the existing prefab sized to the OSM footprint (clamped to the prefab's 8–24 × 6–16 m); it is not the real interior. No balconies, no per-region architectural grammar beyond colour and roof form. Multipolygon buildings and holes are ignored.
- **Roads:** one lane model per class (inferred unless OSM maps lanes), no junction geometry, no traffic lights, no turn restrictions. Tunnels are not drawn; bridges are flat ramps.
- **Simulation:** cars and pedestrians follow the road graph with simple following distance; no navmesh, no collision between player car and NPCs, no schedules beyond fast-forwarding on return.
- **Terrain:** Cape Town is a 96×96 grid per 1 km tile (about 10.4 m), Catmull-Rom resampled from AWS Terrarium zoom 14. The underlying source is still SRTM-class (~30 m), so the grid is smoother and better placed, not truly surveyed at 10 m. For real detail, give the importer a local DEM/DTM: `python3 tools/world/import.py --terrain-only --dem cape.tif --dem-license "..."` (needs `pip install rasterio`; recorded as non-redistributable in the manifest, Terrarium stays the committed fallback). Provenance lives in `manifest.json` under `regions.capetown.terrain`. LODs are strides 1/3/8 of the grid (`lodStride`), `heightAt` always reads the full grid. No terrain editing in the world. The far relief is a 1.5 km grid; the national relief is 2.7 km, so outside Cape Town the ground is smooth and blocky-looking.
- **Not done:** admin boundaries, MapLibre (the 2D map is a plain canvas), KTX2/meshoptimizer/BatchedMesh evaluation, Recast/Yuka evaluation, nationwide road meshes, more than one detailed region, regions generated on demand.
