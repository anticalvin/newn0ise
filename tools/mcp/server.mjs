#!/usr/bin/env node
/* n0ise MCP bridge.
   An AI client (Claude Code, Claude Desktop, any MCP host) talks to this process over stdio. This process runs a tiny
   WebSocket server on 127.0.0.1:8787. Open n0ise 3D with ?mcp=1 (or tap "Connect AI") and the page connects to it.
   Every tool is forwarded to the page's scene API (src/studio-api.js) and the JSON result comes back.
   Nothing leaves your machine: the socket only listens on localhost. */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {WebSocketServer} from 'ws';
import {z} from 'zod';
import fs from 'node:fs';
import path from 'node:path';

const PORT=+process.env.N0_PORT||8787,TIMEOUT=+process.env.N0_TIMEOUT||90000;
const log=(...a)=>console.error('[n0ise-mcp]',...a);
let page=null,seq=0;const pending=new Map();

const wss=new WebSocketServer({host:'127.0.0.1',port:PORT});
wss.on('listening',()=>log('waiting for the page on ws://127.0.0.1:'+PORT));
wss.on('error',e=>log('socket error: '+e.message+(e.code==='EADDRINUSE'?' (another bridge is already running; set N0_PORT)':'')));
wss.on('connection',(ws,req)=>{
  if(page&&page.readyState===1)try{page.close(4000,'replaced');}catch(e){}
  page=ws;log('page connected', req.headers['user-agent']?.slice(0,40), req.url);
  ws.on('message',buf=>{let m;try{m=JSON.parse(String(buf));}catch(e){return;}
    if(m.id!=null&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.t);m.error?p.rej(new Error(m.error)):p.res(m.result);}});
  ws.on('close',()=>{pending.forEach((p,id)=>{if(p.ws===ws){clearTimeout(p.t);p.rej(new Error('The page disconnected. Reload n0ise 3D and try again.'));pending.delete(id);}});if(page===ws){page=null;log('page disconnected');}});
});
function call(args){
  return new Promise((res,rej)=>{
    if(!page||page.readyState!==1)return rej(new Error('n0ise 3D isn’t connected. Open studio.html?mcp=1 in a browser (or tap Connect AI), then try again.'));
    const id=++seq,t=setTimeout(()=>{pending.delete(id);rej(new Error('The page didn’t answer in time.'));},TIMEOUT);
    pending.set(id,{res,rej,t,ws:page});page.send(JSON.stringify({id,args}));
  });
}

const server=new McpServer({name:'n0ise',version:'0.1.0'},{instructions:
`You are building a 3D scene in n0ise 3D, live in the user's browser. Units are metres, rotation is degrees, colours are '#rrggbb'.
Objects sit with their base at pos.y (pos.y=0 is the floor). Use dims:[w,h,d] to give an object an exact size.
Typical loop: n0_environment (ground, sky colour, sun, shadows) → n0_add shapes or models → n0_render and LOOK at the picture → fix with n0_set → n0_walk to test the space.
n0_scene returns exact bounds, so use it to align things instead of guessing. n0_batch runs many commands in one round trip.`});

const text=o=>({content:[{type:'text',text:typeof o==='string'?o:JSON.stringify(o,null,1)}]});
const fail=e=>({isError:true,content:[{type:'text',text:String(e&&e.message||e)}]});
const wrap=fn=>async a=>{try{return await fn(a);}catch(e){return fail(e);}};
const V3=z.array(z.number()).length(3);
const ID={id:z.number().int().optional().describe('Object id from n0_scene'),name:z.string().optional().describe('Object name, if no id')};
const LOOK={color:z.string().optional().describe('#rrggbb'),metalness:z.number().min(0).max(1).optional(),roughness:z.number().min(0).max(1).optional(),emissive:z.string().optional().describe('#rrggbb glow colour'),opacity:z.number().min(0).max(1).optional()};
const PHYS=z.object({type:z.enum(['static','dynamic','kinematic','none']).optional(),shape:z.enum(['box','sphere','capsule','cylinder','hull']).optional(),mass:z.number().optional(),bounce:z.number().optional(),friction:z.number().optional()}).optional().describe('physics body settings');
const XFORM={pos:V3.optional().describe('[x,y,z] metres; y is the base of the object'),rot:V3.optional().describe('[x,y,z] degrees'),dims:V3.optional().describe('exact [width,height,depth] in metres'),size:z.number().optional().describe('longest side in metres'),scale:z.union([z.number(),V3]).optional().describe('raw scale multiplier (prefer dims)')};
const fwd=cmd=>wrap(async a=>text(await call({cmd,...a})));

