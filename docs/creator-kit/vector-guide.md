# Vector Lab and Studio

Choose **Vector** in Lab and select a generator family or construction preset under **Looks**.
**Params** provides sliders, numeric fields, locks, seed controls, and history. **New variation**
advances the saved seed. **Randomize from seed** reproduces the same unlocked parameter values for
the current seed. **Source** opens the generator definition in Lab's CodeMirror editor.
Use **Apply** or Ctrl/Cmd+Enter to validate and apply the JSON. With a controller, use the
shoulder buttons to cycle through drawers and the D-pad to adjust the highlighted slider.

**Export** can download the transparent SVG, save and reopen an editable `.n0vector.json` file, or
send the vector to Studio. Studio opens the design as one procedural layer in a new tab.
The layer can use Studio's standard transforms, opacity, visibility, locking, effects, and ordering.
Studio stores its generator definition in the editable `.n0studio.json` project.

To revise the generator, select the layer and choose **Edit in Lab**. Keep the Studio tab open
while editing. In Lab, choose **Export → Update Studio layer** to apply the edit as a single
undoable change. Studio uses the latest transform and compositing settings on that layer.
Allow browser pop-ups for these two actions.

**Expand to Paths** makes separately editable anchor paths. It requires normal blend, full
opacity, and a layer without effects, since those settings apply to the original layer as a whole.
**Rasterize vector** explicitly converts the generator to an image layer. Both conversions
can be undone. Studio's existing SVG export uses raster content for effects and compositing
operations that require raster evaluation. SVG from Vector Lab always contains vector paths.

## Definition v1

`format` is `n0ise-vector-generator`. Version 1 stores a stable `id`, generator family,
unsigned 32-bit `seed`, `parameters`, stroke `style`, and parameter `locks`.
The [shared module](../../src/vector-generator.js) defines parameter limits and emits
Studio-compatible Bézier anchors. The SVG and Canvas previews derive from those anchors.
The definition is declarative JSON. Future versions can add migrations at the validator boundary.

## Verification

Run `npm test` for model, build, parity, and UI checks. To run the Chrome end-to-end workflow
with the existing Studio Playwright setup, serve the repo on port 8789 and run
`node studio-app/test/procedural-vector.cjs`. Set `CHROME` to a system browser if needed and
`PLAYWRIGHT_MODULE` to the module path if Playwright is installed outside this checkout.
