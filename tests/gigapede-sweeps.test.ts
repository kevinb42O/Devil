import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v,distance} from '../src/simulation';
import {GIGAPEDE_TUNING} from '../src/gigapede-motion';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';

test('gigapedes repeatedly sweep past the platform and climb out without low hovering',()=>{
 for(const sample of [0,.4,1]){
  const w=new World(32,{schedule:false,invulnerable:true});
  const snakes=[w.spawnAt('gigapede',0,sample),w.spawnAt('gigapede',Math.PI,sample)];
  const stages=new Set<string>();let close=0,total=0,passes=0;
  for(let tick=0;tick<120*65;tick++){
   const before=snakes.map(e=>({...e.pos}));w.step(idleInput());w.effects=[];
   for(const [i,e] of snakes.entries()){
    if(e.age>e.activeAt)assert.ok(distance(before[i],e.pos)<=GIGAPEDE_TUNING.speed*STEP+.003);
    const m=e.gigapedeMotion!,stage=m.sweep?.stage;
    if(stage)stages.add(stage);
    assert.ok(m.path.length<1500,'distance trail stays bounded');
    if(e.age>15){
     assert.ok(e.pos.y>7,'head clears the low hover band');
     assert.ok(e.pos.y<18,'climb remains in sight above the arena');
     assert.ok(Math.hypot(e.pos.x,e.pos.z)<65,'recovery stays within a visible flight envelope');
     if(Math.hypot(e.pos.x-w.player.pos.x,e.pos.z-w.player.pos.z)<12)close++;
     if(stage==='pass'&&Math.hypot(e.pos.x-w.player.pos.x,e.pos.z-w.player.pos.z)<6)passes++;
     total++;
    }
   }
  }
  assert.deepEqual([...stages].sort(),['approach','climb','pass','recover']);
  assert.ok(close/total<.35,'does not spend the flight circling directly over the player');
  assert.ok(passes>0,'committed sweeps return through the player area');
 }
});

test('moving underneath a committed pass cannot reverse it and jumping cannot pull it down',()=>{
 const worlds=[1.7,18].map(()=>new World(42,{schedule:false,invulnerable:true}));
 const snakes=worlds.map(w=>w.spawnAt('gigapede',0,.4));let checked=0;
 for(let tick=0;tick<120*35;tick++){
  for(const [i,w] of worlds.entries()){
   w.player.pos=v(Math.sin(tick/300)*7,i?18:1.7,Math.cos(tick/300)*7);w.player.vel=v();w.player.grounded=false;
   const e=snakes[i],s=e.gigapedeMotion?.sweep,goal=s?.stage==='pass'?{...s.goal}:undefined;
   w.step(idleInput());w.effects=[];
   if(goal&&e.gigapedeMotion?.sweep?.stage==='pass'){assert.deepEqual(e.gigapedeMotion.sweep.goal,goal);checked++;}
  }
  assert.deepEqual(snakes[0].pos,snakes[1].pos,'flight ignores target eye height');
 }
 assert.ok(checked>100);
});

test('solo replay files and backward seeking preserve sweep selection',()=>{
 for(const sweeps of [false,true]){
  const setup={time:259,level:4,reserve:0};
  const w=createRun(29,setup,7,true,20,true,true,true,true,true,sweeps),recorder=new RunRecorder(29,setup);
  for(let i=0;i<120*8&&w.state==='playing';i++){const input=idleInput();recorder.record(input);w.step(input);w.effects=[];}
  const run=unpackReplay(packReplay(recorder.finish(w))),replay=new ReplayPlayer(run);
  replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
  replay.seek(0);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
  delete run.gigapedeSweeps;assert.equal(new ReplayPlayer(run).world.gigapedeSweepsEnabled,false);
 }
});

test('crew checkpoints retain flight state and missing sweep flags restore historic flight',()=>{
 const w=new World(32,{schedule:false,invulnerable:true});w.addCrew('host');w.spawnAt('gigapede',0,.4);
 for(let i=0;i<120*12;i++){w.step(idleInput());w.effects=[];}
 const checkpoint=w.captureCrewCheckpoint(),restored=World.restoreCrewCheckpoint(checkpoint);
 assert.equal(restored.gigapedeSweepsEnabled,true);
 for(let i=0;i<120;i++){w.step(idleInput());restored.step(idleInput());w.effects=[];restored.effects=[];}
 assert.deepEqual(restored.enemies,w.enemies);
 delete checkpoint.options.legacyGigapedeSweeps;
 assert.equal(World.restoreCrewCheckpoint(checkpoint).gigapedeSweepsEnabled,false);
});
