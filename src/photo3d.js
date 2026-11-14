/* Photographs turned into objects. Brightness-based: the shapes follow how light or dark each part of the picture is, which is not
   recovered scene depth. Four kinds: fold (accordion, wave, cylinder, card), pins, theatre (layers by brightness) and mosaic (fragments
   that line up from one viewpoint). Each takes a canvas and a small options object, and returns a THREE.Group. */
export const P3D={
  fold:{name:'Folded photograph',opts:[['mode','Fold',0,3,1,['Accordion','Wave','Cylinder','Card']],['amt','Amount',0,100,1],['n','Folds',2,24,1]],def:{mode:0,amt:60,n:8}},
  pins:{name:'Pin relief',opts:[['cols','Pins across',16,96,1],['h','Height',0,100,1],['inv','Invert',0,1,1]],def:{cols:48,h:55,inv:0}},
  theatre:{name:'Paper theatre',opts:[['n','Layers',3,10,1],['gap','Spacing',0,100,1],['bg','Backdrop',0,100,1]],def:{n:6,gap:45,bg:60}},
  mosaic:{name:'Exploded mosaic',opts:[['cols','Fragments across',4,20,1],['spread','Spread',0,100,1],['align','Alignment',0,100,1]],def:{cols:10,spread:40,align:100}}
};
const aspectOf=cv=>cv.width/cv.height;
const tex=(T,cv)=>{const t=new T.CanvasTexture(cv);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;};
function pixels(cv,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(cv,0,0,w,h);return g.getImageData(0,0,w,h).data;}
export function build(T,kind,cv,o){
  o=Object.assign({},P3D[kind].def,o||{});const g=new T.Group(),a=aspectOf(cv),H=2,W=H*a;
  if(kind==='fold'){
    const seg=240,geo=new T.PlaneGeometry(W,H,seg,1),pos=geo.attributes.position,amt=o.amt/100,n=Math.round(o.n);
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),u=x/W+.5;let z=0;
      if(o.mode===0){const tri=Math.abs(((u*n)%1+1)%1-.5)*2;z=(tri-.5)*W*.22*amt;pos.setX(i,x*(1-.1*amt));}
      else if(o.mode===1){z=Math.sin(u*n*Math.PI*2/ (n>6?2:1))*W*.12*amt;}
      else if(o.mode===2){const ang=(u-.5)*Math.PI*1.6*amt+1e-4,r=W/(Math.PI*1.6*amt+1e-4);pos.setX(i,Math.sin(ang)*r);z=(1-Math.cos(ang))*r*-1+r*.0;}
      else{const k=Math.abs(u-.5)*2*amt;z=-k*W*.35;pos.setX(i,x*(1-.12*k));}
      pos.setZ(i,z);}
    geo.computeVertexNormals();
    g.add(new T.Mesh(geo,new T.MeshStandardMaterial({map:tex(T,cv),side:T.DoubleSide,roughness:.7,metalness:0})));
  }else if(kind==='pins'){
    const cols=Math.round(o.cols),rows=Math.max(2,Math.round(cols/a)),d=pixels(cv,cols,rows),cell=W/cols;
    const geo=new T.BoxGeometry(cell*.86,1,cell*.86),mat=new T.MeshStandardMaterial({roughness:.45,metalness:.35,vertexColors:false});
    const im=new T.InstancedMesh(geo,mat,cols*rows),m=new T.Matrix4(),col=new T.Color(),hmax=W*.35*o.h/100+.001;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=(y*cols+x)*4,l=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)/255,hh=Math.max(.02,(o.inv?1-l:l)*hmax+.02);
      m.compose(new T.Vector3((x+.5)*cell-W/2,(rows-y-.5)*cell-rows*cell/2,hh/2-hmax/2),new T.Quaternion().setFromEuler(new T.Euler(Math.PI/2,0,0)),new T.Vector3(1,hh,1));
      // boxes are tall on Y; rotate so the pin points toward the viewer (z)
      im.setMatrixAt(y*cols+x,m);col.setRGB(d[i]/255,d[i+1]/255,d[i+2]/255,T.SRGBColorSpace);im.setColorAt(y*cols+x,col);}
    im.instanceColor.needsUpdate=true;g.add(im);
  }else if(kind==='theatre'){
    const N=Math.round(o.n),W2=Math.min(512,cv.width),H2=Math.round(W2/a),d=pixels(cv,W2,H2),gap=.05+o.gap/100*.5;
    if(o.bg>0){const bgm=new T.Mesh(new T.PlaneGeometry(W*1.4,H*1.4),new T.MeshBasicMaterial({map:tex(T,cv),color:new T.Color(1,1,1).multiplyScalar(.25+.5*o.bg/100)}));bgm.position.z=-gap*.6;g.add(bgm);}
    for(let k=0;k<N;k++){
      const c=document.createElement('canvas');c.width=W2;c.height=H2;const x=c.getContext('2d'),im=x.createImageData(W2,H2);
      for(let i=0;i<W2*H2;i++){const j=i*4,l=(d[j]*.299+d[j+1]*.587+d[j+2]*.114)/255,b=Math.min(N-1,Math.floor(l*N));if(b===k){im.data[j]=d[j];im.data[j+1]=d[j+1];im.data[j+2]=d[j+2];im.data[j+3]=255;}}
      x.putImageData(im,0,0);
      const m=new T.Mesh(new T.PlaneGeometry(W,H),new T.MeshStandardMaterial({map:tex(T,c),transparent:true,alphaTest:.5,side:T.DoubleSide,roughness:.9}));
      m.position.z=k*gap*.5;m.castShadow=m.receiveShadow=true;g.add(m);}
  }else if(kind==='mosaic'){
    const cols=Math.round(o.cols),rows=Math.max(2,Math.round(cols/a)),cw=W/cols,ch=H/rows,D=6,t=tex(T,cv);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const z=(rnd()-.5)*2*o.spread/100*2.4,sc=1+(-z/D)*(o.align/100)*-1; // closer fragments are scaled down, farther ones up, so they line up from the front
      const s=(D-z)/D*(o.align/100)+(1-o.align/100);
      const geo=new T.PlaneGeometry(cw*.98,ch*.98),uv=geo.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,(x+uv.getX(i))/cols,1-(y+1-uv.getY(i))/rows);
      const m=new T.Mesh(geo,new T.MeshStandardMaterial({map:t,side:T.DoubleSide,roughness:.8}));
      m.position.set(((x+.5)*cw-W/2)*s,((rows-y-.5)*ch-H/2)*s,z);m.scale.setScalar(s);g.add(m);}
  }
  return g;
}
export function loadCanvas(file,max=1024){return new Promise((ok,no)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(2,Math.round(im.naturalWidth*k));c.height=Math.max(2,Math.round(im.naturalHeight*k));c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c);};im.onerror=()=>no(new Error('That file isn’t a picture.'));im.src=u;});}
export function sampleCanvas(){const c=document.createElement('canvas');c.width=640;c.height=800;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,800);gr.addColorStop(0,'#27324a');gr.addColorStop(1,'#d9a066');g.fillStyle=gr;g.fillRect(0,0,640,800);g.fillStyle='#f4efe6';g.beginPath();g.arc(320,330,170,0,7);g.fill();g.fillStyle='#b23a2e';g.fillRect(80,560,260,170);g.fillStyle='#1c1c1e';g.beginPath();g.arc(500,600,90,0,7);g.fill();return c;}
