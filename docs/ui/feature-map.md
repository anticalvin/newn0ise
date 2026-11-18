# Feature map: where every control lives in the new design

Rules (from the brief): global actions (Save, Import, Export, Undo/Redo, workspace switching) go in the `⋯` menu. 3D modes go in a Modes sheet. Shading and view options go in one View popover. Inspector rows become collapsible sections. Lab features go under Params, Presets and Export. Nothing is hidden with `display:none`; when unsure it goes under "More".

Status: **Lab is ported (this commit)**. Camera, Effects and 3D are mapped below and ported in later commits. Static ids come from the old markup (`git show 20acf9e:effects.html`, `:studio.html`); dynamic panels are listed by the module that builds them.

## Lab (done)

| Old control (id) | New place |
|---|---|
| Sketch preset select (`preset`) | Presets drawer, "Sketch" |
| New sketch (`new`), 3D object (`modeForm`), Reset code (`reset`), Duplicate to editor (`duplicate`) | Presets drawer "Sketch" group; also in `⋯` |
| My sketches (`slots`), Save (`save`), Save as (`saveas`) | Presets drawer; Save also in the desktop header and `⋯` |
| Mood buttons (`moods`) | Presets drawer, "Mood" |
| Sketch sliders (`controls`), Add slider (`cname`, `cadd`), Randomize (`random`) | Params drawer |
| Canvas shape (`aspect`), Seed (`seedv`, `seed`) | Params drawer |
| Load photo / Clear (`photo`, `unphoto`, `photof`) | Params drawer, "Photo in" |
| Run (`run`) | Run pill next to the sketch name |
| Pause (`pause`) | Round button, top right of the Lab view |
| PNG (`export`), Record 6 s (`rec`), Send to Effects (`tofx`), .js (`dl`), Copy (`copy`) | Export drawer; also in `⋯` |
| Code editor (`code`, CodeMirror) | Source section (right dock on desktop, toggle "Source") |
| Status and error lines (`status`, `error`) | Line under the preview |
| "How it works" text | `⋯` menu |
| Workspace links, Home | Top nav tabs and `⋯` |
| Studio | Round button next to `⋯` ("Coming soon" until `studio-app.html` exists) |

## Camera (Effects page, `?cam=1`)

| Old control | New place |
|---|---|
| Shutter / Rec (`rec`), mode (photo, video, scan) | Shutter row and mode labels |
| Lens, flash, zoom, flip | Side buttons |
| Exposure, white balance, focus, ISO, shutter | Exposure slider; the rest under "Capture settings" |
| Camera body, quality, grid, level, histogram, zebra, peaking | "Capture settings" sheet |
| Open camera / import photo (`open`, `file`) | Gallery button and `⋯` |
| Save (`save`), Undo/Redo | `⋯` and desktop header |
| Find (`find`), Plugins (`plugins`) | `⋯` |

## Effects

| Old control | New place |
|---|---|
| Effect tabs: Effects, Fuse, Stack | Sheet tabs: Looks, Stack, Fuse, Mask |
| Effect list, search, categories, variations (`shuffle`) | Looks tab (wrapping grid, search above it) |
| Per-effect parameters, presets, More controls | Adjust card under Looks; rest under "More" |
| Per-object effects, mask, text (`textoff`), source chip (`srcchip`) | Mask tab and Stack tab |
| Art only (`artonly`), Compare / Hold (`cmpbtn`, `hold`) | Original button on the artwork |
| Pause (`stillbtn`), Animate (`tlbtn`), Power (`power`), Beam paint (`paint`), Place (`toolplace`) | Sheet footer tools and "More" |
| Reset (`reset`, `tunereset`) | Adjust card |
| Save, Open (`open`), Plugins, Find, Undo/Redo | `⋯` and desktop header |
| 3D link (`studiobtn`) | Top nav |

## 3D (Studio page)

| Old control | New place |
|---|---|
| Undo, Redo, Save (`bUndo`, `bRedo`, `bSave`) | `⋯` and desktop header |
| Import (`bImport`, `eImport`), Export (`bExport`) | `⋯`; empty scene shows Import, Draw, Add shape, Try a demo on the canvas |
| Tools (`bTools`), eight modes: World, Sigil, Material, Build, Sculpt, Character, Photo to 3D, Open a model | Modes sheet |
| Light, Material, FX (`bLight`, `bMat`, `bFx`) | Tool row and inspector sections |
| Frame, Grid, Walk, Spin, Hold (`bFrame`, `bGrid`, `bWalk`, `bSpin`, `bHold`) | View popover |
| Effects link (`bLab`) | Top nav |
| Object list, transforms, material, physics, boolean, optimize | Hierarchy dock (left) and collapsible Inspector sections (right) |
| FX done (`fxdone`), Back (`wsback`) | Sheet header |
