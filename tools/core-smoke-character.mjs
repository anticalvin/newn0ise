// Character creator tests: rig and attachment integrity (numerical, CPU skinning), stature, outfit lifecycle, migration, files, decals.
// Format: [name, url, async body] returning true or a failure string. The body runs in character.html with window.__hum.
export const tests = [];
const t = (name, url, body) => tests.push([name, url, body]);
const PRE = `const wait=ms=>new Promise(r=>setTimeout(r,ms));const ready=async()=>{for(let i=0;i<200&&!window.__hum;i++)await wait(250);return window.__hum;};
const D=await import('/src/human-diag.js');const base={base:'male',gender:1,stature:171,statureUser:true,age:.5,muscle:.5,weight:.5,prop:.5};
const put=async(H,st)=>{H.load({...base,...st});await H.apply();await H.outfit();H.expr();};`;

const MATRIX = `[
 {base:'female',gender:0,stature:165,suit:{style:'female_casualsuit01',color:'#ffffff'},shoes:{style:'shoes01',color:'#ffffff'},hair:{style:'bob01',color:'#3b2417'}},
 {base:'male',gender:1,stature:188,muscle:1,weight:.9,suit:{style:'male_casualsuit02',color:'#ffffff'},shoes:{style:'shoes03',color:'#ffffff'},hair:{style:'short02',color:'#16100c'},glasses:{style:'sunglasses',color:'#111111'}},
 {base:'female',gender:0,stature:150,muscle:0,weight:0,age:.9,suit:{style:'none',color:'#fff'},top:{style:'tee',color:'#2563eb'},bottom:{style:'trousers',color:'#334155'},hair:{style:'long01',color:'#c8c8c8'},head:{style:'fedora01',color:'#1a1a1a'}},
 {base:'male',gender:1,stature:172,top:{style:'tank',color:'#c2410c'},bottom:{style:'shorts',color:'#111'},shoes:{style:'shoes05',color:'#fff'},hair:{style:'afro01',color:'#16100c'}}
]`;
const POSES = `['Cheer','Fighter','Run','Sit','Flex','Walk','Wave','T-pose','Dance']`;

t('character: fitted garments, shoes, hair, brows and lashes follow every pose across a body matrix', '/character.html', `async()=>{${PRE}
 const H=await ready();if(!H)return 'human did not load';const V=H.body.position.constructor;
 for(const [k,st] of ${MATRIX}.entries()){await put(H,st);
  const a=D.attachmentReport(H,${POSES},V,3);
  for(const [pose,row] of Object.entries(a))for(const [m,r] of Object.entries(row))if(r.frac>.03||r.maxGrow>.08)return 'look '+k+' pose '+pose+': '+m+' drifts from the body ('+r.bad+'/'+r.n+' points, max '+r.maxGrow+' m)';
  const v=D.validateRig(H,V);if(v.errs.length)return 'look '+k+': '+v.errs[0];const g=H.validate();if(!g.ok)return 'look '+k+' failed the runtime gate: '+g.errs[0];}
 return true}`);

t('character: eyeballs stay on the face in every pose and glasses are owned by the head', '/character.html', `async()=>{${PRE}
 const H=await ready();const V=H.body.position.constructor;
 for(const [k,st] of ${MATRIX}.entries()){await put(H,st);const e=D.eyeReport(H,${POSES},V);
  for(const [p,d] of Object.entries(e))if(!(d<.02))return 'look '+k+' pose '+p+': eyeball is '+d+' m from the lashes';}
 await put(H,{glasses:{style:'round',color:'#111111'}});const head=H.bones.find(b=>b.name==='head'),acc=head.children.find(c=>c.name==='Accessories');
 if(!acc||acc.children.length<4)return 'glasses not built under the head';
 for(const n of ['eye.L','eye.R']){const b=H.bones.find(x=>x.name===n);if(b.children.some(c=>/Glasses/.test(c.name)))return 'glasses attached to '+n;}
 await put(H,{glasses:{style:'none',color:'#111111'}});if(acc.children.length)return 'old glasses were not removed';return true}`);

t('character: stature is measured, exact, and survives age, muscle, weight and base changes', '/character.html', `async()=>{${PRE}
 const H=await ready();
 for(const [b,cm] of [['male',171],['male',183],['female',159],['female',165],['female',178]])for(const age of [.4,.5,.9]){await put(H,{base:b,gender:b==='male'?1:0,stature:cm,age});if(Math.abs(H.measure.stature*100-cm)>.35)return b+' '+cm+' age '+age+' measured '+(H.measure.stature*100).toFixed(2);}
 await put(H,{base:'male',gender:1,stature:183});for(const [m,w] of [[0,0],[1,1],[.2,.9]]){H.S.muscle=m;H.S.weight=w;await H.apply();if(Math.abs(H.measure.stature*100-183)>.35)return 'muscle '+m+' weight '+w+' moved stature to '+(H.measure.stature*100).toFixed(2);}
 H.setBase('female');await H.apply();if(Math.abs(H.measure.stature*100-183)>.35&&H.S.statureUser)return 'switching base changed a chosen stature';
 return true}`);

