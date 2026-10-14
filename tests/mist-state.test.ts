import test from 'node:test';
import assert from 'node:assert/strict';
import {mistAt} from '../src/mist-state';
import {descentAt,DESCENT_CHAPTERS} from '../src/descent';

test('mist follows sky chapters continuously, including skips and rewind',()=>{
  for(const time of [0,8,21,30,39,96,114,211,229,332,350,424,442,900,1e6]){
    const mist=mistAt(time),sky=descentAt(time);
    assert.equal(mist.chapter,sky.chapter);assert.equal(mist.blend,sky.blend);
    assert.ok(mist.density>0&&mist.density<.2);assert.ok(mist.height>=3.8&&mist.height<=22);
    assert.ok(mist.color.every(Number.isFinite));
    mistAt(time+50);assert.deepEqual(mistAt(time),mist);
  }
  for(const {time} of DESCENT_CHAPTERS.slice(1))for(const boundary of [time-18,time]){
    const a=mistAt(boundary-1e-4),b=mistAt(boundary+1e-4);
    for(const key of ['density','height','falloff','bank','smoke','shafts'] as const)assert.ok(Math.abs(a[key]-b[key])<1e-3,`${boundary}: continuous ${key}`);
  }
});
test('cloud layer arrives as opening clears; later chapters have distinct media',()=>{
  assert.ok(mistAt(19).density<mistAt(0).density);
  assert.ok(mistAt(39).density>mistAt(21).density*2);
  assert.ok(mistAt(39).height>mistAt(0).height*3);
  assert.ok(mistAt(114).color[2]>mistAt(114).color[1]);
  assert.equal(mistAt(229).smoke,1);assert.equal(mistAt(350).shafts,1);
  assert.ok(Math.max(...mistAt(442).color)<.01,'depths are only faintly lit without nearby emissive sources');
  assert.ok(mistAt(442).density>0,'darkness still contains a medium for light to reveal');
});
test('reduced motion stops fog pulses while retaining phase transitions',()=>{
  assert.notEqual(mistAt(45.5).pulse,mistAt(58.5).pulse);
  assert.equal(mistAt(45.5,true).pulse,mistAt(58.5,true).pulse);
  assert.notDeepEqual(mistAt(39,true).color,mistAt(229,true).color);
  for(const time of [NaN,Infinity,-50])assert.deepEqual(mistAt(time),mistAt(0));
});
