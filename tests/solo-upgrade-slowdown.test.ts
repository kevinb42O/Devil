import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SoloUpgradeSlowdown,SOLO_UPGRADE_SLOWDOWN as T} from '../src/solo-upgrade-slowdown';

test('solo upgrade slows the clock immediately, holds briefly and recovers smoothly',()=>{
 const clock=new SoloUpgradeSlowdown();assert.equal(clock.rate,1);assert.ok(Math.abs(clock.advance(.02)-.02)<1e-12);
 clock.begin();assert.equal(clock.rate,T.minimum);assert.ok(Math.abs(clock.advance(.1)-.1*T.minimum)<1e-12);
 clock.advance(.1);assert.ok(clock.rate>T.minimum&&clock.rate<1);
 clock.advance(T.duration);assert.equal(clock.rate,1);assert.ok(Math.abs(clock.advance(.1)-.1)<1e-12);
});
test('slowdown admits identical simulation time across frame rates and stalls',()=>{
 const run=(steps:number[])=>{const clock=new SoloUpgradeSlowdown();clock.begin();return steps.reduce((time,dt)=>time+clock.advance(dt),0);};
 const whole=run([1]);
 for(const hz of [30,60,144,240])assert.ok(Math.abs(run(Array.from({length:hz},()=>1/hz))-whole)<1e-10);
 assert.ok(Math.abs(run([.02,.4,.08,.5])-whole)<1e-10);
 assert.ok(whole>.5&&whole<.8);
});
test('restart clears slowdown, retrigger stays bounded, and frozen or invalid frames do not age it',()=>{
 const clock=new SoloUpgradeSlowdown();clock.begin();clock.advance(.3);const rate=clock.rate;
 assert.equal(clock.advance(0),0);assert.equal(clock.advance(NaN),0);assert.equal(clock.advance(-1),0);assert.equal(clock.rate,rate);
 clock.begin();assert.equal(clock.rate,T.minimum);clock.clear();assert.equal(clock.rate,1);
 assert.ok(Math.abs(clock.advance(.03)-.03)<1e-12);
});
