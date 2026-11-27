# Character programme: rig integrity and creator upgrade

Branch `character-rig`, from main `193131c`. Companion to `docs/CHARACTER_AUDIT.md`. Everything below marked "tested" has an automated test in `tools/core-smoke-character.mjs` or `tools/sim-test.mjs`; anything not tested says so.

## 1. Root cause (reproduced, then fixed)

The visible faults (sleeves left behind, detached feet, floating eyes and lashes, ankle holes) had one common cause, not several.

- The source rig weights only the 13380 body vertices. Every clothing, shoe, lash and brow asset is fitted (`.mhclo`) to vertices of the full 19158 vertex base mesh, **including the 5778 helper vertices** that have no weights.
- `src/human.js` gave any point with no weights to the **root bone**, so those points never moved in a pose.
- Measured before the fix (female, `female_casualsuit01` + `shoes01`): shoes 100 % of vertices bound to root, 710 of 952 detached from the body in Cheer and 952 of 952 in Fighter, Run and Sit (up to 0.50 m); suit 212 to 509 of 1203 points detached (up to 0.50 m); lashes up to 125 of 125 detached; eyeball to lash distance up to 0.106 m in Sit.
- After the fix: 0 of 952 shoe points, 0 of 1203 suit points, 0 of 125 lash points drift more than 3 cm in any tested pose (largest growth 0.015 m); eyeball to lash distance 0.0118 m in every pose.
- Fix: helper vertices take skin from the nearest body surface (4 nearest, inverse distance) once at load. Proxy vertices that still have no weights fall back to the same transfer, never to root. `stats()` reports how many.
- The black fingertips came from the `trousers` and `shorts` clip regions having no sideways limit: in the A-pose the fingertips hang at thigh height and were cut into the trousers. Limited to the hip and leg columns.
- The black face covering was the procedural `balaclava` and `mask` garments. Retired.

## 2. What changed

Rig
- Canonical bone frames from pinned source metadata. `tools/pack-human-planes.mjs` adds each bone's rotation plane to `human.json` (163 of 163 bones; none fall back). Y runs head to tail, X is the plane normal, Z completes the frame. Local rest rotation is relative to the parent's world rest frame, local rest translation is rotated into the parent frame, inverse binds are calculated from that rest pose in character space.
- The pose convention is unchanged on purpose: presets and FIRST LIGHT give rotations in rest-world axes. A conjugation, `local = Lr * (Rr^-1 * q * Rr)`, turns that into the canonical local rotation. Tested: the elbow lands within 1e-4 m of the old identity-axis result.
- `setBoneEuler()` is the adapter FIRST LIGHT now uses. Rest, pose, world placement and shape state are separate (`Rr`/`Lr`, `pq`, `root.position`, `measure`).
- Shape updates compose from an immutable snapshot of the look; calls made while one runs share its promise and a final pass applies the last state. `measure.version` increments per applied shape and resets hair and cloth.
- Bone ids are unchanged, so no legacy mapping is needed. Exported GLB names still lose the dots (known, unchanged).

Attachments
- Outfit loads are atomic: every asset is fetched first, a stale request is dropped before it touches the scene, then slots are swapped in one synchronous step. Immutable asset data is cached, every use gets its own mesh and geometry, old ones are disposed. Tested with eight rapid overlapping changes and 12 repeated swaps.
- Body hiding is per garment, computed from the garments that actually fitted, and fully restored when removed (tested).
- Glasses are owned by one `Accessories` group on the head bone, positioned from the eye joints in head space, never on the rotating eyeballs, and always disposed. Eyeballs stay on their bones with a counter rotation so they face forward whatever the bone axes are.
- Brows and lashes carry the 16 expression morph targets through their barycentric binding (tested: a blink moves the lashes and releases cleanly).

