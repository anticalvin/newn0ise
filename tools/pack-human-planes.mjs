// Adds the skeleton's roll metadata to assets/human/human.json: for every bone the three joints that define its rotation plane
// (as base-mesh vertex lists), straight from the pinned MakeHuman default.mhskel (CC0). pack-human.mjs omitted these, so bone axes
// could not be derived. Run: node tools/pack-human-planes.mjs   (needs network; the output is committed)
import fs from 'node:fs';
const man=JSON.parse(fs.readFileSync('assets/human/human.json','utf8'));
const RAW=`https://raw.githubusercontent.com/makehumancommunity/makehuman/${man.sha}/makehuman/data/rigs/default.mhskel`;
const sk=await (await fetch(RAW)).json();
let withPlane=0,missing=[];
for(const b of man.bones){
  const src=sk.bones[b.n],pn=src&&src.rotation_plane,pj=pn&&sk.planes[pn];
  if(!pj||pj.length<3||!pj.every(j=>sk.joints[j])){missing.push(b.n);delete b.pl;continue;}
  b.pl=pj.map(j=>sk.joints[j]);withPlane++;
}
man.planes={source:'default.mhskel rotation_plane',withPlane,missing};
fs.writeFileSync('assets/human/human.json',JSON.stringify(man));
console.log('bones with a rotation plane',withPlane,'of',man.bones.length,'missing',missing.length,missing.slice(0,10));
