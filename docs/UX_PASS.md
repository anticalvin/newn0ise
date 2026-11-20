# n0ise 3D usability pass

## 0. Baseline (before)
- Build and `npm run test:parity` both passed (parity: ok). Structure: `studio.html` (UI and CSS), `src/studio3d.js` (scene, tabs, undo), `src/matstudio.js` (Material tab), `src/figure.js` + `src/human.js` (Character), `src/sigil*.js`, `src/build.js`, `tokens.css` (shared tokens, `--ps-*` phone tokens already present).
- Measured on the Scene tab (desktop): 43 of 115 controls were under 32 px tall, type was 8.5 to 9.5 px in the view bar, chips and section headers. Material tab: preview plus nav took about 190 px of sticky space on phones. Header had no undo, redo or save and no sign of what was selected or which tool was active. Phones: four overlay rows covered the viewport.
- Existing undo covers transforms, appearance and stage settings, but object creation was not undoable.

## 1. Changes
| Area | Change | Files |
|---|---|---|
| Control scale | `--n-ctl` (36 px mouse, 44 px touch), `--n-ctl-fs` tokens (additive). Studio buttons, chips, view segments, tabs, accordions, fields use them; type is now at least 10.5 px; slider thumb 14x22 with a ring; row height 36 px. | `tokens.css`, `studio.html` |
| States | Disabled, busy (shimmer, off for reduced motion) and hover (mouse only) states; tooltips for the view bar buttons. | `studio.html` |
| Header | Undo, redo, Save buttons and a live line: tab, selected object, active tool. | `studio.html`, `src/studio3d.js` |
| Phones | One Tools button opens the view controls; header is slimmer, Effects moves to the workspace row; restore banner is compact. | `studio.html`, `src/studio3d.js` |
| Desktop | The right-hand view pills no longer collide with the view modes on narrower windows. | `studio.html` |
| Material | "Editing: object, what is on it" bar with Undo, Redo and Reset; only that bar and the section tabs stay pinned, the preview scrolls away (about 80 px more room on phones). Reset clears surface, texture, pattern, paint and effect, and is undoable. | `src/matstudio.js`, `src/studio3d.js` |
| Undo | Adding a shape can now be undone. Redo of an add is refused with a message (the object would have to be rebuilt). | `src/studio3d.js` |
| Character | Save look, Export .glb and Open in 3D have explanatory tooltips. | `character.html` |

## 2. Feature preservation
Nothing was removed. The old pills, tabs and sheets are all still reachable (phones: behind Tools). Parity and bundle checks run after the change (see results below).

## 3. Not done (limits)
- No node-based material editor, no dedicated hierarchy panel, no resizable desktop panels, no grouping UI. Redo of added objects and undo of deletions are unsupported.
- Sigil, Build and World were not re-laid-out; they got the shared control sizes only.
- Checked in the in-app browser at desktop and 375x812. Not checked on a physical phone or with every tab in both themes.

## 4. Next engine work (priority order)
1. Scene undo that records add and delete (serialise objects, not only transforms).
2. A hierarchy panel with grouping, and object visibility and lock toggles.
3. Material slots per mesh part, with a shared material library the Character page can also use.
4. Resizable and collapsible desktop panels.
5. Move Sigil and Build toolbars onto the shared control tokens.

## 5. Future research (not implemented, nothing evaluated in code yet)
| Topic | Note to verify before any work |
|---|---|
| Manifold (solid modelling, booleans) | Open source WASM library with JS bindings; check licence text, bundle size and mobile speed. |
| Blender Geometry Nodes | Reference for procedural graphs only; Blender is GPL, so no code reuse. |
| Blender automation or agent scene building | External pipeline through the existing MCP bridge in `AI.md`. |
| Open-source material graphs | Study for data model only; our own `nodemat.js` already exists. |
| Terrain sculpt and paint | Reuse `src/sculpt.js` ideas; needs heightfield data and chunking. |
| Floor plan to 3D | Could feed `src/build.js` walls. |
| OpenStreetMap city generation | OSM data is ODbL (share-alike on the data); needs attribution rules. |
