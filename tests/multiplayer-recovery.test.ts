import test from 'node:test';
import assert from 'node:assert/strict';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {World,idleInput,STEP} from '../src/simulation';
import {InputPacer,InputHistory,inputRuns} from '../src/network-input';
import {CrewClock} from '../src/crew-clock';
import {encodePacket,decodePacket} from '../src/network-codec';
import {encodeState,decodeState,snapshotBaseline,fragmentState,StateAssembler} from '../src/network-state';
import {packIds,unpackIds,packPositions,unpackPositions} from '../src/network-packed';
const setup=()=>{const s=new FriendsSession('host');s.running=true;s.world=new World(42,{schedule:false});s.world.addCrew('host');s.world.addCrew('guest');s.world.selectCrew('host');return s;};
const link=()=>({pc:{close(){}},state:{readyState:'open',bufferedAmount:0,send(){}},timer:0} as any);
test('excess guest backlog drains during continuous input without skipping command numbers',()=>{
 // Queue recovery is simulated synchronously; CPU load must not trigger the
 // separate wall-clock disconnect/stall policy during this fixture.
 const originalPerformance=globalThis.performance;globalThis.performance={now:()=>1000} as Performance;
 const host=setup(),guest=new FriendsSession('guest');try{
  host.links.set('guest',link());guest.localId='guest';guest.running=true;(guest as any).lastState=performance.now();const world=new World(1);applySnapshot(world,host.snapshot()!,'guest');
  const history:InputHistory=(guest as any).history;
  for(let i=0;i<60;i++){history.record(idleInput());world.predictCrew('guest',idleInput());}
  const deliver=()=> (host as any).receiveCommands('guest',encodePacket({epoch:0,life:0,runs:inputRuns(history.commands)}).buffer);
  deliver();guest.reconcile(world,host.snapshot()!);
  let accepted=60;
  for(let i=0;i<360;i++){
   if(guest.predict(world,idleInput()))accepted++;deliver();host.step(idleInput());world.effects=[];host.world!.effects=[];
   if(i%6===5)guest.reconcile(world,host.snapshot()!);
  }
  const snapshot=host.snapshot()!;assert.ok((snapshot.crew[1].queuedInputs??0)<=6);assert.ok(snapshot.crew[1].ack>=350);assert.equal(snapshot.crew[1].ack+(snapshot.crew[1].queuedInputs??0),accepted);
 }finally{host.close();guest.close();globalThis.performance=originalPerformance;}
});
test('pacing keeps full normal rate and skipped prediction does not consume a tap',()=>{
 const pacer=new InputPacer();pacer.update(6);for(let i=0;i<30;i++)assert.equal(pacer.next(),true);
 const host=setup(),guest=new FriendsSession('guest');try{
  guest.running=true;guest.localId='guest';(guest as any).lastState=performance.now();const snapshot=host.snapshot()!;snapshot.crew[1].queuedInputs=60;const w=new World(1);guest.reconcile(w,snapshot);
  const edges=[true,false];let attempts=0;
  while(edges.length&&attempts++<10){if(guest.predict(w,{...idleInput(),fire:edges[0]}))edges.shift();}
  assert.equal(edges.length,0);assert.equal((guest as any).history.commands.length,2);assert.equal(w.stats.shots,10);assert.equal(w.projectiles.length,10);
 }finally{host.close();guest.close();}
});
test('focus release and command timeout preserve processed aim when completing a burst',()=>{
 for(const release of [true,false]){
  const host=setup();try{
   const channel:any={label:'state',readyState:'open',bufferedAmount:0,send(){}};const l=link();l.state=channel;host.links.set('guest',l);(host as any).bind('guest',l,channel);
   (host as any).receiveCommands('guest',encodePacket({epoch:0,runs:[[1,1,0,0,Math.PI/2,-.2,2]]}).buffer);host.step(idleInput());
   if(release)channel.onmessage({data:JSON.stringify({type:'release',epoch:0,seq:1})});else host.inputTimes.set('guest',-Infinity);
   host.step(idleInput());assert.equal(host.world!.crew[1].input.yaw,Math.PI/2);assert.equal(host.world!.crew[1].input.pitch,-.2);assert.equal(host.world!.stats.shots,10);
   const velocity=host.world!.projectiles.reduce((sum,p)=>sum+p.vel.x,0)/10;assert.ok(velocity< -60,'release burst retains sideways aim');
  }finally{host.close();}
 }
});
test('fresh packets with a stopped authoritative tick stall prediction, then recover on progress',()=>{
 const original=globalThis.performance;let now=2000;globalThis.performance={now:()=>now} as Performance;
 const host=setup(),guest=new FriendsSession('guest');try{
  guest.localId='guest';const l:any={assembler:new StateAssembler(),baselines:new Map()};const w=new World(1);guest.onSnapshot=s=>guest.reconcile(w,s);
  const deliver=(frame:number)=>{for(const packet of fragmentState(encodeState(host.snapshot()!,frame,0),frame))(guest as any).receiveState(l,packet);};
  deliver(1);assert.equal(guest.predict(w,idleInput()),true);now+=600;deliver(2);assert.equal(guest.diagnostics.snapshotAgeMs,0);assert.equal(guest.hostStalled,true);assert.equal(guest.predict(w,idleInput()),false);
  host.world!.tick++;host.world!.time+=STEP;deliver(3);assert.equal(guest.hostStalled,false);assert.equal(guest.predict(w,idleInput()),true);
  host.world!.state='dead';deliver(4);now+=1000;deliver(5);assert.equal(guest.hostStalled,false,'completed runs do not count as stalled simulation');
 }finally{host.close();guest.close();globalThis.performance=original;}
});
test('render and worker wake-ups share exactly one bounded fixed-step clock',()=>{
 const clock=new CrewClock();let ticks=0;const step=()=>ticks++;
 clock.advance(0,step);for(let i=1;i<=120;i++){clock.advance(i*1000/120,step);clock.advance(i*1000/120-2,step);clock.advance(i*1000/120,step);}assert.equal(ticks,120);
 clock.advance(6000,step);assert.equal(ticks,150,'long suspensions cannot cause unbounded work');assert.ok(clock.alpha<=1);clock.reset();clock.advance(7000,step);assert.equal(ticks,150);
});
test('packed identities and presentation poses support removals, unsorted IDs and far coordinates',()=>{
 const ids=[2,50,4,2000000];assert.deepEqual(unpackIds(packIds(ids)),ids);assert.throws(()=>unpackIds(new Uint8Array([128])));assert.throws(()=>unpackIds(packIds([2,2])));
 const source=[{x:-63.9,y:2.123456,z:63.9},{x:10000,y:-10000,z:-64}];const bytes=packPositions(source),decoded=unpackPositions(bytes,2);
 for(let i=0;i<source.length;i++)for(const axis of ['x','y','z'] as const)assert.ok(Math.abs(source[i][axis]-decoded[i][axis])<=1/1024);
 assert.throws(()=>unpackPositions(bytes.slice(0,-1),2));assert.throws(()=>unpackPositions(new Uint8Array([...bytes,0]),2));assert.deepEqual((decodePacket(encodePacket({bytes})) as any).bytes,bytes);
});
test('seeded shots reproduce surviving daggers and use explicit corrections for altered flight',()=>{
 const host=setup();try{
  const w=host.world!;w.crew[1].level=4;w.stepCrew(new Map([['guest',{...idleInput(),yaw:.7,pitch:.3,fire:true}]]));w.stepCrew(new Map([['guest',{...idleInput(),yaw:.7,pitch:.3}]]));
  // A removed dagger never reappears when reconstructing the rest of its burst.
  w.projectiles.splice(7,1);w.projectiles[0].pos.x+=1;
  const snapshot=host.snapshot()!,bytes=encodeState(snapshot,1,0),wire=decodePacket(bytes) as any,decoded=decodeState(bytes,new Map())!.snapshot;
  assert.equal(wire.flight.shots.length,1);assert.equal(wire.flight.updates.length,1);assert.equal(decoded.projectiles.length,59);
  for(let i=0;i<59;i++){const a=snapshot.projectiles[i],b=decoded.projectiles[i];assert.equal(b.shotKey,a.shotKey);assert.ok(Math.hypot(a.pos.x-b.pos.x,a.pos.y-b.pos.y,a.pos.z-b.pos.z)<.00001);assert.ok(Math.hypot(a.vel.x-b.vel.x,a.vel.y-b.vel.y,a.vel.z-b.vel.z)<.00001);}
  const bad=structuredClone(wire);bad.flight.shots[0][6][1]=60;assert.throws(()=>decodeState(encodePacket(bad),new Map()));
 }finally{host.close();}
});
test('moving enemies delta changing velocity, phase, damage and rig data without mutating baselines',()=>{
 const host=setup();try{
  const e=host.world!.spawn('centipede',{x:1,y:3,z:2});e.age=2;
  const first=host.snapshot()!,sender=snapshotBaseline(first),receiver=snapshotBaseline(decodeState(encodeState(first,1,0),new Map())!.snapshot),before=structuredClone(receiver);
  host.world!.time=.05;e.pos.x+=.12345;e.age+=.05;e.vel.x=3;e.phase+=.2;e.hp--;e.segments[0].hp--;e.segments[1].pos.z+=.3;
  const second=host.snapshot()!,wire=decodePacket(encodeState(second,2,1,sender)) as any;assert.equal(wire.body.enemies[0].length,5);
  const decoded=decodeState(encodePacket(wire),new Map([[1,receiver]]))!.snapshot.enemies[0];assert.equal(decoded.hp,e.hp);assert.equal(decoded.vel.x,3);assert.ok(Math.abs(decoded.phase-e.phase)<=1/2048);assert.ok(Math.abs(decoded.pos.x-e.pos.x)<=1/1024);assert.equal(decoded.segments[0].hp,e.segments[0].hp);assert.deepEqual(receiver,before);
 }finally{host.close();}
});
test('quantized enemy residuals remain bounded through repeated acknowledged updates',()=>{
 const host=setup();try{
  const e=host.world!.spawn('skull',{x:1.2345,y:3.1234,z:2.2345});e.age=2;
  let sender=snapshotBaseline(host.snapshot()!),receiver=snapshotBaseline(decodeState(encodeState(host.snapshot()!,1,0),new Map())!.snapshot);
  for(let frame=2;frame<=120;frame++){
   host.world!.time+=.05;e.age+=.05;e.pos.x+=.0073;e.pos.z-=.0017;e.vel.x+=.017;e.vel.z-=.012;e.phase+=.015;e.facingYaw+=.0023;
   const current=host.snapshot()!,snapshot=decodeState(encodeState(current,frame,frame-1,sender),new Map([[frame-1,receiver]]))!.snapshot,p=snapshot.enemies[0];
   assert.ok(Math.abs(p.pos.x-e.pos.x)<=1/1024);assert.ok(Math.abs(p.pos.z-e.pos.z)<=1/1024);assert.ok(Math.abs(p.vel.x-e.vel.x)<=1/1024+.000001);assert.ok(Math.abs(p.phase-e.phase)<=1/2048+.000001);
   sender=snapshotBaseline(current);receiver=snapshotBaseline(snapshot);
  }
 }finally{host.close();}
});
