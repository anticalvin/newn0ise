# newn0ise Stage 0 inventory (no code changed)

Source: `index.html` at origin/main `538b977` (3,480 lines). Counts come from the running app.

## 1. What exists today

### Effects (stack modules): 14
| id | Family | Params | Hero (drag) | Color behavior today |
|---|---|---|---|---|
| crtlab | Display | 144 legacy controls (8 tabs) | curv / scan | **Palette default `amber`** (BASE.pal) |
| dither | Bitmap | 11 | bias / cell | Gameboy greens |
| orb | Bitmap | 11 | count / size | Retro rainbow on black |
| multithr | Bitmap | 15 | lvl / ld | Black and cream |
| ascii | Glyph | 17 | cell / scan | Red on black |
| epsilon | Optical | 11 | thr / rad / int | Warm tint over source |
| linemod | Modulation | 9 | lines / th / wob | Lime on black |
| cmyk | Print | 17 | pitch / gain | CMYK on cream paper |
| shapes | Print | 26 (curve + range widgets) | cell / gain | Additive R/G/B inks on black |
| stipple | Print | 12 | sp / dens | Ink on paper |
| patmerge | Pattern | 11 | sp / size / thr | Pink on gray |
| pixelmania | Structure | 14 | cell / below / bev | Source colors (levels) |
| displace | Warp | 22 (image map) | dstr / flow | Source colors |
| crusher | Display | 19 | px / smear | Neon "Video synth" |

Dither methods inside CRT Lab: 13 (Off, Threshold, Bayer 4/8, Blue, White, Halftone, Atkinson, Floyd-Steinberg, Jarvis, Stucki, Sierra, Burkes). Dither module adds Stevenson-Arce and Sierra Lite (Worker).

### CRT Lab controls by tab (144)
Display 8 · Bitmap 17 · Signal 29 · Beam 37 · Glass 17 · Glitch 12 · Wave 13 · Lab 11.
Groups: Screen, Chain macros, Hardware identity | Dither, Palette, Tone | Format, Noise, Sync | Scan, Phosphor, Electronics, Geometry | Light, Reflections, Surface, Cabinet | Master, Corruption | Oscillator, Modulation, Second oscillator, Scope | Analog feedback, Terminal text, Display autopsy (7 layer toggles collapsed into one "one effect at a time" choice).

### Presets today (three overlapping systems)
- **Profiles (26):** None, Studio CRT, 70s B&W, 80s color TV, 90s monitor, Broadcast reference, Arcade cabinet, Amber terminal, Green terminal, Portable TV, Security monitor, VHS playback, Camcorder viewfinder, RGB game monitor, Vector arcade, Oscilloscope, Handheld LCD, Night vision, Thermal camera, Radar sweep, Teletext, Dashcam, Cursed broadcast, Lime composite, Damaged CRT, Unstable old TV.
- **Chains (24)** = Camera(6) → Medium(6) → Playback(6) → Display(12) picks: Newsroom studio, Evening news 1984, Home movie, Rental tape, Worn rental, Camcorder replay, Edit suite, Shop CCTV, Night patrol, Arcade cabinet, Pocket console, Vector cabinet, Amber terminal, Green terminal, Thermal inspection, Pirate broadcast, Late-night UHF, Film on tube, Wedding on portable, CCTV at 3am, Bootleg arcade tape, Archive reel, Dead channel, Studio on S-Video.
- **Saved looks** (localStorage `n0ise.looks`, 12) and **per-module presets** (`n0ise.p.<id>`, 12 each).
- Macros: Wear, Age, Bandwidth loss, Instability. Weather (Markov), clustered events, drift.

### Color systems today
- CRT palettes (15): Ice, Mono, Blood, Green terminal, Amber, Handheld, CGA, Virtual red, Sky, Vapor, Parchment, Home computer, Arcade 16, Custom, **Original color**. Plus extract-from-image, palette edit, depth/cycle controls in Bitmap tab.
- Library palettes (14, 5 categories) with .hex/.gpl import/export, cycle, add/remove color: Handheld (Gameboy, Pocket, Virtual red) · Print (CMYK on cream, Newsprint, Riso) · Neon (Video synth, Retro scan) · Mono (Ink, Red on black, Paper, Amber) · Earth (Parchment, Pink on gray).
- Per-module color params (paper, ink, bg, tint) and CRT Phosphor + Phosphor tint.

### Sources, export, other
- **Sources:** Demo planet, Test card, file (image / video / animated GIF, own LZW decoder), camera (flip), drag-drop, paste.
- **Export:** PNG, looping GIF (2/4/8 s × small/medium/large), video (webm/mp4, 2/4/8 s), manual Rec/Stop, borderless export, Download + Share. No 2x/4x.
- **Header:** Undo, Open, Camera, Rec, Save. **Stage pills:** Reset, Remove text, Power, Shuffle, Beam paint, Hold for original.
- **Actions chips:** Power, Degauss, Change channel, Static burst, Mutate hardware, Save look, Reset all.
- **Engine:** GL context-loss recovery, adaptive quality, frame cap (Smooth / Save battery), Worker for error diffusion, synchronous readbacks (thumbnails, diffusion input).

