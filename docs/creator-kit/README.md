# n0ise Creator Kit: worlds an AI can write

Ask any AI assistant for a room, a level or a small game. It sends you a `.n0world` file (or JSON text). Drag it into the **3D page** (or World tab → **Import world**, which also takes pasted text). n0ise checks it, repairs what it safely can, builds it, and lists anything it couldn't use. Then explore, edit anything, apply an n0ise look, press Play, save, and export it again.

No AI service, key or subscription is built into n0ise. The file is data only: no JavaScript, no network.

## The 2-minute path
1. In the import sheet press **Copy brief for my AI** (or open [`ai-brief.txt`](ai-brief.txt)) and paste it into your assistant once.
2. Say what you want: "a small art gallery with two rooms and a door that opens when I step on a pad".
3. Save its answer as `gallery.n0world`, or paste it into the import sheet. Press **Check**, then **Build world**.
4. If the report lists problems, press **Copy report**, paste it back to the assistant, and ask for the corrected file.

## Files in this kit
| file | what it is |
|---|---|
| [`ai-brief.txt`](ai-brief.txt) | the copy-paste brief (generated from the code) |
| [`ai-authoring-guide.md`](ai-authoring-guide.md) | how to get good files: workflow, mistakes, the report format |
| [`coordinates.md`](coordinates.md) | units, which way is up and forward, where `y: 0` is |
| [`prefabs.md`](prefabs.md) | every prefab and its parameters (generated) |
| [`rules.md`](rules.md) | triggers, actions, conditions and limits (generated) |
| [`examples.md`](examples.md) | three worked examples, each with the prompt that produced it |
| [`../../worlds/n0world.schema.json`](../../worlds/n0world.schema.json) | JSON schema |
| [`../../worlds/`](../../worlds) | the example worlds, plus a deliberately broken one |

## Tools
```bash
node tools/n0world-validate.mjs worlds/*.n0world     # same report as the app
node tools/n0world-pack.mjs world.json out.n0world   # validate and zip (world.json + assets/)
node tools/n0world-docs.mjs                          # regenerate prefabs.md, rules.md, schema, brief
```
`?safe=1` on the 3D page address turns imported worlds off. `?n0world=0` switches the feature off.

## What is not in version 1
Procedural architecture (extrude, bevel, arrays, scatter, booleans), terrain and vegetation, rigs and animation clips, state machines, dialogue, inventories, nested scenes, external textures and models. The format has a `version`, and prefabs, triggers and actions are registries in `src/world-schema.js`, so these can be added without breaking old files.
