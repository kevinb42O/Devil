import test from 'node:test';
import assert from 'node:assert/strict';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {World,idleInput} from '../src/simulation';
import {encodePacket} from '../src/network-codec';
import {encodeState,decodeState,StateAssembler} from '../src/network-state';
import {SnapshotTimeline} from '../src/network-presentation';

function setup(){
 const host=new FriendsSession('host');
 host.links.set('guest',{pc:{close(){}},state:{readyState:'open',bufferedAmount:0,send(){}},timer:0,events:[],baselines:new Map(),ackFrame:0,sentEpoch:-1,tokens:262144,tokenAt:performance.now(),lastSend:0,sendInterval:50,assembler:new StateAssembler()} as any);
 host.members.push({id:'guest',name:'Guest',host:false,ready:false});return host;
}
test('ready gate and host launch precede the shared courtyard',()=>{
 const host=setup();try{
  for(let i=0;i<120;i++)host.step({...idleInput(),forward:1,fire:true});
  assert.equal(host.world!.tick,0);assert.equal(host.running,false);assert.equal(host.prelobby,false);
  assert.throws(()=>host.enterPrelobby(),/Every player/);host.setReady(true);assert.throws(()=>host.enterPrelobby(),/Every player/);
  host.members[1].ready=true;host.enterPrelobby();assert.equal(host.prelobby,true);assert.equal(host.running,false);
  const snapshot=decodeState(encodeState(host.snapshot()!,1,0),new Map())!.snapshot;
  assert.equal(snapshot.prelobby,true);assert.equal(snapshot.time,0);assert.equal(snapshot.crew.length,2);
  for(const p of snapshot.crew)assert.ok(Math.abs(p.player.pos.x)<1.1&&p.player.pos.z===0);
  host.step({...idleInput(),fire:true,homing:true});assert.equal(host.world!.time,0);assert.equal(host.world!.stats.shots,0);
 }finally{host.close();}
});
for(const entrant of ['host','guest'])test(`${entrant} crossing starts one shared arena epoch and clears courtyard controls`,()=>{
 const host=setup();try{
  host.members.forEach(p=>p.ready=true);host.enterPrelobby();const courtyardEpoch=host.epoch;
  const packet=encodePacket({epoch:courtyardEpoch,life:0,runs:[[1,120,1,0,0,0,5]]});
  if(entrant==='guest')(host as any).receiveCommands('guest',packet.buffer);
  for(let i=0;i<120&&!host.running;i++)host.step(entrant==='host'?{...idleInput(),forward:1,jump:true,fire:true}:idleInput());
  assert.equal(host.running,true);assert.equal(host.prelobby,false);assert.equal(host.epoch,courtyardEpoch+1);
  assert.equal(host.world!.time,0);assert.equal(host.world!.stats.shots,0);assert.equal(host.world!.enemies.length,0);assert.ok(host.startAt>Date.now());
  (host as any).receiveCommands('guest',packet.buffer);assert.equal(host.snapshot()!.crew[1].queuedInputs,undefined,'old commands cannot leak into the arena');
  host.start(true);assert.equal(host.epoch,courtyardEpoch+1,'duplicate crossing cannot reset the run');
  host.returnToLobby();assert.equal(host.prelobby,false);assert.equal(host.running,false);assert.ok(host.members.every(p=>!p.ready));
  assert.throws(()=>host.enterPrelobby(),/Every player/);
 }finally{host.close();}
});
test('courtyard guests predict movement without combat or advancing survival',()=>{
 const host=setup(),guest=new FriendsSession('guest');try{
  host.members.forEach(p=>p.ready=true);host.enterPrelobby();guest.prelobby=true;guest.localId='guest';(guest as any).lastState=performance.now();
  const world=new World(1);guest.reconcile(world,host.snapshot()!);const x=world.player.pos.x;
  for(let i=0;i<24;i++)assert.ok(guest.predict(world,{...idleInput(),strafe:1,fire:true,homing:true}));
  assert.ok(world.player.pos.x>x+.5);assert.equal(world.time,0);assert.equal(world.stats.shots,0);assert.equal(world.projectiles.length,0);
 }finally{host.close();guest.close();}
});
test('remote courtyard movement interpolates by tick while survival stays frozen',()=>{
 const host=setup();try{
  host.members.forEach(p=>p.ready=true);host.enterPrelobby();const first=host.snapshot()!;first.tick=0;
  const second=structuredClone(first);second.tick=12;second.crew[1].player.pos.x+=2;
  const world=new World(1);applySnapshot(world,second,'host');const timeline=new SnapshotTimeline();timeline.push(first,0);timeline.push(second,100);
  const view=timeline.view(world,'host',100,{x:0,y:0,z:0});assert.equal(view.time,0);
  assert.ok(view.crew[1].player.pos.x>first.crew[1].player.pos.x&&view.crew[1].player.pos.x<second.crew[1].player.pos.x);
  assert.equal(view.tick,12);
 }finally{host.close();}
});
