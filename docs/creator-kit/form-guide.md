# FORM: generators that make real 3D objects

A **generator** is a small program (JavaScript) that builds geometry from parameters. n0ise runs it in an isolated worker, validates what it returns, and builds a normal selectable 3D object that **keeps its recipe**: code, parameters, seed and a content hash. Change a parameter and the object regenerates in place, keeping its id, position, material colours, n0ise looks and physics.

Write one in **Lab → 3D OBJECT**, or have any AI write a `.n0form` file for you (see below).

## Safety
- A `.n0form` file contains code. n0ise **shows you the code and asks you to press "Review and run"** the first time (remembered per exact code, by hash). `?safe=1` on the page address never runs imported code.
- The generator runs in a Web Worker with no DOM, no network and no storage (those are removed before it starts), and it can't touch your scene. It returns plain data, which the app checks (buffer sizes, index ranges, counts) before building anything.
- Limits: 400,000 vertices, 50,000 instances (6 million vertices drawn across all instances), 2,000 objects, 20,000 builder calls and 4 seconds. Going over stops the generator with a message that names the limit. A newer parameter change cancels a run still in progress.
- Honest limit: a browser can't cap a worker's memory. Memory is bounded by the geometry limits above and by the time limit; code that allocates huge ordinary arrays can still make the tab slow until the time limit stops it.

## The generator
```js
export default function create({ geometry, seed, params, rand, math, time, data }) {
  const g = geometry.group("Name");
  g.tube({ points: [[0,0,0],[0,1,0],[0.3,2,0]], radius: 0.03, material: "stem" });
  return g;
}
```
Optional exports: `export const params = [...]` (the controls), `export const animated = true` (regenerates a few times a second with `time` in seconds), `export const duration = 14` (stops after that many seconds).

| call | makes |
|---|---|
| `geometry.group(name)` | a group; groups nest and have the same methods |
| `.tube({points, radius \| (t,i)=>r, radialSegments, closed, cap, material, id})` | a real tube mesh along a path (3 to 32 sides) |
| `.curve({points, color})`, `.lines({segments})`, `.points({points,size,color})` | line and point primitives |
| `.mesh({vertices, indices, normals?, uvs?})` | your own triangles (vertices as `[[x,y,z],…]` or flat numbers) |
| `.lathe({profile:[[radius,y],…], segments})` | a surface of revolution |
| `.box \| .cylinder \| .sphere \| .cone({dims, segments, pos, rot, scale})` | basic solids standing on `y = 0` |
| `.instances({shape, dims, segments, items:[{pos,rot,scale,color}] \| count + fn})` | thousands of copies, drawn as one object |

Every call accepts `material` (a name the user can recolour), `id`, `name`, `pos`, `rot` (degrees), `scale`, `solid: true` (blocks the walking player; by default you walk through generated objects) and `hidden`.

`rand()` is seeded: also `rand.range(a,b)`, `rand.int(a,b)`, `rand.pick(list)`, `rand.gauss()` and `rand.fork("label")` (an independent stream, so changing one count doesn't reshuffle everything else). `math` has `noise`, `fbm`, `remap`, `lerp`, `clamp`, `smoothstep`, `TAU`. `Math.random` is replaced by the seeded stream, so the **same recipe, seed and values always give identical geometry** (`node tools/n0form-validate.mjs file.n0form --twice` checks it).

## Parameters
```json
"params": [
  {"k":"count","label":"Count","min":1,"max":200,"def":60,"step":1,"hint":"optional"},
  {"k":"glow","t":"b","label":"Glow","def":true},
  {"k":"mode","t":"c","label":"Mode","opts":["A","B"],"def":0},
  {"k":"tint","t":"color","label":"Tint","def":"#88ccff"}
]
```
Sliders (default), switches (`b`), choices (`c`, the value is the option index) and colours. The 3D panel and Lab build the controls from this list: the same exposed-controls idea as Make Tool.

## Units and axes
Metres. `+y` is up and `y = 0` is the floor, so build things standing on the floor. Rotations are degrees. Keep an object under about 5 m unless it is landscape.

## The `.n0form` file
```json
{"n0form":1,"id":"you.thing","name":"Thing","version":"1.0.0","apiVersion":1,"author":"you","licence":"CC0-1.0",
 "seed":7,"params":[...],"code":"export default function create(...) {...}",
 "defaults":{"materials":{"stem":{"color":"#3d7a35","roughness":0.7}}},"animated":false}
```
Import: drag it onto the 3D page, or use Lab → 3D OBJECT. Check one on the command line: `node tools/n0form-validate.mjs file.n0form` (report plus vertex and instance counts, regeneration time and a geometry hash).

## Five worked examples
All in [`forms/`](../../forms). Open them from the Lab examples list or drop them on the 3D page.
1. `spiral-garden.n0form`: 60 strands of tubes spiralling upward.
2. `procedural-tower.n0form`: floors, a window pattern and a taper. Try 60 floors.
3. `swarm.n0form`: thousands of instances following a noise field.
4. `lathe-vases.n0form`: surfaces of revolution.
5. `lattice-sphere.n0form`: struts and joints from instances.
Plus **FORM 001, `impossible-garden.n0form`** (growing plants, looping stems, grass and floating lights; pair it with `worlds/garden.n0world`).

## Common mistakes
- `Math.random`, `Date`, `fetch`, `import`, `document` (not available or not deterministic).
- Thousands of separate `box` calls instead of one `instances` call.
- 64 radial segments on hundreds of tubes (use 5 to 8).
- Forgetting to return or build anything ("The generator made nothing").
- Parameter names in code that aren't in `params` (they come out `undefined`).
- Code inside JSON with real line breaks or unescaped quotes (use `\n` and `\"`).

## The brief for an AI
Press **Copy brief for my AI** in Lab → 3D OBJECT (or open [`form-brief.txt`](form-brief.txt)), paste it once into ChatGPT or Claude, then say what you want. If n0ise reports an error, press nothing special: copy the red message (it includes the line number or the limit that was hit), paste it back, and ask for the whole corrected file.

## Extension points (not built)
Booleans (CSG), isosurfaces, morphing between geometries, generator breeding, p5 as a world generator and rule-grown worlds. The builder has an `apiVersion` and a list of operations (`OPS` in `src/form-runtime.js`); new operations are added there and files declare the version they need, so old files keep working.