## 2. Scaffolding we reuse
| Piece | Where | Reuse in |
|---|---|---|
| Inspector rows `.ir` (label scrub, tap-to-type, range2, curve, color, palette editor, image) | `rowParam`, `palEditor` | Half/full sheet sections, desktop inspector |
| `.grab` handle + 3-snap sheet | `wireSheet` | Becomes 4-state sheet (hidden / peek / half / full) |
| Layer stack + compositor + `defineModule` | `STACK`, `MODULES` | Effect rail, layer strip |
| Skins (Lab / Parchment / Utility) | `data-skin` | Desktop skins, mobile uses Lab |
| Hero drag on canvas | `wireHero` (x→hero[0], y→hero[1]) | Seed of Stage 3 xy maps |
| Gallery with live thumbnails | `moduleThumb`, `renderGallery` | Effect rail thumbnails (add cache) |
| `?bench=1`, `runModuleGate()`, `bFeat/bDist`, `cyanFrac` | bench block | Stage 1 hue check, Stage 4 gate |
| Undo `HIST` (60) + `snap()` | CRT `P` only | Extend to stack, add redo |
| Remix, Share (URL hash), presets, Hold for original, Space/Z keys | inspector, `wire()` | Kept |
| Export panel, GIF encoder | `openExport` | Becomes the export dialog |

## 3. Proposed map: old → new UI
| Old | New home |
|---|---|
| Header Open / Camera | Corner "source" chip on the art (mobile); header stays on desktop |
| Header Undo | Two-finger tap + button; add Redo |
| Header Rec / Save | One Export button → dialog (size, format, 1x/2x/4x, length) |
| Display tab: Source chips | Start screen + source chip |
| Display tab: Chain pickers, Chains | Presets browser (Chains section) |
| Display tab: Profiles | Presets browser ("Looks") |
| Display tab: Chain macros | Tune sheet, "More" |
| Display tab: Actions chips | Overflow menu on the art |
| Bitmap/Palette tab | **Color treatment section** (works on any effect) |
| Bitmap Dither/Tone | Dither effect + Tune "More" |
| Signal / Beam / Glass tabs | CRT Lab accordions (unchanged, inside the effect) |
| Glitch tab | Glitch family on the rail (Tear, RGB split, Block, Drag…) |
| Wave / Lab tabs | Wave + Feedback effects on the rail; Lab extras in "More" |
| 13 stack modules | Rail tiles, grouped by family |
| Saved looks + module presets | Presets (one list) |
| Stage pills (Reset, Shuffle, Beam paint, Hold, Power, Remove text) | Overlays + overflow menu; Hold-to-compare stays |
| Legacy hero drag | Stage 3 xy maps per effect |

## 4. Gaps and flags
**Nothing is removed in this plan.** Things to decide or watch:
1. **Glitché-style names in your screenshot that do not exist yet:** SPHERE (radial lens), SCENE, BURN (we only have a Burn-in slider), PXLGRID (closest: Dither grid, Pixel Crusher, Pixelmania), and "BODY & SPACE". LINES = Line Modulation, LCD = Handheld LCD display. I propose building Sphere, Scene (needs your definition), Burn, and a Pixel Grid effect in Stage 4.
2. **Undo only covers CRT params** (`P`), not layers, palettes or module params; there is no redo. Needs a stack-wide history in Stage 6 (and one step per gesture in Stage 3).
3. **Default color:** `BASE.pal='amber'` plus 9 modules with built-in palettes. Stage 1 needs a global color-treatment layer; effects like Dither, ASCII, Orb, Crusher would default to "original" and keep their old palettes as optional presets/treatments.
4. **Three preset systems** (profiles, chains, looks + module presets) overlap. Stage 1 merges them into one Preset list; chains keep working as a "Chain builder" inside it.
5. **Sync GPU readbacks** (thumbnails, diffusion input) can stall on mobile. Needs async readback (PBO + fence) before the rail renders many live thumbnails.
6. **Bench gaps:** motion-clip columns come out dark; no hue-shift check yet (Stage 1 adds it).
7. **Security Cam** is today only a Camera-stage entry, the "Shop CCTV" / "CCTV at 3am" chains, and the mono "Security monitor" profile. No timestamp/REC overlay besides the profile text, no compression blocks, no interlace combing.
8. **Export** lacks 2x/4x and tiled rendering; preview vs export quality isn't labelled.
9. The legacy chip/pill styling still shows inside CRT Lab accordions (Display tab). Radius is already ≤3px via skins, but chips remain visually pill-like in density; to restyle in Stage 2.

## 5. Proposed stage order and gate per stage
Stage 1 color · 2 mobile sheet · 3 drag maps · 4 effect identities (+ bench gate) · 5 start screen · 6 quality of life. After each: run `?bench`, contact sheet, list changes and deferrals, stop for review.
