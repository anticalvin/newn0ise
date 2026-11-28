# Third-party components (studio.html)

Everything loads in the visitor's browser from a CDN or model host and runs locally; no image is uploaded.
Nothing here is vendored except the Lab code editor, which is bundled into `assets/labeditor.js` so there is a single copy of its core. Versions are pinned and each is more than two weeks old. Licences were checked on the model cards / package metadata on 2026-11-13.

## Runtime libraries
| Component | Version | Licence | Source |
|---|---|---|---|
| three.js | 0.187.0 | MIT | jsDelivr |
| @sparkjsdev/spark | 2.4.0 | MIT | jsDelivr |
| @huggingface/transformers | 4.3.2 | Apache-2.0 | jsDelivr (`dist/transformers.min.js`) |
| CodeMirror 6 (`codemirror` 6.0.2, `@codemirror/view` 6.43.15, `@codemirror/state` 6.7.6, `lang-javascript` 6.2.5, `theme-one-dark` 6.1.3) | see left | MIT | bundled by esbuild into `assets/labeditor.js` (Lab code editor; the one vendored piece) |
| onnxruntime-web | 1.22.0 (released 2025-05-09) | MIT | jsDelivr |

## Models (downloaded on first use, then cached by the browser)
| Model | Used for | Licence | Revision | Size |
|---|---|---|---|---|
| U-2-Netp (`BritishWerewolf/U-2-Netp`) | Default subject cut-out (general objects) | Apache-2.0 | `7112208d…dc8` | 4.6 MB |
| U-2-Net (`BritishWerewolf/U-2-Net`) | "Accurate" cut-out | Apache-2.0 | `c08042b4…c5c` | 176 MB |
| MODNet (`Xenova/modnet`) | "People" cut-out (portrait matting) | Apache-2.0 | `fa2fa546…333fca12` | ~26 MB q8 |
| BiRefNet-lite (`onnx-community/BiRefNet_lite-ONNX`) | Optional, needs WebGPU with enough storage buffers | MIT | `de15b22b…e3ac1` | 115 MB fp16 |
| Depth Anything V2 Small (`onnx-community/depth-anything-v2-small`) | AI depth, runs automatically after the cut-out, result cached per photo in IndexedDB | Apache-2.0 | `4472b736…ca1b` (code loads `main`) | ~25 MB |

## Deliberately not used
- RMBG-1.4 / RMBG-2.0: non-commercial licence.
- @imgly/background-removal: AGPL.
- ISNet ONNX conversions on the Hub: tagged AGPL-3.0.
- Depth Anything V2 Base/Large: CC-BY-NC.

## Notes
- MODNet scored poorly on non-person subjects in our check (IoU 0.43 to 0.54), so it is not the default.
- BiRefNet-lite failed on the test machine's WebGPU (storage-buffer limit) and ran out of memory on WASM, so it is opt-in only and never the default.
- SlimSAM (`Xenova/slimsam-77-uniform`, Apache-2.0) and MediaPipe Image Segmenter are verified permissive but not wired in yet; tap-to-pick uses colour region growing for now.

## Build tooling (not shipped to users)

