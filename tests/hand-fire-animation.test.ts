import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandFireAnimation} from '../src/hand-fire-animation';

test('stream alternates skins at every tier, render rate and primary/homing cadence',()=>{
 for(const hz of [30,60,144])for(let level=3;level<=7;level++)for(const interval of [.05,.075,.1]){
  const animation=new HandFireAnimation();let next=0,bright=0,dark=0;
  for(let frame=0;frame<hz*2;frame++){
   const time=frame/hz;
   while(next<=time+1e-9){animation.trigger(level,false);next+=interval;}
   animation.update(1/hz);
   if(animation.power===1)bright++;else if(animation.power===0)dark++;
  }
  assert.ok(bright>hz/2&&dark>hz/2,`tier ${level}, ${hz} Hz, cadence ${interval}`);
  animation.update(.2);assert.equal(animation.power,0);
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
 animation.update(.12);assert.equal(animation.power,0);
 animation.trigger(3,true);animation.update(0);animation.trigger(4,false);animation.update(0);
 animation.update(.06);assert.equal(animation.power,0,'previous tier blast cannot leak');
 const remaining=animation.remaining;
 for(const dt of [0,-1,NaN])animation.update(dt);
 assert.equal(animation.remaining,remaining);
 animation.clear();assert.equal(animation.power,0);assert.equal(animation.remaining,0);
});

test('shotgun envelope agrees across frame rates',()=>{
 const sample=(hz:number)=>{const a=new HandFireAnimation();a.trigger(4,true);a.update(0);for(let i=0;i<hz;i++)a.update(.12/hz);return a.power;};
 for(const hz of [30,60,144])assert.ok(Math.abs(sample(hz)-sample(1))<1e-10);
});
