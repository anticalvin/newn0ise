# Core asset ledger

Rule: no file goes in the catalog without a recorded right to use it. `Assets.register()` throws unless `source`, `license` and `licenseEvidence` are set.

## Shipped (10 entries, `assets/core/catalog.json`)

All are **generated in code** by `src/core/assetlib.js` (n0ise original work, no third-party files, no outside licence). They are deliberately simple shapes: a placeholder family that makes the pipeline, the store and the tests real while licensed models are sourced.

`retail.shelf`, `retail.product.can`, `retail.product.bottle`, `retail.product.box`, `retail.checkout`, `retail.door`, `street.bollard`, `street.bench`, `nature.rock`, `vehicle.car.generic`.

## Not yet sourced

The planning brief suggests Poly Haven and Kenney CC0 packs. I did not download or bundle any of them: I could not verify the licence of individual files from here, and Poly Haven's API terms differ from its CC0 media. When a file is added, record: source URL, licence, evidence (page or archive hash), date checked, and the optimised `.glb` hash, then add the entry with `format:"glb"` and run it through glTF-Transform (dedup, texture size, optional meshopt) offline.
