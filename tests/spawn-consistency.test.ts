import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World,STEP,idleInput,type EnemyKind} from '../src/simulation.ts';
import {survivalSchedule,TIMELINE} from '../src/survival.ts';
import {originalSpawnRadius,originalTowerSpawnHeight,nextPerimeterSpawnAngle} from '../src/spawn-placement.ts';
import original from '../research/devil-daggers-v3/original-survival-replay-spawns.json';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay.ts';

function trace(seed:number,start=0,end=1200,combat=false,crew=false){
 const world=new World(seed,{invulnerable:true});world.startAt(start);
 if(crew){world.addCrew('host');world.addCrew('guest');}
 const events:{tick:number;kind:EnemyKind;angle:number;radialSample?:number;pos:{x:number;y:number;z:number}}[]=[];
 const spawnAt=world.spawnAt.bind(world);
 world.spawnAt=(kind,angle,radialSample)=>{const enemy=spawnAt(kind,angle,radialSample);events.push({tick:world.tick,kind,angle,radialSample,pos:{...enemy.pos}});return enemy;};
 while(world.tick<Math.round(end/STEP)){
  // Exercise the combat RNG without retaining a growing army for this schedule test.
  if(combat){world.dropGems(world.player.pos,2);world.shoot(idleInput(),true,false);}
  if(crew)world.stepCrew(new Map());else world.step(idleInput());
  world.enemies=[];world.projectiles=[];world.gems=[];world.effects=[];
 }
 return events;
}