Creator
- Male and Female base presets replace the Gender slider. A look saved with a blended gender keeps its value and shows a notice.
- Stature is measured from the rest mesh and is exact: the height macro is solved by bisection, so the chosen height survives age, muscle, weight and base changes (tested to 0.35 cm over five bodies and three ages). Defaults 171 cm male, 159 cm female (global historical averages, not limits); Tall presets 183 and 165 cm. The control accepts 140 to 215 cm and says what this body can reach. Age is 18 to 90 in the creator.
- Numeric box on every slider, double-click a label to reset, searchable morph browser over all 166 real MakeHuman modifiers with per region reset, favourites, seed field, undo and redo (existing), camera views (full, front, face, profile, back), neutral pose, a walk preview, three lighting presets (Studio, Softbox, Outdoor sky made procedurally, nothing downloaded), exposure and background.
- Camera framing follows the measured head position and only runs on tab change or an explicit view, never on a slider.

Wardrobe and materials
- Retired from the catalogue with migration: sneaker (to `shoes05`), balaclava, mask, beanie, headband, scarf, bun, mohawk, buzz hair. Old looks load, the changes are listed in `S.migrated`. Tested.
- Real library items stay (23 clothes including 6 shoes, 10 hair, 12 brows, 4 lashes, 13 skins). Tank, tee, long sleeve, shorts and trousers stay as a **base layer**: they are cut from the body with its own skin weights and pass every pose test, but they are not separate authored assets. See limits.
- Per slot material: fabric presets (cotton, denim, knit, leather, satin) set roughness and a procedural normal map; repeat is the UV scale.
- Logo upload: local PNG, JPEG or WebP only, at most 4 MB, decoded and rejected if unreadable, scaled to 768 px, placed on the chest UV panel (position, size, rotation, opacity), composited with the tint baked in (sRGB) into the garment texture, saved with the look, rejected if a saved file carries a remote or non-image decal. The original texture and UVs are untouched. Tested, including that the composite lives in a canvas texture the GLB exporter writes.

Files and integration
- `.n0character` (JSON, version 2): base asset and sha, morphology, rig profile, wardrobe, materials, decals, animation, the full look, and an asset ledger with licences. Validated on import. Round trip tested.
- GLB export is the neutral rest pose by default; "current pose" is explicit. Re-import with GLTFLoader keeps all bones and the wrist within 1 cm (tested).
- `Send to Core` stores the file; FIRST LIGHT uses it only if `validate()` passes (finite bones, normalised weights, no root-bound fitted vertices, plausible stature), otherwise it keeps the reference character. FIRST LIGHT tests still pass.

Experimental (off by default, CPU, with fallbacks)
- `src/hair-groom.js`: groom format (scalp triangle roots with barycentric weights, style length, curl, clump, density, stiffness, damping, seed, quality), guide strands solved with Verlet, fixed 1/120 s substeps, distance, bend and follow-the-leader constraints, head, neck and shoulder colliders, reset on teleport or shape change, NaN guard, interpolated followers. Quality presets low, medium, high.
- `src/cloth-sim.js`: XPBD stretch and bend constraints, pin weights, capsule and sphere colliders, fixed 1/90 s step, time budget, reset on teleport or shape change, NaN guard.
- `src/experimental.js` wires both to the live character (View tab, Experimental). Hair roots are scalp triangles of the real body mesh; the cloth strip hangs from the real top garment's hem vertices and collides with the skeleton's leg capsules.
- `tools/sim-test.mjs` (node, deterministic): ponytail finite, within 35 % stretch after settling, never inside the head over 600 frames of head motion; same seed gives identical output; teleport and shape change reset; follower counts rise with quality; cloth finite, no point inside the leg capsules, stretch 1.7 %, worst step 1.3 to 1.5 ms for 144 points and 720 constraints on this Mac.

## 3. Tests

- `node tools/core-smoke.mjs "character:"`: 10 tests (attachment across a 4 look by 9 pose matrix, eyes and glasses, stature, canonical frames, rapid outfit changes, migration, files and rejection, logo composite, GLB round trip, expressions). All pass.
- `node tools/sim-test.mjs`: 5 tests. All pass.
- `node tools/core-smoke.mjs "first light"`: 2 tests pass with the canonical rig and `setBoneEuler`.
- Not re-run end to end after this branch: the rest of the Core suite (72 tests passed on main before; unchanged code), `npm run test:ui`, parity.

## 4. Release gates, honestly

