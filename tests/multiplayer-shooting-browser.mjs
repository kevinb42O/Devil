import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='win32'?{channel:'chrome'}:{}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 const host=await browser.newPage(),guest=await browser.newPage(),errors=[];
 for(const [page,role]of [[host,'host'],[guest,'guest']]){
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/network-shooting-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/network-shooting-test');
  await page.evaluate(async role=>{
   const {FriendsSession}=await import('/src/multiplayer.ts'),{World,idleInput,v}=await import('/src/simulation.ts');
   window.s=new FriendsSession(role);window.World=World;window.idleInput=idleInput;window.v=v;window.contacts=[];
   window.s.onSnapshot=s=>{window.w??=new World(42,{schedule:false});window.s.reconcile(window.w,s);};window.s.onEffects=events=>window.contacts.push(...events);
  },role);
 }
 const offer=await host.evaluate(()=>window.s.offer()),answer=await guest.evaluate(o=>window.s.answer(o),offer);await host.evaluate(a=>window.s.accept(a),answer);
 for(const page of [host,guest])await page.waitForFunction(()=>window.s.connected===1&&[...window.s.links.values()].every(l=>l.input?.readyState==='open'&&l.updates?.readyState==='open'));
 await host.evaluate(()=>{
  const s=window.s;s.start();s.startAt=0;s.world=new window.World(42,{schedule:false,invulnerable:true});s.world.addCrew('host');for(const id of s.links.keys())s.world.addCrew(id);
  const e=s.world.spawn('skull4',window.v(2,1.7,6));e.pos=window.v(2,1.7,6);e.age=3;e.activeAt=0;s.world.effects=[];s.broadcast();
 });
 await guest.waitForFunction(()=>window.w?.enemies.length===1&&window.s.startAt===0);
 // Delay the real WebRTC channels. No host tick or confirmation can account for
 // the local contacts observed below, even if network timers run in between.
 for(const page of [host,guest])await page.evaluate(()=>{
  for(const l of window.s.links.values())for(const ch of [l.input,l.updates,l.state]){const send=ch.send.bind(ch);ch.send=data=>setTimeout(()=>{if(ch.readyState==='open')send(data);},150);}
 });
 const immediate=await guest.evaluate(()=>{
  const s=window.s,w=window.w,hp=w.enemies[0].hp;
  for(let tick=0;tick<18;tick++){s.predict(w,{...window.idleInput(),fire:tick===0});window.contacts.push(...w.effects);w.effects=[];}
  return {hits:window.contacts.filter(e=>e.kind==='hit').length,bursts:window.contacts.filter(e=>e.kind==='burst').length,hpBefore:hp,hpAfter:w.enemies[0].hp,hostConfirmedHits:w.stats.hits,pending:s.diagnostics.pendingInputs};
 });
 assert.ok(immediate.hits>0,'guest must see contact before any host response');assert.equal(immediate.bursts,1);assert.equal(immediate.hpAfter,immediate.hpBefore);assert.equal(immediate.hostConfirmedHits,0);
 assert.equal(await host.evaluate(()=>window.s.world.stats.shots),0);
 await host.waitForFunction(()=>[...window.s.commands.values()].some(q=>q.size>=18));
 const authoritative=await host.evaluate(()=>{for(let i=0;i<18;i++)window.s.step(window.idleInput());window.s.broadcast();return {shots:window.s.world.stats.shots,hits:window.s.world.stats.hits};});
 assert.equal(authoritative.shots,10);assert.ok(authoritative.hits>0);
 await guest.waitForFunction(()=>window.s.diagnostics.pendingInputs===0);
 const result=await guest.evaluate(()=>({hitKeys:window.contacts.filter(e=>e.kind==='hit').map(e=>e.shotKey),network:window.s.diagnostics}));
 assert.equal(new Set(result.hitKeys).size,result.hitKeys.length,'reconciliation and delayed confirmations cannot duplicate a local impact');assert.deepEqual(errors,[]);
 console.log('Guest shooting over WebRTC with 300 ms added RTT:',JSON.stringify({immediate,authoritative,uniqueContacts:result.hitKeys.length}));
 for(const page of [host,guest])await page.evaluate(()=>window.s.close());
}finally{await browser.close();}
