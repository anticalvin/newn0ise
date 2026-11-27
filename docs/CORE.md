# n0ise Core

Core is the new 3D engine page: `core.html`, bundled from `src/core/*` to `assets/core.js`. It is a terrain, sea and physics world you can walk and sculpt. Studio, Effects, Lab and the Night Station world are unchanged (the Night Station card is only hidden on the World start sheet).

Open it from **3D → World → n0ise Core**, or directly: `core.html`, `core.html?start=blank`, `core.html?start=coast`, `core.html?start=continue`.

**South Africa world:** a streamed, geographically grounded mode (real OSM roads and buildings, terrain, traffic, one interior). See [WORLD.md](WORLD.md). The `world.*` commands are listed there and in `{"cmd":"describe"}`.

## Start sheet

| Choice | What you get |
| --- | --- |
| Blank | Flat land about 1.2 m up, a sky, a sun, a spawn point and nothing else. The sea is below the land, so sculpting down reaches it. |
| Coast demo | COAST_001: island, beach, dunes, palms, boulders, a pier and a shack. |
| South Africa | Opens the streamed world (Cape Town first, map to go anywhere). Island and blank are unchanged. |
| Import | A `.n0scene` you saved, or a `.n0world` to place on the land. |
| Continue | Your last autosave (only shown when there is one). |

Both presets run the same engine, tools and commands (`terrain.generate(seed, 'blank' | 'coast')`).

## Module map (`src/core/`)

`main` boot and app object · `core` command layer, history, save · `terrain` heightfield and brushes · `water` ocean · `env` sky and light · `nature` palms, grass, boulder meshes · `sand` grain particles · `phys` Rapier · `simlite` fallback solver · `character` stand-in character · `props` pier and shack · `world` `.n0world` import · `input` keyboard, touch, pad · `ui` dock and sheets · `api` AI bridge · `glsl`, `util`.

## Commands

Every mutation goes through `Core.exec(cmd)` and records one undo entry. It validates and clamps, and returns `{ok, msg, ...}`. `{"cmd":"describe"}` returns the live list and limits.

| cmd | Arguments |
| --- | --- |
| `undo`, `redo` | none |
| `scene.new` | `preset: "blank"\|"coast"`, `seed?` |
| `terrain.stroke` | `tool: raise\|lower\|smooth\|flatten\|sand\|rock\|grass`, `center:[x,z]`, `radius 1..40`, `strength 0.05..1`, `duration 0.05..3`, `invert?` |
| `terrain.reset` | `seed?`, `preset?` (terrain only; scenery stays) |
| `environment.set` / `water.set` | any of `time 0..24`, `cloud`, `wind`, `windAng`, `sea 0..1.2`, `tide -0.8..0.9` |
| `scatter.add` | `type?: "palm"`, `center`, `radius 2..60`, `count 1..60` (max 1600 palms) |
| `scatter.erase` | `center`, `radius` |
| `boulder.drop` | `x`, `z`, `radius? 0.3..3`, `height? 2..60` (max 60) |
| `player.teleport` | `x`, `z` |
| `spawn.set` | `x?`, `z?`, `yaw?` |
| `world.import` | `world` (object or JSON), `at?:[x,z]`, `name?` |
| `world.remove` | `index?` |
| `entity.create`, `entity.set`, `entity.remove`, `entity.inspect`, `entity.list` | see `describe` |
| `asset.catalog`, `asset.inspect`, `asset.place` | see `describe` |
| `prefab.build` | `type:"retail.convenience"`, `seed?`, `parameters?`, `at?`, `yaw?` |
| `store.door`, `product.take`, `product.return`, `interact.use` | see `describe` |
| `state`, `describe` | none |

The page console (`/`) takes shorthand (`time 18.5`, `sea .8`, `blank`, `coast`, `boulder`, `palms 10`) or raw JSON. `window.Core.exec(...)` does the same from the browser console.

### AI access

Same bridge as Studio. Start `node tools/mcp/server.mjs`, open `core.html?mcp=1`, then use:

