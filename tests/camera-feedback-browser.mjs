import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Impact feedback regression</title><canvas id="fixture"></canvas>'}));await page.goto(url,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const [T,{World,v},{GameRenderer},{weaponMuzzle,HAND_MUZZLES}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/weapon-origin.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,screenShake:100,mist:false,skyMotion:'reduced'});
  await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded,renderer.crewAvatarReady]);
  const weapon=renderer.originalWeapon,w=new World(7,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,0);w.time=20;
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const draw=(dt=0,position=null)=>renderer.render(w,.8,.4,dt,false,1,position);
  draw();const rotation=renderer.camera.quaternion.clone(),fov=renderer.camera.fov,base=renderer.camera.position.clone();
  const state=JSON.stringify(w.captureCrewCheckpoint());
  renderer.effect({kind:'burst',pos:{...w.player.pos},shotKey:'fixture:1'},w,.8,.4);draw(.02);
  check(renderer.camera.position.distanceTo(base)>0,'burst moves camera');check(renderer.camera.quaternion.equals(rotation),'aim rotation remains exact');check(renderer.camera.fov===fov,'feedback never changes FOV');
  check(JSON.stringify(w.captureCrewCheckpoint())===state,'render feedback never changes simulation');
  const paused=renderer.camera.position.clone();for(let i=0;i<5;i++)draw(0);check(renderer.camera.position.equals(paused),'paused camera freezes exactly');
  const screenshot=renderer.renderer.domElement.toDataURL();
  draw(1);check(renderer.camera.position.equals(base),'camera returns exactly to base');
  renderer.effect({kind:'land',pos:w.player.pos,amount:2},w,.8,.4);draw(.03);check(renderer.camera.position.y<base.y,'landing compresses vertically');
  draw(.02,v(5,8,9));check(renderer.camera.position.equals(new T.Vector3(5,8,9)),'spectator camera stays exact');draw();check(renderer.camera.position.equals(base),'return from spectator has no stale impulses');
  renderer.effect({kind:'burst',pos:w.player.pos},w,.8,.4);renderer.topDown=true;draw();check(renderer.cameraFeedback.diagnostics.active.length===0,'top-down clears feedback');renderer.topDown=false;
  renderer.effect({kind:'burst',pos:w.player.pos},w,.8,.4);renderer.render(w,.8,.4,0,false,1,null,false,true);check(renderer.cameraFeedback.diagnostics.active.length===0,'courtyard clears feedback');
  renderer.effect({kind:'burst',pos:w.player.pos},w,.8,.4);draw(.01);w.time--;draw();check(renderer.cameraFeedback.diagnostics.active.length===0,'backward time clears feedback');
  renderer.configure({quality:'low',fov:90,screenShake:0,mist:false});renderer.effect({kind:'burst',pos:w.player.pos},w,.8,.4);draw(.02);check(renderer.camera.position.equals(base),'zero intensity preserves base camera');
  // Verify actual translated camera + moving hand alignment for every socket.
  renderer.configure({quality:'low',fov:90,screenShake:100,mist:false});
  let sockets=0,maxError=0;const offset=new T.Vector3(.012,-.018,.009);w.player.vel=v(8,-7,5);
  for(const aspect of [16/9,4/3,9/16])for(const fov of [75,90,115,145])for(const [yaw,pitch]of [[0,0],[.8,.6],[-1.1,-1.2]])for(let level=1;level<=4;level++){
   const camera=renderer.camera;camera.position.copy(w.player.pos).add(offset);camera.rotation.set(pitch,yaw,0,'YXZ');camera.aspect=aspect;camera.fov=fov;camera.updateProjectionMatrix();w.level=level;
   weapon.resize(aspect*360,360);weapon.update(w,1/60,false,camera,1,offset);
   for(let i=0;i<HAND_MUZZLES[level-1].length;i++){
    const pos=weaponMuzzle(w.player.pos,yaw,pitch,level,i),p={id:i,shotKey:`local:1:${i}`,pos,vel:v(0,0,-70),age:0,level,homing:false},before=JSON.stringify(p);
    const visual=weapon.projectileView(p,new T.Vector3(pos.x,pos.y,pos.z)),screen=visual.project(camera),tip=weapon.socketScreen(level,i),error=Math.hypot(screen.x-tip.x,screen.y-tip.y);
    maxError=Math.max(maxError,error);check(error<1e-10,'translated launch aligns with moving fingertip');check(JSON.stringify(p)===before,'visual alignment preserves physical shot');
    p.age=.1;const joined=weapon.projectileView(p,new T.Vector3(pos.x,pos.y,pos.z));check(joined.distanceTo(new T.Vector3(pos.x,pos.y,pos.z))===0,'shot joins exact physical path');sockets++;
   }
  }
  // Camera translation and moving overlay must keep dagger and glow together.
  w.level=1;const camera=renderer.camera;camera.position.copy(w.player.pos).add(offset);camera.rotation.set(.4,.8,0,'YXZ');
  const shotPos=weaponMuzzle(w.player.pos,.8,.4,1);shotPos.z-=1;
  w.projectiles=[{id:990,shotKey:'local:lighting:0',pos:shotPos,vel:v(0,0,-70),age:.03,level:1,homing:false}];
  const physical=JSON.stringify(w.projectiles);weapon.update(w,0,false,camera,1,offset);
  renderer.projectileLighting.update(w,false,1,540,weapon.projectileView);
  const dagger=weapon.daggers.find(mesh=>mesh.count>0).instanceMatrix.array,glow=renderer.projectileLighting.glow.geometry.getAttribute('shotCenter');
  check(Math.hypot(dagger[12]-glow.getX(0),dagger[13]-glow.getY(0),dagger[14]-glow.getZ(0))<1e-6,'translated dagger and glow follow the same visual path');
  check(JSON.stringify(w.projectiles)===physical,'lighting and moving hand preserve physical projectiles');
  w.projectiles=[];
  const handSamples=[];
  for(const fps of [30,60,144]){
   weapon.resetMotion();for(let i=0;i<fps/2;i++)weapon.update(w,1/fps,false,camera,1,offset);
   handSamples.push(weapon.effectDiagnostics.motion);
  }
  for(const sample of handSamples)for(const key of ['x','y','z'])check(Math.abs(sample[key]-handSamples[0][key])<1e-12,'hand lag is consistent across framerates');
  const handPaused=JSON.stringify(weapon.effectDiagnostics.motion);weapon.update(w,0,false,camera,1,offset);check(JSON.stringify(weapon.effectDiagnostics.motion)===handPaused,'paused hand motion freezes');
  weapon.configureMotion(0);weapon.update(w,.02,false,camera,1,offset);check(Object.values(weapon.effectDiagnostics.motion).every(x=>x===0),'zero intensity disables added hand motion');
  weapon.configureMotion(100);w.player.vel=v();weapon.resetMotion();weapon.update(w,1/60,false,camera,1,offset);check(Object.values(weapon.effectDiagnostics.motion).every(x=>x===0),'stationary hand has no invented idle motion');
  // Remote personal events never create a local kick.
  renderer.clear();const local=w.player;w.crew=[{id:'local',life:0,alive:true,player:local,input:{yaw:0,pitch:0,fire:false}}, {id:'remote',life:0,alive:true,player:{...local,pos:v(8,1.7,0)},input:{yaw:0,pitch:0,fire:false}}];
  for(const kind of ['burst','land','upgrade'])renderer.effect({kind,pos:local.pos,shooterId:'remote'},w,0,0);
  check(renderer.cameraFeedback.diagnostics.active.length===0,'remote personal effects do not shake local view');
  w.crew=[];renderer.clear();renderer.effect({kind:'burst',pos:w.player.pos},w,0,0);draw(.02);w.crew=[{id:'local',life:1,alive:true,player:local,input:{yaw:0,pitch:0,fire:false}}];draw();check(renderer.cameraFeedback.diagnostics.active.length===0,'life change clears old feedback');w.crew[0].life=2;renderer.effect({kind:'burst',pos:w.player.pos,shooterId:'local',shotKey:'local:new-life'},w,0,0);draw(.02);check(renderer.cameraFeedback.diagnostics.active.includes('burst'),'first new-life shot survives lifecycle reset');
  w.crew=[];w.player.vel=v();renderer.clear();
  // A damaged crystal changes only its local presentation and restores its matrix.
  const enemy=w.spawn('squid',v(0,3,-10));enemy.age=20;draw();const model=renderer.enemies.get(enemy.id);let crystal;model.traverse(o=>{if(o.name==='weak-point-0')crystal=o;});const rest=crystal.scale.clone();
  w.damageEnemy(enemy,1,enemy.pos,0,true);draw();w.time+=.03;draw();check(crystal.scale.distanceTo(rest)>0,'crystal reacts to its own hit');check(new T.Vector3().setFromMatrixScale(crystal.matrix).distanceTo(crystal.scale)<1e-10,'static crystal matrix is updated');w.time+=.2;draw();check(crystal.scale.equals(rest),'crystal returns to exact rest scale');
  const pede=w.spawn('centipede',v(0,3,-15));pede.age=20;draw();
  const segment=renderer.segmentNodes.get(renderer.enemies.get(pede.id))[0].weakPoints[0],segmentRest=segment.scale.clone();
  w.damageEnemy(pede,.25,pede.segments[0].pos,0);draw();w.time+=.03;draw();
  check(segment.scale.distanceTo(segmentRest)>0,'segment crystal reacts independently');
  check(new T.Vector3().setFromMatrixScale(segment.matrix).distanceTo(segment.scale)<1e-10,'batched segment crystal matrix is updated');
  w.time+=.2;draw();check(segment.scale.equals(segmentRest),'segment crystal restores its exact base scale');
  renderer.configure({quality:'low',fov:90,screenShake:100,mist:false});draw();const calls=renderer.renderer.info.render.calls;renderer.configure({quality:'low',fov:90,screenShake:0,mist:false});draw();check(renderer.renderer.info.render.calls===calls,'feedback adds no draw calls');
  renderer.clear();check(weapon.effectDiagnostics.motion.x===0,'clear resets hand motion');
  return {sockets,maxError,drawCalls:calls,screenshot};
 });
 assert.deepEqual(errors,[]);await mkdir('test-results/camera-feedback',{recursive:true});await writeFile('test-results/camera-feedback/burst.png',Buffer.from(result.screenshot.split(',')[1],'base64'));delete result.screenshot;
 await writeFile('test-results/camera-feedback/results.json',JSON.stringify(result,null,2));console.log('Camera feedback browser passed:',result);
 // Real settings UI: reduced motion defaults to off; explicit preference survives.
 await page.unroute(url+'/');await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies&&!document.querySelector('#start').disabled);
 await page.click('#settings-open');assert.equal(await page.locator('#screenShake').inputValue(),'0');assert.equal(await page.locator('#movementMotion').inputValue(),'0');await page.locator('#movementMotion').fill('70');await page.locator('#screenShake').fill('65');assert.equal(await page.locator('#screenShake-value').textContent(),'65%');await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies&&!document.querySelector('#start').disabled);await page.click('#settings-open');assert.equal(await page.locator('#screenShake').inputValue(),'65');assert.equal(await page.locator('#movementMotion').inputValue(),'70');
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('abyss-settings'));s.screenShake=null;localStorage.setItem('abyss-settings',JSON.stringify(s));});
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies&&!document.querySelector('#start').disabled);await page.click('#settings-open');assert.equal(await page.locator('#screenShake').inputValue(),'0','invalid persisted value respects reduced-motion default');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('abyss-settings'));delete s.screenShake;localStorage.setItem('abyss-settings',JSON.stringify(s));});
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies&&!document.querySelector('#start').disabled);await page.click('#settings-open');assert.equal(await page.locator('#screenShake').inputValue(),'35','existing preferences without this field receive conservative default');
 assert.deepEqual(errors,[]);console.log('Screenshake UI passed: reduced motion, percentage and explicit persisted override.');
}finally{await browser.close();}
