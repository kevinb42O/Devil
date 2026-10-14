import test from 'node:test';
import assert from 'node:assert/strict';
import {createDescentState,descentAt,DESCENT_CHAPTERS} from '../src/descent';
import {survivalSchedule} from '../src/survival';

test('descent milestones match the actual encounter ledger',()=>{
  const first=new Map<string,number>();
  for(const event of survivalSchedule()){
    if(!first.has(event.kind))first.set(event.kind,event.time);
    if(event.time>450)break;
  }
  for(const [kind,index] of [['squid2',1],['centipede',2],['leviathan',4],['ghostpede',5]] as const){
    assert.equal(DESCENT_CHAPTERS[index].time,first.get(kind));
    assert.equal(descentAt(first.get(kind)!).chapter,index);
  }
});

test('practice and replay scrubbing reconstruct the same state without history',()=>{
  const out=createDescentState();
  for(const time of [520,0,259,442,39,229,113.5,350,0,259]){
    assert.equal(descentAt(time,out),out);
    assert.deepEqual(out,descentAt(time));
  }
  assert.deepEqual(descentAt(-1),descentAt(0));
  assert.deepEqual(descentAt(NaN),descentAt(0));
  assert.deepEqual(descentAt(Infinity),descentAt(0));
});

test('palette and landmark envelopes are continuous through every transition',()=>{
  const points=[...DESCENT_CHAPTERS.flatMap(c=>[c.time,c.time-18]),21,51,85,114,190,211,229,259,326,350,386,410,442];
  for(const time of points.filter(t=>t>0)){
    const before=descentAt(time-1e-5),after=descentAt(time+1e-5);
    for(const key of ['zenith','haze','cloud'] as const)for(let i=0;i<3;i++)assert.ok(Math.abs(before[key][i]-after[key][i])<1e-5,`${key} at ${time}`);
    for(const key of ['coverage','daylight','opening','furnace','cathedral','crown','travel','furnaceHeight','cathedralRise'] as const)assert.ok(Math.abs(before[key]-after[key])<1e-5,`${key} at ${time}`);
  }
});

test('endless survival never recycles landmarks or returns to daylight',()=>{
  const final=descentAt(442);delete (final as Partial<typeof final>).time;
  for(const time of [443,520,1000,100000]){
    const state=descentAt(time);delete (state as Partial<typeof state>).time;
    assert.deepEqual(state,final);
  }
  let previous=0;
  for(let time=0;time<=520;time+=.25){
    const state=descentAt(time);
    assert.ok(state.travel>=previous);previous=state.travel;
    for(const key of ['daylight','opening','furnace','cathedral','crown'] as const)assert.ok(state[key]>=0&&state[key]<=1);
  }
});
