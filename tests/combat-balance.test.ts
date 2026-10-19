import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {World,STEP,idleInput,v,TUNING,type Enemy} from '../src/simulation';
import {crystalToEnemy,enemyEmergenceScale,enemyRigScale,spiderCrystalRadius,towerCrystalRadius,CREATURE_SCALE_RATIO} from '../src/enemy-presentation';
import {towerFloorHeight,TOWER_FLOOR_CLEARANCE} from '../src/enemy-floor';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';
import {CrewReplayPlayer,unpackCrewReplay,crewCheckpointDigest} from '../src/crew-replay';
import {packEnemy,unpackEnemy,enemyDelta,applyEnemyDelta} from '../src/network-enemies';
import {planTowerMovement} from '../src/tower-movement';
import {sweepArmor} from '../src/projectile-collision';

const tiers=['squid','squid2','squid3'] as const;
const advance=(w:World,seconds:number)=>{for(let i=0;i<seconds/STEP;i++){w.step(idleInput());w.effects=[];}};
const flight=(w:World)=>(w as unknown as {updateProjectiles(dt:number):void}).updateProjectiles(STEP);
const wave=(w:World)=>(w as unknown as {updateUpgradePulses():void}).updateUpgradePulses();

test('new tower crowns stay reachable from the ground through their real entrance',()=>{
 for(const kind of tiers){
  const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawnAt(kind,0);e.nextSpawn=Infinity;
  advance(w,10);
  assert.ok(Math.abs(e.pos.y-towerFloorHeight(e,w.time)-TOWER_FLOOR_CLEARANCE)<1e-8);
  for(const p of e.weakpoints){
   const c=crystalToEnemy(e,w.player.pos,p.local);
   assert.ok(c.y<9,`${kind} crystal is not raised on top of the old floating root`);
   assert.ok(towerCrystalRadius(kind,true)*enemyEmergenceScale(e)>=TUNING.towerCrystalRadius-1e-9);
  }
 }
});

test('ground-level primary fire reaches and destroys every tower crystal',()=>{
 for(const kind of tiers){
  const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawn(kind,v());e.age=12;e.nextSpawn=Infinity;
  for(const p of e.weakpoints){
   const c=crystalToEnemy(e,w.player.pos,p.local),dx=c.x-e.pos.x,dz=c.z-e.pos.z,length=Math.hypot(dx,dz);
   w.player.pos=v(e.pos.x+dx/length*10,1.7,e.pos.z+dz/length*10);
   const x=c.x-w.player.pos.x,y=c.y-w.player.pos.y,z=c.z-w.player.pos.z;
   const input={...idleInput(),yaw:Math.atan2(-x,-z),pitch:Math.atan2(y,Math.hypot(x,z))};
   for(let tick=0;tick<360&&p.hp>0;tick++){w.tick++;if(tick%6===0)w.shoot(input,false,false);flight(w);}
   assert.equal(p.hp,0,`${kind} ground-origin daggers reach its visible crystal`);
   w.projectiles=[];
  }
  assert.equal(e.hp,0);
 }
});

test('hand-II ground pulses retain damage against all grounded tower tiers',()=>{
 for(const kind of tiers){
  const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawnAt(kind,0);e.nextSpawn=Infinity;advance(w,10);
  e.pos.x=8;e.pos.z=0;w.player.pos=v(0,1.7,0);const hp=e.hp;
  w.level=2;w.emit('upgrade',w.player.pos,2);
  for(let i=0;i<180;i++){w.time+=STEP;wave(w);}
  assert.equal(hp-e.hp,5,kind);
 }
});

test('spider tolerance doubles while creature bodies return to their earlier scale',()=>{
 const current=new World(71,{schedule:false}),old=new World(71,{schedule:false,legacyBalance:true});
 for(const kind of ['spider','spider2','centipede','gigapede','ghostpede'] as const){
  const e=current.spawn(kind,v()),previous=old.spawn(kind,v());e.age=previous.age=20;
  assert.ok(Math.abs(e.radius/previous.radius-.62)<1e-10,kind);
  assert.equal(enemyRigScale(e),.62);assert.equal(enemyRigScale(previous),1);
  if(kind.startsWith('spider'))assert.ok(Math.abs(spiderCrystalRadius(e)*enemyEmergenceScale(e)/(spiderCrystalRadius(previous)*enemyEmergenceScale(previous))-2)<1e-10);
 }
});

test('persistent crowded towers never change their spawn rays or push each other outward',()=>{
 const w=new World(71,{invulnerable:true}),origin=new Map<number,{x:number;z:number}>();
 const spawn=w.spawnAt.bind(w);w.spawnAt=(kind,a,r)=>{const e=spawn(kind,a,r);if(kind.startsWith('squid'))origin.set(e.id,{x:e.pos.x,z:e.pos.z});return e;};
 for(let tick=0;tick<300/STEP;tick++){
  const before=new Map(w.enemies.map(e=>[e.id,Math.hypot(e.pos.x,e.pos.z)]));
  w.step(idleInput());w.enemies=w.enemies.filter(e=>e.kind.startsWith('squid'));w.effects=[];w.gems=[];
  for(const e of w.enemies){
   const initial=origin.get(e.id)!;
   assert.ok(Math.abs(e.pos.x*initial.z-e.pos.z*initial.x)<1e-7,'tower remains on the sampled spawn ray');
   assert.ok(Math.hypot(e.pos.x,e.pos.z)<=(before.get(e.id)??Math.hypot(initial.x,initial.z))+1e-8,'crowding never pushes outward');
  }
 }
 assert.equal(w.enemies.length,38,'fixture retains the complete scheduled tower backlog');
});

