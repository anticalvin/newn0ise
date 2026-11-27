// Steering contract for the shared vehicle kernel: +X right, +Y up, forward = (sin yaw, cos yaw), steer > 0 means turn right (D / stick right).
// Pure Node: the Session kernel has no DOM. Run: node --test tools/first-light-steer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Session,FIXED} from '../src/core/first-light/simulation.js';
const scene=JSON.parse(readFileSync(new URL('../projects/first-light/scene.json',import.meta.url))),mission=JSON.parse(readFileSync(new URL('../projects/first-light/mission.json',import.meta.url)));
function drive(yaw,throttle,steer,secs=.6,id=null){
  const open={move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz,hit:false}),blocked:()=>false},s=new Session(scene,mission,open),v=s.vehicles[0];
  v.x=0;v.z=0;v.yaw=yaw;v.speed=throttle>0?8:-3;s.player.x=v.x+1;s.player.z=v.z;for(const k of v.requiresItem?[v.requiresItem]:[])s.inventory.push(k);
  assert.ok(s.enterVehicle(v.id).ok,'could not enter the car');
  const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=-fz,rz=fx;   // right-hand vector for forward (fx,fz) with +Y up: forward x up
  for(let i=0;i<secs/FIXED;i++)s.drive(FIXED,{mx:steer,mz:throttle,brake:false,jump:false});
  const lateral=(v.x*rx+v.z*rz),along=v.x*fx+v.z*fz;
  return {dyaw:Math.atan2(Math.sin(v.yaw-yaw),Math.cos(v.yaw-yaw)),lateral,along};
}
for(const yaw of [0,Math.PI/2,Math.PI,-2.2,1.3]){
  test(`forward + D turns right at heading ${yaw.toFixed(2)}`,()=>{const r=drive(yaw,1,1);assert.ok(r.dyaw<-.05,'yaw should decrease (clockwise from above): '+r.dyaw);assert.ok(r.lateral>.5,'car should end up to its right: '+r.lateral);});
  test(`forward + A turns left at heading ${yaw.toFixed(2)}`,()=>{const r=drive(yaw,1,-1);assert.ok(r.dyaw>.05,'yaw should increase: '+r.dyaw);assert.ok(r.lateral<-.5,'car should end up to its left: '+r.lateral);});
}
test('no steering drives straight',()=>{const r=drive(.4,1,0);assert.ok(Math.abs(r.dyaw)<1e-6&&Math.abs(r.lateral)<1e-6);});
test('reverse + D swings the nose right-to-left like a real car (yaw increases)',()=>{const r=drive(0,-1,1,1.2);assert.ok(r.dyaw>0,'dyaw '+r.dyaw);});
test('left/right are mirror images',()=>{const a=drive(.7,1,1),b=drive(.7,1,-1);assert.ok(Math.abs(a.dyaw+b.dyaw)<1e-6&&Math.abs(a.lateral+b.lateral)<1e-6);});
