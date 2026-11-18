# Isolated Studio integration review

Studio is at `studio-app.html` in the extracted working copy. It uses the approved Studio layout and inherits its 2D selection, snapping, layering, crop, pen, and document workflows. The new starter object is a lit Three.js torus. The desktop artboard starts at 1920 × 1080 and a fresh phone session starts at 1080 × 1920.

## Try the workflow

1. Open [local Studio](http://127.0.0.1:8789/studio-app.html). Choose **Open demo**, select **Metallic torus**, open **Spatial**, and drag a rotation ring. The inspector also accepts degrees.
2. Return to **Canvas**. Use **Add → Import background image…** to fit a photo behind the artwork. Select the torus again.
3. Click **Add Effect** in the dock and search for **Halation**. Adjust Strength, Spread, and Threshold. **Split** shows the artwork and its layer chain. **Graph** gives the chain the full workspace.
4. Use **Export** for the PNG and **Studio → Save project** for the editable file. **Studio → Open project** restores that file.

To recreate the local server from this archive's root, run `python3 -m http.server 8789 --bind 127.0.0.1`.

The start screen also offers a blank canvas or an image/project upload. Choose a preset or set custom pixel dimensions before starting. A saved project supplies its own dimensions. Reorder layers with their grips, or use Up/Down on a focused grip. Choose **Text** and click the artwork to type with a live preview. Double-click existing text to revise it.

## Architecture and dependency decisions

- **Existing engine.** The Effects registry in `src/app.js` owns UI, effect-stack policy and state. Importing it would boot the whole Effects page. Studio calls `installLooks` in `src/looks.js` through a registration adapter and directly reuses `src/engine.js` for shader compilation, uniforms, render targets, and full-screen passes. The source shaders and parameters for Halation, Clarity, Pro Mist, and Split Tone remain in Looks. Studio supplies a texture-pass wrapper that retains input alpha.
- **One WebGL context.** The original 3D page constructs its renderer around its own DOM. Studio uses the same Three.js renderer, torus geometry, material and environment primitives, target conventions, and TransformControls in a single Studio-owned context. The torus renders to a framebuffer. The adapter hands its texture directly to the original effect shader in the same context. Only the finished layer crosses to the established Canvas 2D compositor. Spatial uses that same renderer and canvas. The iframe bridge, global APIs, and 3D workspaces remain outside this implementation.
- **Dependencies.** Three.js 0.186.1 is the locally available build used for this isolated preview, while the original 3D page has its own 0.187.0 CDN pin. The local bundle contains the needed renderer and addons and is about 140 KiB gzip. Fabric 7.4.0 carries over from the approved 2D editor at about 83 KiB gzip. Both include MIT license notices. Studio uses ES modules for engine adapters and the existing plain HTML, CSS, and JavaScript for its shell.
- **Graph.** `src/nodes.js` visualizes an ordered Effects stack. `src/nodemat-ui.js` edits the material evaluator's specialized graph. LiteGraph would supply canvas widgets, with additional styling and accessibility integration. Studio keeps its existing SVG editor and validates the versioned, typed graph outside the UI. Scene and 2D layer graphs use image and texture interfaces. Scene assets retain dedicated geometry, material, and transform data. The final compositor consumes layer outputs in document order. Unknown graph adapters keep their data and report a render notice.
- **Evaluation and export.** The scheduler traverses only dependencies of the active output. Connected parameters, scene state, resolution, time and seed contribute to the output cache key. Changing graph layout leaves the rendered result cached. The static phase uses two reusable GPU effect targets, a scene target, and up to four cached finished layer surfaces. The full-resolution artwork canvas supplies both preview and still export. GPU resources are released on page exit.
- **Formats.** Studio's version 2 document migrates previous Studio version 1 files and embeds photos. Existing Effects recipes, 3D scenes, material graphs, World and Form formats remain owned by their current tools. `src/project.js` and `tools/parity.mjs` demonstrate feedback warm-up for future timed work. `src/recipe.js`, `src/scenedoc.js`, `src/nodemat.js`, `src/form-runtime.js`, and `src/handoff.js` are the upstream seams for later adapters.
- **Scope of this preview.** Spatial edits built-in torus assets. The renderer supports four stateless Looks effects and still export. Full 3D project import, specialized nested graph editors, external Lab and material adapters, masks and depth outputs, a shared playback clock, temporal effects, and video export need further integration. The legacy comp-wide CRT chain is retained for prior Studio files. The Studio graph UI edits the selected layer's chain.

## Release files

The release removes the placeholder click handler for the existing Studio link in `index.html` and adds these isolated files.

```text
studio-app.html
studio-app/REVIEW.md
studio-app/app.js
studio-app/document.js
studio-app/effects.mjs
studio-app/graph-model.js
studio-app/graph.js
studio-app/layer-drag.js
studio-app/render.js
studio-app/runtime.mjs
studio-app/snapping.js
studio-app/style.css
studio-app/test/integration.cjs
studio-app/test/model.test.cjs
studio-app/torus-preview.webp
studio-app/vendor/FABRIC-LICENSE.txt
studio-app/vendor/THREE-LICENSE.txt
studio-app/vendor/fabric.js
studio-app/vendor/three.mjs
```

Review images, sample PNG, and the editable sample project are stored in the adjacent `studio-integration-artifacts/` directory outside this repository.

## Verification

- Baseline build reproduced the shipped outputs byte for byte in a disposable copy. Before homepage activation, SHA-256 verified all 1,031 original files in the integration workspace. The baseline build reported three existing duplicate-key warnings in `src/app.js`.
- Upstream `npm run test:parity` reported zero difference for still, video-frame, and the 3D preview comparison. The upstream `npm run test:ui` passed its existing budgets on the four original workspaces.
- Run the Studio model checks with `node --test studio-app/test/model.test.cjs`. They cover v1 migration, serialized scene and effect data, dependency ordering, incompatible ports, cycles, missing adapters, and screen-space snapping.
- Run the Chrome integration test against the local server with `node studio-app/test/integration.cjs`. It requires Playwright and Chromium. Set `PLAYWRIGHT_MODULE` to an existing Playwright installation if needed, `CHROME` for a Chrome binary, and `STUDIO_ARTIFACTS` for the screenshot and sample output directory. The test drives the Three.js gizmo, verifies the torus alpha channel, checks the photo and Halation composition, edits graph parameters, compares preview and PNG pixels, reopens the project, verifies the same pixels and document data, checks for one WebGL context and verifies teardown, and captures desktop and simulated mobile views. The release test also opens Studio from the homepage and verifies desktop and touch reordering, live text editing, and custom dimensions through upload, export, and reopen.