| Tool | Version | Licence | Use |
|---|---|---|---|
| esbuild | 0.25.5 | MIT (verified in the package's LICENSE.md) | bundles `src/` into `assets/index.js` and `assets/studio.js`. Dev dependency only; three.js and Spark stay on their pinned CDN URLs via the import map. |

## Subject matte (Step 1)

| Item | Version | Licence | Use |
|---|---|---|---|
| @mediapipe/tasks-vision | 1.2.0 (published 2026-10-27), from jsDelivr | Apache-2.0 (`license` field of the package's package.json, read from the pinned version) | Image Segmenter for live person matting, in `seg.worker.js` (module worker, GPU delegate with CPU fallback). WASM files from the same pinned package (about 14 MB, cached by the browser). |
| selfie_segmenter.tflite (float16, folder `1`) | `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite` | Apache-2.0 per Google's MediaPipe model documentation. **The model card PDF could not be machine-read here, so confirm the licence text before launch.** | Default person model, 256 px input, about 0.25 MB |
| selfie_multiclass_256x256.tflite (float32, folder `1`) | `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite` | same as above, same caveat | Optional "Detailed" model, about 16 MB |

Model files are fetched once, kept with the Cache API (`n0ise-models-v1`) with visible progress, and are never uploaded anywhere: frames stay on the device. On mobile data (Save-Data, cellular, 2G/3G) the page asks before downloading.

## Added with the world editor and simulation

| Component | Version | Licence | Where it is used |
|---|---|---|---|
| Rapier (`@dimforge/rapier3d-compat`) | 0.14.0 (jsDelivr, pinned) | Apache-2.0 | Rigid-body physics in `src/sim.js`, loaded at runtime when Play is first pressed |
| `@modelcontextprotocol/sdk`, `ws`, `zod` | 1.12.1, 8.18.2, 3.25.30 | MIT | `tools/mcp` bridge only; not shipped to the browser |
| `assets/models/human.glb` | n/a | **Not stated. Supplied by the project owner; confirm the licence before launch.** | The "Human" object in the World tab |
| Poly Haven textures, HDRIs and models (`api.polyhaven.com`, `dl.polyhaven.org`) | n/a, fetched on demand, nothing bundled | CC0 1.0 | Material tab in 3D: photographed PBR texture sets and environment lighting; Build tab: furniture and props (`src/phmodels.js`); authors are shown in the panel |
| `RGBELoader`, `RoomEnvironment` (three.js examples) | 0.187.0 (jsDelivr, pinned) | MIT | Material tab environments |
| `three-gpu-pathtracer` | 0.0.27 (jsDelivr, pinned) | MIT | Path-traced preview in the Material tab, loaded only when switched on |
| `three-mesh-bvh` | 0.9.17 (jsDelivr, pinned) | MIT | Needed by the path tracer, same lazy loading |

## Character, Sculpt and pen (this batch)
No new dependencies. The Character page and Sculpt are our own code on three.js (MIT) with GLTFExporter from the same pinned three examples. We looked at M3-org Character Studio (MIT, VRM and trait packs) and chose not to bundle it: it needs large downloaded asset packs.

## MakeHuman core assets (Character creator 2.0)
- Source: https://github.com/makehumancommunity/makehuman at commit a8bc2d54ff0ac92e78ff71431b1023eda42bf482 (`makehuman/data`).
- Used: base mesh, skeleton, skin weights, modifier list, morph targets. Licence: **CC0 1.0** for assets (their LICENSE.md, section C).
- Not used: any MakeHuman program code (AGPL-3.0). `jontechlabs/makehuman-web` (AGPL-3.0) and `kblood/CharacterCreator` (GPL-3.0) were studied only.
- Packed by our own `tools/pack-human.mjs` into `assets/human/`.

## MakeHuman CC0 asset packs (hair, clothes, skins, brows, lashes)
- Packs: `makehuman_system_assets_cc0.zip` and `suits05_cc0.zip` from https://static.makehumancommunity.org/assets/assetpacks.html (each `.mhclo` header states: released as CC0 in September 2020).
- Not included: CC-BY packs (they would need attribution per author) such as suits03 and suits04.
- Packed by our `tools/pack-assets.py` (textures resized, hair and brows greyscaled so a tint colours them) into `assets/human/a/`.
- Balaclava, beanie, mask, headband, scarf and glasses are our own procedural shapes.

## Manifold, glTF Transform, three-mesh-bvh (modelling and assets)
- manifold-3d 3.5.5, Apache-2.0, https://github.com/elalish/manifold , loaded on demand from jsDelivr (Combine shapes).
- @gltf-transform/core and /functions 4.5.1, MIT, https://github.com/donmccurdy/glTF-Transform , loaded on demand (smaller GLB export).
- three-mesh-bvh 0.9.17, MIT, already used by the path tracer; now also accelerates picking on heavy meshes.

## Sketchfab (model browser)
The 3D model browser calls the Sketchfab Data API v3 from the visitor's browser. Models belong to their authors and carry their own Creative Commons licences, shown in the browser and in the import message. Nothing is bundled; the visitor supplies their own API token.

## Core runtime (vendored, bundled by esbuild; no CDN at runtime)
Checked 2026-11-28 against each package's own LICENSE and package.json.
- three 0.187.0, MIT, https://github.com/mrdoob/three.js : renderer, addons (GLTFLoader, TransformControls, post passes). Bundled into `assets/core.js`.
- @dimforge/rapier3d-compat 0.14.0, Apache-2.0, https://github.com/dimforge/rapier.js : physics; wasm embedded in the package, bundled into `assets/core.js`. (0.21.0 exists; kept at 0.14.0 so physics behaviour is unchanged. Upgrading is a separate, tested step.)
- fflate 0.8.2, MIT, https://github.com/101arrowz/fflate : `.n0project` zip import and export. Checked 2026-11-28.
