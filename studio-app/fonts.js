'use strict';
/* Free fonts for Studio text (all open licences, loaded from Google Fonts only when you pick one). Each entry: [family, weights, group].
   Weights are the ones the family really has, so the weight picker never offers a weight that would silently fall back. */
const StudioFonts = (() => {
  const L = [
    ['sans-serif','400;700','System'],['serif','400;700','System'],['monospace','400;700','System'],
    ['Inter','100..900','Clean sans'],['DM Sans','100..900','Clean sans'],['Manrope','200..800','Clean sans'],['Outfit','100..900','Clean sans'],['Urbanist','100..900','Clean sans'],['Plus Jakarta Sans','200..800','Clean sans'],
    ['Lexend','100..900','Clean sans'],['Sora','100..800','Clean sans'],['Figtree','300..900','Clean sans'],['Public Sans','100..900','Clean sans'],['Albert Sans','100..900','Clean sans'],['Hanken Grotesk','100..900','Clean sans'],
    ['Work Sans','100..900','Clean sans'],['Nunito Sans','200..900','Clean sans'],['Karla','200..800','Clean sans'],['Rubik','300..900','Clean sans'],['Red Hat Display','300..900','Clean sans'],['Epilogue','100..900','Clean sans'],
    ['Be Vietnam Pro','100;200;300;400;500;600;700;800;900','Clean sans'],['Chivo','100..900','Clean sans'],['Bricolage Grotesque','200..800','Clean sans'],['Space Grotesk','300..700','Clean sans'],['IBM Plex Sans','100;200;300;400;500;600;700','Clean sans'],
    ['Roboto','100;300;400;500;700;900','Basics'],['Open Sans','300..800','Basics'],['Lato','100;300;400;700;900','Basics'],['Montserrat','100..900','Basics'],['Poppins','100;200;300;400;500;600;700;800;900','Basics'],['Raleway','100..900','Basics'],['Barlow','100;200;300;400;500;600;700;800;900','Basics'],['Archivo','100..900','Basics'],['Source Sans 3','200..900','Basics'],['Noto Sans','100..900','Basics'],['Mulish','200..1000','Basics'],['Ubuntu','300;400;500;700','Basics'],
    ['Josefin Sans','100..700','Thin and sleek'],['Jost','100..900','Thin and sleek'],['League Spartan','100..900','Thin and sleek'],['Syncopate','400;700','Thin and sleek'],['Tenor Sans','400','Thin and sleek'],['Questrial','400','Thin and sleek'],['Didact Gothic','400','Thin and sleek'],['Italiana','400','Thin and sleek'],
    ['Archivo Black','400','Bold and black'],['Anton','400','Bold and black'],['Bebas Neue','400','Bold and black'],['Oswald','200..700','Bold and black'],['Big Shoulders Display','100..900','Bold and black'],['Unbounded','200..900','Bold and black'],['Syne','400..800','Bold and black'],['Dela Gothic One','400','Bold and black'],['Rubik Mono One','400','Bold and black'],['Alfa Slab One','400','Bold and black'],['Bungee','400','Bold and black'],['Righteous','400','Bold and black'],['Passion One','400;700;900','Bold and black'],['Lilita One','400','Bold and black'],['Fjalla One','400','Bold and black'],
    ['Playfair Display','400..900','Serif'],['DM Serif Display','400','Serif'],['Cormorant Garamond','300..700','Serif'],['Libre Baskerville','400;700','Serif'],['Lora','400..700','Serif'],['Merriweather','300;400;700;900','Serif'],['EB Garamond','400..800','Serif'],['Fraunces','100..900','Serif'],['Bodoni Moda','400..900','Serif'],['Crimson Pro','200..900','Serif'],['Source Serif 4','200..900','Serif'],['Instrument Serif','400','Serif'],['Abril Fatface','400','Serif'],['Cinzel','400..900','Serif'],['Gloock','400','Serif'],['Prata','400','Serif'],['Cormorant','300..700','Serif'],['Spectral','200;300;400;500;600;700;800','Serif'],
    ['JetBrains Mono','100..800','Mono'],['IBM Plex Mono','100;200;300;400;500;600;700','Mono'],['Space Mono','400;700','Mono'],['Fira Code','300..700','Mono'],['DM Mono','300;400;500','Mono'],['Roboto Mono','100..700','Mono'],['Courier Prime','400;700','Mono'],
    ['Caveat','400..700','Hand'],['Pacifico','400','Hand'],['Permanent Marker','400','Hand'],['Lobster','400','Hand'],['Shadows Into Light','400','Hand'],['Dancing Script','400..700','Hand'],['Satisfy','400','Hand']
  ];
  const byName = new Map(L.map(f => [f[0],f])), generic = new Set(['sans-serif','serif','monospace']);
  const has = name => byName.has(name);
  const groups = () => { const g = new Map(); for (const [n,,grp] of L) (g.get(grp) || g.set(grp,[]).get(grp)).push(n); return g; };
  /* the weights a family offers, as numbers */
  function weights(name) {
    const w = byName.get(name)?.[1] || '400;700';
    if (w.includes('..')) { const [a,b] = w.split('..').map(Number); return [100,200,300,400,500,600,700,800,900].filter(x => x >= a && x <= b); }
    return w.split(';').map(Number);
  }
  const nearest = (name,want) => { const ws = weights(name); return ws.reduce((b,x) => Math.abs(x-want) < Math.abs(b-want) ? x : b,ws[0]); };
  const WEIGHT_NAMES = {100:'Thin',200:'Extra light',300:'Light',400:'Regular',500:'Medium',600:'Semibold',700:'Bold',800:'Extra bold',900:'Black'};
  const url = name => { const w = byName.get(name)[1]; return 'https://fonts.googleapis.com/css2?family='+encodeURIComponent(name).replace(/%20/g,'+')+':wght@'+w+'&display=swap'; };
  const loaded = new Map();
  /* loads the family once (a stylesheet link) and resolves when the browser has the faces ready */
  function load(name,weight = 400) {
    if (!has(name) || generic.has(name)) return Promise.resolve(true);
    if (!loaded.has(name)) {
      const p = new Promise(res => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url(name); l.onload = () => res(true); l.onerror = () => res(false); document.head.append(l); });
      loaded.set(name,p);
    }
    return loaded.get(name).then(ok => ok ? document.fonts.load(`${weight} 48px "${name}"`).then(() => true,() => true) : false);
  }
  const css = (name,weight = 400) => generic.has(name) || !has(name) ? name : `"${name}", sans-serif`;
  return {list:L,has,groups,weights,nearest,load,css,WEIGHT_NAMES,generic};
})();
