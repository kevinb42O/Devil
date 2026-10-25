import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/prelobby-camera-audit',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}</style><canvas></canvas>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/prelobby-camera-audit');
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),A=await import('/src/crew-avatar.ts'),S=await import('/src/simulation.ts'),{GameRenderer}=await import('/src/renderer.ts'),{createCourtyard}=await import('/src/courtyard-state.ts');
  await A.loadCrewAvatar();const body=A.createCrewAvatar(0,false,true),third=A.createCrewAvatar(0),point=new T.Vector3();
  const check=(ok,why)=>{if(!ok)throw Error(why);};
  body.position.set(3,4,2);body.rotation.y=.8;A.updateCrewAvatar(body,S.idleInput(),{x:0,y:0,z:0},true,0,false,true);body.updateMatrixWorld(true);
  const anchor=body.getObjectByName('Neck').getWorldPosition(new T.Vector3());let minClearance=Infinity,maxNeckError=0,poses=0;
  for(const speed of [0,4,11])for(const grounded of [true,false])for(const raised of [false,true])for(let i=0;i<60;i++){
   const time=i/60,input={...S.idleInput(),leftArm:raised,rightArm:raised};A.updateCrewAvatar(body,input,{x:speed,y:grounded?0:8,z:0},grounded,time,false,true);body.updateMatrixWorld(true);
   maxNeckError=Math.max(maxNeckError,body.getObjectByName('Neck').getWorldPosition(point).distanceTo(anchor));
   for(const shoulder of ['L','R'].map(side=>body.getObjectByName('UpperArm'+side))){
    const distance=shoulder.getWorldPosition(point).distanceTo(body.position)-.1-.05;minClearance=Math.min(minClearance,distance);
    check(distance>.1,'jump/run pose entered local eye clearance');
   }
   poses++;
  }
  check(maxNeckError<1e-7,'local collar moves relative to eye');
  A.updateCrewAvatar(third,S.idleInput(),{x:0,y:0,z:0},true,0,false,true);third.updateMatrixWorld(true);const groundShoulder=third.getObjectByName('UpperArmL').getWorldPosition(point).y;
  A.updateCrewAvatar(third,S.idleInput(),{x:0,y:8,z:0},false,.25,false,true);third.updateMatrixWorld(true);check(third.getObjectByName('UpperArmL').getWorldPosition(point).y-groundShoulder>.3,'third-person jump animation was changed');
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:145,screenShake:0,movementMotion:60,mist:false});
  await Promise.all([renderer.courtyard.ready,renderer.originalWeapon.loaded,renderer.originalEnemies.loaded]);
  renderer.configure({quality:'low',fov:145,screenShake:0,movementMotion:60,mist:false,skyMotion:'reduced'});
  const world=new S.World(1,{schedule:false});world.courtyard=createCourtyard(1);world.addCrew('host');world.selectCrew('host');world.player.pos={x:0,y:1.7,z:6};world.playerStarts.clear();
  let renderedClearance=Infinity,airFrames=0,landings=0,wasGrounded=true;
  for(let frame=0;frame<120;frame++){
   const input={...S.idleInput(),jump:frame%48<2,leftArm:frame%48>5,rightArm:frame%48>15,strafe:frame<80?.3:0};
   for(let i=0;i<2;i++)world.stepCrewEntrance(new Map([['host',input]]));
   if(!world.player.grounded)airFrames++;if(!wasGrounded&&world.player.grounded)landings++;wasGrounded=world.player.grounded;
   const pitch=frame<35?0:frame<75?-1.3:frame<100?.9:-.4,yaw=frame>85?(frame-85)*.12:0;
   renderer.render(world,yaw,pitch,1/60,false,frame%3/2,null,false,true,input);
   const model=renderer.emoteHands;model.updateMatrixWorld(true);
   for(const joint of ['L','R'].map(side=>model.getObjectByName('UpperArm'+side))){
    const distance=joint.getWorldPosition(point).distanceTo(renderer.camera.position)-.1-renderer.camera.near;
    renderedClearance=Math.min(renderedClearance,distance);check(distance>.08,'rendered jump/landing eye clips shoulder');
   }
   check(model.position.toArray().every(Number.isFinite),'body position finite');
  }
  check(airFrames>50&&landings>=2,'audit did not exercise repeated jumps and landings');
  // The courtyard body must stay safe during a pit fall and after returning to spawn.
  for(const y of [1.7,0,-3,-7,1.7]){world.player.pos={x:0,y,z:0};world.playerStarts.clear();renderer.render(world,1.4,-1.5,1/60,false,1,null,false,true,S.idleInput());for(const joint of ['L','R'].map(side=>renderer.emoteHands.getObjectByName('UpperArm'+side))){renderer.emoteHands.updateMatrixWorld(true);check(joint.getWorldPosition(point).distanceTo(renderer.camera.position)>.3,'pit fall eye clips shoulder');}}
  renderer.configure({quality:'low',fov:90,movementMotion:0,screenShake:0,mist:false});
  renderer.render(world,0,-1.3,1/60,false,1,null,false,false,S.idleInput());
  check(renderer.camera.position.z<world.player.pos.z&&renderer.camera.position.distanceTo(new T.Vector3(world.player.pos.x,world.player.pos.y,world.player.pos.z))<.5,'combat lost the shared first-person look-down lean');
  window.audit={renderer,world,idleInput:S.idleInput};
  return {poses,maxNeckError,minClearance,renderedClearance,airFrames,landings};
 });
 assert.deepEqual(errors,[]);await mkdir('artifacts/prelobby-camera',{recursive:true});await writeFile('artifacts/prelobby-camera/audit.json',JSON.stringify(result,null,2));
 await page.evaluate(()=>{const {renderer:r,world:w,idleInput}=window.audit;w.player.pos={x:0,y:3.2,z:5};w.player.grounded=false;w.player.vel.y=4;w.playerStarts.clear();r.configure({quality:'low',fov:145,movementMotion:0,screenShake:0,mist:false});r.render(w,0,-.5,1/60,false,1,null,false,true,{...idleInput(),leftArm:true,rightArm:true});});
 await page.screenshot({path:'artifacts/prelobby-camera/jump.png'});
 console.log('Prelobby camera audit passed:',JSON.stringify(result));
}finally{await browser.close();}