test('a late blocker cannot displace an existing tower or bank stopped travel',()=>{
 const w=new World(17,{schedule:false,invulnerable:true}),a=w.spawn('squid3',v(10,0,0)),b=w.spawn('squid3',v(4,0,0));
 a.age=b.age=20;a.nextSpawn=b.nextSpawn=Infinity;
 const starts=w.enemies.map(e=>({...e.pos})),moves=planTowerMovement(w.enemies,0,STEP,.5);
 w.enemies.forEach((e,i)=>{const p=moves.get(e)!;assert.ok(Math.hypot(p.x-starts[i].x,p.z-starts[i].z)<=.5*STEP+1e-8);});
 const reversed=planTowerMovement([...w.enemies].reverse(),0,STEP,.5);assert.deepEqual(moves,reversed);
});

test('emitted Skull II resumes wandering instead of gaining pursuit from its skin',()=>{
 const w=new World(71,{schedule:false,invulnerable:true}),tower=w.spawn('squid',v(20,5,0));w.player.pos=v();tower.age=12;tower.nextSpawn=Infinity;
 (w as unknown as {ejectSkull(e:Enemy,index:number,delay:number,legacy:boolean):void}).ejectSkull(tower,10,0,false);
 const child=w.enemies.at(-1)!;advance(w,5);
 assert.equal(child.kind,'skull2');assert.ok(child.nextMove>child.age);
 assert.ok(Math.hypot(child.target.x-w.player.pos.x,child.target.z-w.player.pos.z)>3,'goal is a wandering point, not the player');
});

test('homing damages exposed crystals instead of spending all twenty shots on hidden crystal zero',()=>{
 for(const kind of ['squid2','squid3'] as const){
  const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawn(kind,v());e.age=12;e.nextSpawn=Infinity;
  const c=crystalToEnemy(e,w.player.pos,e.weakpoints[0].local),dx=c.x-e.pos.x,dz=c.z-e.pos.z,len=Math.hypot(dx,dz);
  w.player.pos=v(e.pos.x-dx/len*20,1.7,e.pos.z-dz/len*20);w.level=3;w.reserve=20;
  const point=w.weakPoint(e),x=point.x-w.player.pos.x,y=point.y-w.player.pos.y,z=point.z-w.player.pos.z;
  const hp=e.hp;w.shoot({...idleInput(),yaw:Math.atan2(-x,-z),pitch:Math.atan2(y,Math.hypot(x,z))},true,true);
  for(let i=0;i<8/STEP;i++)flight(w);
  assert.ok(e.hp<hp,`${kind}: visible alternate crystal takes damage`);
 }
});

test('balance rules survive full and delta enemy packets for guest collision prediction',()=>{
 const w=new World(17,{schedule:false}),e=w.spawn('spider',v());e.age=10;
 const first=packEnemy(e),decoded=unpackEnemy(first);assert.equal(decoded.balance,true);
 assert.ok(Math.abs(spiderCrystalRadius(decoded)*enemyEmergenceScale(decoded)-spiderCrystalRadius(e)*enemyEmergenceScale(e))<1e-6);
 delete e.balance;const next=packEnemy(e),round=unpackEnemy(applyEnemyDelta(enemyDelta(next,first,0),first,0));assert.equal(round.balance,undefined);
});

test('historical solo recordings captured before the edits retain outcomes and backward seeking',()=>{
 for(const time of [39,244,350]){
  const run=unpackReplay(gunzipSync(readFileSync(new URL(`./fixtures/before-balance-solo-${time}.bin.gz`,import.meta.url)))),p=new ReplayPlayer(run);
  assert.equal(p.world.balanceFixesEnabled,false);p.seek(run.ticks);
  assert.deepEqual(p.world.stats,run.stats);assert.equal(p.world.cause,run.cause);
  p.seek(0);p.seek(run.ticks);assert.deepEqual(p.world.stats,run.stats);
 }
});

test('historical crew checkpoints captured before the edits retain every exact digest',()=>{
 const run=unpackCrewReplay(gunzipSync(readFileSync(new URL('./fixtures/before-balance-crew.bin.gz',import.meta.url)))),p=new CrewReplayPlayer(run);
 assert.equal(p.world.balanceFixesEnabled,false);while(!p.done)p.step();
 assert.equal(crewCheckpointDigest(p.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
 p.seek(0);p.seek(run.ticks);assert.equal(crewCheckpointDigest(p.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
});

test('current solo recordings and crew checkpoints retain corrected rules on restore',()=>{
 const w=createRun(17),r=new RunRecorder(17);
 for(let i=0;i<600&&w.state==='playing';i++){const input={...idleInput(),strafe:1,fire:true};r.record(input);w.step(input);w.effects=[];}
 const run=unpackReplay(packReplay(r.finish(w))),p=new ReplayPlayer(run);assert.equal(run.balanceFixes,true);
 p.seek(run.ticks);assert.deepEqual(p.world,w);p.seek(10);p.seek(run.ticks);assert.deepEqual(p.world,w);
 assert.equal(World.restoreCrewCheckpoint(w.captureCrewCheckpoint()).balanceFixesEnabled,true);
});

test('new thorn armor has real remake surfaces while legacy files retain original armor',()=>{
 const w=new World(71,{schedule:false}),e=w.spawn('thorn',v());e.age=20;
 // The authored central spire crosses this short horizontal segment.
 const hit=sweepArmor(e,w.player.pos,v(2,4,0),v(-2,4,0));assert.ok(hit);
 assert.ok(hit.t>0&&hit.t<1);assert.equal(CREATURE_SCALE_RATIO,1/.62);
});
