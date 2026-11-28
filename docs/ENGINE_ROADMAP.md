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
| Merge vehicles (`vehicle.js` + `geo/vehicle.js`), terrain services, `ui.js` + `workspace-ui.js`, CharacterRig interface | Planned |
| Existing modes run through Session with parity tests | Partial: Blank level, Coast, island and first-person checked by the level and living test groups; World, First Light and the shooter games were not re-run |

## Known failing tests (both fail on `main` before this PR)
- `level: the player walks up a ramp and up stairs`: approaching the stair block from +z the player stops at the first step; best climb 1.38 m of 2 m. Real bug, not yet fixed.
- `world: ocean reuses Core water ...`: ocean height window disagrees with `GeoWorld.heightAt`.
- Not re-run after this PR: the full suite (only `level:`, `world:`, `assets:` groups were run; `character:` was run and its one failure was a test edit of mine, reverted).

## Open decisions
- Rapier 0.14.0 vs 0.21.0: kept 0.14.0 so behaviour is unchanged; upgrade separately with the physics tests.
- Whether the Playwright port keeps the in-page test bodies (recommended: yes, only swap the driver).
