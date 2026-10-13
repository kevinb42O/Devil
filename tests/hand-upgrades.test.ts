import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput} from '../src/simulation.ts';

test('hand switches exactly at each gem threshold and emits one matching upgrade',()=>{
 const w=new World(1,{schedule:false});
 for(let gems=1;gems<=200;gems++){
  w.effects=[];w.collect();
  const expected=gems>=200?4:gems>=70?3:gems>=10?2:1;
  assert.equal(w.level,expected,`gem ${gems}`);
  const upgrades=w.effects.filter(e=>e.kind==='upgrade');
  assert.equal(upgrades.length,[10,70,200].includes(gems)?1:0);
  if(upgrades.length)assert.equal(upgrades[0].level,expected);
 }
 w.shoot(idleInput(),true,true);assert.equal(w.reserve,160);assert.equal(w.level,4);
 w.collect();assert.equal(w.level,4,'spending homing does not downgrade the hand');
});

test('spending homing cannot delay the final hand at 200 collected gems',()=>{
 const w=new World(1,{schedule:false});
 for(let i=0;i<199;i++)w.collect();
 w.shoot(idleInput(),true,true);assert.equal(w.level,3);assert.ok(w.reserve<189);
 assert.ok(w.finalHandProgress<1);w.collect();assert.equal(w.level,4);assert.equal(w.finalHandProgress,1);
});

test('crew unlocks the final hand together at 200 shared gems despite different reserves',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');w.addCrew('guest');w.selectCrew('host');
 for(let i=0;i<199;i++)w.collect();
 w.stepCrew(new Map([['host',{...idleInput(),homing:true}]]));
 w.stepCrew(new Map());w.selectCrew('guest');
 assert.equal(w.level,3);assert.equal(w.reserve,189);w.effects=[];w.collect();
 assert.equal(w.stats.collected,200);assert.ok(w.crew.every(p=>p.level===4));
 assert.ok(w.crew[0].reserve<w.crew[1].reserve);
 assert.deepEqual(w.effects.map(e=>({kind:e.kind,level:e.level,shooterId:e.shooterId})),[
  {kind:'upgrade',level:4,shooterId:'host'},{kind:'upgrade',level:4,shooterId:'guest'}
 ]);
 w.effects=[];w.collect();assert.equal(w.effects.length,0);
});
