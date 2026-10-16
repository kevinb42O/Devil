import test from 'node:test';
import assert from 'node:assert/strict';
import {keyboardMovement,stick,controllerState} from '../src/controls';
test('movement follows selected keyboard letters, including AZERTY physical W/A positions',()=>{
 assert.deepEqual(keyboardMovement(new Set(['z','q','Space']),'azerty'),{forward:1,strafe:-1,jump:true});
 assert.deepEqual(keyboardMovement(new Set(['z','q']),'qwerty'),{forward:0,strafe:0,jump:false});
 assert.deepEqual(keyboardMovement(new Set(['w','a']),'qwerty'),{forward:1,strafe:-1,jump:false});
 assert.deepEqual(keyboardMovement(new Set(['z','s','q','d']),'azerty'),{forward:0,strafe:0,jump:false});
});
test('radial deadzone removes drift and preserves full diagonal direction',()=>{
 assert.deepEqual(stick(.05,-.06,.15),[0,0]);assert.deepEqual(stick(1,0,.15),[1,0]);
 const [x,y]=stick(1,1,.15);assert.ok(Math.abs(Math.hypot(x,y)-1)<1e-10);assert.equal(x,y);
 assert.deepEqual(stick(NaN,0,.15),[0,0]);
});
test('standard controller maps movement, look, shoulders, triggers, courtyard action, jump and pause',()=>{
 const buttons=Array.from({length:17},(_,i)=>({pressed:[0,2,4,5,6,7,9].includes(i),value:[0,2,4,5,6,7,9].includes(i)?1:0,touched:false}));
 const state=controllerState({axes:[0,-1,.8,-.4],buttons},.15);
 assert.equal(state.forward,1);assert.equal(state.strafe,0);assert.ok(state.lookX>0&&state.lookY<0);
 assert.ok(state.jump&&state.action&&state.leftShoulder&&state.rightShoulder&&state.fire&&state.homing&&state.pause);assert.equal(state.back,false);
});

import {World,STEP,TUNING,idleInput} from '../src/simulation';
test('partial analog movement scales speed instead of accelerating beyond full-stick speed',()=>{
 for(const amount of [.1,.25,.5,1]){
  const world=new World(1,{schedule:false});const input={...idleInput(),forward:amount};
  for(let i=0;i<120;i++){world.step(input,STEP);assert.ok(Math.hypot(world.player.vel.x,world.player.vel.z)<=TUNING.speed*amount+1e-8);}
  assert.ok(Math.abs(-world.player.vel.z-TUNING.speed*amount)<1e-8,'small stick input reaches its proportional speed despite ground friction');assert.equal(world.state,'playing');
 }
});
test('full diagonal keyboard and controller movement have the same speed',()=>{
 const a=new World(1,{schedule:false}),b=new World(1,{schedule:false});
 for(let i=0;i<120;i++){a.step({...idleInput(),forward:1,strafe:1});b.step({...idleInput(),forward:Math.SQRT1_2,strafe:Math.SQRT1_2});}
 assert.ok(Math.abs(a.player.vel.x-b.player.vel.x)<1e-8);assert.ok(Math.abs(a.player.vel.z-b.player.vel.z)<1e-8);
});
