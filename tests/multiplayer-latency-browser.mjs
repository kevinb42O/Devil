import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const host=await browser.newPage(),guest=await browser.newPage(),errors=[];
 for(const [page,role]of [[host,'host'],[guest,'guest']]){
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/network-latency-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/network-latency-test');
  await page.evaluate(async role=>{
   const {FriendsSession}=await import('/src/multiplayer.ts'),{World,idleInput}=await import('/src/simulation.ts');window.session=new FriendsSession(role);window.World=World;window.idleInput=idleInput;window.snapshots=0;
   window.session.onSnapshot=s=>{window.snapshots++;if(!window.world||window.epoch!==s.epoch){window.world=new World(1,{schedule:false});window.epoch=s.epoch;}window.session.reconcile(window.world,s);};
   window.session.onError=e=>{window.sessionError=e;console.error(e);};
  },role);
 }
 const offer=await host.evaluate(()=>window.session.offer());const answer=await guest.evaluate(offer=>window.session.answer(offer),offer);await host.evaluate(answer=>window.session.accept(answer),answer);
 try{for(const page of [host,guest])await page.waitForFunction(()=>window.session.connected===1&&[...window.session.links.values()].every(l=>l.updates?.readyState==='open'&&l.input?.readyState==='open'));}catch(error){for(const page of [host,guest])console.log(await page.evaluate(()=>({role:window.session.role,error:window.sessionError,links:[...window.session.links.values()].map(l=>({connection:l.pc.connectionState,ice:l.pc.iceConnectionState,state:l.state?.readyState,input:l.input?.readyState,updates:l.updates?.readyState}))})));throw error;}
 await host.evaluate(()=>{const s=window.session;s.start();s.startAt=0;s.world=new window.World(42,{schedule:false});s.world.addCrew('host');for(const id of s.links.keys())s.world.addCrew(id);s.broadcast();});
 await guest.waitForFunction(()=>window.world?.crew.length===2&&window.session.startAt===0);
 // This assertion does not wait for any host reply. Local input must move the
 // player and produce weapon feedback synchronously, even before transmission.
 const immediate=await guest.evaluate(()=>{const s=window.session,w=window.world,before=w.player.pos.z;s.predict(w,{...window.idleInput(),forward:1,fire:true});s.predict(w,{...window.idleInput(),forward:1,fire:false,pitch:-1.4});return {moved:w.player.pos.z<before,daggers:w.projectiles.filter(p=>p.id<0).length,boost:w.player.vel.y,effects:w.effects.map(e=>e.kind)};});
 assert.equal(immediate.moved,true);assert.equal(immediate.daggers,10);assert.ok(immediate.boost>=10.8);assert.ok(immediate.effects.includes('burst'));
 // Delay both directions by 60 ms. Drop/reorder input datagrams and isolated
 // state chunks; acknowledgements and critical events retain reliable delivery.
 for(const page of [host,guest])await page.evaluate(()=>{
  for(const link of window.session.links.values())for(const channel of [link.input,link.updates,link.state]){
   const send=channel.send.bind(channel);let count=0;channel.send=data=>{const n=++count;if(channel.label==='input'&&n%5===0)return;if(channel.label==='updates'&&data instanceof ArrayBuffer){const h=new DataView(data),i=h.getUint32(8),parts=h.getUint32(12);if(i<parts&&i%8===2)return;}const delay=60+(channel.label==='input'&&n%3===0?25:0);setTimeout(()=>{if(channel.readyState==='open')send(data);},delay);};
  }
 });
 await host.evaluate(()=>{window.hostTimer=setInterval(()=>window.session.step(window.idleInput()),1000/120);});
 await guest.evaluate(()=>{
  window.guestTicks=0;window.maxPending=0;window.predictionTimer=setInterval(()=>{const tick=window.guestTicks++;const input={...window.idleInput(),forward:tick<90?1:0,strafe:tick>=90&&tick<150?1:0,fire:tick>=30&&tick<80,jump:tick===20||tick===21,yaw:.2};window.session.predict(window.world,input);window.world.effects=[];window.maxPending=Math.max(window.maxPending,window.session.diagnostics.pendingInputs);},1000/120);
 });
 await guest.waitForFunction(()=>window.guestTicks>210,{},{timeout:10000});
 await guest.evaluate(()=>clearInterval(window.predictionTimer));
 await guest.waitForFunction(()=>window.session.diagnostics.pendingInputs===0,{},{timeout:10000});
 const hostState=await host.evaluate(()=>{const p=window.session.world.crew[1];return {position:p.player.pos,shots:window.session.world.stats.shots,streaming:p.primary.streaming,ack:window.session.snapshot().crew[1].ack};});
 const guestState=await guest.evaluate(()=>({position:window.world.player.pos,snapshots:window.snapshots,maxPending:window.maxPending,network:window.session.diagnostics}));
 assert.ok(Math.hypot(hostState.position.x-guestState.position.x,hostState.position.z-guestState.position.z)<.1);assert.ok(hostState.shots>10);assert.equal(hostState.streaming,false);assert.ok(hostState.ack>200);assert.ok(guestState.maxPending<100);assert.ok(guestState.snapshots>10);assert.ok(guestState.network.rttMs>=100);
 // A restart must reset command numbering and prediction state; delayed old
 // epoch packets must not be allowed to move the new crew.
 await host.evaluate(()=>{clearInterval(window.hostTimer);window.session.start();window.session.startAt=0;window.session.broadcast();});
 await guest.waitForFunction(()=>window.epoch===2&&window.session.diagnostics.pendingInputs===0);assert.equal(await guest.evaluate(()=>window.world.crew[1].primary.wasHeld),false);
 assert.deepEqual(errors,[]);console.log('WebRTC latency/loss passed:',JSON.stringify({immediate,hostState,guestState}));
 await host.evaluate(()=>window.session.close());await guest.evaluate(()=>window.session.close());
}finally{await browser.close();}
