/* The brief for any AI to write a FORM generator. Kept in code so the app's button and docs/creator-kit/form-brief.txt (generated) agree. */
import {OPS,LIMITS,API_VERSION} from './form-runtime.js';
export const FORM_BRIEF=`You are writing a generator for n0ise FORM (a 3D app). Output ONE JSON object and nothing else (no code fences, no commentary). It is a .n0form file; the generator code is a JSON string with \\n for new lines.

FILE
{"n0form":1,"id":"author.name","name":"Name","version":"1.0.0","apiVersion":${API_VERSION},"author":"you","licence":"CC0-1.0","seed":7,
 "params":[{"k":"count","label":"Count","min":1,"max":200,"def":60,"step":1,"hint":"optional"},{"k":"glow","t":"b","label":"Glow","def":true},{"k":"mode","t":"c","label":"Mode","opts":["A","B"],"def":0},{"k":"tint","t":"color","label":"Tint","def":"#88ccff"}],
 "defaults":{"materials":{"stem":{"color":"#5a7a3a","roughness":0.7},"petal":{"color":"#ff7ab8","emissive":"#4a1030"}}},
 "code":"export default function create({ geometry, seed, params, rand, math, time }) { ... return group; }"}
Up to ${LIMITS.params} params. Slider = default type (min, max, def, step). The app builds the controls from "params"; the user can change them and the shape regenerates.

THE GENERATOR
export default function create({ geometry, seed, params, rand, math, time, data }) { ... }
Return the group you built (or nothing, if you built straight on geometry). It must be deterministic: use rand (seeded) and math.noise, never Math.random, Date or the network.
- geometry.group(name) -> group (groups nest; each has the same methods)
- group.tube({points:[[x,y,z],...], radius: number | (t,i)=>number, radialSegments:3-32, closed, cap, material, id}) -> a real tube mesh along the points
- group.curve({points, color}) a polyline; group.lines({segments:[[a,b],...]}); group.points({points,size,color})
- group.mesh({vertices:[[x,y,z],...], indices:[...triangles], normals?, uvs?, material}) your own triangles
- group.lathe({profile:[[radius,y],...], segments}) a surface of revolution (vases, columns)
- group.box|cylinder|sphere|cone({dims:[w,h,d], segments, pos:[x,y,z], rot:[x,y,z] degrees, scale, material, solid:true|false, id}) (y=0 is the base)
- group.instances({shape:'box|sphere|cylinder|cone', dims, segments, items:[{pos,rot,scale,color:'#rrggbb'}] OR count + fn:i=>item, material}) thousands of copies drawn as one object. Use this for repeated things.
Every thing can take material:"name" (the user can recolour names), id, solid:true (blocks the walking player; default is walk-through), hidden.
rand(), rand.range(a,b), rand.int(a,b), rand.pick(list), rand.gauss(), rand.fork("label") (a separate stream so changing one count doesn't reshuffle others).
math.noise(x,y,z) (-1..1), math.fbm, math.remap(v,a,b,c,d), math.lerp, math.clamp, math.smoothstep, math.TAU.
time: seconds, only if you put "export const animated = true" (then it regenerates a few times a second; use it for growth). Otherwise 0.

UNITS: metres, +Y up, y=0 is the floor; build things standing on the floor. Rotations in degrees. Keep the whole thing under about 5 m unless it is a landscape.
LIMITS: ${LIMITS.vertices.toLocaleString()} vertices, ${LIMITS.instances.toLocaleString()} instances, ${LIMITS.nodes} objects, ${LIMITS.calls} builder calls, ${LIMITS.ms/1000} s. Exceeding one stops the generator with a message. Prefer instances for repetition and tubes with radialSegments 5-8.
NOT AVAILABLE: import, fetch, document, window, self, eval, timers, Math.random. Operations: ${OPS.join(', ')}.

COMMON MISTAKES
Using Math.random; building thousands of separate boxes instead of one instances call; 64 radial segments on 500 tubes; forgetting to return or to build anything; placing things below y=0; param keys in code that aren't in "params" (they will be undefined); string code with unescaped quotes or real newlines (JSON needs \\n); comments are fine inside the code string.

IF I PASTE AN n0ise REPORT OR ERROR BACK
Fix exactly what it names (it may say a line number, a limit, or a field) and send back the WHOLE corrected JSON again, nothing else.

Now write a generator for: `;
