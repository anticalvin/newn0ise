# Core engine roadmap

Source: CORE_ENGINE_PLAN and the master prompt. One PR per phase step. Status words are literal: **Done**, **Partial**, **Planned**.

| Phase | Outcome | Status |
|---|---|---|
| 0 Stabilise | Vendor three + Rapier (offline), delete `.bak`/junk, docs truth pass, cycle check, test runner | **Partial** (see ledger) |
| 1 Spine | Session, InputStack, Systems, component schemas, merge duplicate weapons/vehicle/terrain/UI | **Partial** (step 1: Session, InputStack, Systems landed; see ledger) |
| 2 Projects, storage, export | Project manifest, IndexedDB/OPFS, `.n0project`, export player | Planned |
| 3 Gameplay as data | Rules, triggers, spawners, HUD widgets, templates | Planned |
| 4 Characters and AI | AnimationMixer, skinned characters, ragdoll, navmesh | Planned |
| 5 Assets and scale | KTX2/meshopt, auto colliders, LOD, scatter, streaming | Planned |
| 6 Presentation | three.quarks VFX, audio mixer, quality presets | Planned |
| 7 Connect Studio | Studio models, avatar, Effects looks, Nodes materials in Core | Planned |
| 8 Optional | Multiplayer, collaboration, sandboxed scripts | Planned |

## Phase 0 ledger
| Item | Status |
|---|---|
| three 0.187.0 and Rapier 0.14.0 bundled, import map and Rapier CDN import removed from `core.html` / `physics.html` | Done |
| `vehicle.js.bak` and tracked `tmp/oldshots` removed | Done |
| Circular-import check (`tools/check-cycles.mjs`) | Done, not yet wired into CI |
| `docs/ENGINE_MAP.md`, this file, `THIRD_PARTY.md` entries, `CORE_EDITOR.md` "Blank island" fixed | Done |
| Playwright runner replacing the custom Chrome-path CDP runner | **Planned** (still `tools/core-smoke*.mjs` with a local Chrome) |
| Remove `sim.js` / `simlite.js` fallback | **Planned**: `simlite.js` still provides `Boulders`; removal needs a parity port first |
| Archive prototypes to `archive/`, tag `pre-core2` | **Planned** |
| Unused-export scan and dead-code removal | **Planned** |

## Phase 1 ledger
| Item | Status |
|---|---|
| `session.js`: Session (state boot/menu/edit/play/pause/result), InputStack, Systems | Done |
| `inputOwner()` deleted; every caller uses `app.session.owner()` | Done |
| Input ownership pushed/popped at the activation sites: modal sheets (DOM watcher), first-light host, geo world, first-person shooter, car (vehicle) | Done |
| Fixed step is an ordered system list (control, grab, weapons, combat, rules, physics, aim, vehicle) with enable flags and `?debug=1` per-system timing | Done |
| Remaining systems from the plan (character, pickups, ai, camera, audio, vfx, ui) as separate fixed-step systems | Planned: character, pickups and ai still run inside `combat`/`rules`; camera, audio, vfx and ui run per frame, not in the list |
| Mode flags removed (`shooter.active`, `firstLight.active`, `geo.active`, `lv`, arena) | **Planned**: these remain as each module's own bookkeeping and about 40 places still read them. Input ownership no longer depends on them |
| One shared rebindable binding table (keyboard, mouse, touch, gamepad) | Planned: bindings are still in `input.js` |
| `schema.js`: prefab schemas ({name, type, min, max, step, default, label, group}) and component declarations; validation derived from the schema | Done for prim.*, the level kit (blocks, ramp, props, pickups, fighters, car, light, spawn). `build.*`, `asset` and `model.online` keep their own validators and declare components and labels only |
| Details panel generated from the schema (the hand-written car, light, size, colour and boulder blocks were deleted) | Done for schema prefabs; `build.*` and assets keep their custom rows |
| `describe` lists every prefab with components and parameters; console `prefab` and `prefab <name>` | Done |
| Components (model, collider, rigidbody, character, health, weapon, pickup, vehicle, ai, trigger, spawner, light, audio, emitter, script) | Declared only: they describe prefabs but systems do not read them yet. `trigger`, `audio`, `emitter` and `script` are not used by any prefab |
| Weapons: one shared stats table `weapondata.js` (pistol, rifle, shotgun: damage, rate, magazine, reload, pellets, range, spread) used by `guns.js` and the first-person `weapons.js` | Partial: the two views still exist and keep their own pose, recoil and impulse numbers; the shooter's Blaster and Repeater are mini-game weapons outside the table. Rifle and shotgun numbers changed slightly in both views to match |
| Vehicles: the streamed world's car now uses the same `carMesh` as the level car (the hand-built box car in `geo/vehicle.js` was deleted) | Done for the model. The two cars still have different dynamics (arcade kinematic car on streamed terrain vs Rapier raycast vehicle) because the world has no Rapier world; one dynamics model is **Planned** and depends on putting world tiles into Rapier |
| Terrain: `terrainservice.js` gives one interface (`app.ground.heightAt / normalAt / materialAt`) over Core terrain and the streamed world; footsteps use it | Partial: new code should use `app.ground`; existing callers still use `terrain.hAt` and `geo.heightAt` directly |
| `workspace-ui.js` folded into `ui.js`; the six `patch(ui, ...)` monkey-patches became `before:`/`after:` UI hooks (`ui.on`) | Done. The three `patch(a, ...)` wrappers on `start`, `importScene` and `exportScene` are still there |
| CharacterRig interface | Planned |
| Existing modes run through Session with parity tests | Partial: Blank level, Coast, island and first-person checked by the level and living test groups; World, First Light and the shooter games were not re-run |

