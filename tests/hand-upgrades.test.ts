import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput} from '../src/simulation.ts';

test('hand switches exactly at each gem threshold and emits one matching upgrade',()=>{
 const w=new World(1,{schedule:false});
 for(let gems=1;gems<=220;gems++){
  w.effects=[];w.collect();
  const expected=gems>=220?4:gems>=70?3:gems>=10?2:1;
  assert.equal(w.level,expected,`gem ${gems}`);
  const upgrades=w.effects.filter(e=>e.kind==='upgrade');
  assert.equal(upgrades.length,[10,70,220].includes(gems)?1:0);
  if(upgrades.length)assert.equal(upgrades[0].level,expected);
 }
 w.shoot(idleInput(),true,true);assert.equal(w.reserve,120);assert.equal(w.level,4);
 w.collect();assert.equal(w.level,4,'spending homing does not downgrade the hand');
});

test('crew upgrades are attributed per player and use each player\'s reserve',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');w.addCrew('guest');w.selectCrew('host');
 for(let i=0;i<70;i++)w.collect();
 w.selectCrew('guest');w.reserve=w.crew[1].reserve=149;w.selectCrew('host');w.reserve=w.crew[0].reserve=130;
 w.effects=[];w.collect();
 assert.equal(w.level,3);assert.equal(w.crew[1].level,4);
 assert.deepEqual(w.effects.map(e=>({kind:e.kind,level:e.level,shooterId:e.shooterId})),[{kind:'upgrade',level:4,shooterId:'guest'}]);
 assert.equal(w.effects[0].amount,4);
});
