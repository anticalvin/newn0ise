# Effect ideas compared with what exists

| Idea | Closest existing module | Verdict |
|---|---|---|
| Temporal Loom | Datamosh (one stored frame), Echo | New: per-thread memory plus an over/under weave. **Built, behind `?flags=loom`.** |
| Ink Migration | Riso, Engraving, Halftone | Overlaps; only the animated drift of ink between plates is new. Add as a Riso option. |
| Reaction Print | Cymatics (visualizer), Contour | Reaction-diffusion needs several ping-pong buffers; high cost. Later, with a lite fallback. |
| Relief Press | Emboss, Engraving | Mostly covered. Skip unless depth input is available. |
| Slit Glass | Time and Glitch families, line jitter | Needs a ring of frames (8 to 32). Do after the frame-history API exists. |
| Feedback Garden | Datamosh, Echo, CRT persistence | Mostly covered by feedback plus Echo; a growth rule would be the only new part. |
| Magnetic Threads | Lines, Contour Map | Needs a vector field; partly covered by curl noise in Datamosh. Later. |
| Facet Assembly | Mosaic, Pixel, Voronoi-style looks | Overlaps pixel and mosaic. Skip. |
| Exposure Memory | Bloom, halation, camera sim pump | Overlaps long-exposure ghosting from Loom at high Memory. Skip for now. |
| Signal Weather | Signals/modulators, camera sim bands | Better as a modulator source than an effect. |

## Temporal Loom
- **Mechanism:** each thread (column or row strip) has its own memory length. A woven over/under checker decides which threads show the live frame and which show a slightly drifted copy of the previous output.
- **Primary controls:** Thread width, Memory, Over and under. Advanced: Thread drift, Cloth shading, Horizontal threads.
- **Presets:** Linen, Ribbon, Static weave.
- **Determinism:** the stored frame resets on any backward seek, any jump over half a second, and at the start of an export, so a given time renders from a clean state. Exports step frames in order, so repeated exports match.
- **Lite fallback:** when the engine is in lite mode, no stored frame is read and only the woven shading remains.
