# Core engine roadmap

Source: CORE_ENGINE_PLAN and the master prompt. One PR per phase step. Status words are literal: **Done**, **Partial**, **Planned**.

| Phase | Outcome | Status |
|---|---|---|
| 0 Stabilise | Vendor three + Rapier (offline), delete `.bak`/junk, docs truth pass, cycle check, test runner | **Partial** (see ledger) |
| 1 Spine | Session, InputStack, Systems, component schemas, merge duplicate weapons/vehicle/terrain/UI | Planned |
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

## Known failing tests (both fail on `main` before this PR)
- `level: the player walks up a ramp and up stairs`: approaching the stair block from +z the player stops at the first step; best climb 1.38 m of 2 m. Real bug, not yet fixed.
- `world: ocean reuses Core water ...`: ocean height window disagrees with `GeoWorld.heightAt`.
- Not re-run after this PR: the full suite (only `level:`, `world:`, `assets:` groups were run; `character:` was run and its one failure was a test edit of mine, reverted).

## Open decisions
- Rapier 0.14.0 vs 0.21.0: kept 0.14.0 so behaviour is unchanged; upgrade separately with the physics tests.
- Whether the Playwright port keeps the in-page test bodies (recommended: yes, only swap the driver).