t('character: posing in rest-world axes equals the canonical rig (bone frames, no drift)', '/character.html', `async()=>{${PRE}
 const H=await ready();const V=H.body.position.constructor;await put(H,{});H.pose('A-pose');H.root.updateMatrixWorld(true);
 const P=n=>{const b=H.bones.find(x=>x.name===n),v=new V();b.getWorldPosition(v);return v;},rest={};for(const n of ['upperarm01.R','lowerarm01.R','wrist.R'])rest[n]=P(n);
 H.pose('Wave');H.root.updateMatrixWorld(true);const E=H.bones[0].rotation.constructor;
 const q=new (H.bones[0].quaternion.constructor)().setFromEuler(new E(-.2,0,-1.9,'XYZ'));
 const exp=rest['lowerarm01.R'].clone().sub(rest['upperarm01.R']).applyQuaternion(q).add(rest['upperarm01.R']);
 const got=P('lowerarm01.R'),d=exp.distanceTo(got);if(d>1e-4)return 'elbow is '+d+' m from the identity-axis result';
 const f=H.frames();if(f.info.fallbackRoll.length)return f.info.fallbackRoll.length+' bones had no usable rotation plane';if(f.info.degenerate.length)return 'zero length bones '+f.info.degenerate.join();
 for(let i=0;i<H.bones.length;i++){const l=f.Rr[i].length();if(!(Math.abs(l-1)<1e-5))return 'frame '+H.bones[i].name+' is not a unit rotation';}
 const arm=f.Yax[H.bones.findIndex(b=>b.name==='upperarm01.L')];if(!(arm.x>.3&&arm.y<-.3))return 'left upper arm axis does not run outward and down';return true}`);

t('character: rapid outfit changes leave exactly the requested slots and no stale meshes', '/character.html', `async()=>{${PRE}
 const H=await ready();await put(H,{});const ids=['female_casualsuit01','male_casualsuit03','none','male_worksuit01'];
 const ps=[];for(let i=0;i<8;i++){H.S.suit={style:ids[i%4],color:'#ffffff'};H.S.shoes={style:i%2?'shoes02':'none',color:'#fff'};H.S.glasses={style:['none','round','visor','sunglasses'][i%4],color:'#111'};ps.push(H.outfit());}
 await Promise.all(ps);
 const names=H.root.children.filter(c=>c.isSkinnedMesh&&c!==H.body).map(c=>c.name);
 if(names.filter(n=>/suit/.test(n)).length!==1)return 'suit meshes: '+names.join();
 if(names.includes('shoes02')!==(H.S.shoes.style==='shoes02'))return 'shoes slot out of step with the final look: '+names.join();
 const head=H.bones.find(b=>b.name==='head'),acc=head.children.find(c=>c.name==='Accessories');if(!acc||acc.children.length<3)return 'final glasses missing';
 for(let i=0;i<12;i++){H.S.suit={style:ids[i%4],color:'#fff'};await H.outfit();}
 if(H.root.children.filter(c=>c.isSkinnedMesh&&c!==H.body).length>6)return 'meshes piling up';
 H.S.suit={style:'none',color:'#fff'};H.S.shoes={style:'none',color:'#fff'};H.S.head={style:'none',color:'#fff'};await H.outfit();if(H.body.geometry.index.count!==H.body.geometry.index.count||H.root.children.some(c=>/suit/.test(c.name)))return 'suit not removed';
 const full=H.man.nIdx;if(H.body.geometry.index.count<full-3000)return 'body mask not restored ('+H.body.geometry.index.count+' of '+full+')';return true}`);

t('character: looks saved before the rework migrate, nothing is dropped silently', '/character.html', `async()=>{${PRE}
 const H=await ready();H.load({gender:.3,age:.5,shoes:{style:'sneaker',color:'#fff'},head:{style:'balaclava',color:'#111'},hair:{style:'bun',color:'#333'},neck:{style:'scarf',color:'#c00'}});await H.apply();await H.outfit();
 if(H.S.base!=='female')return 'base '+H.S.base;if(H.S.gender!==.3)return 'legacy blend not preserved';if(H.S.migrated.length<4)return 'migration notes: '+H.S.migrated.join();
 if(H.root.children.some(c=>['Shoes','Balaclava','Mask','Beanie','Scarf','Headband'].includes(c.name)))return 'a retired procedural item is still drawn';
 if(H.S.hair.style==='bun'||!H.lib.hair.some(x=>x.id===H.S.hair.style))return 'hair not mapped to a real asset: '+H.S.hair.style;return true}`);

