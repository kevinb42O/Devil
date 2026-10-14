import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const host=await browser.newPage(),guest=await browser.newPage(),errors=[];
 for(const [page,role]of [[host,'host'],[guest,'guest']]){
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/large-state-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/large-state-test');
  await page.evaluate(async role=>{
   const {FriendsSession}=await import('/src/multiplayer.ts');window.session=new FriendsSession(role);window.effects=[];window.session.onSnapshot=s=>window.snapshot=s;window.session.onEffects=effects=>window.effects.push(...effects);
  },role);
 }
 const offer=await host.evaluate(()=>window.session.offer()),answer=await guest.evaluate(offer=>window.session.answer(offer),offer);await host.evaluate(answer=>window.session.accept(answer),answer);
 for(const page of [host,guest])await page.waitForFunction(()=>window.session.connected===1&&[...window.session.links.values()].every(l=>l.updates?.readyState==='open'));
 await host.evaluate(()=>{window.session.start();window.session.startAt=0;window.session.broadcast();});await guest.waitForFunction(()=>window.snapshot?.epoch===1&&window.snapshot.running);
 const at=Date.now();await host.evaluate(()=>{
  const s=window.session;s.world.time=.1;s.world.tick=12;s.world.projectiles=Array.from({length:6000},(_,i)=>({id:i+1,pos:{x:1,y:2,z:3},vel:{x:0,y:0,z:-42},age:.1,homing:true}));
  for(const l of s.links.values()){l.tokens=0;l.tokenAt=performance.now();}
  s.pendingEffects=[{kind:'death',networkId:123,pos:{x:0,y:0,z:0}}];s.broadcast();
 });
 await guest.waitForFunction(()=>window.effects.some(e=>e.networkId===123));assert.equal(await guest.evaluate(()=>window.snapshot.projectiles.length),0,'effects arrive while the large frame is still in flight');
 await guest.waitForFunction(()=>window.snapshot.projectiles.length===6000,{},{timeout:10000});const elapsed=Date.now()-at;assert.ok(elapsed>300);
 await host.waitForFunction(()=>[...window.session.links.values()].some(l=>l.ackFrame>0));
 // Restart with another partially sent frame; old chunks cannot restore the old run.
 await host.evaluate(()=>{
  const s=window.session;for(const l of s.links.values()){l.transfer=undefined;l.tokens=0;l.tokenAt=performance.now();}s.world.time=.2;s.world.tick=24;s.broadcast();s.start();s.startAt=0;s.broadcast();
 });
 await guest.waitForFunction(()=>window.snapshot.epoch===2&&window.snapshot.projectiles.length===0);assert.deepEqual(errors,[]);
 console.log('Large WebRTC state passed: 6,000 projectiles, paced transfer, early reliable effects, ACK and restart cancellation.',JSON.stringify({transferMs:elapsed}));
 await host.evaluate(()=>window.session.close());await guest.evaluate(()=>window.session.close());
}finally{await browser.close();}
