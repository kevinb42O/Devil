import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v} from '../src/simulation';
import {towerOutletHeight,towerRadius,towerOutlets,localToEnemy,crystalToEnemy,enemyEmergenceScale} from '../src/enemy-presentation';
import {towerFloorHeight} from '../src/enemy-floor';
import {sweepArmor} from '../src/projectile-collision';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';

const tiers=['squid','squid2','squid3'] as const;
test('large spawners expose shootable crystals at the crown above their solid core',()=>{
 for(const kind of tiers){
  const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawn(kind,v(0,0,0));e.age=12;
  assert.equal(towerOutletHeight(kind),kind==='squid3'?18:kind==='squid2'?13:8);assert.ok(towerRadius(kind)>=1.8);
  for(const point of e.weakpoints){
   assert.equal(point.local.y,towerOutletHeight(kind)-.4);
   assert.ok(Math.hypot(point.local.x,point.local.z)>towerRadius(kind));
   const p=crystalToEnemy(e,w.player.pos,point.local),hp=e.hp;
   w.projectiles.push({id:900,pos:{...p},vel:v(),age:0,homing:false});
   (w as any).updateProjectiles(STEP);assert.equal(e.hp,hp-1,'visible crown crystal receives real damage');
  }
  const y=e.pos.y+towerOutletHeight(kind)*.4;
  assert.ok(sweepArmor(e,w.player.pos,v(0,y,20),v(0,y,-20),1,0),'new tall core blocks shots');
  assert.equal(sweepArmor(e,w.player.pos,v(0,e.pos.y+towerOutletHeight(kind)+2,20),v(0,e.pos.y+towerOutletHeight(kind)+2,-20)),null,'space above crown stays clear');
 }
});

test('skulls eject from the enlarged tower outlet rather than the old floating body',()=>{
 for(const kind of tiers){
  const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawn(kind,v(0,0,0));e.age=12;
  (w as any).ejectSkull(e,0,0,false);const child=w.enemies.at(-1)!;
  assert.equal(child.pos.y,e.pos.y+towerOutletHeight(kind)*enemyEmergenceScale(e));
 }
});

