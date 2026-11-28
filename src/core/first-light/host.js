import * as THREE from 'three';
import {FirstLightGame} from './game.js';
// Owns a temporary gameplay scene, not a second renderer or animation loop.
// The existing authored local scene stays intact while the slice runs.
export function createFirstLightHost(app){
 let game=null,scene=null,camera=null,saved=null;
 const host={get active(){return !!game;},get game(){return game;},start(){if(game)return{ok:true};const r=app.renderer;
  saved={ratio:r.getPixelRatio(),exposure:r.toneMappingExposure,shadow:r.shadowMap.enabled};
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.075,2200);
  document.body.classList.add('first-light-active');
  app.input?.keys.clear();
  try{app.session&&app.session.enter('firstlight');game=new FirstLightGame({renderer:r,scene,camera,canvas:r.domElement,onExit:()=>host.close()});if(/[?&]fldebug\b/.test(location.search))window.__fl=game;return{ok:true};}
  catch(e){host.close();app.ui.toast('FIRST LIGHT: '+e.message);return{ok:false,msg:e.message};}},
 update(dt){if(!game)return;const cv=app.renderer.domElement;const aspect=cv.clientWidth/Math.max(1,cv.clientHeight);if(aspect!==camera.aspect){camera.aspect=aspect;camera.updateProjectionMatrix();}game.update(dt);app.renderer.render(scene,camera);},
 close(){if(game){game.dispose();game=null;}app.session&&app.session.leave('firstlight');document.body.classList.remove('first-light-active');if(saved){app.renderer.setPixelRatio(saved.ratio);app.renderer.setSize(innerWidth,innerHeight,false);app.renderer.toneMappingExposure=saved.exposure;app.renderer.shadowMap.enabled=saved.shadow;saved=null;}scene=camera=null;app.ui.showStart(app.core.hasSave());},
 exec(c){if(!game)return{ok:false,msg:'FIRST LIGHT is not running'};if(c.cmd==='describe')return{ok:true,commands:['firstlight.state','firstlight.snapshot','firstlight.scene','firstlight.action','firstlight.exit']};if(c.cmd==='state'||c.cmd==='firstlight.state')return{ok:true,state:game.inspect()};if(c.cmd==='firstlight.snapshot')return{ok:true,snapshot:game.session.snapshot()};if(c.cmd==='firstlight.scene')return{ok:true,scene:structuredClone(game.session.doc)};if(c.cmd==='firstlight.exit'){host.close();return{ok:true};}if(c.cmd==='firstlight.action'&&['begin','interact','camera','weather','time','radio','map','equipment','save','load','restart','resume','pause','garage'].includes(c.action)){game.action(c.action);return{ok:true,state:game.inspect()};}return{ok:false,msg:'Authored scene commands blocked during isolated FIRST LIGHT session'};}};
 return host;
}
