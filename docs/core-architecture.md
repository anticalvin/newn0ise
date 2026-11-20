# Core architecture (as built)

```
core.html / src/core/ui.js            dock, Place panel, Use button, keyboard, pad
        ↓ semantic actions
Core.exec({cmd,...})  (core.js)       one gateway for UI, console, pad, MCP (api.js), tests
        ↓ validated, one undo entry per command
Scene state   terrain · env · palms · boulders · worlds · ENTITIES (entities.js)
        ↓ derived, never saved
three.js objects · Rapier colliders (phys.js) · instanced batches
```

## Authoritative data

`Entities` holds plain records `{id, prefab, parent, transform{position, rotation(radians), scale}, parameters, components, state, tags}`. Meshes and colliders are rebuilt from records on load. Records are saved in `n0ise.core.scene` **version 4** as `entities` (plus `assetsUsed`); version 2 and 3 files still load (no entities). A prefab registers `validate(params)`, optional `initState/validateState`, and `build(rec, ctx)` returning `{object, colliders(), instanceCount?, tick?, dispose?}`.

Built-in prefabs: `prim.box|sphere|cylinder`, `asset` (catalog asset by `assetId`), `retail.convenience`.

Invariants: ids are unique and stable; transforms are metres, Y up, radians (`rotationDeg` is converted at the edge); every command returns `{ok}` or `{ok:false, code, msg, path}`; a failed command changes nothing and adds no undo entry (tested); one command = one undo entry.

## Assets (`assets.js`, `assetlib.js`, `assets/core/catalog.json`)

Searchable catalog (`asset.catalog`, `asset.inspect`, `asset.place`) with size, triangle count, tags, source, licence and licence evidence for each entry. The 10 shipped entries are generated in code. The GLB importer (`Assets.register` + `ensure`) is size-limited (8 MB), cached, normalised to metres with the pivot on the floor, and refuses a file without `source`, `license` and `licenseEvidence`. See [CORE_ASSETS.md](CORE_ASSETS.md).

## Store compiler (`prefabs/room.js`, `prefabs/retail.js`)

`room.js` is pure geometry: walls with real door and window openings (sill, lintel), floor, ceiling, as local boxes used for both drawing and colliders. `retail.convenience` lays out shelves in rows with a clear central walkway and a clear zone inside the entrance, a counter, a door on a hinge, and fills every shelf tier with products. A product slot exists if `hash(seed, key) < stock`, so the same record always gives the same store; keys look like `store001/s03/t2/c11d1` and are saved as a sparse `removed` list in the entity's `state`. Draw calls: shell 1, roof 1, shelves 1, products 3 (one `InstancedMesh` per product type), plus the door, counter and glass.

## Commands added

`entity.create|set|remove|inspect|list`, `asset.catalog|inspect|place`, `prefab.build`, `store.door`, `product.take|return`, `interact.use`. All are in `describe` and reachable through `n0_core`.

## Tests

`npm test` = bundle check, parity, UI budgets (now including Core), and `tools/core-smoke.mjs` (+ `core-smoke-extra.mjs`) which drives the real page in headless Chrome. `node tools/core-smoke.mjs --shots` also writes store screenshots to `ui-shots/`. `core.html?debug=1` shows live telemetry; `n0.telemetry()` returns it.
