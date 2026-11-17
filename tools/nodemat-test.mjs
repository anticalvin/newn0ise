import * as M from '../src/nodemat.js';
const ev=M.createEval();
for(const [name,mk] of M.TEMPLATES){const g=mk();const t=performance.now();const m=M.buildMaps(g,256,ev);const dt=performance.now()-t;
 let bad=0,mn=9,mx=-9;for(const im of [m.base,m.rough,m.normal,m.emit].filter(Boolean)){for(const v of im.d){if(!isFinite(v))bad++;mn=Math.min(mn,v);mx=Math.max(mx,v);}}
 console.log(name.padEnd(16),dt.toFixed(0)+'ms','bad',bad,'range',mn.toFixed(2),mx.toFixed(2),JSON.stringify(m.flags));}
// every node type evaluates
const g=M.newGraph();for(const t of Object.keys(M.NODES)){if(t==='out')continue;const id=M.addNode(g,t,0,0);const n=g.nodes[id];const src=M.addNode(g,'noise',0,0);n.in=n.in.map(()=>src);const im=M.createEval()(g,128).get(id);let bad=0;for(const v of im.d)if(!isFinite(v))bad++;console.log(t,bad);}
// cycle guard
const g2=M.newGraph();const a=M.addNode(g2,'invert',0,0),b=M.addNode(g2,'invert',0,0);g2.nodes[b].in[0]=a;console.log('cycle blocked',!M.canConnect(g2,b,a));
