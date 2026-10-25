import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/hand-feedback-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/hand-feedback-test');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput},T]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,mist:false,movementMotion:0,screenShake:0});await r.prepare();await r.crewAvatarReady;
  const w=new World(42,{schedule:false});w.player.pos={x:0,y:5,z:0};
  const check=(ok,message)=>{if(!ok)throw Error(message);};let checks=0;
  const render=(input,dt=0)=>r.render(w,0,0,dt,false,1,null,false,false,input);
  const tip=(level,side)=>{const out=new T.Vector3();check(r.combatMuzzle(level,level>=5?side:0,out),'Missing palm');return out;};
  for(const level of [1,2,3,4,5,6,7])for(const side of level>=5?[0,1]:[1])for(const burst of [true,false]){
   r.originalWeapon.clear();w.level=level;w.effects=[];w.projectiles=[];render(idleInput());
   const before=[tip(level,0),tip(level,1)];
   w.shoot(idleInput(),burst,false,level>=5?side:undefined);
   for(const e of w.effects)r.effect(e,w,0,0);render({...idleInput(),fire:true,...(side===1?{fireLeft:true}:{fireRight:true})},.016);
   const feedback=r.originalWeapon.handFeedback.hands;
   check(feedback[side].recoil>0&&feedback[side].firePower>0,'Firing hand lacks kick/flash');
   check(feedback[1-side].recoil===0&&feedback[1-side].firePower===0,'Idle hand recoils or flashes');
   const uniforms=r.emoteHands.userData.avatarMaterials.find(m=>m.name==='Demon_Main').userData.combatFeedback.uniforms;
   const fire=uniforms.combatHandFire.value;check((side===1?fire.x:fire.y)>0&&(side===1?fire.y:fire.x)===0,'Glow leaked to other arm');
   if(level>=5)check(tip(level,1-side).distanceTo(before[1-side])<1e-8,'Idle palm moved with firing recoil');
   const sparks=r.originalWeapon.fragments.filter(f=>f.handLevel===level);
   check(sparks.length>0,'Missing firing particles');if(level>=5)check(sparks.every(f=>f.handSocket%2===side),'Firing particles attached to wrong palm');
   if(level<5){const palm=tip(level,1).project(r.camera);check(palm.x<0,'Starting palm is on right side '+JSON.stringify({level,palm:palm.toArray(),camera:r.camera.position.toArray(),L:r.emoteHands.getObjectByName('Middle1L').getWorldPosition(new T.Vector3()).toArray(),R:r.emoteHands.getObjectByName('Middle1R').getWorldPosition(new T.Vector3()).toArray()}));check(r.combatHandDiagnostics.hands.primary==='left','Starting arm is not left');}
   checks++;
  }
  w.level=5;r.originalWeapon.clear();w.effects=[];w.projectiles=[];w.shoot(idleInput(),false,false);for(const e of w.effects)r.effect(e,w,0,0);render(idleInput(),.016);check(r.originalWeapon.handFeedback.hands.every(h=>h.recoil>0&&h.firePower>0),'Paired shots do not animate both hands');
  w.level=1;r.originalWeapon.clear();w.effects=[];w.projectiles=[];render(idleInput());
  window.handFeedbackRenderer=r;return {checks,startingHand:r.combatHandDiagnostics.hands.primary};
 });
 await mkdir('artifacts/hand-feedback',{recursive:true});await page.screenshot({path:'artifacts/hand-feedback/left-start.png'});
 assert.deepEqual(errors,[]);console.log('Hand feedback passed:',result);
}finally{await browser.close();}