server.tool('n0_status','Is the n0ise page connected to this bridge?',{},wrap(async()=>text({connected:!!(page&&page.readyState===1),port:PORT})));
server.tool('n0_describe','List every scene command and its arguments.',{},fwd('describe'));
server.tool('n0_scene','Read the whole scene: objects (id, name, pos, rot, size, bounds, colour), lights, camera, environment.',{},fwd('scene'));
server.tool('n0_add','Add a shape (cube, sphere, torus, knot, plane, cylinder, cone, capsule) or import a model/photo from a URL or base64 (glb, gltf, obj, stl, ply, splat, jpg, png).',
  {type:z.string().optional().describe('cube|sphere|torus|knot|plane|cylinder|cone|capsule, or ready-made human|wall|floor|platform|pillar|crate|ball'),url:z.string().optional().describe('http(s) or same-origin URL of a model or image'),data:z.string().optional().describe('base64 file bytes (use with filename)'),filename:z.string().optional(),name:z.string().optional(),...XFORM,...LOOK,phys:PHYS},fwd('add'));
server.tool('n0_set','Change an object: move, rotate, resize, recolour, rename, hide.',{...ID,newName:z.string().optional(),visible:z.boolean().optional(),...XFORM,...LOOK,phys:PHYS},fwd('set'));
server.tool('n0_delete','Delete an object.',ID,fwd('delete'));
server.tool('n0_duplicate','Copy a shape.',{...ID,name:z.string().optional(),pos:V3.optional()},fwd('duplicate'));
server.tool('n0_select','Select an object (shows its gizmo for the human).',ID,fwd('select'));
server.tool('n0_light','Add, change or remove a light. type: point, spot or dir.',{op:z.enum(['add','set','delete','clear']).optional(),id:z.string().optional().describe('light id like L1'),type:z.enum(['point','spot','dir']).optional(),pos:V3.optional(),target:V3.optional(),color:z.string().optional(),intensity:z.number().optional(),angle:z.number().optional()},fwd('light'));
server.tool('n0_environment','Sky colour, ground plane, fog, sun, shadows, grid.',{bg:z.string().optional(),envIntensity:z.number().optional(),sun:z.object({intensity:z.number().optional(),pos:V3.optional(),color:z.string().optional()}).optional(),
  ground:z.union([z.boolean(),z.object({color:z.string().optional(),size:z.number().optional()})]).optional(),fog:z.union([z.null(),z.object({color:z.string().optional(),near:z.number().optional(),far:z.number().optional()})]).optional(),grid:z.boolean().optional(),shadows:z.boolean().optional()},fwd('environment'));
server.tool('n0_camera','Move the orbit camera. Give pos/target, or lookAt an object, or frame everything.',{pos:V3.optional(),target:V3.optional(),fov:z.number().optional(),lookAt:z.string().optional().describe('object name or id'),frame:z.boolean().optional()},fwd('camera'));
server.tool('n0_view','Display mode: shaded, clay, normal, depth, wire.',{mode:z.enum(['shaded','clay','normal','depth','wire'])},fwd('view'));
server.tool('n0_look','Turn the effect look over the scene on or off (off for a clean 3D render).',{on:z.boolean()},fwd('look'));
server.tool('n0_walk','Enter or leave first-person walk mode. Collision uses object bounds; floor is y=0.',{on:z.boolean(),pos:V3.optional(),yaw:z.number().optional().describe('degrees; 0 looks toward -z')},fwd('walk'));
server.tool('n0_sim','Physics. op play (build bodies from the scene and run), pause, reset (put everything back), gravity. Mark objects dynamic with phys first.',{op:z.enum(['play','pause','reset','gravity']),g:z.number().optional()},fwd('sim'));
server.tool('n0_clear','Remove every object and light.',{},fwd('clear'));
server.tool('n0_batch','Run several commands in one call. ops is a list like [{cmd:"add",type:"cube",...},{cmd:"set",...}].',{ops:z.array(z.record(z.any())),stopOnError:z.boolean().optional()},fwd('batch'));
server.tool('n0_run','Send any raw command object to the scene API (see n0_describe).',{command:z.record(z.any())},wrap(async a=>text(await call(a.command))));
server.tool('n0_render','Render the scene to a picture you can look at. pass: beauty (with the look), clean, clay, normal, depth, wire.',{pass:z.enum(['beauty','clean','clay','normal','depth','wire']).optional(),width:z.number().int().min(160).max(3600).optional()},
  wrap(async a=>{const r=await call({cmd:'render',...a});return{content:[{type:'image',data:r.base64,mimeType:r.mime},{type:'text',text:`${r.pass} ${r.width}x${r.height}`}]};}));
server.tool('n0_export','Export the scene to a file on this computer. format: glb or zip (project). Returns the path.',{format:z.enum(['glb','zip']),path:z.string().optional().describe('output file path; defaults to ./n0ise-exports/')},
  wrap(async a=>{const r=await call({cmd:'export',format:a.format});const out=path.resolve(a.path||path.join('n0ise-exports',`scene-${Date.now()}.${a.format}`));
    fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,Buffer.from(r.base64,'base64'));return text({saved:out,bytes:fs.statSync(out).size});}));

await server.connect(new StdioServerTransport());
log('MCP ready on stdio');
