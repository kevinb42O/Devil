import {test} from 'node:test';import assert from 'node:assert/strict';
import {RunRecorder,ReplayPlayer,createRun,REPLAY_RULES_VERSION} from '../src/replay.ts';import {idleInput} from '../src/simulation.ts';
test('recorded input recreates gameplay exactly and backward seeking preserves the same result',()=>{
 const seed=4729,w=createRun(seed),recorder=new RunRecorder(seed);for(let i=0;i<1000&&w.state==='playing';i++){const input={...idleInput(),yaw:Math.sin(i/50)*.2,fire:i%40<20,jump:i%100===0};recorder.record(input);w.step(input);w.effects=[];}
 const data=recorder.finish(w),player=new ReplayPlayer(data);player.seek(data.ticks);player.world.effects=[];assert.deepEqual(player.world,w);player.seek(120);player.seek(data.ticks);player.world.effects=[];assert.deepEqual(player.world,w);
});
test('replays retain practice setup and reject a different rules version',()=>{
 const setup={time:350,level:4,reserve:50},w=createRun(4,setup),recorder=new RunRecorder(4,setup);recorder.record(idleInput());w.step(idleInput());const run=recorder.finish(w);assert.equal(run.practice,true);const replay=new ReplayPlayer(run);replay.step();assert.equal(replay.world.time,w.time);assert.equal(replay.world.enemies[0].kind,'leviathan');assert.throws(()=>new ReplayPlayer({...run,version:REPLAY_RULES_VERSION+1}),/incompatible/);
});
test('saved version-four replays retain their original camera projectile trajectories',()=>{
 const setup={time:0,level:1,reserve:0},world=createRun(44,setup,4),recorder=new RunRecorder(44,setup);
 for(let i=0;i<480;i++){const input={...idleInput(),yaw:Math.sin(i/20)*.3,fire:i%45<23};recorder.record(input);world.step(input);world.effects=[];}
 const run={...recorder.finish(world),version:4},replay=new ReplayPlayer(run);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
});
test('saved replays preserve fractional movement from before analog speed correction',()=>{
 const setup={time:0,level:1,reserve:0},world=createRun(42,setup,6,false,0),recorder=new RunRecorder(42,setup);
 for(let i=0;i<120;i++){const input={...idleInput(),forward:.5};recorder.record(input);world.step(input);world.effects=[];}
 const run={...recorder.finish(world),version:6};delete run.analogMovement;delete run.combatRevision;
 const replay=new ReplayPlayer(run);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
 replay.seek(20);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
 const corrected=createRun(42,setup);for(let i=0;i<120;i++)corrected.step({...idleInput(),forward:.5});
 assert.ok(Math.abs(world.player.vel.z)>Math.abs(corrected.player.vel.z),'historical replay retains its previous movement');
});
test('new controller recordings reproduce partial stick movement and jumping',()=>{
 const seed=7,world=createRun(seed),recorder=new RunRecorder(seed);
 for(let i=0;i<120;i++){const input={...idleInput(),forward:.25,strafe:.15,jump:i===30,fire:i>60&&i<80};recorder.record(input);world.step(input);world.effects=[];}
 const run=recorder.finish(world);assert.equal(run.analogMovement,true);const replay=new ReplayPlayer(run);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
});
test('saved fingertip-origin recordings retain their ballistics while new runs use the under-hand launch',()=>{
 for(const revision of [1,2,3,4,5,6]){
  const world=createRun(19,undefined,6,true,revision),recorder=new RunRecorder(19);
  for(let i=0;i<180;i++){const input={...idleInput(),strafe:i<90?1:-1,fire:i%40<22};recorder.record(input);world.step(input);world.effects=[];}
  const run={...recorder.finish(world),combatRevision:revision},replay=new ReplayPlayer(run);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
  replay.seek(40);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
 }
 const old=createRun(1,undefined,6,true,1),current=createRun(1);old.shoot(idleInput(),false,false);current.shoot(idleInput(),false,false);
 assert.ok(current.projectiles[0].pos.y<old.projectiles[0].pos.y);assert.ok(current.projectiles[0].pos.z>old.projectiles[0].pos.z);
});
test('saved combat retains old low-enemy contact and snake escape behavior',()=>{
 for(const revision of [0,1]){
  const low=createRun(9,undefined,6,true,revision);
  const egg=low.spawn('egg',{...low.player.pos,y:low.player.pos.y-1.15});egg.age=2;low.step(idleInput());
  assert.equal(low.state,revision===0?'playing':'dead');
  const snake=createRun(9,undefined,6,true,revision);
  const e=snake.spawn('centipede',{...snake.player.pos});e.pos={...snake.player.pos,y:snake.player.pos.y+.5};e.age=7;e.status='hunting';e.statusUntil=20;
  snake.step(idleInput());assert.equal(e.status,revision===0?'burrowing':'hunting');assert.equal(snake.state,revision===0?'playing':'dead');
 }
 const world=createRun(9),recorder=new RunRecorder(9);recorder.record(idleInput());world.step(idleInput());
 assert.equal(recorder.finish(world).combatRevision,11);
});

test('saved eye-seeking pede revisions preserve their trajectories',()=>{
 for(const revision of [4,5,6,7,8]){
  const setup={time:259,level:4,reserve:0},world=createRun(29,setup,6,true,revision),recorder=new RunRecorder(29,setup);
  for(let i=0;i<480&&world.state==='playing';i++){const input={...idleInput(),strafe:1,jump:i%120===0};recorder.record(input);world.step(input);world.effects=[];}
  const run={...recorder.finish(world),combatRevision:revision},replay=new ReplayPlayer(run);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
  replay.seek(20);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
 }
});