- `n0_core` with `command` = any Core command above
- `n0_core_describe` for the list
- `n0_render` for a picture (the Core page answers `render`)

Core commands sent to the Studio page get a plain error pointing at `core.html?mcp=1`, because the bridge talks to one page at a time. Core accepts `{cmd:"core",command:{...}}`, a raw Core command, `batch`, `render` and `camera` (`mode`, `yaw`, `pitch`, `dist`, `target`).

## Physics

Rapier 0.14.0 (the same pinned CDN build as `src/sim.js`, loaded lazily): a heightfield collider rebuilt about 120 ms after sculpting stops, a kinematic character controller (slopes, autostep, snap to ground, pushes boulders), dynamic ball boulders with water drag, buoyancy and splash events, and static cuboids for the pier, the shack and imported shapes. If Rapier cannot load, `simlite.js` (the prototype's solver) keeps the world walkable and a message says so.

## Sand

Footsteps, landings, boulder impacts and the sculpt brush kick up thousands of small grains, and wind keeps a veil of grains hopping across dry sand near you. The ground also has per-grain speckle and glints up close. Grains are visual only: they fall, bounce up to twice, and settle. The beach is a heightfield, not granular sand.

## Saves

`n0ise.core.scene`, version 4 (reads 2 and 3; adds `entities` and `assetsUsed`). Stored in `localStorage` under `n0ise.core.scene` (falls back to the old `n0ise.core.coast001` key) and exported as `.n0scene`. It holds the preset and seed, the terrain as a compressed delta from the seeded base plus the paint mask, palms, boulders, environment, spawn, player, and any imported `.n0world` documents. Grass and footprints are rebuilt, not saved.

## `.n0world` import

`validateWorld` from `src/world-schema.js` runs first and its repairs are reported. Instances and prefabs are then placed as static solid shapes on the flattest dry spot near you (or `at`). The terrain is never changed. A `spawn` prefab becomes the Core spawn. The import sheet lists everything Core cannot do (openings not cut, doors closed, lights, cameras, rules, looks, material patterns, non-static physics, the world's own sky and fog). Nothing is dropped silently.

## Working / Approximated / Planned

The in-app guide (`?`) shows the same table; keep both in step.

- **Working:** sculpt and paint with undo, Rapier physics, walkable character, ocean with foam and swash, wet and dry sand, footprints, palms, grass, boulders, day and night, commands, autosave, `.n0scene`, `.n0world` import.
- **Approximated:** sand grains are particles, not granular simulation; the ocean is a wave model, not fluid; the character is procedural; imported worlds are static shapes.
- **Planned:** see [CORE_BACKLOG.md](CORE_BACKLOG.md).

## Phase 2 additions

Entities, assets and the convenience store: see [core-architecture.md](core-architecture.md) and [CORE_ASSETS.md](CORE_ASSETS.md). Use the Place tab to search assets or build a store; F, RB or the Use button opens the door and picks up the nearest product. Telemetry: `core.html?debug=1`.

## Workspace shell (`src/core/workspace-ui.js`, `ui/core-workspace.css`)

The launcher, workspace navigation, inspector and status bar are one bundled module, mounted once from `main.js` after `window.n0` exists (`n0.workspace`). It is a presentation layer over the legacy `UI` class and `Core.exec`; it owns no simulation state. `mountWorkspace()` is idempotent and `n0.workspace.dispose()` removes every node, listener, timer and method patch it added.

**Working:** Create (Blank, Third person = Blank's existing player), Projects (continue the single autosave, import), Examples and Labs (COAST_001, South Africa incl. Cape Town and the national map), return to the viewport, return from South Africa to the local scene; workspaces World, Assets and Environment open the real dock groups; Scene lists entities and edits position through `entity.set` (undoable); Diagnostics shows `n0.telemetry()` (a dash when unavailable) and opens the console, screenshot and `describe`.

**Planned and labelled so:** First person, Vehicle, Open world, Interior, HABITAT_01, the character/vehicle/gameplay laboratories, Simulate mode, named projects, gizmos, component inspector, and the Characters, Vehicles, Gameplay and Cinematics capability lists. Play is the old Explore mode, not isolated from editing.

**Lifecycle rules:** launch routes go through `app.start`; nothing switches while South Africa is loading (`geo.loading`); replacing the scene asks first when commands have run since it was started, loaded or exported; imports are parsed and checked (`Core.checkScene`, `readWorld`) before anything changes, and `Core.load` rolls back to a snapshot if it fails midway; `ui.modalOpen()` (launcher, guide, report, confirm) blocks keyboard, pad and movement input to the world.

Tests: `tools/core-smoke-workspace.mjs` (`node tools/core-smoke.mjs "workspace:"`).

## Convergence slice 1: projects, templates, routing (this release)

**Honest status.** This slice covers release gate A (route, project lifecycle, real template launcher) plus the steering fix. Gates B to F (gizmo editor, shared character/vehicle/interaction runtime, isolated Play/Simulate, traversal, Dynamics Lab, FIRST LIGHT on the shared runtime, MCP transactions, `.n0project` export) are **not done**. The geo runtime is still separate from the local runtime; no modules were consolidated beyond the ones listed here.

- **Routing.** Entering World in 3D (Studio) opens `core.html?from=studio`; the old start page is no longer on the normal path. The launcher has *Back to 3D* (`studio.html?stay=1`, which suppresses the auto launcher). Legacy places stay reachable under Labs: Photo Walk, Physics Sandbox, Night Station (`studio.html?stay=1#world:<place>`). Coast is no longer built at boot; the boot backdrop is Blank unless `?start=coast`.
- **Projects** (`src/core/projects.js`). IndexedDB: `projects` (manifest, `n0ise.project` v1), `scenes`, `snapshots` (recovery every 5th save, last 3 kept). Create, open, rename, duplicate, delete with confirmation, recover. Autosave writes the open project; the legacy one-slot localStorage autosave still works (Continue). Importing a scene file creates a project. The manifest lists asset ids with `hash: null` (hashing is not built). Portable `.n0project` is not built.
- **Templates** (`src/core/templates.js`) are data run through `scene.new`, `terrain.stroke`, `entity.create`, `prefab.build`, `boulder.drop`. Ready: Third person, Architecture (room kit with real door and window openings, editor camera), Empty (editor camera). Planned and labelled so: First person (no first-person camera), Driving (no vehicle in the local runtime), Open world. Starters: Mechanics Playground (PROVING GROUND 01: 72 ordinary entities, measured ramps 10 to 40 degrees, stairs 0.18 m rise, ledges 0.5 to 3 m, vaults, climb tower, target range tagged `target`, slalom, a working convenience store as the interaction room, three dynamic boulders), Empty Grid, Outdoor Terrain. **Not in Proving Ground yet:** moving platform, NPC arena, vehicle, virtual aiming and checkpoints (they need systems that do not exist locally).
- **Grid** (`src/core/grid.js`): a view aid saved as `view.grid` in the scene; neutral rock-grey ground replaces sand on grid starters.
- **FIRST LIGHT steering.** Contract: +X right, +Y up, forward = (sin yaw, cos yaw), steer > 0 turns right. The kernel turned left for D because it added to yaw; fixed in `Session.drive`, with the wheel and body-roll visuals flipped to match (one owner, no opposing hacks). `tools/first-light-steer.test.mjs` runs 13 pure-Node checks (five headings, A and D mirror, straight, reverse); 11 failed before the fix. Keyboard and gamepad share `mx`, so parity holds by construction; no on-device driving test was run.
- **Studio (2D editor).** Rotating from a corner now draws the pivot, the start ray, the live ray, a swept wedge and arc, eight 45-degree ticks, and a live angle readout (with the total in a second figure); the arc turns green when it snaps. The corner ring shows a rotate cursor and a faint ring on hover. Dark halos keep it legible on light and dark layers. Checked in the browser with synthetic pointer events, not with a touch device.