t('character: .n0character files round-trip, and invalid files and images are rejected', '/character.html', `async()=>{${PRE}
 const H=await ready();await put(H,{base:'female',gender:0,stature:163,statureUser:true,hair:{style:'ponytail01',color:'#7a4a25'},suit:{style:'female_casualsuit02',color:'#ffffff'}});
 const o=H.exportCharacter();if(o.format!=='n0character'||o.version<2)return 'bad header';if(!o.assets.some(a=>a.id==='female_casualsuit02'&&a.license))return 'asset ledger missing the suit licence';
 if(o.base.license!=='CC0-1.0'||!o.base.sha)return 'base asset provenance missing';const txt=JSON.stringify(o);
 await put(H,{base:'male',gender:1,stature:190});await H.importCharacter(JSON.parse(txt));if(H.S.base!=='female'||Math.abs(H.measure.stature*100-163)>.4||H.S.suit.style!=='female_casualsuit02')return 'round trip changed the look';
 let rejected=0;for(const bad of [{format:'x'},{format:'n0character',version:99,look:{}},{format:'n0character',version:2,look:{},decals:[{img:'http://evil/x.png'}]}]){try{await H.importCharacter(bad);}catch(e){rejected++;}}
 if(rejected!==3)return 'accepted '+(3-rejected)+' invalid files';
 try{await H.loadDecalFile(new File(['hello'],'x.txt',{type:'text/plain'}));return 'accepted a text file as a decal';}catch(e){if(!/PNG/.test(e.message))return 'unhelpful error: '+e.message;}
 try{await H.loadDecalFile(new File([new Uint8Array(5*1048576)],'big.png',{type:'image/png'}));return 'accepted an oversized image';}catch(e){if(!/4 MB/.test(e.message))return 'unhelpful size error: '+e.message;}
 return true}`);

t('character: a logo is composited into the garment texture and travels with the look', '/character.html', `async()=>{${PRE}
 const H=await ready();await put(H,{top:{style:'tee',color:'#ffffff'},bottom:{style:'none',color:'#fff'},suit:{style:'none',color:'#fff'}});
 const cv=document.createElement('canvas');cv.width=cv.height=64;const g=cv.getContext('2d');g.fillStyle='#ff0000';g.fillRect(0,0,64,64);const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
 const img=await H.loadDecalFile(new File([blob],'logo.png',{type:'image/png'}));H.setDecal({slot:'top',img,x:.5,y:.5,scale:.6});await new Promise(r=>setTimeout(r,600));H.applyMaterials();
 const m=H.root.children.find(c=>c.name==='Top');if(!m||!m.material.map||!m.material.map.isCanvasTexture)return 'top has no composited texture';
 const c2=m.userData.decalCanvas.getContext('2d').getImageData(0,0,1024,1024).data;let red=0;for(let i=0;i<c2.length;i+=4*97)if(c2[i]>200&&c2[i+1]<60&&c2[i+2]<60)red++;if(red<20)return 'logo pixels not found ('+red+')';
 const o=H.exportCharacter();if(!o.decals.length||o.decals[0].img.slice(0,22)!=='data:image/png;base64,')return 'decal not saved with the look';
 H.setDecal(null);H.applyMaterials();if(m.material.map)return 'removing the logo left a texture';return true}`);

t('character: GLB export is a neutral rest pose and re-imports with the same skeleton', '/character.html', `async()=>{${PRE}
 const H=await ready();await put(H,{suit:{style:'male_casualsuit01',color:'#ffffff'},shoes:{style:'shoes02',color:'#fff'}});H.pose('Cheer');
 const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 H.pose('A-pose');H.root.updateMatrixWorld(true);const buf=await new Promise((ok,no)=>new GLTFExporter().parse(H.root,ok,no,{binary:true,onlyVisible:true,maxTextureSize:512}));
 const gl=await new Promise((ok,no)=>new GLTFLoader().parse(buf,'',ok,no));let skinned=0,bones=0;gl.scene.traverse(o=>{if(o.isSkinnedMesh)skinned++;if(o.isBone)bones++;});
 if(bones<H.bones.length)return 'bones '+bones+' of '+H.bones.length;if(skinned<3)return 'skinned meshes '+skinned;
 /* the re-imported rest skeleton must put the wrist where the live rig has it */
 const V=H.body.position.constructor,a=new V(),b=new V();H.bones.find(x=>x.name==='wrist.L').getWorldPosition(a);let w=null;gl.scene.traverse(o=>{if(o.isBone&&/wrist/.test(o.name)&&/L$/.test(o.name))w=o;});gl.scene.updateMatrixWorld(true);w.getWorldPosition(b);
 if(a.distanceTo(b)>.01)return 'wrist moved '+a.distanceTo(b).toFixed(4)+' m after export';return true}`);

t('character: brows and lashes follow expressions (a blink closes the lashes)', '/character.html', `async()=>{${PRE}
 const H=await ready();const V=H.body.position.constructor;await put(H,{});const lash=H.root.children.find(c=>/eyelash/.test(c.name));if(!lash)return 'no lashes';
 const sum=()=>{const t=new V();let y=0,n=0;for(let i=0;i<lash.geometry.attributes.position.count;i++){lash.getVertexPosition(i,t);if(t.x>0){y+=t.y;n++;}}return y/n;};
 const a=sum();H.S.expr={'eye-left-closure':1,'eye-right-closure':1};H.expr();const b=sum();H.S.expr={};H.expr();const c=sum();
 if(Math.abs(b-a)<.0015)return 'lashes did not move on a blink ('+(b-a).toFixed(5)+' m)';if(Math.abs(c-a)>1e-5)return 'lashes did not return to rest';return true}`);
