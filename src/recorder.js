/* Shared video recorder for the camera, the effects page and the 3D page.
   State machine: idle -> arming -> recording -> stopping -> saving -> idle. start() and stop() are safe to call at any time:
   stop() during arming is remembered and applied the moment recording begins, so a quick tap or a cancelled press can never leave a
   recorder running. Data is flushed every second, the recording stops by itself at the cap, when the tab is hidden, when the page is
   left, or when the video track ends, and whatever was captured so far is saved. */
const MIMES=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1','video/webm;codecs=vp9,opus','video/webm;codecs=vp9','video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm','video/mp4'];
export const pickMime=()=>{try{return window.MediaRecorder&&MediaRecorder.isTypeSupported?MIMES.find(m=>MediaRecorder.isTypeSupported(m))||'':'';}catch(e){return '';}};
export const fmtTime=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
export function createRecorder(o={}){
  const CAP=o.cap||180,WARN=o.warn||CAP-15;
  const R={state:'idle',sec:0,mime:'',reason:''};
  let tog=false,cv=null,mg=null,src=null,lastReq=0,iv=33,pump=0,attached=false,rf=null,mr=null,parts=[],t0=0,timer=0,stopWanted=false,mic=null,opts=null,poster=null,posterT=0,warned=false,posterTried=false;
  const set=s=>{R.state=s;o.onState&&o.onState(s,R);};
  async function makePoster(){
    if(poster||!opts||!(cv||opts.canvas))return;
    try{poster=await new Promise(res=>(cv||opts.canvas).toBlob(res,'image/jpeg',.8));}catch(e){}
  }
  function cleanup(){
    clearInterval(timer);timer=0;
    if(mic){mic.getTracks().forEach(t=>t.stop());mic=null;}
    try{opts&&opts.end&&opts.end();}catch(e){}
    removeEventListener('pagehide',onHide);document.removeEventListener('visibilitychange',onVis);
    const vt=opts&&opts.watchTrack;if(vt)vt.removeEventListener('ended',onEnded);
    clearInterval(pump);pump=0;
    if(attached&&cv)cv.remove();mg=null;src=null;attached=false;cv=null;rf=null;
    mr=null;parts=[];opts=null;poster=null;warned=false;posterTried=false;stopWanted=false;
  }
  const onHide=()=>R.stop('left');
  const onVis=()=>{if(document.hidden)R.stop('hidden');};
  const onEnded=()=>R.stop('camera');
  async function finish(){
    const dur=Math.max(0,(performance.now()-t0)/1000),o2=opts,type=(mr&&mr.mimeType)||R.mime.split(';')[0]||'video/webm',p=parts.slice();
    set('saving');
    try{
      if(!poster)await makePoster();
      const base=type.split(';')[0];let blob=new Blob(p,{type:base});if(/webm/.test(base))blob=await fixWebmDuration(blob,dur);
      const ext=/mp4/.test(base)?'mp4':'webm';
      if(blob.size<64){throw new Error('The recording was empty.');}
      o2&&o2.onDone&&await o2.onDone({blob,ext,mime:base,duration:dur,poster,reason:R.reason});
    }catch(e){o.onError&&o.onError(e);}
    cleanup();R.sec=0;set('idle');
  }
  R.start=async function(op){
    if(R.state!=='idle')return false;
    opts=op;stopWanted=false;R.reason='';poster=null;warned=false;parts=[];
    set('arming');
    try{
      R.mime=pickMime();if(!R.mime)throw new Error('This browser can’t record video.');
      if(!op.canvas||!op.canvas.captureStream)throw new Error('Recording isn’t supported here.');
      op.begin&&op.begin();
      /* Record a scaled copy at a steady frame rate, not the live canvas: a phone canvas can be 1200 x 2600 and the encoder can't keep up
         in real time, which shows up as a laggy, stuttering file. The copy is capped (default 1280 on the long side) and frames are
         paced, with the last frame repeated if the page stalls, so the timeline never freezes. */
      src=op.canvas;iv=1000/(op.fps||30);const k=Math.min(1,(op.maxSide||1280)/Math.max(src.width,src.height,1));
      if(op.copy||k<.999){cv=document.createElement('canvas');cv.width=Math.max(2,Math.round(src.width*k)&~1);cv.height=Math.max(2,Math.round(src.height*k)&~1);mg=cv.getContext('2d');mg.drawImage(src,0,0,cv.width,cv.height);}
      else cv=src;
      if(!cv.isConnected){cv.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';document.body.appendChild(cv);attached=true;}
      let stream=(op.manual||op.copy||mg)&&cv.captureStream(0);rf=stream&&stream.getVideoTracks()[0];
      if(!(rf&&typeof rf.requestFrame==='function')){rf=null;stream=cv.captureStream(op.fps||30);}
      if(op.mic){try{mic=await navigator.mediaDevices.getUserMedia({audio:true});mic.getAudioTracks().forEach(t=>stream.addTrack(t));}catch(e){o.onWarn&&o.onWarn('Microphone was blocked. Recording without sound.');}}
      if(op.audioStream)op.audioStream.getAudioTracks().forEach(t=>stream.addTrack(t));
      mr=new MediaRecorder(stream,{mimeType:R.mime,videoBitsPerSecond:op.bitrate||Math.round(Math.min(8e6,Math.max(1.5e6,cv.width*cv.height*(op.fps||30)*.12)))});
      mr.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data);};
      mr.onerror=()=>R.stop('error');
      mr.onstop=finish;
      if(stopWanted){cleanup();set('idle');return false;}
      mr.start(250);t0=performance.now();R.sec=0;set('recording');lastReq=0;
      if(rf)pump=setInterval(()=>{if(performance.now()-lastReq>iv*1.7){lastReq=performance.now();try{const x=cv.getContext('2d');if(x){tog=!tog;x.save();x.globalAlpha=.02;x.fillStyle=tog?'#000':'#fff';x.fillRect(0,0,1,1);x.restore();}rf.requestFrame();}catch(e){}}},iv);
      timer=setInterval(()=>{
        R.sec=(performance.now()-t0)/1000;o.onTick&&o.onTick(R.sec,R);
        if(R.sec>1&&!posterTried){posterTried=true;makePoster();}
        if(R.sec>=WARN&&!warned){warned=true;o.onWarn&&o.onWarn('Recording stops at '+fmtTime(CAP)+'.');}
        if(R.sec>=CAP)R.stop('limit');
      },250);
      addEventListener('pagehide',onHide);document.addEventListener('visibilitychange',onVis);
      if(op.watchTrack)op.watchTrack.addEventListener('ended',onEnded);
      return true;
    }catch(e){cleanup();set('idle');o.onError&&o.onError(e);return false;}
  };
  R.due=()=>!!rf&&(R.state==='recording'||R.state==='arming')&&performance.now()-lastReq>=iv*.85;
  R.frame=()=>{
    if(!rf||(R.state!=='recording'&&R.state!=='arming'))return;
    const n=performance.now();if(n-lastReq<iv*.85)return;lastReq=n;   // never faster than the target rate
    try{if(mg&&src)mg.drawImage(src,0,0,cv.width,cv.height);rf.requestFrame();}catch(e){}
  };
  R.stop=function(reason){
    if(R.state==='arming'){stopWanted=true;return;}
    if(R.state!=='recording')return;
    R.reason=reason||'user';set('stopping');
    try{if(mr.state==='recording'){try{mr.requestData();}catch(e){}mr.stop();}else finish();}catch(e){finish();}
  };
  Object.defineProperty(R,'busy',{get(){return R.state!=='idle';}});
  return R;
}

