import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/emote-rig-test',r=>r.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));await page.goto(base+'/emote-rig-test');
 const rig=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');const {createCrewAvatar,loadCrewAvatar,updateCrewAvatar}=await import('/src/crew-avatar.ts');const {World,idleInput}=await import('/src/simulation.ts');const {GameRenderer}=await import('/src/renderer.ts');
  await loadCrewAvatar();const avatar=createCrewAvatar(0);avatar.rotation.y=.8;
  const boneDirection=(side)=>{avatar.updateMatrixWorld(true);const a=avatar.getObjectByName('UpperArm'+side).getWorldPosition(new THREE.Vector3()),b=avatar.getObjectByName('LowerArm'+side).getWorldPosition(new THREE.Vector3()),c=avatar.getObjectByName('Middle1'+side).getWorldPosition(new THREE.Vector3());const local=avatar.quaternion.clone().invert();return {upper:b.sub(a).normalize().applyQuaternion(local).toArray(),lower:c.sub(avatar.getObjectByName('LowerArm'+side).getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(local).toArray(),palm:new THREE.Vector3(0,0,-1).applyQuaternion(avatar.getObjectByName('Middle1'+side).getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(local).toArray()};};
  for(let i=0;i<60;i++)updateCrewAvatar(avatar,{...idleInput(),leftArm:true,rightArm:true,pitch:1.3},{x:5,y:0,z:0},true,i/60,false,true);
  const raised={left:boneDirection('L'),right:boneDirection('R'),weights:{...avatar.userData.emotes}};
  const fingerL=avatar.getObjectByName('Middle3L').quaternion,fingerR=avatar.getObjectByName('Middle3R').quaternion;
  if(Math.abs(fingerL.x-fingerR.x)+Math.abs(fingerL.y+fingerR.y)+Math.abs(fingerL.z+fingerR.z)>1e-5)throw Error('Both hands must open symmetrically');
  updateCrewAvatar(avatar,idleInput(),{x:0,y:0,z:0},true,1,false,true);const releasing={...avatar.userData.emotes};
  for(let i=61;i<100;i++)updateCrewAvatar(avatar,idleInput(),{x:0,y:0,z:0},true,i/60,false,true);
  const lowered={...avatar.userData.emotes};updateCrewAvatar(avatar,{...idleInput(),leftArm:true,rightArm:true},{x:0,y:0,z:0},true,2,false,false);const arena={...avatar.userData.emotes};
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90});await renderer.crewAvatarReady;await renderer.entrance.ready;
  const world=new World(1,{schedule:false});world.addCrew('host');world.addCrew('guest');world.selectCrew('host');world.player.pos={x:0,y:1.7,z:1};world.crew[1].player.pos={x:0,y:1.7,z:-4};world.crew[1].input={...idleInput(),yaw:Math.PI,leftArm:true,rightArm:true};
  for(let i=0;i<60;i++){world.tick=i*2;renderer.render(world,0,0,1/60,false,1,null,false,true,{...idleInput(),leftArm:true,rightArm:true});}
  for(const fov of [75,90,120,145]){
   renderer.baseFov=fov;renderer.camera.fov=fov;renderer.camera.updateProjectionMatrix();
   renderer.render(world,0,-.5,1/60,false,1,null,false,true,{...idleInput(),leftArm:true,rightArm:true});
   if(renderer.emoteHands.position.distanceTo(new THREE.Vector3(world.player.pos.x,world.player.pos.y,world.player.pos.z))>1e-8)throw Error('First-person body detached from player at FOV '+fov);
   if(renderer.emoteHands.getObjectByName('first-person-shoulder'))throw Error('Artificial shoulder spheres returned');
   for(const side of ['L','R']){const bone=renderer.emoteHands.getObjectByName('UpperArm'+side);renderer.emoteHands.updateMatrixWorld(true);if(!bone.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite))throw Error('Invalid shoulder pose at FOV '+fov);}
  }
  renderer.baseFov=90;renderer.camera.fov=90;renderer.camera.updateProjectionMatrix();renderer.render(world,0,.25,1/60,false,1,null,false,true,{...idleInput(),leftArm:true,rightArm:true});
  window.emoteRig={renderer,world,idleInput};return {raised,releasing,lowered,arena,hands:renderer.emoteHands.userData.emotes};
 });
 for(const [side,arm]of [[-1,rig.raised.left],[1,rig.raised.right]])for(const direction of [arm.upper,arm.lower]){assert.ok(direction[0]*side>.25,'arm opens away from head');assert.ok(direction[1]>.6&&direction[1]<.75,'arm remains raised diagonally');assert.ok(direction[2]<-.4,'arm clears face slightly forward');}
 for(const arm of [rig.raised.left,rig.raised.right])assert.ok(arm.palm[2]<-.9,'palm faces forward, away from the owner');
 assert.ok(rig.releasing.left>0&&rig.releasing.left<1);assert.ok(rig.lowered.left<.001);assert.deepEqual(rig.arena,{left:1,right:1});assert.ok(rig.hands.left>.99);
 await page.screenshot({path:'artifacts/courtyard-emotes.png'});
 await page.evaluate(()=>{const {renderer,world}=window.emoteRig;world.player.pos.z=-1.6;renderer.render(world,0,0,1/60,false,1,null,false,true,null);});
 await page.screenshot({path:'artifacts/courtyard-emotes-diagonal-third-person.png'});
 const neck=await page.evaluate(()=>{
  const {renderer:r,world:w,idleInput}=window.emoteRig;
  r.configure({quality:'low',fov:145,movementMotion:0,screenShake:0,mist:false,skyMotion:'reduced'});r.resetFeedback();
  const before=JSON.stringify(w.captureCrewCheckpoint());
  r.render(w,0,-1.3,1/60,false,1,null,false,true,idleInput());
  const first=w.player.pos.z-r.camera.position.z;
  r.courtyardNeck.update(-1.3,1);r.render(w,0,-1.3,0,false,1,null,false,true,idleInput());
  const settled=w.player.pos.z-r.camera.position.z;
  const body=r.emoteHands.position.toArray(),origin=[w.player.pos.x,w.player.pos.y,w.player.pos.z];
  r.render(w,Math.PI/2,-1.3,0,false,1,null,false,true,idleInput());
  const turned={x:w.player.pos.x-r.camera.position.x,z:w.player.pos.z-r.camera.position.z};
  r.render(w,Math.PI/2,-1.3,1/60,false,1,null,false,false,idleInput());
  const arenaCamera=r.camera.position.toArray(),arenaNeck={...r.courtyardNeck.pose};
  if(JSON.stringify(w.captureCrewCheckpoint())!==before)throw Error('Neck rendering modified simulation state');
  return {first,settled,body,origin,turned,arenaCamera,arenaNeck};
 });
 assert.ok(neck.first>0&&neck.first<.1,'downward neck lean eases in');assert.ok(neck.settled>.3&&neck.settled<.42,'eyes lean over the chest');
 assert.deepEqual(neck.body,neck.origin,'neck movement never moves the body');assert.ok(neck.turned.x>.3&&Math.abs(neck.turned.z)<1e-8,'neck follows current yaw');
 assert.deepEqual(neck.arenaCamera,neck.origin,'arena camera stays exactly at its original position');assert.deepEqual(neck.arenaNeck,{forward:0,drop:0},'entering the arena clears all neck motion');
 for(const scheme of ['qwerty','azerty','controller']){
  console.log('Checking',scheme);
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(scheme=>{localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Emotes',configured:true}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:scheme}));window.testPad={id:'Test',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});},scheme);
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);await page.click('#start');await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.entrance);
  const key=async(letter,held)=>page.evaluate(({letter,held})=>window.dispatchEvent(new KeyboardEvent(held?'keydown':'keyup',{key:letter,code:letter==='a'?'KeyQ':letter==='q'?'KeyQ':'KeyE'})),{letter,held});
  if(scheme==='controller')await page.evaluate(()=>{window.testPad.buttons[4].pressed=true;window.testPad.buttons[5].value=.8;});else{await key(scheme==='azerty'?'a':'q',true);await key('e',true);}
  await page.waitForFunction(()=>window.abyss.input.leftArm&&window.abyss.input.rightArm);assert.equal(await page.evaluate(()=>window.abyss.stats.shots),0);
  if(scheme==='controller')await page.evaluate(()=>{window.testPad.buttons[4].pressed=false;window.testPad.buttons[5].value=0;});else{await key(scheme==='azerty'?'a':'q',false);await key('e',false);}
  await page.waitForFunction(()=>!window.abyss.input.leftArm&&!window.abyss.input.rightArm);
  if(scheme!=='controller'){await key(scheme==='azerty'?'a':'q',true);await page.keyboard.press('Escape');await page.waitForFunction(()=>window.abyss.mode==='paused');assert.equal(await page.evaluate(()=>!!window.abyss.input.leftArm),false);}
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('Courtyard emotes passed: outward palms, open fingers, native shoulder rig at FOV 75/90/120/145, smooth courtyard neck lean and unchanged arena camera, diagonal rig alignment, smooth release, first-person body, QWERTY/AZERTY/controller holds, pause cleanup and combat gestures.');
}finally{await browser.close();}
