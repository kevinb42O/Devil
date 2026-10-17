import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='win32'?{channel:'chrome'}:{}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const host=await browser.newPage(),guest=await browser.newPage(),errors=[],report=[];
 for(const [page,role]of [[host,'host'],[guest,'guest']]){
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/moving-target-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/moving-target-test');
  await page.evaluate(async role=>{
   const {FriendsSession}=await import('/src/multiplayer.ts'),{World,idleInput,v}=await import('/src/simulation.ts');
   window.s=new FriendsSession(role);Object.assign(window,{World,idleInput,v});window.hits=new Map();window.contactKeys=new Set();window.delay=0;window.dropInputs=false;window.inputPacket=0;
   window.s.onSnapshot=s=>{window.w??=new World(42,{schedule:false});window.s.reconcile(window.w,s);};
   window.s.onEffects=effects=>{for(const e of effects)if(e.kind==='hit'&&e.shotKey?.startsWith(window.s.localId+':'))window.hits.set(e.shotKey,Date.now());};
   const send=RTCDataChannel.prototype.send;
   RTCDataChannel.prototype.send=function(data){
    if(this.label==='input'&&window.dropInputs&&++window.inputPacket%5===0)return;
    const channel=this,delay=window.delay+(this.label==='input'&&window.dropInputs&&window.inputPacket%3===0?20:0);
    if(typeof data==='string'){const message=JSON.parse(data);if(message.type==='contacts')window.contactKeys.add(data);}
    const deliver=()=>{if(channel.readyState==='open')send.call(channel,data);};
    if(delay)setTimeout(deliver,delay);else deliver();
    // Deliberate duplicate reports exercise exactly-once shared damage.
    if(typeof data==='string'&&JSON.parse(data).type==='contacts')setTimeout(deliver,delay+15);
   };
  },role);
 }
 const offer=await host.evaluate(()=>window.s.offer()),answer=await guest.evaluate(o=>window.s.answer(o),offer);await host.evaluate(a=>window.s.accept(a),answer);
 for(const page of [host,guest])await page.waitForFunction(()=>window.s.connected===1&&[...window.s.links.values()].every(l=>l.input?.readyState==='open'&&l.updates?.readyState==='open'));
 for(const delay of [0,75,150]){
  for(const page of [host,guest])await page.evaluate(delay=>{window.delay=delay;window.dropInputs=delay>0;window.hits.clear();window.contactKeys.clear();window.inputPacket=0;},delay);
  const epoch=await host.evaluate(()=>{
   window.s.start();window.s.startAt=0;const w=window.s.world=new window.World(42,{schedule:false,invulnerable:true});w.addCrew('host');for(const id of window.s.links.keys())w.addCrew(id);w.contactOwners=[...window.s.links.keys()];
   const e=w.spawn('skull4',window.v(2,1.7,6));Object.assign(e,{pos:window.v(2,1.7,6),age:10,activeAt:0,hp:1000,radius:.6});w.effects=[];window.hitErrors=[];window.s.broadcast();
   window.hostTimer=setInterval(()=>{
    const w=window.s.world,e=w.enemies[0];if(!e)return;
    e.pos=window.v(2+3*Math.sin(w.time*6),1.7,6);e.vel=window.v(18*Math.cos(w.time*6),0,0);
    window.s.step(window.idleInput());
    for(const effect of w.effects)if(effect.kind==='hit'&&effect.shotKey){window.hits.set(effect.shotKey,Date.now());window.hitErrors.push(Math.hypot(e.pos.x-effect.pos.x,e.pos.z-effect.pos.z));}
    e.pos=window.v(2+3*Math.sin(w.time*6),1.7,6);e.vel=window.v(18*Math.cos(w.time*6),0,0);w.effects=[];
   },1000/120);return window.s.epoch;
  });
  await guest.waitForFunction(epoch=>window.s.epoch===epoch&&window.w?.enemies.length===1&&window.s.clientHits,epoch);
  await guest.evaluate(()=>{
   const start=performance.now();window.displayed=null;window.controlStopped=false;
   const frame=now=>{window.displayed=window.s.presentation(window.w,now);window.renderFrame=requestAnimationFrame(frame);};window.renderFrame=requestAnimationFrame(frame);
   window.controlTimer=setInterval(()=>{
    const elapsed=performance.now()-start,w=window.w,e=window.displayed?.enemies[0]??w.enemies[0];
    if(elapsed>1700){clearInterval(window.controlTimer);window.controlStopped=true;return;}
    const dx=e.pos.x-w.player.pos.x,dz=e.pos.z-w.player.pos.z,travel=Math.hypot(dx,dz)/70;
    const input={...window.idleInput(),fire:elapsed<1300,yaw:Math.atan2(-(dx+e.vel.x*travel),-dz),pitch:Math.atan2(e.pos.y-w.player.pos.y,Math.hypot(dx,dz))};
    window.s.predict(w,input);w.effects=[];
   },1000/120);
  });
  await guest.waitForFunction(()=>window.controlStopped&&window.s.diagnostics.pendingInputs===0&&window.s.localFlight.size===0,{}, {timeout:15000});
  const local=await guest.evaluate(()=>({hits:[...window.hits],messages:window.contactKeys.size,network:window.s.diagnostics}));assert.ok(local.hits.length>0,'moving target must receive local contacts');
  await host.waitForFunction(keys=>keys.every(k=>window.hits.has(k)),local.hits.map(([key])=>key),{timeout:6000});
  const confirmed=await host.evaluate(()=>({hits:[...window.hits],stats:{...window.s.world.stats},maxHistoricalDistance:Math.max(0,...window.hitErrors)}));
  assert.deepEqual(confirmed.hits.map(([key])=>key).sort(),local.hits.map(([key])=>key).sort(),'every visible contact counts once, with no extra host-trajectory hits');
  assert.equal(confirmed.stats.hits,local.hits.length,'duplicate reliable reports must not apply extra damage');
  const remoteTimes=new Map(confirmed.hits),latencies=local.hits.map(([key,at])=>remoteTimes.get(key)-at).sort((a,b)=>a-b);
  if(delay)assert.ok(confirmed.maxHistoricalDistance>.6,'host target must actually have moved outside its original hitbox');
  report.push({addedRTT:delay*2,inputLoss:delay?'20% plus reordering':'none',localHits:local.hits.length,confirmedHits:confirmed.stats.hits,medianContactToHostMs:latencies[Math.floor(latencies.length/2)],maxHistoricalDistance:confirmed.maxHistoricalDistance,contactMessages:local.messages});
  await host.evaluate(()=>clearInterval(window.hostTimer));await guest.evaluate(()=>cancelAnimationFrame(window.renderFrame));
 }
 assert.deepEqual(errors,[]);await mkdir('artifacts',{recursive:true});await writeFile('artifacts/multiplayer-moving-target-audit.json',JSON.stringify(report,null,2));console.log('Moving-target WebRTC registration:',JSON.stringify(report));
 for(const page of [host,guest])await page.evaluate(()=>window.s.close());
}finally{await browser.close();}
