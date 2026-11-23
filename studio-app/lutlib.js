'use strict';
/* A library of film and movie style colour grades. Each one is a small recipe (curves, saturation, split toning, fade, bleach bypass, channel mix)
   that is baked into a real 17-point 3D LUT (.cube) on demand, so it goes through the same LUT path as a file you load and is saved with the project.
   They are original looks inspired by the character of well known stocks and films, not copies of anyone's LUT files. */
const StudioLutLib = (() => {
  const clamp = v => Math.max(0,Math.min(1,v)), sm = v => v*v*(3-2*v);
  /* g gamma, lift/gain per channel, con contrast curve, sat, sh shadow tint, hi highlight tint, fade black lift, mono, bleach, mix 3x3 */
  const S = (o) => ({g:1,lift:[0,0,0],gain:[1,1,1],con:0,sat:1,sh:[0,0,0],hi:[0,0,0],fade:0,mono:false,bleach:0,mix:null,...o});
  const LOOKS = [
    ['Neutral',['Clean','Neutral (identity)'],S({})],
    ['Clean',['Clean','Soft contrast'],S({con:.25,sat:1.04})],['Clean',['Clean','Punchy'],S({con:.5,sat:1.18})],['Clean',['Clean','Lifted blacks'],S({fade:.06,con:.15})],['Clean',['Clean','Airy and bright'],S({g:1.12,fade:.04,sat:.95,hi:[.02,.02,.03]})],
    ['Film stock',['Film stock','Warm portrait film'],S({con:.3,sat:.95,sh:[.015,.008,0],hi:[.04,.02,-.01],fade:.03,gain:[1.03,1,.96]})],['Film stock',['Film stock','Fine-grain daylight'],S({con:.28,sat:1.05,hi:[.015,.01,0],sh:[0,.006,.012],gain:[1,1.005,1.01]})],
    ['Film stock',['Film stock','Slide film, saturated'],S({con:.55,sat:1.42,gain:[1.02,1,1.02]})],['Film stock',['Film stock','Tungsten night film'],S({con:.35,sat:1.05,sh:[-.02,.02,.07],hi:[.01,.02,.05],gain:[.92,1,1.12]})],
    ['Film stock',['Film stock','Cross-processed'],S({con:.45,sat:1.2,sh:[0,.05,.06],hi:[.07,.04,-.05],mix:[[1.1,-.05,-.05],[0,1.05,-.05],[-.1,.05,1.1]]})],['Film stock',['Film stock','Faded 70s'],S({con:.18,sat:.82,fade:.1,sh:[.03,.01,0],hi:[.05,.03,-.02],gain:[1.04,1,.9]})],
    ['Film stock',['Film stock','Kodachrome-style warmth'],S({con:.42,sat:1.25,hi:[.05,.015,-.03],sh:[.015,0,.01],gain:[1.05,1,.94]})],['Film stock',['Film stock','Expired film'],S({con:.1,sat:.78,fade:.12,sh:[.04,.06,.02],hi:[.06,.01,.03]})],['Film stock',['Film stock','Instant print'],S({con:.22,sat:.9,fade:.08,sh:[.02,.04,.05],hi:[.07,.03,-.02]})],
    ['Black and white',['Black and white','Classic silver'],S({mono:true,con:.4})],['Black and white',['Black and white','High contrast noir'],S({mono:true,con:.9,g:1.1})],['Black and white',['Black and white','Soft fine-art mono'],S({mono:true,con:.18,fade:.05})],['Black and white',['Black and white','Selenium tone'],S({mono:true,con:.4,sh:[.03,0,.04],hi:[.02,.01,0]})],['Black and white',['Black and white','Sepia print'],S({mono:true,con:.3,sh:[.05,.02,-.02],hi:[.09,.05,-.02]})],['Black and white',['Black and white','Infrared look'],S({mono:true,con:.7,g:.85,gain:[1.1,1,.9]})],
    ['Movie',['Movie','Teal and orange blockbuster'],S({con:.4,sat:1.15,sh:[-.03,.03,.07],hi:[.08,.03,-.06]})],['Movie',['Movie','Cold thriller'],S({con:.4,sat:.85,sh:[-.02,.02,.06],hi:[-.01,.01,.04],gain:[.95,1,1.06]})],['Movie',['Movie','Neon dystopia'],S({con:.5,sat:1.25,sh:[.04,-.02,.1],hi:[.06,-.02,.06],gain:[1.04,.96,1.08]})],
    ['Movie',['Movie','Green-tinted cyber'],S({con:.4,sat:.9,sh:[-.03,.06,-.02],hi:[-.02,.05,-.02],gain:[.94,1.05,.94]})],['Movie',['Movie','Desert orange'],S({con:.5,sat:1.2,sh:[.04,0,-.04],hi:[.1,.04,-.08],gain:[1.1,.98,.85]})],['Movie',['Movie','Pastel hotel'],S({con:.15,sat:1.05,fade:.05,sh:[.05,.01,.04],hi:[.07,.03,.04],g:1.1})],
    ['Movie',['Movie','Moonlight blue'],S({con:.35,sat:.95,sh:[-.02,.01,.08],hi:[-.02,.02,.07],gain:[.9,.98,1.12]})],['Movie',['Movie','Golden hour glow'],S({con:.3,sat:1.12,hi:[.09,.04,-.05],sh:[.02,0,-.02],gain:[1.08,1,.9]})],['Movie',['Movie','Bleach bypass'],S({con:.55,sat:.7,bleach:.55})],['Movie',['Movie','Silver war drama'],S({con:.6,sat:.55,bleach:.35,sh:[-.01,0,.02]})],
    ['Movie',['Movie','Horror sickly green'],S({con:.45,sat:.8,sh:[-.02,.05,.02],hi:[0,.04,-.01],gain:[.94,1.04,.94]})],['Movie',['Movie','Western dust'],S({con:.4,sat:.85,fade:.04,hi:[.08,.04,-.04],sh:[.03,.01,-.02],gain:[1.06,1,.88]})],['Movie',['Movie','Sci-fi chrome'],S({con:.45,sat:.8,sh:[-.02,.01,.05],hi:[-.01,.02,.05],gain:[.95,1,1.08]})],
    ['Movie',['Movie','Romance soft pink'],S({con:.12,sat:1.05,fade:.05,hi:[.08,.02,.03],sh:[.03,0,.03],g:1.08}) ],['Movie',['Movie','Noir with a red accent'],S({con:.8,sat:.3,sh:[.02,-.01,-.01],hi:[.04,-.02,-.02],mix:[[1.25,-.15,-.1],[-.05,.95,0],[-.05,0,.95]]})],['Movie',['Movie','Vintage technicolor'],S({con:.5,sat:1.5,hi:[.04,.02,-.02],gain:[1.04,1,.98]})],
    ['Movie',['Movie','Two-strip colour'],S({con:.4,sat:1.0,mix:[[1,.1,0],[.05,1,.05],[.9,.1,.1]],hi:[.04,.0,-.02]})],['Movie',['Movie','VHS rental'],S({con:.15,sat:.9,fade:.09,sh:[.01,.03,.05],hi:[.04,.0,.02],gain:[1.02,.99,1.04]})],['Movie',['Movie','Arthouse muted'],S({con:.25,sat:.62,fade:.05,sh:[.01,.015,.02]})],
    ['Movie',['Movie','Gritty street'],S({con:.6,sat:.7,fade:.03,sh:[-.01,.01,.02]})],['Movie',['Movie','Sunbaked road'],S({con:.55,sat:1.3,hi:[.1,.05,-.07],gain:[1.1,1,.85]})],['Movie',['Movie','Underwater'],S({con:.3,sat:.9,sh:[-.04,.04,.08],hi:[-.03,.03,.06],gain:[.85,1.02,1.1]})],['Movie',['Movie','Candy pop'],S({con:.3,sat:1.6,hi:[.04,.0,.05],g:1.08})],
    ['Film stock',['Film stock','Cinema 35mm'],S({con:.32,sat:1.02,fade:.025,sh:[.01,.012,.02],hi:[.03,.015,-.01]})],['Film stock',['Film stock','Reversal high grain'],S({con:.6,sat:1.3,fade:.01})],['Film stock',['Film stock','Daylight negative'],S({con:.22,sat:.98,hi:[.02,.015,0],g:1.04})],['Film stock',['Film stock','Pushed two stops'],S({con:.7,sat:1.1,g:.9,sh:[.01,.0,.02]})],
    ['Moods',['Moods','Warm sunset'],S({sat:1.15,hi:[.08,.03,-.05],gain:[1.06,1,.9]})],['Moods',['Moods','Cold winter'],S({sat:.85,sh:[-.02,.01,.04],hi:[-.02,.01,.05],gain:[.92,1,1.1]})],['Moods',['Moods','Dreamy haze'],S({con:.08,fade:.08,g:1.15,hi:[.04,.03,.05],sat:.95})],['Moods',['Moods','Deep shadows'],S({g:.82,con:.4})],['Moods',['Moods','Matte'],S({fade:.14,con:.12,sat:.9})],
    ['Moods',['Moods','Vivid pop'],S({con:.35,sat:1.55})],['Moods',['Moods','Teal shadows, warm skin'],S({con:.3,sat:1.05,sh:[-.03,.025,.05],hi:[.05,.02,-.03]})],['Moods',['Moods','Autumn'],S({sat:1.2,hi:[.07,.02,-.06],sh:[.02,0,-.03],gain:[1.06,.98,.86]})],['Moods',['Moods','Pastel'],S({con:.08,sat:.8,fade:.07,g:1.12})]
  ];
  const norm = LOOKS.map(([g,[grp,name],s]) => ({group:grp,name,spec:s}));
  function grade(s,r,g,b) {
    let c = [r,g,b];
    if (s.mix) c = s.mix.map(row => row[0]*r+row[1]*g+row[2]*b);
    c = c.map((v,i) => clamp(Math.pow(clamp(v*s.gain[i]+s.lift[i]),1/s.g)));
    if (s.con) c = c.map(v => v+s.con*(sm(v)-v));
    let l = .299*c[0]+.587*c[1]+.114*c[2];
    if (s.bleach) { const m = clamp(sm(l)*.5+l*.5+s.con*.15); c = c.map(v => v+(m-v)*s.bleach); l = .299*c[0]+.587*c[1]+.114*c[2]; }
    c = s.mono ? [l,l,l] : c.map(v => l+(v-l)*s.sat);
    const sh = (1-l)*(1-l), hi = l*l;
    c = c.map((v,i) => clamp(v+s.sh[i]*sh+s.hi[i]*hi));
    if (s.fade) c = c.map(v => s.fade+v*(1-s.fade));
    return c.map(clamp);
  }
  const cache = new Map();
  function cube(name,size = 17) {
    const key = name+'|'+size; if (cache.has(key)) return cache.get(key);
    const e = norm.find(x => x.name === name); if (!e) return null;
    const lines = ['# '+name+' (n0ise generated film look)','TITLE "'+name.replace(/"/g,'')+'"','LUT_3D_SIZE '+size];
    for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) { const c = grade(e.spec,r/(size-1),g/(size-1),b/(size-1)); lines.push(c[0].toFixed(5)+' '+c[1].toFixed(5)+' '+c[2].toFixed(5)); }
    const text = lines.join('\n'); if (cache.size > 12) cache.clear(); cache.set(key,text); return text;
  }
  const groups = () => { const m = new Map(); for (const e of norm) (m.get(e.group) || m.set(e.group,[]).get(e.group)).push(e.name); return m; };
  return {list:norm,groups,cube,grade};
})();
