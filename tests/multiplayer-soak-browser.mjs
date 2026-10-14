import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const pages=[],errors=[];
 for(const role of ['host','guest','guest','guest']){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/crew-soak-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/crew-soak-test');
  await page.evaluate(async role=>{
   const [{FriendsSession},{World,idleInput},{CrewClock}]=await Promise.all([import('/src/multiplayer.ts'),import('/src/simulation.ts'),import('/src/crew-clock.ts')]);
   window.session=new FriendsSession(role,[]);window.World=World;window.idleInput=idleInput;window.CrewClock=CrewClock;window.snapshots=0;window.maxPending=0;window.maxQueue=0;window.sampleTicks=0;window.accepted=0;
   window.session.onSnapshot=s=>{window.snapshots++;if(!window.world||window.epoch!==s.epoch){window.world=new World(1,{schedule:false});window.epoch=s.epoch;}window.session.reconcile(window.world,s);};
  },role);pages.push(page);
 }
 const [host,...guests]=pages;
 for(const guest of guests){const offer=await host.evaluate(()=>window.session.offer()),answer=await guest.evaluate(offer=>window.session.answer(offer),offer);await host.evaluate(answer=>window.session.accept(answer),answer);}
 await host.waitForFunction(()=>window.session.connected===3);for(const page of guests)await page.waitForFunction(()=>window.session.members.length===4);
 await host.evaluate(()=>{
  const s=window.session;s.start();s.startAt=0;s.world=new window.World(42,{schedule:false,invulnerable:true});s.world.addCrew('host');for(const id of s.links.keys())s.world.addCrew(id);for(const p of s.world.crew)p.level=4;s.world.selectCrew('host');s.broadcast();
 });
 for(const page of guests)await page.waitForFunction(()=>window.epoch===1&&window.session.startAt===0&&window.world.crew.length===4);
 // Real WebRTC with 120 ms added RTT, 20% input loss/reordering, isolated
 // snapshot losses, and one 250 ms input blackout midway through sustained fire.
 for(const page of pages)await page.evaluate(()=>{
  window.networkAt=performance.now();
  for(const l of window.session.links.values())for(const channel of [l.input,l.updates,l.state]){
   const send=channel.send.bind(channel);let count=0;
   channel.send=data=>{
    const n=++count,age=performance.now()-window.networkAt;
    if(channel.label==='input'&&(n%5===0||age>=4000&&age<4250))return;
    if(channel.label==='updates'&&data instanceof ArrayBuffer){const h=new DataView(data);if(h.getUint32(8)<h.getUint32(12)&&h.getUint32(8)%8===2)return;}
    setTimeout(()=>{if(channel.readyState==='open')send(data);},60+(channel.label==='input'&&n%3===0?25:0));
   };
  }
 });
 await host.evaluate(()=>{
  const clock=new window.CrewClock();clock.advance(performance.now(),()=>{});
  window.timer=setInterval(()=>clock.advance(performance.now(),()=>{window.session.step(window.idleInput());window.session.world.effects=[];window.maxQueue=Math.max(window.maxQueue,...window.session.snapshot().crew.map(p=>p.queuedInputs??0));}),8);
 });
 for(const [index,page]of guests.entries())await page.evaluate(index=>{
  const clock=new window.CrewClock();clock.advance(performance.now(),()=>{});
  window.timer=setInterval(()=>clock.advance(performance.now(),()=>{
   const tick=window.sampleTicks++;if(tick>=1800){clearInterval(window.timer);return;}
   const input={...window.idleInput(),strafe:tick%240<120?.2:-.2,yaw:index*.3,fire:tick<900,jump:tick===150||tick===450};
   if(window.session.predict(window.world,input))window.accepted++;window.world.effects=[];window.maxPending=Math.max(window.maxPending,window.session.diagnostics.pendingInputs);
  }),8);
 },index);
 for(const page of guests)await page.waitForFunction(()=>window.sampleTicks>=1800,{},{timeout:25000});
 for(const page of guests)await page.waitForFunction(()=>window.session.diagnostics.pendingInputs===0,{},{timeout:10000});
 await host.evaluate(()=>clearInterval(window.timer));
 const authoritative=await host.evaluate(()=>({crew:window.session.snapshot().crew.map(p=>({id:p.id,pos:p.player.pos,ack:p.ack,streaming:p.primary.streaming})),shots:window.session.world.stats.shots,maxQueue:window.maxQueue}));
 const reports=[];
 for(const page of guests){const r=await page.evaluate(()=>({id:window.session.localId,pos:window.world.player.pos,maxPending:window.maxPending,snapshots:window.snapshots,accepted:window.accepted,network:window.session.diagnostics}));reports.push(r);const p=authoritative.crew.find(p=>p.id===r.id);
  assert.ok(Math.hypot(p.pos.x-r.pos.x,p.pos.y-r.pos.y,p.pos.z-r.pos.z)<.1);assert.equal(p.ack,r.accepted);assert.equal(p.streaming,false);assert.ok(r.maxPending<180);assert.ok(r.snapshots>100);assert.equal(r.network.predictionStalled,false);
 }
 assert.ok(authoritative.shots>1000);assert.deepEqual(errors,[]);
 console.log('15-second four-player WebRTC soak passed: sustained level-IV fire, movement/jumps, input blackout, latency, loss/reordering, FEC and full acknowledgement recovery.',JSON.stringify({shots:authoritative.shots,maxHostQueue:authoritative.maxQueue,guests:reports.map(r=>({accepted:r.accepted,maxPending:r.maxPending,snapshots:r.snapshots,rttMs:r.network.rttMs}))}));
 for(const page of pages)await page.evaluate(()=>window.session.close());
}finally{await browser.close();}
