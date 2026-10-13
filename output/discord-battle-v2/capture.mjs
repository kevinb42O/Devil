import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
const root='output/discord-battle-v2';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
await page.route('http://127.0.0.1:5173/promo-capture',r=>r.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"></head><body style="margin:0;background:black;overflow:hidden"><canvas id="battle" style="width:100vw;height:100vh"></canvas><div id="timer" style="position:fixed;top:16px;left:0;right:0;text-align:center;font:600 25px monospace;color:#f8deae;text-shadow:0 2px 5px black"></div><div style="position:fixed;top:20px;left:22px;color:#dfc692;letter-spacing:3px;font:12px monospace">ABYSS / DAGGERS<br><span style="font-size:9px;letter-spacing:2px">PRACTICE • IV</span></div></body></html>'}));
await page.goto('http://127.0.0.1:5173/promo-capture');
console.log('Loading game assets');
await page.evaluate(async()=>{
 const [{World,STEP,idleInput},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
 const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:95});
 await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded,renderer.crewAvatarReady]);
 const world=new World(19271,{invulnerable:true});world.startAt(406,4,500);
 let yaw=0,pitch=0,target=null,recording=false;
 function tick(){
  const t=world.time-406;
  // Smooth targeting and continuous circular strafing using the real input/simulation pipeline.
  const candidates=world.enemies.filter(e=>e.age>1&&!e.kind.includes('egg'));
  if(!target||!candidates.includes(target)||Math.floor(t*1.2)!==Math.floor((t-STEP)*1.2)){
   target=candidates.sort((a,b)=>{const score=e=>Math.hypot(e.pos.x-world.player.pos.x,e.pos.z-world.player.pos.z)+(e.kind.startsWith('squid')?10:0)+(e.kind.includes('pede')?12:0);return score(a)-score(b);})[0];
  }
  if(target&&!recording){
   const dx=target.pos.x-world.player.pos.x,dz=target.pos.z-world.player.pos.z,dy=target.pos.y-world.player.pos.y;
   const desired=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
   yaw+=Math.max(-.026,Math.min(.026,delta));
   pitch+=(Math.atan2(dy,Math.hypot(dx,dz))-pitch)*.06;
  }
  const radius=Math.hypot(world.player.pos.x,world.player.pos.z);
  const inward=Math.atan2(world.player.pos.x,world.player.pos.z);
  const travel=radius>20?inward:Math.atan2(-world.player.pos.z,world.player.pos.x);
  const forward=Math.cos(travel-yaw),strafe=-Math.sin(travel-yaw);
  if(recording){yaw=.22*Math.sin((t-38)*.65);pitch=.10+.06*Math.sin((t-38)*.8);}
  const input={...idleInput(),yaw,pitch,forward:recording?0:forward*.9,strafe:recording?.24*Math.cos((t-38)*1.1):strafe*.9,fire:t>34&&t%2.3<1.95,homing:t>34&&t%3.2<.2,jump:t%.75<STEP};
  world.step(input,STEP);
  for(const e of world.effects)renderer.effect(e,world,yaw,pitch);
 }
 for(let i=0;i<38/STEP;i++)tick();
 recording=true;world.player.pos={x:0,y:1.7,z:14};world.player.vel={x:0,y:0,z:0};yaw=0;pitch=.1;
 window.captureFrame=()=>{for(let i=0;i<6;i++)tick();renderer.render(world,yaw,pitch,1/20,false);document.querySelector('#timer').textContent=world.time.toFixed(3);return {time:world.time,enemies:world.enemies.length,kills:world.stats.kills,position:world.player.pos,motion:world.enemies.slice(0,5).map(e=>({id:e.id,kind:e.kind,pos:{...e.pos},age:e.age}))};};
 renderer.render(world,yaw,pitch,1/20,false);
});
console.log('Assets ready; recording 8 seconds at 20 fps');
for(let i=0;i<160;i++){
 const status=await page.evaluate(()=>window.captureFrame());
 await page.screenshot({path:`${root}/frames/${String(i).padStart(4,'0')}.png`});
 if(i%40===0)console.log('frame',i,JSON.stringify(status));
}
await browser.close();
console.log('Capture complete');
