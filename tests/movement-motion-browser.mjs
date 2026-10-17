import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style><canvas id="fixture"></canvas>'}));await page.goto(url);
 const result=await page.evaluate(async()=>{
  const [T,{World,v},{GameRenderer},{weaponMuzzle,HAND_MUZZLES}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/weapon-origin.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,screenShake:0,movementMotion:100,mist:false,skyMotion:'reduced'});
  await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded,renderer.crewAvatarReady]);
  const w=new World(723,{schedule:false,invulnerable:true}),weapon=renderer.originalWeapon;w.player.pos=v(0,1.7,0);w.time=5;
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const magnitude=p=>Math.hypot(p.x,p.y,p.z);
  const draw=(dt=1/60,yaw=0,pitch=0,spectator=null,entrance=false)=>renderer.render(w,yaw,pitch,dt,false,1,spectator,false,entrance);
  const tick=(dt,yaw=0,pitch=0)=>{w.time+=dt;for(const key of ['x','y','z'])w.player.pos[key]+=w.player.vel[key]*dt;draw(dt,yaw,pitch);};
  draw();check(magnitude(renderer.movementMotion.pose.camera)===0,'standing camera stays still');
  w.player.vel.z=-11;for(let i=0;i<20;i++)tick(1/60);
  check(magnitude(renderer.movementMotion.pose.arm)>0,'moving player swings arm');check(magnitude(renderer.movementMotion.pose.rotation)>0,'arm swing includes rotation');check(magnitude(renderer.movementMotion.pose.camera)>0,'moving player has restrained camera bob');
  const restingCamera=new T.Vector3(w.player.pos.x,w.player.pos.y,w.player.pos.z);check(renderer.camera.position.distanceTo(restingCamera)<=.012+1e-12,'movement camera stays bounded');
  const aim=new T.Quaternion().setFromEuler(new T.Euler(0,0,0,'YXZ'));check(renderer.camera.quaternion.angleTo(aim)<1e-12,'walking keeps horizon and aim exact');
  const movingImage=renderer.renderer.domElement.toDataURL();
  // Paused presentation preserves the exact gait and overlay transform.
  const frozen=JSON.stringify(renderer.movementMotion.diagnostics),frozenCamera=renderer.camera.position.clone(),hand=JSON.stringify(weapon.effectDiagnostics.motionRotation);
  for(let i=0;i<5;i++)draw(0);
  check(JSON.stringify(renderer.movementMotion.diagnostics)===frozen,'pause freezes movement state');check(renderer.camera.position.equals(frozenCamera),'paused camera is exact');check(JSON.stringify(weapon.effectDiagnostics.motionRotation)===hand,'paused arm rotation is exact');
  let sockets=0,maxError=0;
  for(const fov of [75,90,115,145])for(const aspect of [16/9,9/16])for(let level=1;level<=7;level++){
   w.level=level;renderer.configure({quality:'low',fov,screenShake:0,movementMotion:100,mist:false});tick(1/60,.45,.3);
   renderer.camera.aspect=aspect;renderer.camera.updateProjectionMatrix();weapon.resize(aspect*540,540);
   weapon.update(w,0,false,renderer.camera,1,renderer.feedbackWorldOffset,renderer.movementMotion.pose);
   for(let socket=0;socket<HAND_MUZZLES[level-1].length;socket++){
    const pos=weaponMuzzle(w.player.pos,.45,.3,level,socket),p={id:socket,shotKey:`local:1:${socket}`,pos,vel:v(0,0,-70),age:0,level,homing:false},before=JSON.stringify(p);
    const visual=weapon.projectileView(p,new T.Vector3(pos.x,pos.y,pos.z)).project(renderer.camera),tip=weapon.socketScreen(level,socket),error=Math.hypot(visual.x-tip.x,visual.y-tip.y);
    maxError=Math.max(error,maxError);check(error<1e-10,'actual swinging arm and translated camera preserve launch alignment');check(JSON.stringify(p)===before,'swing never mutates the physical dagger');sockets++;
   }
  }
  // The imported arm and palm stay rigid. Rotation is anchored at the lower
  // arm, so the base only follows intentional translation, never an orbit
  // around the hand. Check the actual rendered parent transform.
  const {HAND_POSE}=await import('/src/weapon-origin.ts');
  const localBase=new T.Vector3(-.055,.19,.006),restBase=localBase.clone().applyQuaternion(weapon.restRotation);
  const renderedBase=localBase.clone().applyQuaternion(weapon.pose.quaternion).add(weapon.pose.position);
  const expectedBase=restBase.clone().add(new T.Vector3(HAND_POSE.x+weapon.motion.x,HAND_POSE.y+weapon.motion.y,HAND_POSE.z+weapon.recoil+weapon.motion.z));
  check(renderedBase.distanceTo(expectedBase)<1e-10,'whole rigid arm rotates around its base');
  check(weapon.pose.scale.equals(new T.Vector3(1,1,1)),'locomotion never stretches the arm mesh');
  w.level=1;renderer.configure({quality:'low',fov:90,screenShake:100,movementMotion:0,mist:false});renderer.effect({kind:'burst',pos:w.player.pos},w,0,0);draw(.02);
  check(magnitude(renderer.movementMotion.pose.arm)===0,'movement off disables swing');check(renderer.cameraFeedback.diagnostics.active.includes('burst'),'impact shake remains independent of movement setting');
  renderer.clear();renderer.configure({quality:'low',fov:90,screenShake:0,movementMotion:100,mist:false});w.player.vel=v(0,0,-11);w.player.grounded=true;for(let i=0;i<20;i++)tick(1/60);
  check(renderer.cameraFeedback.diagnostics.active.length===0,'movement does not require impact shake');check(magnitude(renderer.movementMotion.pose.camera)>0,'movement camera survives independent shake setting');
  w.player.grounded=false;w.player.vel.y=5;const phase=renderer.movementMotion.diagnostics.phase;
  for(let i=0;i<50;i++)tick(1/60);check(renderer.movementMotion.diagnostics.phase===phase,'airborne gait phase stops');check(magnitude(renderer.movementMotion.pose.camera)===0,'airborne camera settles');check(Math.abs(weapon.effectDiagnostics.motion.y)>0,'airborne arm retains physical lag');
  draw(.02,0,0,v(5,8,9));check(renderer.camera.position.equals(new T.Vector3(5,8,9)),'spectator position stays exact');check(magnitude(renderer.movementMotion.pose.arm)===0,'spectator clears movement pose');
  renderer.topDown=true;draw();check(magnitude(renderer.movementMotion.pose.camera)===0,'top-down clears bob');renderer.topDown=false;
  renderer.clear();w.player.grounded=true;w.player.vel=v(0,0,-11);draw(0);
  for(let i=0;i<10;i++){w.time+=.1;w.player.pos.z-=1.1;draw(.05);}
  const expected=(11*Math.PI*2/4.8)%(Math.PI*2);
  check(Math.abs(renderer.movementMotion.diagnostics.phase-expected)<1e-10,'gait follows simulation distance when render dt is capped');
  // A camera discontinuity never becomes a dramatic arm lurch.
  w.player.grounded=true;w.player.vel=v(0,0,-11);renderer.clear();for(let i=0;i<10;i++)tick(1/60);w.player.pos.x+=50;draw();check(magnitude(renderer.movementMotion.pose.arm)===0,'teleport resets inertia');
  w.player.pos=v(0,1.7,0);renderer.clear();draw(.02,0,0,null,true);tick(1/60); // courtyard and arena use the same bounded presentation path
  renderer.clear();w.player.pos=v(0,1.7,0);w.player.vel=v(0,0,-11);
  for(let i=0;i<20;i++){w.tick+=2;w.player.pos.z-=11/60;draw(1/60,0,0,null,true);}check(magnitude(renderer.movementMotion.pose.camera)>0,'courtyard walking has movement feedback');
  renderer.clear();w.player.vel=v();draw(0);const neutral=renderer.camera.position.clone();
  for(let i=0;i<10;i++)draw(1/60, i*.04, i*.005);check(magnitude(weapon.effectDiagnostics.motionRotation)>0,'turning sways arm');check(renderer.camera.position.equals(neutral),'turning does not bob or lean the camera');
  const q=new T.Quaternion().setFromEuler(new T.Euler(.045,.36,0,'YXZ'));check(renderer.camera.quaternion.angleTo(q)<1e-7,'turn sway never delays aim');
  renderer.clear();w.player.vel=v();w.player.grounded=false;draw(1/60);const restTip=weapon.socketScreen(1,0).x;
  draw(1/60,-.05,0);check(weapon.socketScreen(1,0).x<restTip,'right turn visibly trails the arm to the left');
  renderer.clear();w.player.vel=v();draw(0);const calls=renderer.renderer.info.render.calls;
  renderer.configure({quality:'low',fov:90,screenShake:0,movementMotion:0,mist:false});draw(0);check(renderer.renderer.info.render.calls===calls,'movement adds no draw calls');
  return {sockets,maxError,drawCalls:calls,movingImage};
 });
 assert.deepEqual(errors,[]);await mkdir('test-results/movement-motion',{recursive:true});await writeFile('test-results/movement-motion/running.png',Buffer.from(result.movingImage.split(',')[1],'base64'));delete result.movingImage;
 await writeFile('test-results/movement-motion/results.json',JSON.stringify(result,null,2));console.log('Movement rendering passed:',result);
}finally{await browser.close();}
