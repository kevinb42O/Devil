import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,type EnemyKind} from '../src/simulation.ts';
import {originalSpawnRadius} from '../src/spawn-placement.ts';
import {towerEmissionTick,towerEntrancePose} from '../src/tower-spawn.ts';
import {towerSpitPulse} from '../src/enemy-presentation.ts';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay.ts';
import reference from '../research/devil-daggers-v3/original-survival-replay-spawns.json';
import emissions from '../research/devil-daggers-v3/original-tower-emissions.json';
import enemyReference from '../research/devil-daggers-v3/reference-data.json';

test('tower entrances preserve recorded travel while the large tower matches normal floor clearance',()=>{
 for(const replay of reference.replays)for(const kind of ['squid','squid2','squid3'] as const){
  const birth=replay.spawns.find(e=>e.kind===kind)!;
  const samples=replay.firstEnemyMotion.filter(e=>e.id===birth.id&&e.tick-birth.tick<=900);
  const world=new World(29,{schedule:false,invulnerable:true});world.startAt(birth.time);
  const tower=world.spawnAt(kind,birth.angle!,.5);tower.nextSpawn=Infinity;
  const normal=kind==='squid3'?world.spawnAt('squid',birth.angle!,.5):null;
  if(normal)normal.nextSpawn=Infinity;
  for(const sample of samples){
   while(world.tick<sample.tick*2)world.step(idleInput());
   const radius=Math.hypot(tower.pos.x,tower.pos.z),expected=Math.hypot(sample.position[0],sample.position[2])*.62;
   assert.ok(Math.abs(radius-expected)<.04,`${replay.source}: ${kind} at ${sample.tick}, error ${radius-expected}`);
   if(normal){
    assert.ok(Math.abs((tower.pos.y-2.812134)-(normal.pos.y-3.229219))<.001,'large and normal tower undersides share floor clearance');
    assert.ok(Math.abs(towerEntrancePose(kind,(sample.tick-birth.tick)/60).height-sample.position[1]*.62)<.02,'original measurements remain available');
   }else assert.ok(Math.abs(tower.pos.y-sample.position[1]*.62)<.02);
  }
 }
});

test('every recorded tower offspring event matches original ticks and types, including repeat bursts',()=>{
 const kinds:Record<number,EnemyKind>={1:'skull',2:'skull2',3:'skull3',5:'skull4'};
 for(const replay of emissions.replays)for(const towerReference of replay.towers){
  if(!towerReference.children.length)continue;
  const world=new World(91,{schedule:false,invulnerable:true});world.startAt(towerReference.spawnTick/60);
  const tower=world.spawnAt(towerReference.kind as EnemyKind,.7,.5),actual:{tick:number;kind:EnemyKind}[]=[];
  const spawn=world.spawn.bind(world);
  world.spawn=(kind,pos,announce)=>{const child=spawn(kind,pos,announce);actual.push({tick:world.tick,kind});return child;};
  const end=towerReference.children.at(-1)!.tick*2;
  while(world.tick<end){world.step(idleInput());world.enemies=[tower];world.effects=[];}
  assert.deepEqual(actual,towerReference.children.map(e=>({tick:e.tick*2,kind:kinds[e.type]})),`${replay.source}: tower ${towerReference.id}`);
 }
});

test('killing a tower during discharge prevents unborn children from appearing',()=>{
 const world=new World(1,{schedule:false,invulnerable:true}),tower=world.spawnAt('squid',0,.5);
 for(let i=0;i<372;i++)world.step(idleInput());
 const children=world.enemies.filter(e=>e!==tower);assert.equal(children.length,2);
 world.damageEnemy(tower,tower.hp);
 for(let i=0;i<240;i++){world.step(idleInput());world.effects=[];}
 assert.equal(world.enemies.length,children.length);
});

test('tower animation stays open through each measured discharge across repeated bursts',()=>{
 for(const kind of ['squid','squid2','squid3'] as const)for(const burst of [0,1,5,20]){
  const first=towerEmissionTick(kind,burst,0)/60,last=towerEmissionTick(kind,burst,kind==='squid3'?15:10)/60;
  assert.ok(Math.abs(towerSpitPulse(first,kind,true)-1)<1e-9);
  assert.ok(Math.abs(towerSpitPulse(last,kind,true)-1)<1e-9);
  assert.ok(towerSpitPulse(first-.2,kind,true)>0);
  assert.equal(towerSpitPulse(last+.6,kind,true),0);
 }
});

test('scheduled spiders retain radial jitter relative to their measured base radius',()=>{
 for(const kind of ['spider','spider2'] as const){
  const world=new World(1,{schedule:false,invulnerable:true}),spider=world.spawnAt(kind,0,.5);
  const base=originalSpawnRadius(kind,0)!;
  world.step(idleInput());assert.ok(Math.abs(Math.hypot(spider.pos.x,spider.pos.z)-base)<1e-7,'entrance does not jump');
  spider.age=kind==='spider'?3.1:9.1;spider.nextMove=Infinity;spider.orbitSpeed=0;
  for(const jitter of [-.25,.25]){
   spider.radialOffset=3.8*spider.size+jitter;world.step(idleInput());
   assert.ok(Math.abs(Math.hypot(spider.pos.x,spider.pos.z)-base-jitter)<1e-7);
  }
 }
});

test('both spider rewards match the independent v3.2 reference and old revisions keep five gems',()=>{
 for(const [kind,id] of [['spider','Spider1'],['spider2','Spider2']] as const){
  const referenceGems=enemyReference.enemies.find(e=>e.id===id)!.ownGems;
  for(const revision of [10,11]){
   const world=createRun(1,undefined,6,true,revision),spider=world.spawn(kind,{x:0,y:0,z:20});
   world.damageEnemy(spider,spider.hp);
   assert.equal(world.gems.length,revision===10?5:referenceGems);
   world.damageEnemy(spider,1000);assert.equal(world.gems.length,revision===10?5:referenceGems);
  }
 }
});

test('revision ten and current recordings replay and seek with their own entrance and discharge rules',()=>{
 for(const revision of [10,11]){
  const setup={time:38.9,level:4,reserve:0},world=createRun(91,setup,6,true,revision),recorder=new RunRecorder(91,setup);
  for(let i=0;i<720&&world.state==='playing';i++){const input={...idleInput(),fire:i%40<20};recorder.record(input);world.step(input);world.effects=[];}
  assert.ok(world.time>=43,'recording crosses tower/spider birth and first tower burst');
  const run={...recorder.finish(world),combatRevision:revision},replay=new ReplayPlayer(run);
  replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
  replay.seek(100);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
 }
});
