import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
await mkdir('artifacts/palm-fire',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/palm-fire-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/palm-fire-test');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput},T,{crewWeaponMuzzle}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/crew-avatar.ts')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,skyMotion:'reduced',mist:false,movementMotion:0,screenShake:0});await r.prepare();
  const w=new World(971,{schedule:false});w.player.pos={x:0,y:1.7,z:0};let checks=0;
  const render=(input,dt=1/60)=>{w.time+=dt;r.render(w,input.yaw,input.pitch,dt,false,1,null,false,false,input);};
  for(const level of [1,2,3,4,5,6,7])for(const pitch of [-1.3,0,1.3])for(const burst of [false,true]){
   w.level=level;r.originalWeapon.clear();for(let i=0;i<60;i++)render({...idleInput(),pitch});
   const hands=r.emoteHands;
   const closed=hands.getObjectByName('Middle2R').quaternion.clone();
   if(level===5&&pitch===0&&!burst){
    let largest=0;
    for(let i=0;i<30;i++){render(idleInput());largest=Math.max(largest,hands.getObjectByName('Middle2R').quaternion.angleTo(closed));}
    if(largest<.0001||largest>.035)throw Error('Idle flex should be subtle and alive');
   }
   const input={...idleInput(),pitch,fire:!burst,homing:burst};
   w.shoot(input,burst,false);const physical=w.projectiles.map(p=>({...p.pos}));
   for(const e of w.effects)r.effect(e,w,0,pitch);w.effects=[];render(burst?{...idleInput(),pitch}:input);
   for(const side of level>=5?['R','L']:['R']){
    const base=hands.getObjectByName('Middle1'+side).getWorldPosition(new T.Vector3());
    const tip=hands.getObjectByName('Middle3'+side+'_end').getWorldPosition(new T.Vector3());
    const upward=new T.Vector3(0,Math.cos(pitch),Math.sin(pitch));
    if(tip.clone().sub(base).normalize().dot(upward)<.65)throw Error('Fingers not upright '+JSON.stringify({level,pitch,burst,side,dir:tip.clone().sub(base).normalize().toArray()}));
    const palm=new T.Vector3();crewWeaponMuzzle(hands,palm,level,side==='L'?1:0);
    if(palm.distanceTo(base)>.13||palm.distanceTo(tip)<.08)throw Error('Emission not in palm '+JSON.stringify({level,pitch,burst,side,base:palm.distanceTo(base),tip:palm.distanceTo(tip),basePos:base.toArray(),palm:palm.toArray(),index:hands.getObjectByName('Index1'+side).getWorldPosition(new T.Vector3()).toArray()}));
   }
   if(w.projectiles.some((p,i)=>p.pos.x!==physical[i].x||p.pos.y!==physical[i].y||p.pos.z!==physical[i].z))throw Error('Pose moved physics');
   for(let i=0;i<90;i++)render({...idleInput(),pitch});
   if(hands.getObjectByName('Middle2R').quaternion.angleTo(closed)>.035)throw Error('Hand did not return to relaxed idle');checks++;
  }
  window.palmTest={r,w,idleInput,render};return {checks};
 });
 for(const level of [1,5])for(const mode of ['idle','beam','shotgun']){
  await page.evaluate(({level,mode})=>{const {r,w,idleInput,render}=window.palmTest;w.level=level;w.projectiles=[];w.effects=[];r.originalWeapon.clear();for(let i=0;i<60;i++)render(idleInput());if(mode!=='idle'){const input={...idleInput(),fire:mode==='beam',homing:mode==='shotgun'};w.shoot(input,mode==='shotgun',false);for(const e of w.effects)r.effect(e,w,0,0);w.effects=[];render(input,0);}}, {level,mode});
  await page.evaluate(mode=>{const {r,w,idleInput}=window.palmTest;const input={...idleInput(),fire:mode==='beam',homing:mode==='shotgun'};const frame=()=>{r.render(w,0,0,0,false,1,null,false,false,input);window.palmPreview=requestAnimationFrame(frame);};window.palmPreview=requestAnimationFrame(frame);},mode);
  await page.screenshot({path:`artifacts/palm-fire/level-${level}-${mode}.png`});
  await page.evaluate(()=>{cancelAnimationFrame(window.palmPreview);});
 }
 assert.deepEqual(errors,[]);console.log('Palm firing poses passed:',result);
}finally{await browser.close();}
