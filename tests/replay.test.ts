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
