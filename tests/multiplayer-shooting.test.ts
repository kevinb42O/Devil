import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v,type Projectile,type Effect} from '../src/simulation';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {SnapshotTimeline} from '../src/network-presentation';
import {decodePacket} from '../src/network-codec';

function world(){const w=new World(42,{schedule:false});w.addCrew('host');w.addCrew('guest');w.selectCrew('guest');return w;}
function dagger(w:World,changes:Partial<Projectile>={}){const p:Projectile={id:-900,shotKey:'guest:1:0',pos:v(-2,3,0),vel:v(480,0,0),age:0,homing:false,level:1,...changes};w.projectiles.push(p);return p;}
function skull(w:World){const e=w.spawn('skull',v(0,3,0));e.age=3;w.effects=[];return e;}
function session(){const s=new FriendsSession('guest');s.running=true;s.localId='guest';(s as any).lastState=performance.now();return s;}

test('guest swept hits respond locally without changing enemy health, RNG, gems or authoritative stats',()=>{
 const w=world(),e=skull(w);dagger(w);const hp=e.hp,stats=structuredClone(w.stats),rng=w.captureCrewCheckpoint().rng;
 w.predictCrew('guest',idleInput());
 assert.equal(w.projectiles.length,0);assert.equal(e.hp,hp);assert.deepEqual(w.stats,stats);assert.equal(w.gems.length,0);assert.equal(w.captureCrewCheckpoint().rng,rng);
 const hit=w.effects.find(e=>e.kind==='hit')!;assert.ok(hit);assert.equal(hit.shotKey,`guest:1:0:hit:${e.id}`);assert.equal(w.effects.some(e=>e.kind==='kill'),false);
});

test('guest homing steers immediately and predicts absorption without spending host damage or scheduling explosions',()=>{
 const w=world(),e=skull(w);dagger(w,{pos:v(-5,3,4),vel:v(0,0,-42),homing:true,level:4});
 w.predictCrew('guest',idleInput());assert.ok(w.projectiles[0].vel.x>0);assert.equal(e.hp,1);
 const ghost=w.spawn('ghostpede',v(0,5,0));ghost.pos=v(0,5,0);ghost.age=20;ghost.activeAt=0;ghost.status='idle';ghost.segments=[];
 w.projectiles=[];dagger(w,{pos:v(0,5,0),vel:v(),homing:true,level:4});const stats=structuredClone(w.stats);
 w.predictCrew('guest',idleInput());assert.equal(w.projectiles.length,0);assert.ok(w.effects.some(e=>e.kind==='eat'));assert.deepEqual(w.stats,stats);assert.deepEqual(w.captureCrewCheckpoint().detonations,[]);
});

test('guest daggers bounce off the floor instead of flying underneath it',()=>{
 const w=world(),p=dagger(w,{pos:v(0,.3,0),vel:v(0,-60,0)});
 w.predictCrew('guest',idleInput());assert.ok(p.vel.y>0);assert.equal(p.floorBounces,1);assert.ok(p.pos.y>0);assert.ok(w.effects.some(e=>e.kind==='ricochet'&&e.shotKey==='guest:1:0:ricochet:1'));
});

test('acknowledged guest projectiles keep simulating locally while remote shots remain untouched',()=>{
 const w=world();skull(w);const own=dagger(w,{id:901}),remote=dagger(w,{id:902,shotKey:'host:1:0'}),before=structuredClone(remote);
 w.predictCrew('guest',idleInput());assert.equal(w.projectiles.includes(own),false);assert.deepEqual(remote,before);assert.deepEqual(w.projectiles,[remote]);
});

test('local contact prediction uses displayed targets without mutating or replacing authoritative enemies',()=>{
 const w=world(),e=skull(w);e.pos.x=10;const enemies=w.enemies,displayed=structuredClone(enemies);displayed[0].pos.x=0;dagger(w);
 w.predictCrew('guest',idleInput(),STEP,false,displayed);assert.ok(w.effects.some(e=>e.kind==='hit'));assert.equal(w.enemies,enemies);assert.equal(e.pos.x,10);assert.equal(displayed[0].hp,e.hp);
});