| Gate | State |
|---|---|
| A reproduction and audit | Done for the weights, bind and attachment faults (numbers above). The user's screenshots are the before images. No independent Blender or MPFB export comparison was made. |
| B rig, attachments, wardrobe integrity | Done for 4 looks (two sexes, 150 to 188 cm, weight and muscle extremes, age 25 to 90) across 9 poses. Not done: joint-limit diagnostics, wrist and ankle orientation checks, corrective morphs at elbow, knee and shoulder, IK. The 4 look matrix is not every extreme. |
| C usable creator | Done: base presets, measured height, numeric inputs, morph search, reset, favourites, undo, materials, logo, mobile layout (checked at 375 x 812). Not done: asymmetric face controls, wardrobe compatibility rules beyond "outfit replaces top and bottom", a real separate blank tee asset (the tee is still the body-cut base layer), real normal maps (procedural only). |
| D export, import, shared character | Done: `.n0character`, GLB neutral, re-import, validated hand-off to FIRST LIGHT. Not done: an explicit project picker for Send to Core, running Khronos glTF-Validator, re-opening in Studio after this change. |
| E hair and cloth | Experiments run on the real body and a real garment hem with numeric tests and documented costs. Not done: GPU strand rendering, an authored groom from Blender curves, self collision, mobile profiling. |
| F lighting and cinematic | Lighting presets and exposure done. **Path tracing not implemented**: not started, not claimed. Skin subsurface, eye cornea geometry, hair anisotropy and contact shadows not done. |
| Navigation World to Core | **Not done.** Kept secondary as asked; the legacy World routes were not touched. |

## 5. Licence and asset ledger

Code and assets are audited separately. No code was copied from any reference below.

| Item | Licence (checked with the GitHub API on 2026-11-27) | Use |
|---|---|---|
| MakeHuman base mesh, targets, skeleton, weights, library clothes, hair, brows, skins | CC0 1.0 (assets; the repo reports NOASSERTION because code and assets differ). Pinned sha in `human.json`. | Shipped in `assets/human/`. |
| MakeHuman program code | AGPL-3.0 | Not used. |
| `culturalibre_heroine_suit_*` | Per `assets/human/library.json`; confirm before redistribution. | Shipped, ledger entry says "see library.json". |
| mpfb2 | NOASSERTION (code and assets differ) | Reference only, not integrated. |
| Scthe/frostbitten-hair-webgpu | MIT, last push 2024-09 | Research reference for GPU strand rendering. Not integrated. |
| tenkkov/webgpu-hair-simulation | **No licence declared**, last push 2022-01 | Do not copy. Reference only. |
| GPUOpen-Effects/TressFX | MIT, native DX12 and Vulkan | Reference for the guide and follower design. Not drop-in. |
| eriondibrani/hair-simulator | **No licence declared** | Do not copy. |
| bandinopla/three-simplecloth | MIT, active | Candidate for skinned garment blending; not integrated yet. |
| jspdown/cloth | MIT | XPBD reference. |
| ccincotti3/webgpu_cloth_simulator | **No licence declared** | Do not copy. |
| gkjohnson/three-gpu-pathtracer | MIT, active | Candidate for the cinematic mode. r187 compatibility, skinned geometry updates and BVH cost are **unverified**. |
| KhronosGroup/glTF-Validator | Apache-2.0 | Candidate for CI. Not run. |
| pixiv/three-vrm | MIT | Optional VRM interchange later. Not integrated. |
| TuriaArt/3d-gen-TU | NOASSERTION | Not evaluated. |

## 6. Known limits

- Idle and pose presets still define rotations in rest-world axes. Anatomical Euler channels (flexion, abduction, twist) exist in the frames but nothing animates through them yet.
- The tee, tank, long sleeve, shorts and trousers are cut from the body surface. They deform correctly but they are one layer thick, cannot fall away from the body, and their UV layout is the body atlas. The chest panel for logos is found by position, so it is approximate on unusual bodies.
- Stature at ages 18 to 24 pushes the adult height macro harder (the young age target is a blend with the child shape), so extreme heights there can look stretched. The reach readout reflects this.
- Experimental hair draws thin lines, not shaded strands. The hem cloth draws a flat strip. Both ignore the garment's real topology.
- Frame times and memory were measured only for the solvers on one Mac (see above); no mobile device or GPU profile was taken.
