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

## Living world layer (movement, grab, combat) — v2 port

The prototype in `AGENT_PROMPT_core_v2.md` is now Core's one movement system. The player in every local mode (Blank island, Coast demo, Import, Continue, Lab, the editor's Explore camera, first person, the coins game) is an `Actor`; fighters are the same class. The geographic world (South Africa) keeps its own walker and car for now and only borrows the character mesh.

| Module | What it is |
|---|---|
| `tune.js` | `TUNE` (live constants) and `SCHEMA` (panel layout). Read every step by `actor.js`, `camera.js`, `combat.js`; nothing caches them. |
| `actor.js` | Locomotion with constant acceleration, analog walk to run, coyote time, jump buffer, variable jump, landing squash, lean, footstep events; the `ATTACKS` table and the free / attack / hit / down / getup / dodge / dead state machine. `render(alpha, dt)` interpolates, `character.limb()` gives hand and foot positions. |
| `character.js` | Block-built humanoid with a critically damped bone animator and keyframed `ACTIONS`. Still accepts the old `update(dt, speed, onGround, depth, vy)` call that the geo world makes. |
| `combat.js` | Strikes (cone and reach, once per target per attack), combo chaining with an input queue, block, parry, dodge i-frames, armor, knockdown, KO and respawn, per-actor hit-stop, lock-on, fast props that hurt, fighter AI (`brawler`, `heavy`, `dummy`). |
| `grab.js` | Cursor or reticle pick, velocity-driven hold with gravity scale 0, mass limits lift and speed, wheel changes lift, release keeps velocity (26 m/s cap). Used by explore left-click and the Fighters group's Grab tool. |
| `camera.js` | `CamRig` works on the shared `app.cam` object (so the editor, shooter and tests that write `yaw`, `pitch`, `dist` still work; a direct write is adopted as the new target). Critically damped follow, look-ahead, soft lock-on, terrain-aware boom, speed FOV, trauma shake. |
| `fx.js`, `hud.js` | Spark and dust pools, rings, WebAudio synth (`M` mutes); player HP, combo, floating enemy bars, lock reticle. |
| `phys.js` | Merged into the existing file: one kinematic capsule per actor and one shared `CharacterController`; dynamic boulder, crate (cuboid) and barrel (cylinder) with explicit masses, CCD, water drag and buoyancy; `interp(alpha)`; the terrain-rebuild step now lifts props onto the new surface, and a safety net puts back any prop that tunnels below the ground or leaves the world. Without Rapier an actor falls back to the sculpted ground (no solid props). |
| `lab.js` | The Tune panel (`T` key or button): every `TUNE` slider, a per-attack editor, spawn and test tools, presets saved to this browser, Copy and Paste JSON, and `flatArena()`. The **Combat lab** entry (Labs tab, or `?start=lab`) opens a flat 220 m grid arena and sets `core.noSave`, so it never touches your autosave. |

**Timing.** One fixed 60 Hz step per frame loop (bounded to 6 catches-ups), driven by `fixedStep` in `main.js`: intent from latched input edges, then actors and fighters, then grab, then physics. Rendering interpolates between the last two steps. Global slow-mo is `app.slowmo(scale, dur)`; hit-stop is per actor.

**Input ownership.** `app.inputOwner()` returns `modal`, `firstlight`, `fps`, `geo`, `editor` or `play`. Combat keys, left-click punch and grab act only for `play`; movement also works in `fps`; the editor keeps its shortcuts in `editor`. Controls: WASD, Shift run, Space jump (hold for height), J or left click punch, K kick, Q block (a tap just before a hit parries), C dodge, Tab lock on, click a prop to grab, wheel lifts, right or middle drag orbits. Pad in Play: A jump, X punch, Y kick, B dodge, LT block, RT grab, RB lock-on, LB use, L3 run, R3 recentre, Select toggles Edit (the old mapping is unchanged in Edit, geo and first person). Touch: stick plus Jump, Punch, Kick, Block, Dodge buttons.

**Commands and saves.** `boulder.drop {kind: boulder|crate|barrel}`, `actor.spawn {kind, x, z}`, `actor.clear`; console words `crate`, `barrel`, `fighter`, `brawler`, `heavy`, `dummy`, `clear`. `.n0scene` gains `actors` (kind and home) and a sixth boulder field `kind`; saves without them still load (boulders, no fighters).

**Changed from the prototype.** The fighter AI's `wantBlock` was never applied to the body in the prototype; it is now, so fighters block. Fighters stand still while you are in Edit or a sheet is open. Prop hit checks read the fixed-step transform (`cp`), not the interpolated mesh. The scene snapshot (scene.new undo) now includes fighters and prop kinds. Coast now starts with two fighters and a crate stack and barrels; Blank is the player alone.

**Approximated, kept honest.** Melee hit checks are a reach-and-cone test, not per-limb hitboxes. The characters are block-built with no skinned mesh and no ragdoll; knockdowns and hits are authored poses. Grab is a velocity target, not a joint. Crates and barrels are rigid bodies; there is no fluid, granular, vehicle or pedestrian simulation. The no-Rapier fallback treats every prop as a sphere.

**To apply tuning:** press `T`, set the sliders, Copy JSON, and give it to the agent to write into the defaults in `tune.js` and `ATTACKS`.

Tests: `tools/core-smoke-living.mjs` (`node tools/core-smoke.mjs "living:"`).
