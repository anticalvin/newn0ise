/* The brief a person pastes into ChatGPT, Claude or any assistant once. Kept in code so the app's "Copy brief" button and
   docs/creator-kit/ai-brief.txt (generated) say the same thing. */
import {PREFABS,TRIGGERS,ACTIONS,PRIM_TYPES,READY_TYPES,SOUNDS,LIMITS} from './world-schema.js';
const ps=k=>Object.entries(PREFABS[k].params).map(([n,s])=>n+(s.t==='num'||s.t==='int'?'('+s.min+'-'+s.max+', default '+s.def+')':s.t==='enum'?'('+s.opts.join('|')+')':s.t==='bool'?'(true|false)':s.t==='material'?'(material name)':s.t==='vec3'?'([x,y,z])':'(list)')).join(', ');
export const WORLD_BRIEF=`You are writing a world file for n0ise (a 3D app). Output ONE JSON object and nothing else (no code fences, no commentary), so it can be saved as world.n0world or pasted straight into n0ise. The file is declarative: it never contains code.

FORMAT
{"format":"n0ise-world","version":1,
 "scene":{"name":"...","environment":{"timeOfDay":0-24,"sky":"day|dusk|night|overcast|none","fog":{"color":"#rrggbb","near":8,"far":60}|false,"ground":{"color":"#rrggbb","size":80}|false,"shadows":true}},
 "materials":{"name":{"color":"#rrggbb","roughness":0-1,"metalness":0-1,"emissive":"#rrggbb","opacity":0-1,"pattern":{"type":"checker|stripes|noise","color2":"#rrggbb","scale":4}}},
 "instances":[{"id":"unique-id","name":"optional","type":"${PRIM_TYPES.join('|')}|${READY_TYPES.join('|')}" OR "prefab":"${Object.keys(PREFABS).join('|')}","params":{...},"pos":[x,y,z],"rot":[x,y,z],"dims":[w,h,d],"material":"name","color":"#rrggbb","phys":{"type":"static|dynamic|kinematic|none"},"parent":"group-id"}],
 "lights":[{"id":"l1","type":"point|spot|dir","pos":[x,y,z],"color":"#rrggbb","intensity":number}],
 "cameras":[{"id":"main","pos":[x,y,z],"target":[x,y,z],"fov":50}],
 "rules":[{"id":"r1","when":{"trigger":"..."},"if":{"flag":"name","equals":true},"then":[{"action":"..."}]}],
 "looks":[{"target":"scene|object:<id>|material:<name>","profile":"vhs"}]}

UNITS AND COORDINATES
Metres, degrees, colours "#rrggbb". +y is up and y=0 is the floor. pos is the BASE of an object (pos.y=0 sits it on the floor). +x is right, +z is toward the viewer, so "forward" is -z. A character with yaw 0 faces -z. rot is [x,y,z] degrees; to turn something around the vertical axis use rot:[0,deg,0]. A room is centred on its pos and its walls are inside width x depth. Wall letters: n is the -z side, s is +z, e is +x, w is -x. Use dims:[w,h,d] for exact sizes.

PREFABS (each stays one editable object)
${Object.keys(PREFABS).map(k=>'- '+k+': '+PREFABS[k].note+' Params: '+(ps(k)||'none')).join('\n')}
A door is sized to fill a room opening: put the door at the opening's centre in the wall (for an 's' wall at depth D the door sits at z=D/2-0.1; for e/w walls add rot:[0,90,0]). Give the room an opening of the same width and height.

RULES (closed set, no scripting)
Triggers: ${Object.entries(TRIGGERS).map(([k,v])=>k+' ('+v.note+')').join('; ')}
Actions: ${Object.entries(ACTIONS).map(([k,v])=>k+' '+v.note).join('; ')}
Sounds: ${SOUNDS.join(', ')}. Targets are instance ids. Use "zone" prefab instances as invisible trigger areas.
Limits: ${LIMITS.instances} instances, ${LIMITS.rules} rules, ${LIMITS.actionsPerRule} actions per rule. Prefer prefabs (a room or stairs is ONE instance) over many loose boxes.

ALWAYS
- Include one spawn prefab where the player starts, inside the room, facing where you want them to look.
- Give every instance a unique id and reference materials only if you defined them under "materials".
- Keep things on the floor: platforms and furniture pos.y is their base.
- Add a light or two (or set timeOfDay) so the room is lit.

COMMON MISTAKES
Wrong wall letter or an opening wider than the wall; a door that doesn't match an opening; positions in centimetres instead of metres; forgetting that "forward" is -z; rules whose target id doesn't exist; using toggle-open on something that isn't a door; inventing prefab, trigger, action or sound names (they will be shown as pink placeholders and listed in a report); comments or trailing commas in the JSON.

IF I PASTE AN n0ise REPORT BACK
It lists lines like "- FIXED instances[2] "door1": material "steel2" doesn't exist; using the default." or "- CHECK ...". Fix exactly what it names and send back the WHOLE corrected JSON again, nothing else.

Now build this world: `;
