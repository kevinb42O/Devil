import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route(url+'/palm-surface',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}</style><canvas></canvas>'}));await p.goto(url+'/palm-surface');
 const result=await p.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput},T,{crewWeaponMuzzle}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/crew-avatar.ts')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:95,movementMotion:0,screenShake:0});await r.prepare();const w=new World(71,{schedule:false});let checks=0;
  const report=[];
  for(const level of [4,5,6,7])for(const fov of [75,95,135])for(const pitch of [-1,0,1]){
   w.level=level;r.configure({quality:'low',fov,movementMotion:0,screenShake:0});r.render(w,.4,pitch,0,false,1,null,false,false,{...idleInput(),yaw:.4,pitch,fire:true});
   const model=r.emoteHands,mesh=model.getObjectByName('Demon_1');
   for(let side=0;side<(level>=5?2:1);side++){
    const anchor=new T.Vector3();assert(crewWeaponMuzzle(model,anchor,level,side),'Missing palm');
    const name=level>=5?(side?'L':'R'):'L',wrist=model.getObjectByName('Middle1'+name).getWorldPosition(new T.Vector3()),knuckle=model.getObjectByName('Middle2'+name).getWorldPosition(new T.Vector3());
    const palmAxis=knuckle.clone().sub(wrist),fraction=anchor.clone().sub(wrist).dot(palmAxis)/palmAxis.lengthSq();
    assert(fraction>.45&&fraction<1.2,'Emitter lies at wrist or beyond palm '+JSON.stringify({level,side,fraction}));
    const distance=anchor.distanceTo(r.camera.position),ray=new T.Raycaster(r.camera.position,anchor.clone().sub(r.camera.position).normalize());
    const hit=ray.intersectObject(mesh,false)[0];assert(hit,'Emitter does not project onto the visible hand');
    const clearance=hit.distance-distance;assert(clearance>-.002&&clearance<.04,'Emitter buried in skin or floating away '+JSON.stringify({level,side,fov,pitch,clearance}));
    report.push({level,side,fov,pitch,fraction,clearance});checks++;
   }
  }
  function assert(ok,message){if(!ok)throw Error(message);}
  window.palm={r,w,T,idleInput,crewWeaponMuzzle};return {checks,report};
 });
 await mkdir('artifacts/palm-emitter',{recursive:true});
 for(const level of [4,7]){
  await p.evaluate(level=>{const {r,w,T,idleInput,crewWeaponMuzzle}=window.palm;w.level=level;r.configure({fov:95});r.render(w,0,0,0,false,1,null,false,false,{...idleInput(),fire:true});for(let side=0;side<(level>=5?2:1);side++){const position=new T.Vector3();crewWeaponMuzzle(r.emoteHands,position,level,side);const dot=new T.Mesh(new T.SphereGeometry(.008),new T.MeshBasicMaterial({color:0x3aff75,depthTest:true}));dot.position.copy(position);r.scene.add(dot);}r.render(w,0,0,0,false,1,null,false,false,{...idleInput(),fire:true});},level);
  await p.locator('canvas').screenshot({path:`artifacts/palm-emitter/hand-${level}.png`});
 }
 assert.deepEqual(errors,[]);await writeFile('artifacts/palm-emitter/audit.json',JSON.stringify({...result,errors},null,2)+'\n');console.log('Palm surface checks passed:',result.checks);
}finally{await b.close();}
