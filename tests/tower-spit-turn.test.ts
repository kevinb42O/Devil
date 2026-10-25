import {test} from 'node:test';
import assert from 'node:assert/strict';
import {towerSpitTurn,towerDeathPose} from '../src/enemy-presentation';

import {towerEmissionTick} from '../src/tower-spawn';
const kinds=['squid','squid2','squid3'] as const;
test('spawners reverse wind-up, release a full turn, and settle between bursts',()=>{
 for(const kind of kinds)for(const original of [false,true]){
  const start=original?towerEmissionTick(kind,0,0)/60:3,period=original?(towerEmissionTick(kind,1,0)-towerEmissionTick(kind,0,0))/60:20;
  assert.equal(towerSpitTurn(start-.5,kind,original),0);
  assert.ok(towerSpitTurn(start-.1,kind,original)<-.3);
  assert.ok(towerSpitTurn(start+.65,kind,original)>2);
  assert.ok(Math.abs(towerSpitTurn(start+1.7,kind,original)-Math.PI*2)<1e-10);
  const peak=(towerSpitTurn(start+.51,kind,original)-towerSpitTurn(start+.49,kind,original))/.02;
  assert.ok(peak>5,'spit rotation must visibly outrun idle rotation');
  for(const offset of [-.4,0,.85,1.05,1.4,period-.4]){
   const a=towerSpitTurn(start+offset-1e-5,kind,original),b=towerSpitTurn(start+offset+1e-5,kind,original);
   assert.ok(Math.abs(b-a)<.001,'angle must not snap at a phase boundary');
  }
  assert.ok(Math.abs(towerSpitTurn(start+period+1.7,kind,original)-Math.PI*4)<1e-9);
 }
});
test('death spin accelerates while the complete creature sinks beneath the floor',()=>{
 const a=towerDeathPose(.5,16),b=towerDeathPose(1,16),c=towerDeathPose(1.5,16),end=towerDeathPose(2,16);
 assert.ok(c.spin-b.spin>b.spin-a.spin);assert.ok(a.sink<b.sink&&b.sink<c.sink);
 assert.equal(end.sink,16);assert.equal(end.done,true);assert.deepEqual(towerDeathPose(1,16),b);
});
