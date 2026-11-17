/* Glass helper: picks the accent colour from the artwork (a 24x24 copy, at most 3 times a second) and drops the blur when frames get slow. */
(()=>{
  const root=document.documentElement,probe=document.createElement('canvas');probe.width=probe.height=24;const px=probe.getContext('2d',{willReadFrequently:true});
  let last='';
  const art=()=>{let best=null,ba=0;document.querySelectorAll('canvas,#stage img,.stage img').forEach(c=>{const r=c.getBoundingClientRect();const a=r.width*r.height;if(a>ba&&r.bottom>0&&r.top<innerHeight&&getComputedStyle(c).visibility!=='hidden'){best=c;ba=a;}});return best;};
  function pick(){
    if(document.hidden)return;
    const c=art();if(!c)return;let d;
    try{px.drawImage(c,0,0,24,24);d=px.getImageData(0,0,24,24).data;}catch(e){return;}
    let H=[0,0,0,0,0,0,0,0,0,0,0,0].map(()=>({w:0,r:0,g:0,b:0}));
    for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),v=mx/255,s=mx?(mx-mn)/mx:0;if(v<.25||s<.18)continue;
      let h=mx===mn?0:mx===r?((g-b)/(mx-mn)+6)%6:mx===g?(b-r)/(mx-mn)+2:(r-g)/(mx-mn)+4;const k=Math.floor(h*2)%12,w=s*v;H[k].w+=w;H[k].r+=r*w;H[k].g+=g*w;H[k].b+=b*w;}
    const t=H.reduce((a,b)=>b.w>a.w?b:a,H[0]);
    let col='';
    if(t.w>1.5){let r=t.r/t.w,g=t.g/t.w,b=t.b/t.w;const L=(r*.3+g*.59+b*.11)/255;const k=L<.55?.55/Math.max(.05,L):L>.85?.85/L:1; /* keep it bright enough to read on glass */
      r=Math.min(255,r*k);g=Math.min(255,g*k);b=Math.min(255,b*k);col='rgb('+(r|0)+','+(g|0)+','+(b|0)+')';}
    if(col!==last){last=col;col?root.style.setProperty('--art',col):root.style.removeProperty('--art');}
  }
  /* accent is fixed CRT electric blue; pick() kept for a future per-project accent */
  /* glass costs frame time on weak phones: when frames run long for a few seconds, fall back to a solid translucent fill */
  let n=0,slow=0,t0=performance.now();
  (function f(t){if(t-t0>1000){const fps=n*1000/(t-t0);slow=fps<24?slow+1:0;n=0;t0=t;if(slow>=3)root.classList.add('glass-lite');}n++;if(!root.classList.contains('glass-lite'))requestAnimationFrame(f);})(t0);
})();