test('fire edges transmit before the network timer and keep numbered tap/release ordering',()=>{
 const s=session(),w=world(),packets:any[]=[];const link:any={pc:{close(){}},timer:0,input:{readyState:'open',bufferedAmount:0,send(data:ArrayBuffer){packets.push(decodePacket(new Uint8Array(data)));}}};s.links.set('guest',link);
 try{
  assert.ok(s.predict(w,{...idleInput(),fire:true}));assert.equal(packets.length,1);assert.equal(packets[0].runs[0][6],2);
  assert.ok(s.predict(w,idleInput()));assert.equal(packets.length,2);assert.deepEqual(packets[1].runs.map((r:number[])=>[r[0],r[6]]),[[1,2],[2,0]]);
 }finally{s.close();}
});

test('snapshot replay and delayed host confirmations play a predicted contact only once, while host kills still arrive',()=>{
 const host=new FriendsSession('host'),guest=session();host.world=world();host.running=true;const e=skull(host.world);dagger(host.world,{id:900});const snapshot=structuredClone(host.snapshot()!),w=world();applySnapshot(w,snapshot,'guest');
 const received:Effect[]=[];guest.onEffects=effects=>received.push(...effects);
 const channel:any={label:'state',readyState:'open',bufferedAmount:0,send(){}};const link:any={pc:{close(){}},state:channel,timer:0};guest.links.set('guest',link);(guest as any).bind('guest',link,channel);
 try{
  guest.predict(w,idleInput());assert.equal(w.effects.filter(e=>e.kind==='hit').length,1);w.effects=[];
  guest.reconcile(w,snapshot);guest.reconcile(w,snapshot);assert.equal(received.length,0);
  (host.world as any).updateProjectiles(STEP);assert.equal(e.hp,0);const events=host.world.effects.map((e,i)=>({...e,networkId:i+1}));
  channel.onmessage({data:JSON.stringify({type:'effects',epoch:0,events})});
  assert.equal(received.filter(e=>e.kind==='hit').length,0);assert.equal(received.filter(e=>e.kind==='kill').length,1);
  guest.reconcile(w,snapshot);assert.equal(received.filter(e=>e.kind==='hit').length,0);
 }finally{host.close();guest.close();}
});

test('presentation does not extrapolate already simulated acknowledged local daggers twice',()=>{
 const host=new FriendsSession('host');host.world=world();dagger(host.world,{id:900,pos:v(0,5,0),vel:v(0,0,-70)});
 try{const snapshot=structuredClone(host.snapshot()!),w=world();applySnapshot(w,snapshot,'guest');w.predictCrew('guest',idleInput());const timeline=new SnapshotTimeline();timeline.push(snapshot,1000);const view=timeline.view(w,'guest',1050,v());assert.deepEqual(view.projectiles[0],w.projectiles[0]);}finally{host.close();}
});

test('two guests may predict the same lethal contact, but the host kills and drops gems exactly once',()=>{
 const host=new FriendsSession('host');host.world=world();host.world.addCrew('other');const e=skull(host.world);
 dagger(host.world,{id:900});dagger(host.world,{id:901,shotKey:'other:1:0'});
 try{
  const snapshot=host.snapshot()!;
  for(const id of ['guest','other']){const local=world();applySnapshot(local,snapshot,id);local.predictCrew(id,idleInput());assert.equal(local.effects.filter(e=>e.kind==='hit').length,1);assert.equal(local.enemies[0].hp,1);assert.equal(local.stats.kills,0);assert.equal(local.gems.length,0);}
  (host.world as any).updateProjectiles(STEP);
  assert.equal(host.world.stats.hits,1);assert.equal(host.world.stats.kills,1);assert.equal(host.world.effects.filter(e=>e.kind==='kill').length,1);assert.equal(host.world.gems.length,e.gems);
  (host.world as any).updateProjectiles(STEP);assert.equal(host.world.stats.kills,1);assert.equal(host.world.gems.length,e.gems);
 }finally{host.close();}
});

test('both players damage the same durable enemy without one client overwriting another',()=>{
 const w=world(),e=skull(w);e.hp=10;dagger(w,{id:900});dagger(w,{id:901,shotKey:'other:1:0'});
 (w as any).updateProjectiles(STEP);assert.equal(e.hp,8);assert.equal(w.stats.hits,2);assert.equal(w.stats.kills,0);assert.equal(w.gems.length,0);
});
