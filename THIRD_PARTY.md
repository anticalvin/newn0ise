# Third-party components (studio.html)

Everything loads in the visitor's browser from a CDN or model host and runs locally; no image is uploaded.
Nothing here is vendored. Versions are pinned and each is more than two weeks old. Licences were checked on the model cards / package metadata on 2026-11-13.

## Runtime libraries
| Component | Version | Licence | Source |
|---|---|---|---|
| three.js | 0.187.0 | MIT | jsDelivr |
| @sparkjsdev/spark | 2.4.0 | MIT | jsDelivr |
| @huggingface/transformers | 4.3.2 | Apache-2.0 | jsDelivr (`dist/transformers.min.js`) |
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