/* WebM from MediaRecorder has no Duration, so players can't seek and report Infinity. This writes one into the Info element
   (own code, no dependency). Only touches the header; the media bytes are untouched. */
const vint=(n,len)=>{const a=new Uint8Array(len);let v=BigInt(n);for(let i=len-1;i>=0;i--){a[i]=Number(v&0xffn);v>>=8n;}a[0]|=1<<(8-len);return a;};
function readVint(b,o,keepMarker){const f=b[o];let len=1;while(len<=8&&!(f&(0x80>>(len-1))))len++;if(len>8)return null;let v=keepMarker?BigInt(f):BigInt(f&(0xff>>len));for(let i=1;i<len;i++)v=(v<<8n)|BigInt(b[o+i]);return{len,v};}
export async function fixWebmDuration(blob,seconds){
  try{
    if(!/webm/.test(blob.type)||!(seconds>0))return blob;
    const head=new Uint8Array(await blob.slice(0,Math.min(blob.size,4096)).arrayBuffer());
    let o=0;const id=(at)=>{const r=readVint(head,at,true);return r&&{len:r.len,v:r.v};};
    // EBML header
    let e=id(0);if(!e||e.v!==0x1a45dfa3n)return blob;let sz=readVint(head,e.len);o=e.len+sz.len+Number(sz.v);
    const segAt=o;e=id(o);if(!e||e.v!==0x18538067n)return blob;const ssz=readVint(head,o+e.len);const segHead=e.len+ssz.len,segUnknown=ssz.v===(1n<<BigInt(7*ssz.len))-1n;
    let p=o+segHead,infoAt=-1,infoSz=0,infoHead=0;
    while(p<head.length-12){const c=id(p);if(!c)return blob;const z=readVint(head,p+c.len);if(!z)return blob;
      if(c.v===0x1549a966n){infoAt=p;infoHead=c.len+z.len;infoSz=Number(z.v);break;}
      if(c.v===0x1f43b675n)return blob;p+=c.len+z.len+Number(z.v);}
    if(infoAt<0||infoAt+infoHead+infoSz>head.length)return blob;
    const info=head.slice(infoAt+infoHead,infoAt+infoHead+infoSz);
    for(let q=0;q<info.length-2;q++)if(info[q]===0x44&&info[q+1]===0x89)return blob; // already has one
    let scale=1000000;for(let q=0;q<info.length-4;q++)if(info[q]===0x2a&&info[q+1]===0xd7&&info[q+2]===0xb1){const l=info[q+3]&0x7f;let v=0;for(let k=0;k<l;k++)v=v*256+info[q+4+k];scale=v;break;}
    const dur=new Uint8Array(11);dur[0]=0x44;dur[1]=0x89;dur[2]=0x88;new DataView(dur.buffer).setFloat64(3,seconds*1e9/scale,false);
    const newInfoSz=infoSz+dur.length,newHead=new Uint8Array([0x15,0x49,0xa9,0x66,...vint(newInfoSz,8)]);
    const parts=[head.slice(0,segAt+e.len)];
    parts.push(segUnknown?head.slice(segAt+e.len,segAt+segHead):vint(Number(ssz.v)+(newHead.length-infoHead)+dur.length,8));
    parts.push(head.slice(segAt+segHead,infoAt),newHead,info,dur,blob.slice(infoAt+infoHead+infoSz));
    return new Blob(parts,{type:blob.type});
  }catch(err){return blob;}
}
/* Dev check: seek a recording at a few times and hash what is drawn. Identical hashes mean frozen video. */
export async function verifyFrames(blob,times=[.5,1.5,3]){
  const v=document.createElement('video');v.muted=true;v.playsInline=true;v.src=URL.createObjectURL(blob);v.preload='auto';
  await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(new Error('unplayable'));setTimeout(()=>no(new Error('timeout')),8000);});
  const c=document.createElement('canvas');c.width=48;c.height=48;const g=c.getContext('2d',{willReadFrequently:true}),hs=[];
  const dur=isFinite(v.duration)?v.duration:1e9;
  for(const t of times){if(t>dur-.05)continue;v.currentTime=t;await new Promise(r=>{v.onseeked=r;setTimeout(r,3000);});await new Promise(r=>setTimeout(r,60));
    g.drawImage(v,0,0,48,48);const d=g.getImageData(0,0,48,48).data;let h=0;for(let i=0;i<d.length;i+=4)h=(h*31+d[i]+d[i+1]*3+d[i+2]*7)>>>0;hs.push(h);}
  URL.revokeObjectURL(v.src);
  return{hashes:hs,duration:v.duration,distinct:new Set(hs).size,ok:hs.length<2||new Set(hs).size>1};
}
