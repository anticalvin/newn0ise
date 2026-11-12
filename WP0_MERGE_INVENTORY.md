# WP0: merge inventory (no code changed)

Sources: newn0ise `index.html` (af0983a, ~3,640 lines, see STAGE0_INVENTORY.md) and the n0ise camera `index.html` (1,696 lines, uploaded copy). GitHub is not reachable from my shell, so the camera repo was read from the uploaded file only; anything in the repo beyond that file (manifest, icons) is unverified.

## Camera app: what it has
- **Architecture:** one fragment shader `fsFx` with `switch(u_fx)` (case 0..54), a blur pass `fsBlur`, a shared post pass `fsPost` (split, glow, hue, sat, vignette, grain). Two ping-pong history buffers (`u_prev`) for time effects.
- **Tune (shared by all filters):** intensity, motion, hue, saturation, glow, grain, split. Per-filter defaults for intensity and motion.
- **Filters (47):** Color 12 (clean, chrome, aqua, solar, thermal, duo, tri, neon, fire, cyber, sunset, forest) · Mono 6 (noir, invert, x-ray, poster, halftone, ascii) · Film 9 (lomo, vintage, kodak, fuji, cinema, super 8, vhs, crt, night) · FX 11 (bloom, dream, glitch, pixel, prism, kaleido, mirror, matrix, liquid, paint, grid) · Time 4 (ghost, tunnel, slit, mosh) · Face 5 (mesh, dots, eyes, poly, aura; `@vladmandic/human` loaded lazily from jsDelivr, **unpinned**, must be pinned).
- **App:** shutter, timer, hold-to-record, front/rear flip, mirror, grid, aspect (free, 9:16, 3:4, 1:1, 4:3, 16:9), capture roll/gallery, attract mode, mic level (`u_aud`), manifest link, localStorage state.

## Duplicates and decisions
| Camera filter | newn0ise has | Decision |
|---|---|---|
| halftone | CMYK Print, Shape Halftone | Keep both. Camera one becomes "Halftone dot" (cheap, pointwise, fusable). |
| ascii | Glyph / ASCII | Keep both. Camera one is "Matrix-free ASCII quick"; real glyph module stays the quality one. |
| pixel | Pixelmania, Pixel Crusher | Keep both. Camera one becomes "Pixelate" (plain blocks). |
| glitch | CRT Lab Glitch tab | Keep both; camera one is an effect module, CRT glitch stays inside CRT Lab. |
| vhs, crt | Signal chain, CRT Lab | Keep both; camera "vhs"/"crt" are fast pointwise approximations, tagged "Quick". CRT Lab stays the hero. |
| night, thermal | Night vision / Thermal camera profiles | Keep both; camera ones become modules, profiles unchanged. |
| invert, solar, duo, tri | Color treatment modes | Keep as effects; color treatment stays separate. |

Rule: nothing from either app is dropped. Names stay distinct where looks overlap.

## Where everything lives after the merge
| Piece | Home |
|---|---|
| 47 camera filters | `fx/cam-*.js`: one `fx_<id>(Ctx)` GLSL function each, grouped by family (color, mono, film, fx, time, face) |
| Shared post (split, glow, hue, sat, vignette, grain) | One shared "Finish" pass, available to every stack |
| Time effects | Shared history ring (2 frames now, up to N), only allocated when a time module is active |
| Face effects | Lazy-loaded Human (pinned version), only when a face module is on, luma-mask fallback offline |
| Camera screen (shutter, timer, hold-to-record, flip, mirror, grid, roll) | `cam.js`, opened from the Source chip; camera frames are just a source |
| 7 tune controls | Mapped to the module param model (intensity, motion) plus Finish pass (hue, sat, glow, grain, split) |
| newn0ise stack modules (14), CRT Lab, presets, chains, export | Unchanged, become modules in the same stack |

## Architecture decision (WP1)
newn0ise today runs one full pass per layer plus a compositor. The fusion engine adds a second kind of module: **fusable** (pointwise or small-tap GLSL function). A recipe of fusable steps compiles to one program; heavy modules (CRT Lab, diffusion, bloom, history) keep their own pass. Toggle is a uniform bypass, recompiles are cached by signature. The 14 existing modules keep working untouched as "pass" modules.

## Proposed file strategy
Develop as `index.html` shell + `fx/*.js` + `cam.js`, with `node build.mjs` inlining into `dist/index.html`. Caveat: my sandbox has no confirmed Node, so I would check that first; otherwise the build script is a plain concatenation I can write in shell.

## Risks and flags
1. Camera app has no tests and I only read its source; its shaders are untested in newn0ise's `?bench` gate (cyan share, pairwise distance). Several camera filters (neon, cyber, aqua, thermal) are likely to trip the 15% cyan rule and need retuning.
2. Human is unpinned on a CDN; I'd pin an exact version at least two weeks old.
3. The "50 features" list is a roadmap across ~7 work packages; it is not one change. Proposed first slice: WP1 + 2 camera filters + CRT stack, as your prompt says.
4. Memory roadmap (6a..7) overlaps WP1/WP3/WP4; I'd treat this plan as superseding it.
