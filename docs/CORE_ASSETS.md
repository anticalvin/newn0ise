# Core asset ledger

Rule: no file goes in the catalog without a recorded right to use it. `Assets.register()` throws unless `source`, `license` and `licenseEvidence` are set.

## Shipped (10 entries, `assets/core/catalog.json`)

All are **generated in code** by `src/core/assetlib.js` (n0ise original work, no third-party files, no outside licence). They are deliberately simple shapes: a placeholder family that makes the pipeline, the store and the tests real while licensed models are sourced.

`retail.shelf`, `retail.product.can`, `retail.product.bottle`, `retail.product.box`, `retail.checkout`, `retail.door`, `street.bollard`, `street.bench`, `nature.rock`, `vehicle.car.generic`.

## Not yet sourced

The planning brief suggests Poly Haven and Kenney CC0 packs. I did not download or bundle any of them: I could not verify the licence of individual files from here, and Poly Haven's API terms differ from its CC0 media. When a file is added, record: source URL, licence, evidence (page or archive hash), date checked, and the optimised `.glb` hash, then add the entry with `format:"glb"` and run it through glTF-Transform (dedup, texture size, optional meshopt) offline.

## Added with the editor (2026-11-27)

27 real models and 11 sounds and sprites from Kenney's starter kits (GitHub `KenneyNL/Starter-Kit-FPS`, `Starter-Kit-City-Builder`, `Starter-Kit-3D-Platformer`), bundled in `assets/core/kenney/`. Each repo's `LICENSE.md` is the MIT licence, copyright Kenney, checked on 2026-11-27, and every catalog entry records that as its evidence. They are low-poly and stylised (blasters, a flying drone, houses, roads, platforms, walls, a coin, a flag), not photoreal. Kenney's own site blocked automated download, so only what those three repos ship is here; his furniture and weapon packs were not available this way.

Online, on demand and not bundled: the Build panel's "Online CC0" tab lists Poly Haven models (the same source and loader as the 3D page, `src/phmodels.js`), including real furniture. They are fetched when you place one, cached by the browser, and saved in the scene as an id, so a saved scene needs a network to show them again.

Not found: realistic CC0 firearm models. The weapon system takes any GLB through the catalog (`WEAPONS` in `src/core/weapons.js` is data), so a better set is a catalog entry plus a few numbers.
