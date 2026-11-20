# Core backlog

In proposed order. Phase 1 (`core.html`, Rapier, commands, `.n0world` import, blank and coast, sand) is done; none of the below is started.

1. **Real character.** Swap the procedural stand-in for the repo human (`src/human.js`, `src/figure.js`, walk cycle, ragdoll). Keep the stand-in as a fallback. Needs a retarget of the controller's capsule and foot placement; do it as its own commit.
2. **Generic scatter.** One scatter system over any prefab: an instanced field per prefab, deterministic from seed plus brush strokes, with density, slope, height and wet-line rules. Palms and grass become two entries of it, and `.n0world` prefabs can be scattered. Command: `scatter.add {prefab,...}`.
3. **Place `.n0world` objects as editable things.** Move, rotate, delete and snap imported instances, keep their ids, honour `phys` (dynamic and kinematic), and run the world's rules and doors through a small runtime shared with Studio.
4. **Save everything.** Persist grass density, footprints and sand wear (a cheap tile of changes), and move saves from `localStorage` to IndexedDB so big worlds fit.
5. **Tile streaming.** Split the 256 m world into tiles that load and unload around the player (heightfield, paint, scatter, colliders per tile), raising the world size without raising memory.
6. **Buildings and interiors.** Room, door and stair prefabs from the `.n0world` schema as walkable, lit interiors with portals or cheap occlusion.
7. **Vehicles.** A Rapier raycast vehicle, enter and exit, camera follow; start with the schema's `vehicle` prefab.
8. **Pedestrians and crowds.** Navmesh from the terrain service, instanced agents with a shared walk animation, avoidance. Say "crowd" only when it is one.
9. **Fuse and the look pipeline.** Node graph for materials and scene logic, and the Effects look pipeline over the Core view.
10. **Richer AI commands.** Camera paths, screenshots with passes, and batch scene authoring through `n0_core`, with the same limits.

Not planned: real fluid, granular sand or soft-body simulation. If they ever land they get their own entry and the guide moves them from Approximated to Working.
