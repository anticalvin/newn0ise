# Interaction foundation (affordances)

Status: **working vertical slice**, one runtime for doors, chairs, drinks and parcels, usable by the player, any fighter/NPC `Actor`, and Core commands. Experimental parts are marked.

## The idea
An *affordance* says what an entity permits an actor to do. Prefabs declare them as data; `src/core/interact.js` is the only code that executes them. There is no door code, chair code or cup code in the engine, only a hinged part + `open`, a seat anchor + `sit`, a grip profile + `carry`, a `consume`.

```js
// src/core/prefabs/interactive.js
affordances: r => [{ type: 'sit', anchor: [0, 0.45, 0], reach: 1.4, facing: 0, exit: [0, 0, 0.85], hip: 0.55 }]
```

| type | does | availability | reserves |
|---|---|---|---|
| `open` | toggles a hinged `part`; swings away from the actor; collider off while moving | always | no |
| `sit` / `stand` | seats the actor at the anchor, frees them at the exit point | free chair, empty hands | yes, until stand |
| `carry` / `place` | holds the object at hip (1 hand) or chest (2 hands); slows by mass (5% per kg, max 40%); `place` ray-casts onto the surface in front (table, floor) | empty hands, not taken | yes, until place |
| `consume` | one sip of `sips` (default 3), only while held | not empty | no |

## Lifecycle
discover → availability (with a human reason) → reserve → execute → animate in `tick` → finish/release. Events on `app.events`: `interaction.started | refused | failed | opened | closed | settled | sat | stood | picked | placed | consumed`.
Not yet built from the full list in the directive: approach, alignment, animation sync, mid-interaction interruption by physics.

## State split
- **Authored**: `rec.state` (`open`, `left`) and `rec.transform`. Never written during Play.
- **Runtime**: `InteractWorld` (created by the level `Runtime`, disposed on Stop). Stop restores positions, door angle and drink level from the records. Tested by comparing the serialized records before Play and after Stop.

## Entry points
- Player: **F** (and the gamepad Use button), through `app.interact()` → `lv.interact()`. A prompt shows the verb, or why it is unavailable.
- Commands (same path, so MCP gets it): `interact.discover {actor?}` and `interact.perform {entity, type, actor?}`. `actor` is `"player"` or a fighter id. Errors: `interact.idle` (not in Play), `interact.range`, `interact.busy`, `interact.actor`.
- Authoring: *Interactive* category in the level palette (Door, Chair, Drink, Parcel); the details panel is generated from each prefab's schema. `level.sample` includes the set.

## Adding a new interactive object
1. Register a prefab with `components: [..., 'interaction']`, geometry, and `affordances(rec)`.
2. Return `parts` from `build` if something moves, and `setLevel` if something visibly depletes.
That is all. A new *type* (e.g. `push`) goes in `TYPES` in `interact.js` with `verb`, `can`, `run`, optional `tick`.

## Tests
`tools/core-smoke-interact.mjs` (`node tools/core-smoke.mjs interact:`): door swing direction, collider state, Stop isolation; chair reservation between player and a fighter; carry profiles, hands-full refusal, sips, surface placement on a table; the F key path.

## Known limitations
- **No sit, carry or open animations.** A seated character stands upright in a lowered chair; carried objects follow fixed offsets, not hands. Needs the animation system (roadmap Phase 4).
- Carried objects are kinematic, not Rapier bodies; placing does not drop or collide, and `upright`/`fragile` are stored but do not yet change physics.
- Fighters can be *driven* through `interact.perform`, but no AI chooses interactions yet.
- The retail store still has its own door (`store.door`, `interact.use`) that writes `rec.state.doorOpen` into the saved record. Migrating it onto `open` is the next consolidation.
- Interactions run only in the level Play runtime, not in First Light or the streamed world.
- No mission/trigger layer yet, so the delivery scenario is not achievable end to end.
