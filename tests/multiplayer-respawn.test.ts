import test from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,TUNING,idleInput,v,CREW_RESPAWN_DELAY,CREW_RESPAWN_PROTECTION} from '../src/simulation';
import {floorHeight} from '../src/arena';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {encodePacket} from '../src/network-codec';
import {encodeState,decodeState} from '../src/network-state';
import {SnapshotTimeline} from '../src/network-presentation';
const world=()=>{const w=new World(1,{schedule:false});for(const id of ['host','a','b'])w.addCrew(id);return w;};
const kill=(w:World,id:string)=>{w.crew.find(p=>p.id===id)!.player.pos=v(80,-10,80);w.stepCrew(new Map());};
const stepTo=(w:World,time:number)=>{while(w.time+STEP<time-1e-8){assert.equal(w.state,'playing','world died while advancing to deadline');w.stepCrew(new Map());}w.stepCrew(new Map(),time-w.time);};
test('revives at 15 seconds beside the nearest survivor, facing them, with progression intact',()=>{
 const w=world(),p=w.crew[1];p.level=3;p.reserve=12;p.shotSequence=51;
 kill(w,'a');const due=p.respawnAt!;assert.equal(due,w.time+CREW_RESPAWN_DELAY);
 w.crew[2].player.pos=v(10,TUNING.eyeHeight,10);w.crew[2].input.yaw=.8;
 stepTo(w,due-STEP);assert.equal(p.alive,false);
 w.stepCrew(new Map([['b',{...idleInput(),yaw:.8,pitch:.3}]]));assert.equal(p.alive,true);
 assert.equal(p.life,1);assert.equal(p.respawnAt,null);assert.equal(p.cause,'');assert.equal(p.level,3);assert.equal(p.reserve,12);assert.equal(p.shotSequence,51);
 assert.equal(p.input.yaw,.8);assert.equal(p.input.pitch,.3);assert.deepEqual(p.player.vel,v());assert.equal(p.input.fire,false);
 assert.ok(Math.hypot(p.player.pos.x-w.crew[2].player.pos.x,p.player.pos.z-w.crew[2].player.pos.z)<=2.4);
 assert.equal(p.player.pos.y,floorHeight(p.player.pos.x,p.player.pos.z,w.time)+TUNING.eyeHeight);
 assert.equal(CREW_RESPAWN_PROTECTION,3);assert.equal(p.protectedUntil,w.time+3);
});
test('independent deadlines and repeated deaths get a full new timer',()=>{
 const w=world();kill(w,'a');const first=w.crew[1].respawnAt!;stepTo(w,w.time+2);kill(w,'b');const second=w.crew[2].respawnAt!;
 stepTo(w,first);assert.equal(w.crew[1].alive,true);assert.equal(w.crew[2].alive,false);
 stepTo(w,second);assert.equal(w.crew[2].alive,true);assert.equal(w.crew[1].alive,true);
 stepTo(w,w.crew[1].protectedUntil);kill(w,'a');assert.equal(w.crew[1].respawnAt,w.time+15);assert.equal(w.crew[1].alive,false);
});
test('team wipe on the deadline wins over pending respawns',()=>{
 const w=world();kill(w,'a');kill(w,'b');w.time=w.crew[1].respawnAt!-STEP;kill(w,'host');assert.equal(w.state,'dead');assert.ok(w.crew.every(p=>!p.alive));w.stepCrew(new Map());assert.equal(w.crew[1].life,0);
});
test('simultaneous revivals use original survivors and do not refill reserve',()=>{
 const w=world();w.crew[1].player.pos=v(80,-10,80);w.crew[2].player.pos=v(-80,-10,-80);w.stepCrew(new Map());w.crew[1].reserve=9;w.crew[2].reserve=3;
 stepTo(w,w.crew[1].respawnAt!);assert.ok(w.crew.every(p=>p.alive));assert.deepEqual(w.crew.map(p=>p.reserve),[0,9,3]);
});
test('respawn blocks enemy contact for all three seconds and expires at its deadline',()=>{
 const w=world();kill(w,'a');stepTo(w,w.crew[1].respawnAt!);const p=w.crew[1];w.crew[0].player.pos=v(-10,TUNING.eyeHeight,-10);w.crew[2].player.pos=v(-15,TUNING.eyeHeight,-10);
 const until=p.protectedUntil;
 for(const time of [until-3+STEP,until-2,until-1,until-STEP]){
  w.time=time-STEP;const e=w.spawn('skull',{...p.player.pos});e.age=2;
  w.stepCrew(new Map());assert.equal(p.alive,true);assert.equal(p.respawnAt,null);w.enemies=[];
 }
 w.time=until;const e=w.spawn('skull',{...p.player.pos});e.age=2;
 w.stepCrew(new Map());assert.equal(p.alive,false);assert.equal(p.respawnAt,w.time+CREW_RESPAWN_DELAY);
});
test('respawn protection also blocks abyss deaths until the three-second deadline',()=>{
 const w=world();kill(w,'a');stepTo(w,w.crew[1].respawnAt!);const p=w.crew[1],until=p.protectedUntil;
 for(const time of [until-3+STEP,until-2,until-1,until-STEP]){
  w.time=time-STEP;w.effects=[];kill(w,'a');
  assert.equal(p.alive,true);assert.equal(p.cause,'');assert.equal(p.respawnAt,null);assert.ok(!w.effects.some(e=>e.kind==='death'));
 }
 w.time=until;kill(w,'a');assert.equal(p.alive,false);assert.equal(p.cause,'FALLEN');
});
test('respawn protection permits movement and firing, and is carried in network snapshots',()=>{
 const host=new FriendsSession('host');try{
  host.start();host.world=world();const w=host.world;kill(w,'a');stepTo(w,w.crew[1].respawnAt!);const p=w.crew[1],before={...p.player.pos};
  for(let i=0;i<30;i++)w.stepCrew(new Map([['a',{...idleInput(),forward:1,fire:true}]]));
  assert.equal(p.alive,true);assert.ok(w.time<p.protectedUntil);assert.ok(Math.hypot(p.player.pos.x-before.x,p.player.pos.z-before.z)>.5);assert.ok(w.stats.shots>0);
  const snapshot=decodeState(encodeState(host.snapshot()!,1,0),new Map())!.snapshot;
  const view=new World(1);applySnapshot(view,snapshot,'a');assert.equal(view.crew[1].protectedUntil,p.protectedUntil);assert.ok(view.time<view.crew[1].protectedUntil);
 }finally{host.close();}
});
test('unsafe falling survivors delay revival, then use valid ground without another countdown',()=>{
 const w=world();kill(w,'a');w.crew[2].alive=false;w.crew[2].cause='DISCONNECTED';w.time=w.crew[1].respawnAt!-STEP;
 w.crew[0].player.pos=v(80,-4,80);w.stepCrew(new Map());assert.equal(w.crew[1].alive,false);assert.equal(w.state,'playing');
 w.crew[0].player.pos=v(0,TUNING.eyeHeight+2,0);w.stepCrew(new Map());assert.equal(w.crew[1].alive,true);assert.equal(w.crew[2].alive,false);assert.equal(w.crew[1].player.grounded,true);
});
test('shrinking edge placement stays on valid ground',()=>{
 const w=world();kill(w,'a');w.time=600;w.crew[0].player.pos=v(17,floorHeight(17,0,600)+TUNING.eyeHeight,0);w.crew[2].alive=false;w.crew[2].cause='DISCONNECTED';
 w.stepCrew(new Map());const p=w.crew[1];assert.equal(p.alive,true);assert.ok(floorHeight(p.player.pos.x,p.player.pos.z,w.time,0)>-8);
});
test('snapshots round-trip respawn state and reset prediction on a new life',()=>{
 const host=new FriendsSession('host'),guest=new FriendsSession('guest');try{
 host.start();host.world=world();kill(host.world,'a');guest.localId='a';const snapshot=decodeState(encodeState(host.snapshot()!,1,0),new Map())!.snapshot;
 const view=new World(1);applySnapshot(view,snapshot,'a');assert.equal(view.crew[1].respawnAt,host.world.crew[1].respawnAt);
 (guest as any).history.record({...idleInput(),fire:true});stepTo(host.world,host.world.crew[1].respawnAt!);guest.reconcile(view,host.snapshot()!);
 assert.equal(view.crew[1].life,1);assert.equal(view.crew[1].alive,true);assert.equal(guest.diagnostics.pendingInputs,0);assert.equal(view.stats.shots,0);assert.equal((guest as any).history.lastSequence,0);
 }finally{host.close();guest.close();}
});
test('delayed commands from an old life are rejected and fresh commands start at one',()=>{
 const host=new FriendsSession('host');try{
 host.start();host.world=world();const receive=(life:number)=> (host as any).receiveCommands('a',encodePacket({epoch:host.epoch,life,runs:[[1,1,1,0,0,0,2]]}).buffer);
 receive(0);assert.equal((host as any).commands.get('a').size,1);kill(host.world,'a');(host as any).commands.delete('a');receive(0);assert.equal((host as any).commands.has('a'),false);
 stepTo(host.world,host.world.crew[1].respawnAt!);receive(0);assert.equal((host as any).commands.has('a'),false);receive(1);assert.equal((host as any).commands.get('a').next().seq,1);
 }finally{host.close();}
});
test('remote revival snaps presentation instead of interpolating from the corpse',()=>{
 const host=new FriendsSession('host');try{
 host.start();host.world=world();kill(host.world,'a');const before=structuredClone(host.snapshot()!);stepTo(host.world,host.world.crew[1].respawnAt!);const after=structuredClone(host.snapshot()!);
 const timeline=new SnapshotTimeline();timeline.push(before,0);timeline.push(after,50);const w=new World(1);applySnapshot(w,after,'host');const presented=timeline.view(w,'host',50,v());assert.deepEqual(presented.crew[1].player.pos,after.crew[1].player.pos);
 }finally{host.close();}
});
test('host simulation clears command queues on death and again on revival',()=>{
 const host=new FriendsSession('host');try{
 host.start();host.startAt=0;host.world=world();
 (host as any).commands.set('a',{size:1});host.inputs.set('a',{...idleInput(),fire:true});host.world.crew[1].player.pos=v(80,-10,80);
 host.step(idleInput());assert.equal(host.world.crew[1].alive,false);assert.equal((host as any).commands.has('a'),false);assert.equal(host.inputs.has('a'),false);
 host.world.time=host.world.crew[1].respawnAt!-STEP;(host as any).commands.set('a',{size:1});host.inputs.set('a',{...idleInput(),fire:true});host.step({...idleInput(),yaw:.7,pitch:.4});
 assert.equal(host.world.crew[1].alive,true);assert.equal((host as any).commands.has('a'),false);assert.equal(host.inputs.has('a'),false);assert.equal(host.world.crew[1].input.yaw,.7);assert.equal(host.world.crew[1].input.fire,false);
 }finally{host.close();}
});
test('nearest unsafe teammate is skipped in favor of another survivor',()=>{
 const w=world();kill(w,'a');w.time=w.crew[1].respawnAt!-STEP;w.crew[2].player.pos=v(80,-4,80);w.stepCrew(new Map());
 assert.equal(w.crew[1].alive,true);assert.ok(Math.hypot(w.crew[1].player.pos.x-w.crew[0].player.pos.x,w.crew[1].player.pos.z-w.crew[0].player.pos.z)<=2.4);
});
test('dropping a dead connection cancels its scheduled revival',()=>{
 const host=new FriendsSession('host');try{
 host.start();host.world=world();kill(host.world,'a');
 host.links.set('a',{pc:{close(){}},timer:setTimeout(()=>{},10000)} as any);(host as any).drop('a');assert.equal(host.world.crew[1].respawnAt,null);assert.equal(host.world.crew[1].cause,'DISCONNECTED');stepTo(host.world,host.world.time+16);assert.equal(host.world.crew[1].alive,false);
 }finally{host.close();}
});
