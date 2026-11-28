# Core engine map

Where things live in `src/core/` today, and where they are going (see `ENGINE_ROADMAP.md`). Honest status: this describes **Core as it is** after Phase 0. The Session / InputStack / Systems spine is **Planned** (Phase 1), not built.

## Layers (current)

```
main.js            boot, mode flags (mode, shooter.active, firstLight.active, geo.active, lv, arena), frame loop, fixed 60 Hz step
core.js            Core: one command gateway (Core.exec), undo/redo, serialize/load, console words, describe
entities.js        entity registry: records {id, prefab, transform, parameters, components, tags}; meshes/colliders are derived
prefabs/ levelkit.js buildkit.js   prefab packs (build kit, level kit, props)
phys.js dynents.js simlite.js      Rapier world, entity-to-body bridge, fallback physics (to be removed, Phase 0 follow-up)
actor.js character.js combat.js grab.js guns.js weapons.js vehicle.js   living-world gameplay
camera.js input.js fx.js hud.js tune.js lab.js                          presentation and tuning
editor3d.js ui.js workspace-ui.js  editor, panels, start sheet
level.js           level creator Play runtime (.n0level.json)
world.js world-modes.js geo/       streamed world
first-light/       full game slice
game.js            three hardcoded mini-games
```

## Runtime
- three 0.187.0 and Rapier 0.14.0 are **vendored**: `tools/build.mjs` bundles them (wasm embedded) into `assets/core.js`. `core.html` has no import map and loads nothing from a CDN for the engine. Optional online features (Poly Haven browser, Sketchfab) still need a network and say so.
- `node tools/check-cycles.mjs` fails the build on circular imports in `src/core`.

## Target spine (Planned, Phase 1)
Session (Boot, Menu, Edit, Play, Pause, Result) owns InputStack and an ordered Systems list; prefabs declare components and parameter schemas. Not built yet.

## Module sizes and fan-in (generated 2026-11-28)
| module | size | imported by |
|---|---|---|
| actor.js | 20 KB | 2 |
| api.js | 3 KB | 1 |
| assetlib.js | 5 KB | 1 |
| assets.js | 6 KB | 1 |
| buildkit.js | 12 KB | 2 |
| camera.js | 6 KB | 1 |
| character.js | 20 KB | 2 |
| combat.js | 11 KB | 1 |
| core.js | 34 KB | 1 |
| debug.js | 2 KB | 1 |
| dynents.js | 5 KB | 1 |
| editor3d.js | 34 KB | 1 |
| entities.js | 14 KB | 3 |
| env.js | 4 KB | 2 |
| first-light/audio.js | 4 KB | 1 |
| first-light/district.js | 14 KB | 1 |
| first-light/game.js | 22 KB | 1 |
| first-light/host.js | 2 KB | 1 |
| first-light/menu.js | 11 KB | 1 |
| first-light/simulation.js | 15 KB | 4 |
| first-light/visuals.js | 27 KB | 1 |
| fx.js | 8 KB | 1 |
| game.js | 14 KB | 1 |
| geo/buildings.js | 19 KB | 1 |
| geo/data.js | 3 KB | 1 |
| geo/georef.js | 2 KB | 1 |
| geo/manager.js | 73 KB | 2 |
| geo/map.js | 9 KB | 1 |
| geo/ocean.js | 3 KB | 1 |
| geo/roads.js | 11 KB | 2 |
| geo/sim.js | 12 KB | 1 |
| geo/terrain.js | 6 KB | 2 |
| geo/vehicle.js | 6 KB | 1 |
| geo/wilds.js | 12 KB | 1 |
| glsl.js | 6 KB | 13 |
| grab.js | 6 KB | 1 |
| guns.js | 7 KB | 2 |
| hud.js | 3 KB | 1 |
| input.js | 13 KB | 1 |
| lab.js | 9 KB | 1 |
| level.js | 12 KB | 2 |
| levelkit.js | 13 KB | 3 |
| main.js | 33 KB | 0 |
| nature.js | 13 KB | 3 |
| photowalk.js | 11 KB | 1 |
| phys.js | 12 KB | 1 |
| post.js | 2 KB | 1 |
| prefabs/retail.js | 12 KB | 1 |
| prefabs/room.js | 3 KB | 2 |
| props.js | 5 KB | 1 |
| sand.js | 7 KB | 1 |
| simlite.js | 8 KB | 1 |
| terrain.js | 15 KB | 3 |
| tune.js | 2 KB | 6 |
| ui.js | 23 KB | 1 |
| util.js | 2 KB | 18 |
| vehicle.js | 7 KB | 2 |
| water.js | 9 KB | 3 |
| weapons.js | 26 KB | 1 |
| workspace-ui.js | 30 KB | 1 |
| world-modes.js | 6 KB | 1 |
| world.js | 9 KB | 1 |
