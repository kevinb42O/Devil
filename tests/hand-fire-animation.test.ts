import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandFireAnimation} from '../src/hand-fire-animation';

test('stream stays dim and steady at every tier, render rate and primary/homing cadence',()=>{
 for(const hz of [30,60,144])for(let level=1;level<=7;level++)for(const interval of [.05,.075,.1]){
  const animation=new HandFireAnimation();let next=0,previous=0;
  for(let frame=0;frame<hz*2;frame++){
   const time=frame/hz;
   while(next<=time+1e-9){animation.trigger(level,false);next+=interval;}
   animation.update(1/hz);
   assert.ok(animation.power>0&&animation.power<=.18,`dim glow: tier ${level}, ${hz} Hz, cadence ${interval}`);
   assert.ok(animation.power>=previous,'continuous stream never flickers back to dark');
   assert.ok(animation.power-previous<.1,'no abrupt brightness jumps');
   previous=animation.power;
  }
  assert.ok(animation.power>.179,'steady glow');
  animation.update(.12);
  for(let frame=0;frame<hz;frame++){
   animation.update(1/hz);assert.ok(animation.power<=previous,'release fades smoothly');previous=animation.power;
  }
  assert.equal(animation.power,0);
 }
});

test('shotgun hits immediately then blends through intermediate skins and settles',()=>{
 const animation=new HandFireAnimation();animation.trigger(7,true);animation.update(.25);
 assert.equal(animation.power,1,'show first frame even after a stall');
 let previous=1;
 for(let i=0;i<18;i++){
  animation.update(.01);assert.ok(animation.power<=previous);previous=animation.power;
  if(i<16)assert.ok(animation.power>0&&animation.power<1);
 }
 assert.equal(animation.power,0);
 animation.trigger(7,true);animation.update(0);assert.equal(animation.power,1,'retrigger');
});

test('stream does not freeze shotgun decay; clear, tier switches and pause reset safely',()=>{
 const animation=new HandFireAnimation();animation.trigger(3,true);animation.update(0);
 for(let i=0;i<30;i++){animation.trigger(3,false);animation.update(.01);}
 animation.update(.6);assert.equal(animation.power,0);
 animation.trigger(3,true);animation.update(0);animation.trigger(4,false);animation.update(0);
 animation.update(.06);assert.ok(animation.power<=.18,'previous tier blast cannot leak');
 const remaining=animation.remaining;
 for(const dt of [0,-1,NaN])animation.update(dt);
 assert.equal(animation.remaining,remaining);
 animation.clear();assert.equal(animation.power,0);assert.equal(animation.remaining,0);
});

test('shotgun envelope agrees across frame rates',()=>{
 const sample=(hz:number)=>{const a=new HandFireAnimation();a.trigger(4,true);a.update(0);for(let i=0;i<hz;i++)a.update(.12/hz);return a.power;};
 for(const hz of [30,60,144])assert.ok(Math.abs(sample(hz)-sample(1))<1e-10);
});
