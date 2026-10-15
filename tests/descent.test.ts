import test from 'node:test';
import assert from 'node:assert/strict';
import {createDescentState,descentAt,DESCENT_CHAPTERS} from '../src/descent';
import {survivalSchedule} from '../src/survival';
import {readFileSync} from 'node:fs';
import {mistAt} from '../src/mist-state';

test('the complete existing sky and mist curves survive the intro unchanged',()=>{
  const baseline=JSON.parse(readFileSync(new URL('./fixtures/environment-before-cosmos.json',import.meta.url),'utf8'));
  for(const row of baseline){
    const sky=descentAt(row.time+30),mist=mistAt(row.time+30);
    for(const [key,value] of Object.entries(row.sky))if(key!=='time')assert.deepEqual(sky[key as keyof typeof sky],value,`sky ${row.time}: ${key}`);
    for(const [key,value] of Object.entries(row.mist))if(key!=='time')assert.deepEqual(mist[key as keyof typeof mist],value,`mist ${row.time}: ${key}`);
  }
});

test('environment milestones shift thirty seconds while encounter ledger stays unchanged',()=>{
  const first=new Map<string,number>();
  for(const event of survivalSchedule()){
    if(!first.has(event.kind))first.set(event.kind,event.time);
    if(event.time>450)break;
  }
  for(const [kind,index] of [['squid2',1],['centipede',2],['leviathan',4],['ghostpede',5]] as const){
    assert.equal(DESCENT_CHAPTERS[index].time,first.get(kind));
    assert.equal(descentAt(first.get(kind)!+30).chapter,index);
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
  const points=[...DESCENT_CHAPTERS.flatMap(c=>[c.time+30,c.time+12]),21,51,85,114,190,211,229,259,326,350,386,410,442];
  for(const time of points.filter(t=>t>0)){
    const before=descentAt(time-1e-5),after=descentAt(time+1e-5);
    for(const key of ['zenith','haze','cloud'] as const)for(let i=0;i<3;i++)assert.ok(Math.abs(before[key][i]-after[key][i])<1e-5,`${key} at ${time}`);
    for(const key of ['coverage','daylight','opening','furnace','cathedral','crown','travel','furnaceHeight','cathedralRise'] as const)assert.ok(Math.abs(before[key]-after[key])<1e-5,`${key} at ${time}`);
  }
});

test('endless survival never recycles landmarks or returns to daylight',()=>{
  const final=descentAt(472);delete (final as Partial<typeof final>).time;delete (final as Partial<typeof final>).environmentTime;
  for(const time of [473,520,1000,100000]){
    const state=descentAt(time);delete (state as Partial<typeof state>).time;delete (state as Partial<typeof state>).environmentTime;
    assert.deepEqual(state,final);
  }
  let previous=0;
  for(let time=0;time<=520;time+=.25){
    const state=descentAt(time);
    assert.ok(state.travel>=previous);previous=state.travel;
    for(const key of ['daylight','opening','furnace','cathedral','crown'] as const)assert.ok(state[key]>=0&&state[key]<=1);
  }
});

 test('cosmic arrival is continuous and reaches the original opening at thirty seconds',()=>{
  assert.equal(descentAt(0).cosmic,1);assert.equal(descentAt(21).cosmic,1);
  assert.equal(descentAt(30).cosmic,0);assert.equal(descentAt(30).environmentTime,0);
  assert.equal(descentAt(144).environmentTime,114);
  for(const time of [21,30]){
    const a=descentAt(time-1e-5),b=descentAt(time+1e-5);
    assert.ok(Math.abs(a.cosmic-b.cosmic)<1e-5);
    assert.ok(Math.abs(a.environmentTime-b.environmentTime)<2e-5);
  }
 });