test('solo replay metadata preserves old and new tower rules through binary export and backward seek',()=>{
 for(const enabled of [false,true]){
  const w=createRun(71,undefined,7,true,20,true,enabled),recorder=new RunRecorder(71);
  for(let i=0;i<420&&w.state==='playing';i++){const input={...idleInput(),strafe:1,fire:true};recorder.record(input);w.step(input);w.effects=[];}
  const saved=recorder.finish(w);assert.equal(saved.towerArchitecture,enabled);
  if(!enabled)delete saved.towerArchitecture; // A file made before the remake.
  const replay=new ReplayPlayer(unpackReplay(packReplay(saved)));
  replay.seek(saved.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
  replay.seek(20);replay.seek(saved.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
 }
});

test('historical team checkpoints retain their exact digests with old tower targets and emissions',async()=>{
 const {CrewRunRecorder,CrewReplayPlayer,packCrewReplay,unpackCrewReplay,crewCheckpointDigest}=await import('../src/crew-replay');
 const w=new World(71,{schedule:false});(w as any).replayLegacyTowers=true;w.addCrew('host');w.selectCrew('host');
 const tower=w.spawn('squid2',v(30,8,-30));tower.age=12;
 const recorder=new CrewRunRecorder(71,w,[],'historical-towers',1);
 for(let i=0;i<2000&&w.state==='playing';i++){
  const inputs=new Map([['host',{...idleInput(),forward:1}]]),before=w.crew.map(p=>({...p}));
  w.effects=[];w.stepCrew(inputs);recorder.record(w,inputs,new Set(),before);
 }
 const saved=recorder.finish(w)!;assert.ok(saved);delete saved.towerArchitecture;
 const run=unpackCrewReplay(packCrewReplay(saved)),replay=new CrewReplayPlayer(run);
 while(!replay.done)replay.step();assert.equal(crewCheckpointDigest(replay.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
 replay.seek(10);replay.seek(run.ticks);assert.equal(crewCheckpointDigest(replay.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
});


test('floating spawner flesh and siphons block projectiles, while space underneath stays open',()=>{
 for(const kind of tiers)for(const zone of ['body','exhaust'] as const){
  const w=new World(71,{schedule:false,invulnerable:true}),tower=w.spawn(kind,v(0,5,0));tower.age=12;tower.facingYaw=0;
  const scale=enemyEmergenceScale(tower),y=zone==='body'?tower.pos.y+towerOutletHeight(kind)*.55*scale:tower.pos.y+(towerOutletHeight(kind)-.06)*scale;
  // Trace the actual outlet: the redesigned fork and citadel deliberately
  // leave open space between their separate spawning chambers.
  const outlet=towerOutlets(kind)[0],mouth=crystalToEnemy(tower,w.player.pos,{...outlet,y:outlet.y-.06});
  const from=zone==='body'?v(0,y,20):v(mouth.x,mouth.y+3,mouth.z);
  const to=zone==='body'?v(from.x,y,-20):v(mouth.x,mouth.y-3,mouth.z);
  const target=w.spawn('skull2',to);target.age=2;
  const hp=target.hp;
  w.projectiles.push({id:900,pos:from,vel:v((to.x-from.x)/STEP,(to.y-from.y)/STEP,(to.z-from.z)/STEP),age:0,homing:false});
  (w as any).updateProjectiles(STEP);
  assert.equal(target.hp,hp,`${kind} ${zone} shields the enemy`);
  assert.ok(w.effects.some(e=>e.kind==='impact'&&e.enemy===kind),`${kind} ${zone} absorbs the shot`);
  assert.equal(sweepArmor(tower,w.player.pos,v(0,tower.pos.y-.2,20),v(0,tower.pos.y-.2,-20)),null,'floating body has no hidden pedestal');
 }
});

test('every tower stream clears the crown before descending into the swarm',()=>{
 for(const seed of [1,3,17,81,300])for(const kind of tiers){
  const w=new World(seed,{schedule:false,invulnerable:true}),tower=w.spawn(kind,v(20,5,0));
  let descending=0;
  for(let i=0;i<1080;i++){
   w.step(idleInput());
   for(const child of w.enemies){
    if(!child.towerFlight||child.age<=0||child.age>3)continue;
    if(child.pos.y-child.radius<tower.pos.y+towerOutletHeight(kind)*enemyEmergenceScale(tower)&&child.vel.y<0){
     descending++;
     assert.ok(Math.hypot(child.pos.x-tower.pos.x,child.pos.z-tower.pos.z)>towerRadius(kind)*1.05*enemyEmergenceScale(tower)+child.radius,`${kind} child drops into the crown at age ${child.age}`);
    }
   }
  }
  assert.ok(descending>0,`${kind} must exercise the descending flight`);
 }
});


test('tower streams rise from the top, then pursue the player instead of scattering',()=>{
 for(const kind of tiers)for(const player of [v(0,1.7,0),v(40,1.7,0),v(20,1.7,30),v(20,1.7,-30)]){
  const w=new World(71,{schedule:false,invulnerable:true});w.player.pos={...player};
  const tower=w.spawn(kind,v(20,5,-10));tower.age=12;tower.facingYaw=.73;tower.nextSpawn=Infinity;
  const outlets=towerOutlets(kind),children=[];
  for(let index=0;index<16;index++){
   (w as any).ejectSkull(tower,index,0,false);
   const child=w.enemies.at(-1)!,origin=crystalToEnemy(tower,w.player.pos,outlets[index%outlets.length]);children.push(child);
   assert.ok(Math.hypot(child.pos.x-origin.x,child.pos.z-origin.z)<=.221,`${kind} emits at its chimney mouth`);
   assert.equal(child.pos.y,origin.y);
   if(child.kind!=='skull2')assert.equal(Math.hypot(child.vel.x,child.vel.z),0,'hunting launch starts straight up');
   assert.ok(child.vel.y>0);
  }
  const starts=children.map(e=>({...e.pos}));
  for(let i=0;i<12;i++)w.step(idleInput());
  children.forEach((e,i)=>assert.ok(e.pos.y>starts[i].y+.4,'stream rises above the outlet'));
  for(let i=0;i<108;i++)w.step(idleInput());
  children.forEach((e,i)=>{
   if(e.kind==='skull2')return; // The restored tier-II variant wanders after launch.
   const dx=w.player.pos.x-e.pos.x,dz=w.player.pos.z-e.pos.z;
   assert.ok(dx*e.vel.x+dz*e.vel.z>0,`${kind} moves toward the player`);
   assert.ok(Math.hypot(dx,dz)<Math.hypot(player.x-starts[i].x,player.z-starts[i].z)-.5,`${kind} closes the distance`);
  });
 }
});
