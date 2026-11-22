# n0ise

Effects, a 3D studio with a World builder, and a p5 Lab, as a static site (no build step for visitors; `npm run build` bundles the sources in `src/`).

- Plugins and tools (`.n0fx`): [PLUGINS.md](PLUGINS.md), [docs/ai-plugin-guide.md](docs/ai-plugin-guide.md)
- Worlds an AI can write (`.n0world`): [docs/creator-kit](docs/creator-kit/README.md)
- [Editable procedural vectors in Lab and Studio](docs/creator-kit/vector-guide.md)
- Procedural objects that keep their recipe (`.n0form`, Lab → 3D OBJECT): [docs/creator-kit/form-guide.md](docs/creator-kit/form-guide.md)
- Building scenes from code or an AI: [AI.md](AI.md)
- 3D model browser (Sketchfab): Scene tab, Empty-state or the launch screen > Browse models. Searching is public; importing needs your own free Sketchfab API token (sketchfab.com > Settings > Password & API), kept only in your browser. Each model's author and licence are shown and in the import toast; keep that credit with your work.
- 3D materials: Material tab > My materials saves the selected object's surface, texture or node pattern to a library on this device, reuses it on any object, and exports or imports it as a `.n0mat.json` file. Paint layers stay with their object and the project.
- Toon effects (Effects > Toon): Cel Shade, Comic Ink and Clean Halftone, with presets.
- Third-party licences: [THIRD_PARTY.md](THIRD_PARTY.md)
