/* Effects → Geometry: one conversion. The picture (after the effect) becomes a grid of brightness values, and a normal FORM generator turns
   it into raised instanced cylinders (dots) or a displaced terrain. The result is an ordinary generated object with a recipe, so it stays editable. */
export const GEO_CODE=`export const params = [
  { k: "mode", label: "Mode", t: "c", opts: ["Raised dots", "Terrain"], def: 0 },
  { k: "size", label: "Width (m)", min: 1, max: 12, def: 5, step: 0.1 },
  { k: "height", label: "Height", min: 0.02, max: 2, def: 0.5, step: 0.01 },
  { k: "radius", label: "Dot size", min: 0.2, max: 1, def: 0.8, step: 0.01 },
  { k: "threshold", label: "Cut below", min: 0, max: 0.9, def: 0.12, step: 0.01 },
  { k: "step", label: "Skip cells", min: 1, max: 4, def: 1, step: 1 },
  { k: "invert", label: "Invert", t: "b", def: false }
];

// data: [cols lo, cols hi, rows lo, rows hi, then brightness 0-255 for each cell, row by row]
export default function create({ geometry, params, data }) {
  if (!data) throw new Error("This generator needs image data. Use Make geometry in Effects.");
  const cols = data[0] | (data[1] << 8), rows = data[2] | (data[3] << 8), px = data.subarray(4);
  const { mode, size, height, radius, threshold, step, invert } = params;
  const cell = size / cols, g = geometry.group("Pattern");
  const val = (x, y) => { const v = px[Math.min(rows - 1, y) * cols + Math.min(cols - 1, x)] / 255; return invert ? 1 - v : v; };
  if (mode === 0) {
    const items = [];
    for (let y = 0; y < rows; y += step) for (let x = 0; x < cols; x += step) {
      const v = val(x, y);
      if (v < threshold) continue;
      const d = cell * step * radius;
      items.push({ pos: [(x - cols / 2 + 0.5) * cell, 0, (y - rows / 2 + 0.5) * cell], scale: [d, Math.max(0.005, v * height), d], color: "#" + [1, 0.8, 0.55].map(k => Math.round(255 * Math.min(1, 0.25 + v * 0.75 * k)).toString(16).padStart(2, "0")).join("") });
    }
    if (!items.length) throw new Error("Nothing is bright enough. Lower Cut below.");
    g.instances({ shape: "cylinder", dims: [1, 1, 1], segments: 10, items, material: "dots" });
  } else {
    const nx = Math.ceil(cols / step), ny = Math.ceil(rows / step), v = [], idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v.push([(i * step - cols / 2) * cell, val(i * step, j * step) * height, (j * step - rows / 2) * cell]);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
    g.mesh({ vertices: v, indices: idx, material: "terrain" });
  }
  return g;
}`;
export const GEO_PARAMS=[{k:'mode',label:'Mode',t:'c',opts:['Raised dots','Terrain'],def:0},{k:'size',label:'Width (m)',min:1,max:12,def:5,step:.1},{k:'height',label:'Height',min:.02,max:2,def:.5,step:.01},{k:'radius',label:'Dot size',min:.2,max:1,def:.8,step:.01},{k:'threshold',label:'Cut below',min:0,max:.9,def:.12,step:.01},{k:'step',label:'Skip cells',min:1,max:4,def:1,step:1},{k:'invert',label:'Invert',t:'b',def:false}];
/* brightness grid from a canvas: returns {b64, cols, rows} */
export function gridFromCanvas(cv,maxCols=72){
  const ar=cv.height/Math.max(1,cv.width),cols=maxCols,rows=Math.max(8,Math.min(maxCols*2,Math.round(cols*ar)));
  const t=document.createElement('canvas');t.width=cols;t.height=rows;const g=t.getContext('2d',{willReadFrequently:true});g.drawImage(cv,0,0,cols,rows);
  const px=g.getImageData(0,0,cols,rows).data,out=new Uint8Array(4+cols*rows);out[0]=cols&255;out[1]=cols>>8;out[2]=rows&255;out[3]=rows>>8;
  for(let i=0;i<cols*rows;i++)out[4+i]=Math.round(.299*px[i*4]+.587*px[i*4+1]+.114*px[i*4+2]);
  let bin='';for(let i=0;i<out.length;i+=0x8000)bin+=String.fromCharCode.apply(null,out.subarray(i,i+0x8000));
  return{b64:btoa(bin),cols,rows};
}
export function geoDoc(grid,name='Pattern geometry'){
  return{n0form:1,id:'me.pattern-geometry',name,version:'1.0.0',apiVersion:1,author:'me',licence:'CC0-1.0',seed:1,params:GEO_PARAMS,code:GEO_CODE,data:grid.b64,defaults:{materials:{dots:{color:'#ffffff',roughness:.45},terrain:{color:'#c9b27c',roughness:.8}}}};
}
