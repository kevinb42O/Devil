import test from 'node:test';
import assert from 'node:assert/strict';
import {FriendsSession,applySnapshot,validPeerId} from '../src/multiplayer';
import {World,idleInput} from '../src/simulation';
import {encodeState,decodeState,snapshotBaseline,fragmentState,StateAssembler,stateAssemblyTimeout} from '../src/network-state';
import {encodePacket,NETWORK_PROTOCOL_VERSION} from '../src/network-codec';
import {decodeEffects} from '../src/network-effects';
import {canonicalPosition} from '../src/network-packed';
const setup=()=>{const s=new FriendsSession('host');s.running=true;s.world=new World(42,{schedule:false});s.world.addCrew('host');s.world.addCrew('guest');s.world.selectCrew('host');return s;};
function transport(host:FriendsSession){
 const controls:string[]=[],packets:ArrayBuffer[]=[];
 const state={readyState:'open',bufferedAmount:0,send(data:unknown){if(typeof data==='string')controls.push(data);else packets.push(data as ArrayBuffer);}};
 const updates={readyState:'open',bufferedAmount:0,send(data:ArrayBuffer){packets.push(data);updates.bufferedAmount+=data.byteLength;}};
 const link:any={pc:{connectionState:'connected',close(){}},state,updates,timer:0,events:[],baselines:new Map(),ackFrame:0,sentEpoch:host.epoch,tokens:262144,tokenAt:performance.now(),lastSend:0,sendInterval:50,assembler:new StateAssembler()};
 host.links.set('guest',link);return {link,controls,packets};
}
test('recovery preserves physical primary/homing hold timing, shot count and jump edges',()=>{
 for(const button of ['fire','homing'] as const)for(const duration of [1,16,20,120]){
  const results=[];
  for(const queue of [0,60,120]){
   const host=setup(),guest=new FriendsSession('guest');try{
    host.world!.crew[1].level=4;host.world!.crew[1].reserve=200;guest.localId='guest';guest.running=true;(guest as any).lastState=performance.now();
    const s=host.snapshot()!;s.crew[1].queuedInputs=queue;const w=new World(1);guest.reconcile(w,s);
    for(let i=0;i<duration;i++)assert.equal(guest.predict(w,{...idleInput(),[button]:true}),true);
    assert.equal(guest.predict(w,idleInput()),true,'release is never paced');
    assert.equal(guest.predict(w,{...idleInput(),jump:true}),true,'jump press is never paced');
    assert.equal(guest.predict(w,idleInput()),true,'jump release is never paced');
    const commands=(guest as any).history.commands;assert.equal(commands.length,duration+3);
    results.push({shots:w.stats.shots,reserve:w.reserve,burst:w.effects.filter(e=>e.kind==='burst').length,held:w.crew[1].primary.held});
    // Run exactly the recorded commands on the authoritative controller too.
    for(const c of commands)host.world!.stepCrew(new Map([['guest',c.input]]));assert.equal(host.world!.stats.shots,w.stats.shots);assert.equal(host.world!.crew[1].reserve,w.reserve);
   }finally{host.close();guest.close();}
  }
  assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
 }
});
test('rounding-boundary baselines stay identical across 120 updates, keyframes, loss and far poses',()=>{
 const host=setup();try{
  const e=host.world!.spawn('skull',{x:1.00097655,y:3,z:-1.00097655});e.age=2;
  let current=host.snapshot()!,decoded=decodeState(encodeState(current,1,0),new Map())!,sender=snapshotBaseline(current),receiver=snapshotBaseline(decoded.snapshot);
  assert.deepEqual(sender.enemies.get(e.id)![2].slice(0,3),receiver.enemies.get(e.id)![2].slice(0,3));
  let ack=1;
  for(let frame=2;frame<=121;frame++){
   host.world!.time+=.05;e.age+=.05;e.pos.x=1+frame/512+1/1024-1e-8;e.pos.z=-e.pos.x;
   if(frame===60)e.pos.y=10000.00097655;if(frame===70)e.pos.y=3.00097655;
   current=host.snapshot()!;const keyframe=frame%25===0,wire=encodeState(current,frame,keyframe?0:ack,keyframe?undefined:sender);
   if(frame%11===0)continue; // Lost snapshots never become acknowledged baselines.
   decoded=decodeState(wire,new Map([[ack,receiver]]))!;const p=decoded.snapshot.enemies[0],expected=canonicalPosition(e.pos);
   assert.deepEqual(p.pos,expected);assert.ok(Math.abs(p.pos.x-e.pos.x)<=1/1024);
   sender=snapshotBaseline(current);receiver=snapshotBaseline(decoded.snapshot);assert.deepEqual(sender.enemies.get(e.id)![2].slice(0,3),receiver.enemies.get(e.id)![2].slice(0,3));ack=frame;
  }
 }finally{host.close();}
});
for(const [count,pumpMs]of [[2400,25],[6000,25],[6000,100]])test(`${count}-projectile/${pumpMs}ms-pump playing snapshots obey the budget and assemble after more than 300 ms`,()=>{
 const original=globalThis.performance;let now=2000;globalThis.performance={now:()=>now} as Performance;
 const host=setup();try{
  host.world!.projectiles=Array.from({length:count},(_,i)=>({id:i+1,pos:{x:1,y:2,z:3},vel:{x:0,y:0,z:-42},age:.1,homing:true}));
  const {link,packets}=transport(host);link.tokens=0;
  const size=fragmentState(encodeState(host.snapshot()!,1,0),1).reduce((n,p)=>n+p.byteLength,0);if(count===6000)assert.ok(size>262144);else assert.ok(size<262144);
  const assembler=new StateAssembler();let decoded:ReturnType<typeof decodeState>=null,total=0;
  host.broadcast();if(count===6000)assert.ok(link.transfer);assert.equal(packets.length,0);const at=now;
  for(let i=0;i<300&&!decoded;i++){
   now+=pumpMs;link.updates.bufferedAmount=0;(host as any).pumpNetwork();
   for(const packet of packets.splice(0)){total+=packet.byteLength;const bytes=assembler.push(packet,now);if(bytes)decoded=decodeState(bytes,new Map());}
   assert.ok(link.tokens>=0);assert.ok(total<=192000*(now-at)/1000+1,'every chunk is charged to the bandwidth budget');assert.ok(link.updates.bufferedAmount<=9000);
   if(!decoded)assert.equal(link.ackFrame,0,'unacknowledged candidates must never become delta bases');
  }
  assert.ok(decoded);assert.equal(decoded.snapshot.projectiles.length,count);assert.ok(now-at>300);assert.ok(now-at<(pumpMs===100?5000:3000));assert.ok(link.baselines.has(decoded.frame));
  link.state.label='state';(host as any).bind('guest',link,link.state);link.state.onmessage({data:JSON.stringify({type:'ack',epoch:host.epoch,frame:decoded.frame})});assert.equal(link.ackFrame,decoded.frame,'ACK is valid even before trailing parity finishes');
  now+=25;link.updates.bufferedAmount=0;(host as any).drainState(link,now);assert.equal(link.transfer?.frame===decoded.frame,false);
  assembler.accept(decoded.frame);assert.equal(assembler.pending,0);
  const partial=fragmentState(new Uint8Array(300000),1000)[0];assembler.push(partial,now);assembler.push(fragmentState(new Uint8Array([1]),1001)[0],now+stateAssemblyTimeout(300000)+1);assert.equal(assembler.pending,0);
 }finally{host.close();globalThis.performance=original;}
});
test('reliable effects flush independently of congestion, tokens and an unfinished frame',()=>{
 for(const blocked of ['queue','budget','transfer']){
  const host=setup();try{
   const {link,controls,packets}=transport(host);if(blocked==='queue')link.updates.bufferedAmount=9000;
   if(blocked==='budget')link.tokens=0;
   if(blocked==='transfer')link.transfer={frame:5,epoch:host.epoch,packets:fragmentState(new Uint8Array(300000),5),next:0,baseline:snapshotBaseline(host.snapshot()!),at:performance.now(),size:300000};
   (host as any).pendingEffects=[{kind:'death',pos:{x:0,y:0,z:0},networkId:1}];host.broadcast();
   assert.equal(controls.length,1);assert.equal(decodeEffects(JSON.parse(controls[0]))!.events[0].networkId,1);assert.equal(link.events.length,0);host.broadcast();assert.equal(controls.length,1);
   if(blocked==='queue')assert.equal(packets.length,0);
  }finally{host.close();}
 }
});
test('effect send failures retain events and new epochs establish lifecycle state first',()=>{
 const host=setup();try{
  const {link,controls,packets}=transport(host),send=link.state.send;link.state.send=()=>{throw Error('temporarily busy');};
  (host as any).pendingEffects=[{kind:'hit',pos:{x:0,y:0,z:0},networkId:1}];host.broadcast();assert.equal(link.events.length,1);
  link.state.send=send;host.broadcast();assert.equal(controls.length,1);assert.equal(link.events.length,0);
  host.epoch++;let failures=1;link.state.send=(data:unknown)=>{if(data instanceof ArrayBuffer&&failures-- >0)throw Error('lifecycle retry');send(data);};
  (host as any).pendingEffects=[{kind:'death',pos:{x:0,y:0,z:0},networkId:2}];host.broadcast();assert.equal(link.events.length,1);assert.equal(controls.length,1);
  host.broadcast();assert.equal(controls.length,2);assert.equal(decodeEffects(JSON.parse(controls[1]))!.epoch,host.epoch);assert.equal(decodeEffects(JSON.parse(controls[1]))!.events[0].networkId,2);assert.ok(packets.length>0);
 }finally{host.close();}
});
test('returning to the lobby cancels an unfinished lossy transfer',()=>{
 const host=setup();try{
  const {link}=transport(host);link.updates.bufferedAmount=9000;link.transfer={frame:5,epoch:host.epoch,packets:[],next:0,baseline:snapshotBaseline(host.snapshot()!),at:performance.now(),size:300000};
  host.returnToLobby();assert.equal(link.transfer,undefined);assert.equal(host.running,false);
 }finally{host.close();}
});
test('reserved/malformed peer identities are rejected at signaling, offers, parsing and commands',async()=>{
 const host=setup(),guest=new FriendsSession('guest');try{
  host.running=false;let offers=0;(host as any).offer=async()=>{offers++;return 'unexpected';};
  for(const id of ['host','HOST','__proto__','constructor','prototype','guest:1','', 'a'.repeat(65)]){
   assert.equal(validPeerId(id),false);await (host as any).signalMessage(JSON.stringify({type:'join',id,name:'Bad'}),'test');
   await assert.rejects(()=>guest.answer(JSON.stringify({version:NETWORK_PROTOCOL_VERSION,id,room:'ABC123',description:{type:'offer',sdp:''}})),/Invalid connection code/);
  }
  await (host as any).signalMessage('null','test');assert.equal(offers,0);assert.equal(host.members.length,1);assert.equal(host.links.size,0);
  const clean=new FriendsSession('host');try{await assert.rejects(()=>clean.offer('host'),/Invalid peer identity/);}finally{clean.close();}
  host.running=true;host.links.set('host',{pc:{close(){}},timer:0} as any);const before={...host.world!.player.pos};
  (host as any).receiveCommands('host',encodePacket({epoch:0,runs:[[1,1,1,0,0,0,0]]}).buffer);host.step(idleInput());assert.equal(host.world!.player.pos.z,before.z);assert.equal((host as any).commands.has('host'),false);
  assert.equal(validPeerId('guest-123_abc'),true);
 }finally{host.close();guest.close();}
});
test('connection status, prediction and waiting HUD share authoritative stall detection',()=>{
 const original=globalThis.performance;let now=2000;globalThis.performance={now:()=>now} as Performance;
 const host=setup(),guest=new FriendsSession('guest');try{
  guest.running=true;guest.localId='guest';(guest as any).lastState=now;(guest as any).hostPlaying=true;(guest as any).lastProgress=now-600;
  guest.links.set('guest',{...transport(host).link,rttMs:10,pongAt:now} as any);const w=new World(1);applySnapshot(w,host.snapshot()!,'guest');
  assert.equal(guest.hostStalled,true);assert.equal(guest.waitingForHost,true);assert.equal(guest.connection.state,'stalled');assert.equal(guest.predict(w,idleInput()),false);
  (guest as any).lastProgress=now;assert.equal(guest.waitingForHost,false);assert.equal(guest.connection.state,'connected');assert.equal(guest.predict(w,idleInput()),true);
  (guest as any).hostPlaying=false;(guest as any).lastProgress=now-1000;assert.equal(guest.hostStalled,false,'team wipe is not a simulation stall');
 }finally{host.close();guest.close();globalThis.performance=original;}
});
