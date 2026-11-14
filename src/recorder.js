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
  let mr=null,parts=[],t0=0,timer=0,stopWanted=false,mic=null,opts=null,poster=null,posterT=0,warned=false,posterTried=false;
  const set=s=>{R.state=s;o.onState&&o.onState(s,R);};
  async function makePoster(){
    if(poster||!opts||!opts.canvas)return;
    try{poster=await new Promise(res=>opts.canvas.toBlob(res,'image/jpeg',.8));}catch(e){}
  }
  function cleanup(){
    clearInterval(timer);timer=0;
    if(mic){mic.getTracks().forEach(t=>t.stop());mic=null;}
    try{opts&&opts.end&&opts.end();}catch(e){}
    removeEventListener('pagehide',onHide);document.removeEventListener('visibilitychange',onVis);
    const vt=opts&&opts.watchTrack;if(vt)vt.removeEventListener('ended',onEnded);
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
      const base=type.split(';')[0],blob=new Blob(p,{type:base});
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
      const stream=op.canvas.captureStream(op.fps||30);
      if(op.mic){try{mic=await navigator.mediaDevices.getUserMedia({audio:true});mic.getAudioTracks().forEach(t=>stream.addTrack(t));}catch(e){o.onWarn&&o.onWarn('Microphone was blocked. Recording without sound.');}}
      if(op.audioStream)op.audioStream.getAudioTracks().forEach(t=>stream.addTrack(t));
      mr=new MediaRecorder(stream,{mimeType:R.mime,videoBitsPerSecond:op.bitrate||6e6});
      mr.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data);};
      mr.onerror=()=>R.stop('error');
      mr.onstop=finish;
      if(stopWanted){cleanup();set('idle');return false;}
      mr.start(1000);t0=performance.now();R.sec=0;set('recording');
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
  R.stop=function(reason){
    if(R.state==='arming'){stopWanted=true;return;}
    if(R.state!=='recording')return;
    R.reason=reason||'user';set('stopping');
    try{if(mr.state==='recording'){try{mr.requestData();}catch(e){}mr.stop();}else finish();}catch(e){finish();}
  };
  Object.defineProperty(R,'busy',{get(){return R.state!=='idle';}});
  return R;
}
