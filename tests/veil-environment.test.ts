import test from 'node:test';
import assert from 'node:assert/strict';
import {veilAt} from '../src/veil-shading';
import {createDescentState} from '../src/descent';

test('veil enters with receding rain and leaves exactly at furnace arrival',()=>{
 for(const time of [0,30,69,100,126,259,380,900])assert.equal(veilAt(time),0,`${time}s outside veil`);
 for(const time of [144,180,230,241])assert.equal(veilAt(time),1,`${time}s full veil`);
 for(const time of [130,135,140])assert.ok(veilAt(time)>0&&veilAt(time)<1);
 for(const time of [245,250,255])assert.ok(veilAt(time)>0&&veilAt(time)<1);
 for(const time of [126,144,241,259])assert.ok(Math.abs(veilAt(time-.001)-veilAt(time+.001))<.0001);
});
test('veil reconstructs independently of sampling history and supports caller-owned state',()=>{
 const state=createDescentState();
 for(const time of [180,270,135,144,0,250,180])assert.equal(veilAt(time,state),veilAt(time));
 for(const time of [NaN,Infinity,-1])assert.equal(veilAt(time),0);
});
