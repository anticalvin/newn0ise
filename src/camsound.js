/* Small synthesised sounds so each camera body feels like a thing: SLR chunk, plastic click and wind-on, instant motor, digital beep,
   tape load and record beeps. Everything is made on the spot with Web Audio (no files), kept quiet, and only runs after a tap. */
const FILM_SLR=new Set(['noir','neg35','slide','xpro','bleach','mf120','pinhole']);
const PLASTIC=new Set(['disp','holga','p110']);
const INSTANT=new Set(['inst','expired']);
export function createCamSound(){
  let ac=null,master=null;
  const ctx=()=>{if(!ac){ac=new (window.AudioContext||window.webkitAudioContext)();master=ac.createGain();master.gain.value=.5;master.connect(ac.destination);}
    if(ac.state==='suspended')ac.resume();return ac;};
  const burst=(at,dur,freq,q,gain,sweep,type='bandpass')=>{
    const a=ctx(),n=Math.max(8,Math.floor(a.sampleRate*dur)),b=a.createBuffer(1,n,a.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(n*.22));
    const s=a.createBufferSource();s.buffer=b;const f=a.createBiquadFilter();f.type=type;f.frequency.setValueAtTime(freq,at);if(sweep)f.frequency.exponentialRampToValueAtTime(sweep,at+dur);f.Q.value=q;
    const g=a.createGain();g.gain.value=gain;s.connect(f);f.connect(g);g.connect(master);s.start(at);};
  const tone=(at,dur,freq,gain,type='sine',to)=>{
    const a=ctx(),o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,at);if(to)o.frequency.linearRampToValueAtTime(to,at+dur);
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(gain,at+.01);g.gain.exponentialRampToValueAtTime(.0001,at+dur);o.connect(g);g.connect(master);o.start(at);o.stop(at+dur+.02);};
  const ratchet=(t,n,gap,gain)=>{for(let i=0;i<n;i++)burst(t+i*gap,.025,3000+i*80,2,gain);};
  function play(kind,body){
    try{
      const a=ctx(),t=a.currentTime+.005,id=(body&&body.id)||'',cat=(body&&body.cat)||'';
      if(kind==='shutter'){
        if(FILM_SLR.has(id)){burst(t,.04,2400,.8,.5);burst(t+.045,.07,650,.7,.55);tone(t+.04,.07,130,.25,'triangle');}
        else if(PLASTIC.has(id)){burst(t,.03,3400,1.4,.6);ratchet(t+.18,6,.055,.22);}
        else if(INSTANT.has(id)){burst(t,.035,2600,.9,.5);tone(t+.12,.55,200,.07,'sawtooth',340);burst(t+.12,.5,900,.6,.08,500);}
        else if(cat==='Digital'||cat==='Glitch'){tone(t,.05,1850,.12,'square');burst(t+.03,.04,2200,.8,.4);burst(t+.08,.05,1500,.8,.3);}
        else{burst(t,.05,2600,.9,.55);burst(t+.075,.05,1700,.9,.4);}
      }else if(kind==='select'){
        if(cat==='Film'){ratchet(t,3,.045,.16);}
        else if(cat==='Video'){burst(t,.28,500,.5,.14,1400,'bandpass');tone(t+.05,.2,170,.04,'sawtooth',230);}
        else if(cat==='Digital'){tone(t,.04,1500,.06,'square');}
        else{burst(t,.12,1800,.3,.12,300,'highpass');}
      }else if(kind==='recstart'){
        if(cat==='Video'||cat==='Digital'||cat==='Glitch'){tone(t,.07,1320,.1,'square');tone(t+.1,.09,1760,.1,'square');burst(t+.2,.3,420,.6,.08,260);}
        else{for(let i=0;i<10;i++)burst(t+i*.055,.03,900,.8,.12);tone(t,.6,60,.1,'sine');}
      }else if(kind==='recstop'){tone(t,.09,880,.1,'square');}
    }catch(e){}
  }
  return {play};
}
