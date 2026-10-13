import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput} from '../src/simulation.ts';

for(const level of [1,2,3,4])for(const stream of [false,true]){
 test(`solo hand ${level} homing ${stream?'stream':'tap'} spends only reserve`,()=>{
  const w=new World(1,{schedule:false,invulnerable:true});w.startAt(0,level,40);
  const collected=w.stats.collected,reserve=w.reserve;
  for(let i=0;i<(stream?30:1);i++)w.step({...idleInput(),homing:true});
  w.step(idleInput());
  assert.equal(w.stats.collected,collected);assert.equal(w.level,level);
  if(level<2){assert.equal(w.stats.homingFired,0);assert.equal(w.reserve,reserve);}
  else {assert.ok(w.stats.homingFired>0);assert.equal(w.reserve,reserve-w.stats.homingFired);assert.ok(w.projectiles.some(p=>p.homing));}
 });
 for(const shooter of ['host','guest'])test(`crew ${shooter} hand ${level} homing ${stream?'stream':'tap'} spends only their reserve`,()=>{
  const w=new World(1,{schedule:false,invulnerable:true});w.addCrew('host');w.addCrew('guest');
  const count=level===1?0:level===2?50:level===3?110:210;
  for(let i=0;i<count;i++)w.collect();
  const collected=w.stats.collected,before=w.crew.map(p=>p.reserve);
  for(let i=0;i<(stream?30:1);i++)w.stepCrew(new Map([[shooter,{...idleInput(),homing:true}]]));
  w.stepCrew(new Map());assert.equal(w.stats.collected,collected);
  for(let i=0;i<w.crew.length;i++){
   const p=w.crew[i];assert.equal(p.level,level);
   assert.equal(p.reserve,before[i]-(p.id===shooter?w.stats.homingFired:0));
  }
  assert.equal(w.stats.homingFired>0,level>=2);
 });
}