## Phase 2 ledger
| Item | Status |
|---|---|
| Project manifest `{format, version, name, template, startScene, scenes[], assets[], rules, tests}` with a versioned `migrateManifest` | Done. `rules` and `tests` are stored but nothing executes them yet |
| `projects/index.json` registry and 10 seed manifests, generated by `tools/projects-index.mjs` (checked by `npm run check:projects`) | Done for: blank-level, coast-demo, physics-sandbox, proving-ground, shooting-range, drone-arena, coin-run, first-light, combat-lab, vehicle-yard. Seed manifests point at the existing start routes; they do not hold scene files |
| `ai-arena`, `animation-test`, `perf-stress` seed projects | Planned: they need the Phase 4 and 5 systems (navmesh, skinned characters, instancing) |
| Project browser in the start sheet (Projects tab): seed list with status badges, saved projects with Open / Export / Delete, Save current, Import | Done. "Duplicate as template", "Run tests" and "New project from template" are not built |
| IndexedDB store (`projectstore.js`): named projects and autosave; localStorage is tried first, IndexedDB takes over when it is full; quota and write failures are shown | Done. OPFS is not used |
| `.n0project` zip import/export (fflate 0.8.2, MIT) | Done: manifest plus `scenes/*.json`. Embedded asset files are not stored in the zip |
| Export player: one self-contained HTML (runtime, wasm, scene, the bundled Kenney models and sounds) that runs offline with no editor, via `project.exportPlayer` or the Projects tab | Done for scenes whose assets are the bundled ones. Imported GLBs and Poly Haven models are not embedded. The player still has the Tune panel on the T key |
| Test projects declare checks and `npm run test:project -- <id>` runs them | Planned: manifests list a `boots` check only |
| 20 MB scene round trip | Not measured: the IndexedDB path is tested with a small scene and a forced localStorage quota failure |

## Known failing tests
- `level: the player walks up a ramp and up stairs`: fixed. It was a test bug, not an engine bug: three of the four approaches walked into the tall end or the flanks (walls), and the one real approach needed about 270 fixed steps at walking speed, more than the 300-step budget allowed from 6 m away. I tried a stair-assist in `phys.js` (hand back unspent travel after a step-up); it made climbing slower, so it was reverted.
- (flaky, passes alone: `world:` tests sometimes report "not ready" when the streamed world is slow to load under software GL.)
- `world: ocean reuses Core water ...`: ocean height window disagrees with `GeoWorld.heightAt`.
- Not re-run after this PR: the full suite (only `level:`, `world:`, `assets:` groups were run; `character:` was run and its one failure was a test edit of mine, reverted).

## Open decisions
- Rapier 0.14.0 vs 0.21.0: kept 0.14.0 so behaviour is unchanged; upgrade separately with the physics tests.
- Whether the Playwright port keeps the in-page test bodies (recommended: yes, only swap the driver).
