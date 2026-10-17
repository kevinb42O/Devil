import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandRecoil} from '../src/hand-recoil';
import {shotgunFeedback} from '../src/weapon-tuning';

test('every tier hits immediately, holds briefly and returns without overshoot',()=>{
 for(let level=1;level<=7;level++){
  const recoil=new HandRecoil(),t=shotgunFeedback(level);recoil.trigger(t.kick,t.recovery,t.hold);recoil.update(0);
  assert.equal(recoil.value,t.kick);recoil.update(.01);assert.equal(recoil.value,t.kick);
  let previous=recoil.value;
  for(let i=0;i<100;i++){recoil.update(.01);assert.ok(recoil.value>=0&&recoil.value<=previous);previous=recoil.value;}
  assert.equal(recoil.value,0);
 }
});
test('recovery agrees across frame rates and freezes exactly when paused',()=>{
 const sample=(hz:number)=>{const recoil=new HandRecoil();recoil.trigger(.32,24);recoil.update(0);for(let i=0;i<hz;i++)recoil.update(.2/hz);return recoil.value;};
 for(const hz of [30,60,144])assert.ok(Math.abs(sample(hz)-sample(1))<1e-10);
 const recoil=new HandRecoil();recoil.trigger(.2,27);recoil.update(0);recoil.update(.08);const value=recoil.value;
 for(const dt of [0,-1,NaN])recoil.update(dt);assert.equal(recoil.value,value);
 recoil.clear();assert.equal(recoil.value,0);
});
test('switching from a blast to stream cannot abruptly snap the hands forward',()=>{
 const recoil=new HandRecoil();recoil.trigger(.32,24);recoil.update(0);recoil.update(.06);const value=recoil.value;
 recoil.trigger(.009,29);assert.equal(recoil.value,value);
 recoil.update(.016);assert.ok(recoil.value<value&&recoil.value>.009);
 recoil.trigger(.32,24);assert.equal(recoil.value,.32);
});


test('higher tiers deliver a longer held impact as well as stronger depth recoil',()=>{
 let previousImpulse=0;
 for(let level=1;level<=7;level++){
  const t=shotgunFeedback(level),recoil=new HandRecoil();recoil.trigger(t.kick,t.recovery,t.hold);recoil.update(0);
  recoil.update(t.hold);assert.equal(recoil.value,t.kick);
  const impulse=t.kick*(t.hold+2/t.recovery);assert.ok(impulse>previousImpulse);previousImpulse=impulse;
 }
 for(const [level,old] of [[3,.15],[4,.19],[5,.23],[6,.275],[7,.32]])assert.ok(shotgunFeedback(level).kick>old*1.4);
});
