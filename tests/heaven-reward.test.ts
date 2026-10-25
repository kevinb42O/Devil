import test from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,STEP} from '../src/simulation';
import {heavenDropsBetween} from '../src/heaven-reward';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';

test('each arrival schedules exactly fifty staggered drops without duplicates',()=>{
 for(const cycle of [0,1,10]){
  const start=498+cycle*510,drops=[];
  for(let n=0;n<400;n++)drops.push(...heavenDropsBetween(start-.1+n*STEP,start-.1+(n+1)*STEP));
  assert.equal(drops.length,50);assert.equal(new Set(drops.map(d=>d.index)).size,50);
  assert.ok(drops.every(d=>d.cycle===cycle));
 }
 assert.equal(heavenDropsBetween(497,497.9).length,0);assert.equal(heavenDropsBetween(501,510).length,0);
 assert.equal(heavenDropsBetween(501,498).length,0);
});
test('gems rain without kills, fall above safe ground and use normal upgrades',()=>{
 const w=new World(17,{schedule:false,invulnerable:true});w.startAt(497.9);
 for(let n=0;n<800;n++)w.step(idleInput());
 assert.equal(w.stats.released,50);assert.equal(w.stats.kills,0);assert.equal(w.stats.collected,50);assert.equal(w.level,2);
 const legacy=new World(17,{schedule:false,invulnerable:true,heavenRewards:false});legacy.startAt(497.9);
 for(let n=0;n<800;n++)legacy.step(idleInput());assert.equal(legacy.stats.released,0);
 const firing=new World(17,{schedule:false,invulnerable:true});firing.startAt(497.9);
 for(let n=0;n<800;n++)firing.step({...idleInput(),fire:true});
 assert.equal(firing.stats.released,50);assert.ok(firing.gems.length>0);assert.ok(firing.gems.every(g=>g.pos.y>=.39&&Math.hypot(g.pos.x,g.pos.z)<firing.radius));
});
test('crew share one shower and checkpoint restore cannot replay claimed drops',()=>{
 const w=new World(17,{schedule:false,invulnerable:true});w.startAt(497.9);w.addCrew('host');w.addCrew('guest');w.selectCrew('host');
 const inputs=new Map([['host',idleInput()],['guest',idleInput()]]);
 for(let n=0;n<150;n++)w.stepCrew(inputs);
 const restored=World.restoreCrewCheckpoint(w.captureCrewCheckpoint());
 for(let n=0;n<350;n++){w.stepCrew(inputs);restored.stepCrew(inputs);}
 assert.equal(w.stats.released,50);assert.equal(w.stats.collected,50);
 assert.deepEqual(restored.captureCrewCheckpoint(),w.captureCrewCheckpoint());
 assert.equal(w.crew[0].reserve,w.crew[1].reserve);
});
test('new replay files retain rewards across export and rewind; absent flags keep old rules',()=>{
 const setup={time:497.9,level:1,reserve:0},w=createRun(17,setup),recorder=new RunRecorder(17,setup);
 for(let n=0;n<480&&w.state==='playing';n++){w.step(idleInput());recorder.record(idleInput());w.effects=[];}
 const run=unpackReplay(packReplay(recorder.finish(w))),p=new ReplayPlayer(run);
 assert.equal(run.heavenRewards,true);p.seek(run.ticks);assert.equal(p.world.stats.released,50);assert.deepEqual(p.world.stats,w.stats);
 p.seek(0);p.seek(run.ticks);assert.deepEqual(p.world.stats,w.stats);
 delete run.heavenRewards;const old=new ReplayPlayer(run);old.seek(run.ticks);assert.equal(old.world.stats.released,0);
});
