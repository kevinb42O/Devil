import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
await mkdir('artifacts/combat-hands',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],oldHands=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',r=>{if(/\/(meshes|textures)\/hand\d/.test(r.url()))oldHands.push(r.url());});
 await page.route('**/combat-hands-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas></body>'}));
 await page.goto(base+'/combat-hands-test');
 const rig=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput},THREE]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90});await renderer.prepare();
  const world=new World(971,{schedule:false});world.player.pos={x:0,y:1.7,z:0};
  const pose=input=>{for(let i=0;i<45;i++){world.time+=1/60;world.tick+=2;renderer.render(world,0,0,1/60,false,1,null,false,false,input);}};
  pose(idleInput());
  if(!renderer.combatHandDiagnostics.visible||renderer.combatHandDiagnostics.source!=='quaternius-demon')throw Error('Prelobby model missing in combat');
  const atRest=renderer.combatHandDiagnostics;
  pose({...idleInput(),leftArm:true,rightArm:true,fire:true});const raised=renderer.combatHandDiagnostics;
  pose(idleInput());const released=renderer.combatHandDiagnostics;
  const checks=[];
  for(const level of [1,2,3,4,5,6,7])for(const fov of [75,90,120,145])for(const pitch of [-1.3,0,1.3]){
   world.level=level;renderer.configure({quality:'low',fov,screenShake:0,movementMotion:0,mist:false,skyMotion:'reduced'});
   renderer.render(world,0,pitch,0,false,1,null,false,false,{...idleInput(),pitch,fire:true});
   const hands=renderer.emoteHands;hands.updateWorldMatrix(true,true);
   if(hands.position.distanceTo(new THREE.Vector3(world.player.pos.x,world.player.pos.y,world.player.pos.z))>1e-8)throw Error('Body detached');
   if(!hands.visible||hands.getObjectByName('crew-arm'))throw Error('Combat hand selection wrong');
   for(const side of ['L','R']){
    const tip=hands.getObjectByName('Middle3'+side).getWorldPosition(new THREE.Vector3());if(!tip.toArray().every(Number.isFinite))throw Error('Nonfinite pose');
    if(side==='R'||level>=5){
     const dorsal=new THREE.Vector3(0,0,1).applyQuaternion(hands.getObjectByName('LowerArm'+side).getWorldQuaternion(new THREE.Quaternion()));
     const expected=new THREE.Vector3(0,Math.cos(pitch),Math.sin(pitch));
     if(dorsal.dot(expected)<.99)throw Error('Upside-down combat palm '+JSON.stringify({side,level,fov,pitch,dot:dorsal.dot(expected)}));
    }
   }
   if(level>=5){
    const leftArm=hands.getObjectByName('LowerArmL'),rightArm=hands.getObjectByName('LowerArmR');
    const leftWrist=hands.worldToLocal(leftArm.getWorldPosition(new THREE.Vector3()));
    const rightWrist=hands.worldToLocal(rightArm.getWorldPosition(new THREE.Vector3()));
    if(Math.abs(leftWrist.x-rightWrist.x)<.45)throw Error('Combat hands too close together');

    for(const finger of ['Thumb','Index','Middle','Pinky'])for(let joint=1;joint<=3;joint++){
     const left=hands.getObjectByName(finger+joint+'L'),right=hands.getObjectByName(finger+joint+'R');
     if(!left&&!right)continue;
     if(!left||!right)throw Error('Missing mirrored finger joint');
     const mirrored=new THREE.Quaternion(right.quaternion.x,-right.quaternion.y,-right.quaternion.z,right.quaternion.w);
     if(left.quaternion.clone().normalize().angleTo(mirrored.normalize())>1e-5)throw Error('Asymmetric combat finger '+finger+joint);
     const lp=leftArm.worldToLocal(left.getWorldPosition(new THREE.Vector3()));
     const rp=rightArm.worldToLocal(right.getWorldPosition(new THREE.Vector3()));rp.x=-rp.x;
     if(lp.distanceTo(rp)>1e-5)throw Error('Asymmetric combat finger placement '+finger+joint);
    }
   }
   checks.push({level,fov,pitch});
  }
  renderer.configure({quality:'low',fov:90,screenShake:0,movementMotion:0,mist:false,skyMotion:'reduced'});world.level=1;pose(idleInput());
  window.combatTest={renderer,world,idleInput,pose};return {atRest,raised,released,checks:checks.length};
 });
 assert.equal(oldHands.length,0,'no extracted hand requests');assert.ok(rig.raised.gestures.left>.99&&rig.raised.gestures.right>.99);assert.ok(rig.released.gestures.left<.001);
 const feedback=await page.evaluate(()=>{
  const {renderer:r,world:w,idleInput}=window.combatTest,results=[];
  const render=dt=>r.render(w,0,0,dt,false,1,null,false,false,idleInput());
  const wrist=side=>r.emoteHands.getObjectByName('Middle1'+side).getWorldPosition(r.camera.position.clone());
  for(let level=1;level<=7;level++){
   w.level=level;r.originalWeapon.clear();render(0);
   const rest=wrist('R');
   r.originalWeapon.effect({kind:'burst',level,pos:w.player.pos},w,0,0,false);render(0);
   if(r.originalWeapon.handFeedback.firePower!==0)throw Error('Remote shot changed local feedback');
   r.originalWeapon.effect({kind:'burst',level,pos:w.player.pos},w,0,0,true);render(0);
   const state=r.originalWeapon.handFeedback,materials=r.emoteHands.userData.avatarMaterials;
   const skin=materials.find(m=>m.name==='Demon_Main'),u=skin.userData.combatFeedback.uniforms;
   const distance=rest.distanceTo(wrist('R'));
   if(state.firePower!==1||u.combatFire.value!==1||distance<.01)throw Error('Visible rig missed shot feedback '+level+' '+distance);
   if(level>=5&&wrist('L').distanceTo(wrist('R'))<.3)throw Error('Recoil collapsed twin palms');
   for(let i=0;i<120;i++)render(1/60);
   if(u.combatFire.value!==0||r.originalWeapon.handFeedback.recoil!==0)throw Error('Shot feedback did not settle');
   r.originalWeapon.effect({kind:'upgrade',level,pos:w.player.pos},w,0,0,true);render(0);
   if(u.combatUpgrade.value!==1||u.combatTier.value!==level)throw Error('Upgrade missing from new skin');
   r.originalWeapon.restoreReplayUpgradeAge(.6);render(0);
   if(Math.abs(u.combatAge.value-.6)>1e-8||u.combatUpgrade.value<=0)throw Error('Replay upgrade age lost');
   r.originalWeapon.effect({kind:'burst',level,pos:w.player.pos},w,0,0,true);render(0);
   if(u.combatUpgrade.value!==0||u.combatFire.value!==1)throw Error('Upgrade obscured shooting');
   for(let i=0;i<120;i++)render(1/60);
   if(u.combatUpgrade.value!==0)throw Error('Upgrade did not settle');
   results.push({level,recoilDistance:distance});
  }
  w.level=1;r.originalWeapon.clear();render(0);return results;
 });
 assert.equal(feedback.length,7);
 await page.screenshot({path:'artifacts/combat-hands/tier-1.png'});
 await page.evaluate(()=>{const {world,pose,idleInput}=window.combatTest;world.level=5;pose({...idleInput(),fire:true});});
 await page.screenshot({path:'artifacts/combat-hands/tier-5.png'});
 await page.evaluate(()=>{const {pose,idleInput}=window.combatTest;pose({...idleInput(),leftArm:true,rightArm:true});});
 await page.screenshot({path:'artifacts/combat-hands/gestures.png'});
 const visibility=await page.evaluate(()=>{
  const {renderer:r,world:w,idleInput}=window.combatTest;
  r.topDown=true;r.render(w,0,0,0,false,1,null,false,false,idleInput());const topDown=!r.emoteHands.visible;
  r.topDown=false;r.render(w,0,0,0,false,1,{x:0,y:4,z:5},false,false,idleInput());const spectator=!r.emoteHands.visible;
  w.state='dead';r.render(w,0,0,0,false,1,null,false,false,idleInput());const dead=!r.emoteHands.visible;
  w.state='playing';r.render(w,0,0,0,false,1,null,false,false,idleInput());const alive=r.emoteHands.visible;
  return {topDown,spectator,dead,alive};
 });assert.deepEqual(visibility,{topDown:true,spectator:true,dead:true,alive:true});
 // Load the previous renderer only for an exact bullet comparison. The normal
 // game above has already been checked to request none of its hand assets.
 const baseline=execFileSync('git',['show','f9abc5b:src/original-weapon.ts'],{encoding:'utf8'});
 // Vite must transpile the TypeScript baseline, preserving its relative imports.
 const {transform}=await import('esbuild');
 const compiled=await transform(baseline,{loader:'ts',format:'esm'});
 await page.route('**/src/baseline-original-weapon.ts',r=>r.fulfill({contentType:'text/javascript',body:compiled.code.replaceAll('from "three"','from "/node_modules/.vite/deps/three.js"').replaceAll('from "three/addons/loaders/OBJLoader.js"','from "/node_modules/.vite/deps/three_addons_loaders_OBJLoader__js.js"')}));
 const bullets=await page.evaluate(async()=>{
  const [{OriginalWeapon},THREE,{World,idleInput}]=await Promise.all([import('/src/baseline-original-weapon.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts')]);
  const current=window.combatTest.renderer.originalWeapon,previous=new OriginalWeapon(new THREE.Scene());await previous.loaded;
  if(!previous.ready)throw Error(previous.error);let cases=0,maxError=0;
  for(let level=1;level<=7;level++)for(const fov of [75,90,145])for(const burst of [false,true]){
   const world=new World(72,{schedule:false});world.level=level;world.player.pos={x:0,y:5,z:0};world.shoot(idleInput(),burst,false);
   const camera=new THREE.PerspectiveCamera(fov,16/9,.04,1000);camera.position.set(0,5,0);
   for(const weapon of [current,previous]){weapon.clear();for(const effect of world.effects)weapon.effect(effect,world,0,0);weapon.update(world,0,false,camera);}
   for(let socket=0;socket<(level>=5?10:level===1?1:level===2?2:level===3?3:5);socket++)maxError=Math.max(maxError,current.socketScreen(level,socket).distanceTo(previous.socketScreen(level,socket)));
   for(let batch=0;batch<current.daggers.length;batch++){
    const a=current.daggers[batch],b=previous.daggers[batch];if(a.count!==b.count)throw Error('Bullet count changed');
    for(let i=0;i<a.count*16;i++)maxError=Math.max(maxError,Math.abs(a.instanceMatrix.array[i]-b.instanceMatrix.array[i]));
   }cases++;
  }
  return {cases,maxError};
 });assert.equal(bullets.maxError,0,'bullet sockets and rendered transforms unchanged');
 // Exercise real combat input, including controller trigger separation and mobile holds.
 const controls=[];
 for(const scheme of ['qwerty','azerty','controller','mobile']){
  const ui=await browser.newPage({viewport:{width:1280,height:720}});ui.on('pageerror',e=>errors.push(e.message));
  await ui.addInitScript(scheme=>{localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:scheme}));window.testPad={id:'Test',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});},scheme);
  await ui.goto(base+'/?hand-preview=5');await ui.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);await ui.click('#start');
  await ui.waitForFunction(()=>window.abyss?.combatHands?.visible);
  if(scheme==='controller')await ui.evaluate(()=>{window.testPad.buttons[4].pressed=true;window.testPad.buttons[5].pressed=true;});
  else if(scheme==='mobile')await ui.evaluate(()=>{document.querySelectorAll('#combat-gestures button').forEach(b=>{b.setPointerCapture=()=>{};b.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,bubbles:true}));});});
  else await ui.evaluate(scheme=>{for(const key of [scheme==='azerty'?'a':'q','e'])window.dispatchEvent(new KeyboardEvent('keydown',{key,code:key==='a'?'KeyQ':key==='q'?'KeyQ':'KeyE'}));},scheme);
  await ui.waitForFunction(()=>window.abyss.input.leftArm&&window.abyss.input.rightArm&&window.abyss.combatHands.gestures.left>.95);
  assert.equal(await ui.evaluate(()=>window.abyss.stats.shots),0,'gestures alone do not shoot');
  if(scheme==='controller'){
   await ui.evaluate(()=>{window.testPad.buttons[7].pressed=true;});await ui.waitForFunction(()=>window.abyss.stats.shots>0);
   assert.equal(await ui.evaluate(()=>window.abyss.input.leftArm&&window.abyss.input.rightArm),true);
  }
  await ui.evaluate(()=>window.dispatchEvent(new Event('blur')));await ui.waitForFunction(()=>!window.abyss.input.leftArm&&!window.abyss.input.rightArm);
  controls.push(scheme);await ui.close();
 }
 assert.deepEqual(errors,[]);await writeFile('artifacts/combat-hands/report.json',JSON.stringify({rig,feedback,visibility,bullets,controls,errors},null,2));
 console.log(JSON.stringify({rig,feedback,visibility,bullets,controls,errors}));
}finally{await browser.close();}
