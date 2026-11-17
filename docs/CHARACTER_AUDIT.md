# Character creator audit, licences and plan

Written alongside Character Creator 2.0. Facts below were checked against the repositories on 2026-11-17; "tested" means we ran it.

## 1. What was there (audit of the old creator)
- `src/figure.js` (old): about 140 lines. Capsules and spheres parented in a hand-made hierarchy, sliders scaled them. No skinning, no morph targets, no real face, hair and clothes were primitives. Export used GLTFExporter on plain meshes (no skeleton).
- Renderer: three.js 0.187 via the importmap (same as the 3D page). Already present in the codebase: GLTFLoader, GLTFExporter, gamepad and pen modules, the Poly Haven loader, the material studio. **Not present**: skinned-mesh editing, morph target pipeline, VRM loader.
- Hand-off to 3D already worked (IndexedDB `n0fig` then `studio.html#figure`).

## 2. Repositories, licences, and what we did with each
| Project | Licence (checked) | Verdict |
|---|---|---|
| makehumancommunity/makehuman (assets) | Assets **CC0 1.0** (LICENSE.md section C: base mesh, targets, modifiers, skeleton, weights). Program code AGPL-3.0. | **Used: assets only.** No MakeHuman code is copied. Our loader is written from the data formats. |
| jontechlabs/makehuman-web | **AGPL-3.0** (alpha). Downloads the same CC0 asset bundle. | **Studied, not used.** AGPL would force the whole site to AGPL. Its feature list (macro/detail morphs, clothing fitting, rig placement) guided the design. |
| M3-org/CharacterStudio | MIT, 480 MB repo (large asset packs), React-separated core | Not integrated now. Good reference for modular trait packs and VRM export; assets need individual licence review. Candidate for a later "modular parts" import. |
| pixiv/three-vrm | MIT | Not needed yet. Candidate for VRM export and expression mapping once the humanoid bone map is added (next milestone). |
| makehumancommunity/mpfb2 | Code GPL/other (NOASSERTION); assets CC0 | Reference only. |
| kblood/CharacterCreator | **GPL-3.0** | Reference only, not reused. |
| ekza-space/ekza-studio | NOASSERTION (no licence found) | Reference only, not reused. |

Keep code and asset licences separate: our code stays ours; the CC0 data lives in `assets/human/` with its source commit recorded in `human.json` (`sha`).

## 3. Chosen approach
MakeHuman core assets, our own runtime.
- `tools/pack-human.mjs` (our script) downloads from the pinned MakeHuman commit and writes `assets/human/human.bin` (base positions, body mesh with seams, skin weights; 0.6 MB) and one small file per morph target `assets/human/t/*.bin` (about 560 targets, loaded only when a slider needs them).
- `src/human.js` (our code): blends targets (gender, age, muscle, weight, height, proportions, ancestry blend and 166 face and body detail modifiers), rebuilds the 163-bone skeleton from the new body, skins the mesh, derives garments and hair from the body (clipped exactly on plane lines, offset along the surface so nothing intersects), builds 16 expression morph targets, poses, serialises state.
- `src/figure.js`: mobile-first editor, undo/redo, seeded randomise, presets, camera framing per tab, export.

## 4. Verified
- Loads on desktop and a 375x812 emulated phone; sheet and viewport do not collide.
- Gender, age, muscle, weight, height, proportions, details, expressions, six hair styles, outfits, eight poses work.
- Undo, redo and persistence round-trip (state is one JSON object).
- GLB export: 5 skinned meshes, 163 bones, 16 morph targets, 4.2 MB. Re-parsed with GLTFLoader and a bone rotation moved the skin (0.435 units). The same file opened in the n0ise 3D editor through Open in 3D.

## 5. Known limits (not done)
- Body shape is baked into the exported mesh; only the 16 expressions are live morph targets.
- Hair and clothes are derived from the body surface (clean but simple). There are no fabric textures, hair strands, or loadable garments yet. Skin is a tint with a sheen, no texture.
- No VRM export, no IK, no animation clips beyond static poses.
- Bone names lose dots on re-import (`upperarm01.L` becomes `upperarm01L`); harmless, but rig retargeting must allow for it.
- The GLB is 4.2 MB mostly because of dense morph targets (glTF sparse accessors would shrink it).
- The target pack is 13 MB in the repo (loaded lazily, usually 1 to 2 MB per character).
- Not hand-checked for every body preset in every pose; garments are offset along rest-pose normals, so extreme bends could show small intersections at joints.
- Mutation Studio, Form Studio, sculpt-on-character, n0ise effects on characters are the next milestones.