test('the complete preloop enemy order matches the spawnset, with float countdown ticks',()=>{
 const types:Record<string,EnemyKind>={'Squid I':'squid','Squid II':'squid2','Squid III':'squid3','Spider I':'spider','Spider II':'spider2',Centipede:'centipede',Gigapede:'gigapede',Ghostpede:'ghostpede',Leviathan:'leviathan',Thorn:'thorn'};
 const rows=readFileSync(new URL('../research/devil-daggers-v3/survival-spawns.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1).map(row=>row.split(','));
 const expected=rows.filter(row=>row[5]==='preloop'&&row[1]!=='-1').map(row=>({kind:types[row[2]],time:Number(row[4])}));
 assert.deepEqual(TIMELINE.map(e=>e.kind),expected.map(e=>e.kind));
 expected.forEach((e,i)=>assert.ok(Math.abs(TIMELINE[i].time-e.time)<=1/60+1e-7));
});

test('scheduled order and ticks are fixed; locations repeat for a seed independently of combat and co-op',()=>{
 const baseline=trace(1);
 assert.deepEqual(trace(1,0,1200,true),baseline);
 assert.deepEqual(trace(1,0,1200,false,true),baseline);
 const other=trace(917);
 assert.notEqual(other[0].angle,baseline[0].angle);
 assert.deepEqual(other.map(({tick,kind})=>({tick,kind})),baseline.map(({tick,kind})=>({tick,kind})));
 const expected=[];
 for(const event of survivalSchedule()){if(event.time>1200)break;expected.push({tick:event.tick*2,kind:event.kind});}
 assert.deepEqual(baseline.map(({tick,kind})=>({tick,kind})),expected);
 const triple=baseline.filter(e=>e.tick===259/STEP&&e.kind==='gigapede');
 assert.equal(triple.length,3);assert.equal(new Set(triple.map(e=>e.angle)).size,3);
 assert.ok(baseline.some(e=>e.kind==='ghostpede'));
 assert.ok(baseline.some(e=>e.kind==='thorn'&&e.radialSample!==undefined));
 assert.notEqual(baseline[0].angle,Math.PI);
});

test('practice skips advance placement through every earlier event, including simultaneous spawns',()=>{
 const baseline=trace(1);
 for(const start of [39,174,259,350,456,600,1000]){
  const placements=(events:ReturnType<typeof trace>)=>events.map(({kind,angle,radialSample})=>({kind,angle,radialSample}));
  assert.deepEqual(placements(trace(1,start)),placements(baseline.filter(e=>e.tick>=Math.round(start/STEP))),`practice at ${start}s`);
 }
});

test('pre-fix replays retain combat-dependent placement and replay seeking',()=>{
 const world=createRun(29,undefined,6,true,6),recorder=new RunRecorder(29);
 for(let i=0;i<19/STEP&&world.state==='playing';i++){
  const input={...idleInput(),fire:i%40<20};recorder.record(input);world.step(input);world.effects=[];
 }
 assert.ok(world.time>=14,'test reaches a spawn that used combat randomness');
 const run={...recorder.finish(world),combatRevision:6},replay=new ReplayPlayer(run);
 replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
 replay.seek(120);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
});


test('every scheduled spawn tick and type matches both original standard Survival replays',()=>{
 for(const replay of original.replays){
  const actual=[];
  for(const event of survivalSchedule()){if(event.tick>=replay.ticks)break;actual.push({tick:event.tick,kind:event.kind});}
  assert.deepEqual(actual,replay.spawns.map(({tick,kind})=>({tick,kind})),replay.source);
 }
});

test('original tower heights, fixed radii and float-shrinking spider radii match recorded coordinates',()=>{
 for(const replay of original.replays)for(const event of replay.spawns){
  if(!event.kind.startsWith('squid')&&!event.kind.startsWith('spider'))continue;
  const radius=originalSpawnRadius(event.kind as EnemyKind,event.tick)!;
  assert.ok(Math.abs(radius-event.radius!*.62)<.00001,`${replay.source}: ${event.kind} at ${event.tick}`);
  if(event.kind.startsWith('squid'))assert.ok(Math.abs(originalTowerSpawnHeight(event.kind as EnemyKind)-event.position![1]*.62)<1e-7);
 }
});

test('consecutive perimeter spawns obey the angular interval observed in both original runs',()=>{
 for(const replay of original.replays){
  const perimeter=replay.spawns.filter(e=>e.kind.startsWith('squid')||e.kind.startsWith('spider'));
  for(let i=1;i<perimeter.length;i++){
   const angle=(perimeter[i].angle!-perimeter[i-1].angle!+Math.PI*2)%(Math.PI*2);
   assert.ok(angle>=Math.PI/2-1e-5&&angle<=Math.PI*1.5+1e-5);
  }
 }
 assert.equal(nextPerimeterSpawnAngle(0,0),Math.PI/2);
 assert.equal(nextPerimeterSpawnAngle(0,1),Math.PI*1.5);
 const perimeter=trace(1).filter(e=>e.kind.startsWith('squid')||e.kind.startsWith('spider'));
 for(let i=1;i<perimeter.length;i++){
  const angle=perimeter[i].angle-perimeter[i-1].angle;
  assert.ok(angle>=Math.PI/2-1e-5&&angle<=Math.PI*1.5+1e-5);
 }
});

test('scheduled snakes start inside the observed central disk at the recorded depths and orientation',()=>{
 for(const replay of original.replays)for(const event of replay.spawns){
  if(!['centipede','gigapede','ghostpede'].includes(event.kind))continue;
  assert.ok(event.radius!<25);
  assert.equal(event.position![1],event.kind==='ghostpede'?-15:-4);
  assert.deepEqual(event.orientation,[1,0,0,0,1,0,0,0,1]);
 }
 const world=new World(1,{schedule:false});
 for(const kind of ['centipede','gigapede','ghostpede'] as const){
  const snake=world.spawnAt(kind,.7,.6);
  assert.ok(Math.abs(Math.hypot(snake.pos.x,snake.pos.z)-25*.62*.6)<1e-7);
  assert.equal(snake.pos.y,(kind==='ghostpede'?-15:-4)*.62);
  assert.equal(snake.facingYaw,0);
 }
});

test('revision seven and eight recordings preserve their old fixed placements and timing',()=>{
 for(const revision of [7,8]){
  const world=createRun(29,undefined,6,true,revision),recorder=new RunRecorder(29);
  for(let i=0;i<19/STEP&&world.state==='playing';i++){
   const input={...idleInput(),fire:i%40<20};recorder.record(input);world.step(input);world.effects=[];
  }
  const replay=new ReplayPlayer({...recorder.finish(world),combatRevision:revision});
  replay.seek(replay.run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
 }
});

test('thorn anchors match the recorded tile-center grid and underground depth',()=>{
 for(const replay of original.replays)for(const event of replay.spawns){
  if(event.kind!=='thorn')continue;
  assert.equal(Math.abs(event.position![0]%4),0);assert.equal(Math.abs(event.position![2]%4),0);
  assert.equal(event.position![1],Math.fround(-15.7));
 }
 const world=new World(1,{schedule:false,invulnerable:true});
 const thorn=world.spawnAt('thorn',.7,.6),grid=4*.62;
 assert.ok(Math.abs(thorn.pos.x/grid-Math.round(thorn.pos.x/grid))<1e-7);
 assert.ok(Math.abs(thorn.pos.z/grid-Math.round(thorn.pos.z/grid))<1e-7);
 assert.equal(thorn.pos.y,Math.fround(-15.7)*.62);
 world.step(idleInput());assert.ok(thorn.pos.y>Math.fround(-15.7)*.62&&thorn.pos.y<0);
});
