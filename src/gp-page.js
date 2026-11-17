/* Controller cursor for the plain pages (home, Lab): left stick moves the cursor, ✕ / A clicks, right stick scrolls. */
import {createGamepad} from './gamepad.js';
import {initPen} from './pen.js';
let t=null,tt=0;
function toast(m,ms=2500){if(!t){t=document.createElement('div');t.setAttribute('role','status');t.style.cssText='position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translateX(-50%);z-index:100003;padding:10px 16px;border-radius:16px;background:rgba(14,15,18,.94);color:#eee;font:700 12px ui-monospace,monospace;max-width:calc(100vw - 24px);display:none';document.body.appendChild(t);}
  t.textContent=m;t.style.display='block';clearTimeout(tt);tt=setTimeout(()=>t.style.display='none',ms);}
createGamepad({THREE:null,camera:null,controls:null,S:{},toast,sheet:null,bump:()=>{},canvas:null});
initPen({canvas:document.body,toast});
