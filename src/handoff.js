/* One-shot hand-off between pages (Camera, Effects, 3D, World): the sending page stores a picture and some notes in IndexedDB, the
   receiving page takes it once. Nothing is uploaded; entries older than ten minutes are ignored. */
const open=()=>new Promise((res,rej)=>{const q=indexedDB.open('n0ise-handoff',1);q.onupgradeneeded=()=>q.result.createObjectStore('h');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
export async function put(blob,meta){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction('h','readwrite');tx.objectStore('h').put({blob,meta:meta||{},t:Date.now()},'cur');tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
export async function take(){
  try{const db=await open();const rec=await new Promise((res,rej)=>{const tx=db.transaction('h','readwrite'),st=tx.objectStore('h'),g=st.get('cur');g.onsuccess=()=>{st.delete('cur');res(g.result);};g.onerror=()=>rej(g.error);});
    return rec&&Date.now()-rec.t<6e5?rec:null;}catch(e){return null;}
}
