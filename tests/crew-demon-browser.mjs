import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],warnings=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
 await page.route('**/crew-demon-test',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><canvas></canvas></body></html>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/crew-demon-test');
 const report=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput},THREE]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/three/build/three.module.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90});await renderer.prepare();
  const world=new World(1,{schedule:false});for(const id of ['host','alice','bob','charlie'])world.addCrew(id);world.selectCrew('host');
  for(let i=1;i<4;i++){world.crew[i].player.pos={x:(i-2)*2.8,y:1.7,z:5};world.crew[i].input.yaw=Math.PI;}
  renderer.setCrewNames(world.crew.map(p=>({id:p.id,name:p.id})));renderer.render(world,0,0,1/60,false);
  const models=[...renderer.crewModels.values()],root=models[0].getObjectByName('quaternius-demon');
  
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()).toArray();
  const skinned=[];root.traverse(o=>{if(o.isSkinnedMesh)skinned.push(o);});
  const other=[];models[1].traverse(o=>{if(o.isSkinnedMesh)other.push(o);});
  const eye=skinned.find(m=>m.material.name==='Eye_Black'),eyeCenter=new THREE.Vector3();root.updateMatrixWorld(true);eye.skeleton.update();for(let i=0;i<eye.geometry.attributes.position.count;i++){const v=new THREE.Vector3().fromBufferAttribute(eye.geometry.attributes.position,i);eye.applyBoneTransform(i,v);eye.localToWorld(v);eyeCenter.add(v);}eyeCenter.divideScalar(eye.geometry.attributes.position.count);const head=root.getObjectByName('Head').getWorldPosition(new THREE.Vector3());const facing=eyeCenter.sub(head).toArray();
  const aimResults=[];
  for(const [yaw,pitch] of [[0,0],[1,.65],[-2,-.65]]){
   const model=models[0];world.time=2;world.crew[1].input={...idleInput(),fire:true,yaw,pitch};renderer.render(world,0,0,0,false);
   model.updateWorldMatrix(true,true);
   const upper=model.getObjectByName('UpperArmR'),lower=model.getObjectByName('LowerArmR'),finger=model.getObjectByName('Middle1R');
   const a=upper.getWorldPosition(new THREE.Vector3()),b=lower.getWorldPosition(new THREE.Vector3()),c=finger.getWorldPosition(new THREE.Vector3());
   const expected=new THREE.Vector3(0,Math.sin(pitch),-Math.cos(pitch)).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
   aimResults.push({yaw,pitch,upperDot:b.clone().sub(a).normalize().dot(expected),lowerDot:c.clone().sub(b).normalize().dot(expected)});
  }
  // Reset pose and render one firing teammate, one running, one idle.
  world.time=2;world.crew[1].input={...idleInput(),yaw:Math.PI,fire:true};world.crew[2].player.vel.x=5;renderer.render(world,0,0,1/60,false);
  const before=models[0].getObjectByName('LowerArmR').quaternion.toArray();renderer.render(world,0,0,0,false);const paused=models[0].getObjectByName('LowerArmR').quaternion.toArray();
  const geometries=skinned.map(m=>m.geometry);
  const triangles=skinned.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
  window.demonTest={renderer,world,idleInput};
  return {facing,size,models:models.length,triangles,drawCalls:skinned.length,geometryShared:geometries.every((g,i)=>g===other[i].geometry),rigIndependent:skinned[0].skeleton!==other[0].skeleton,aimResults,pausedStable:JSON.stringify(before)===JSON.stringify(paused),oldArm:models.some(m=>m.getObjectByName('crew-arm')),source:models.map(m=>m.userData.avatarSource)};
 });
 assert.equal(report.models,3);assert.equal(report.oldArm,false);assert.equal(report.geometryShared,true);assert.equal(report.rigIndependent,true);assert.equal(report.pausedStable,true);assert.equal(report.drawCalls,4);assert.ok(report.triangles<=6500);assert.ok(report.size[1]>1.9&&report.size[1]<2.2);
 for(const aim of report.aimResults){assert.ok(aim.upperDot>.99,JSON.stringify(aim));assert.ok(aim.lowerDot>.99,JSON.stringify(aim));}
 assert.ok(report.source.every(s=>s==='quaternius-demon'));
 await mkdir('artifacts/crew-demon',{recursive:true});await page.screenshot({path:'artifacts/crew-demon/multiplayer.png'});
 const muzzle=await page.evaluate(()=>{
  const {renderer,world}=window.demonTest,source={kind:'shot',shooterId:'alice',pos:{x:20,y:20,z:20},muzzles:[{x:20,y:20,z:20}],direction:{x:0,y:0,z:1},level:2};
  const original=renderer.originalWeapon.effect;let received;renderer.originalWeapon.effect=(effect,w,y,p,local)=>{received={muzzles:effect.muzzles,local};};
  renderer.effect(source,world,0,0);const bone=renderer.crewModels.get('alice').getObjectByName('Middle3R_end'),expected=bone.getWorldPosition(bone.position.clone());
  const error=Math.hypot(received.muzzles[0].x-expected.x,received.muzzles[0].y-expected.y,received.muzzles[0].z-expected.z);const remote=received.local;
  renderer.effect({...source,shooterId:'host'},world,0,0);const localUntouched=received.local&&received.muzzles===source.muzzles;renderer.originalWeapon.effect=original;
  return {error,remote,localUntouched,sourceIntact:source.muzzles[0].x===20};
 });
 assert.ok(muzzle.error<1e-6);assert.equal(muzzle.remote,false);assert.equal(muzzle.localUntouched,true);assert.equal(muzzle.sourceIntact,true);
 const views=await page.evaluate(async()=>{
  const {renderer,world,idleInput}=window.demonTest;
  world.crew[1].input.fire=false;world.crew[1].input.homing=false;world.time=4;renderer.render(world,0,0,0,false);const relaxed=renderer.crewModels.get('alice').getObjectByName('UpperArmR').quaternion.toArray();
  renderer.clear();world.time=4;renderer.render(world,0,0,0,false);const fresh=renderer.crewModels.get('alice').getObjectByName('UpperArmR').quaternion.toArray();const recovers=JSON.stringify(relaxed)===JSON.stringify(fresh);
  renderer.clear();const hand=[];renderer.originalWeapon.render=(gpu,hidden)=>hand.push(hidden);
  world.crew=[];world.time=3;renderer.render(world,0,0,0,false,1,null,false,false,idleInput());const fpBody=renderer.replayBody?.visible??false;
  renderer.topDown=true;renderer.render(world,0,0,0,false,1,null,false,false,{...idleInput(),fire:true});const replay=renderer.replayBody;const replayVisible=replay.visible,source=replay.userData.avatarSource;
  renderer.topDown=false;renderer.render(world,0,0,0,false,1,null,false,false,idleInput());const hiddenAgain=!replay.visible;
  renderer.setDeathGhost(world.player.pos,0);renderer.render(world,0,0,0,false,1,{x:0,y:4,z:6},false,false,{...idleInput(),fire:true,pitch:.4});
  const ghostSource=renderer.deathGhost.userData.avatarSource,opacity=renderer.deathGhost.userData.avatarMaterials.map(m=>m.opacity);
  renderer.setDeathGhost(world.player.pos,0,true,.1,3);const hiddenOnImpact=!renderer.deathGhost.visible;
  renderer.clear();const cleaned=renderer.crewPresentation.length===0&&renderer.replayBody===null;
  return {recovers,fpBody,replayVisible,source,hiddenAgain,ghostSource,opacity,hiddenOnImpact,cleaned,hand};
 });
 assert.equal(views.recovers,true);assert.equal(views.fpBody,false);assert.equal(views.replayVisible,true);assert.equal(views.source,'quaternius-demon');assert.equal(views.hiddenAgain,true);assert.equal(views.ghostSource,'quaternius-demon');assert.ok(views.opacity.every(n=>n===.48));assert.equal(views.hiddenOnImpact,true);assert.equal(views.cleaned,true);assert.deepEqual(views.hand.slice(0,3),[false,true,false]);
 assert.deepEqual(errors,[]);assert.ok(!warnings.some(w=>w.includes('demon could not load')||w.includes('PropertyBinding')));
 await writeFile('artifacts/crew-demon/report.json',JSON.stringify({report,muzzle,views,errors,warnings},null,2));console.log(JSON.stringify({report,views,errors}));
}finally{await browser.close();}
