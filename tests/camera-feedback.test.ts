import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CameraFeedback} from '../src/camera-feedback.ts';
import {CAMERA_FEEDBACK as T,feedbackIntensity} from '../src/camera-feedback-tuning.ts';
import {crystalImpactScale} from '../src/impact-presentation.ts';
import type {Effect} from '../src/simulation.ts';
const pos={x:0,y:1.7,z:0};
const event=(kind:Effect['kind'],extra:Partial<Effect>={}):Effect=>({kind,pos:{...pos},...extra});
const length=(p:{x:number;y:number;z:number})=>Math.hypot(p.x,p.y,p.z);
function feedback(){const f=new CameraFeedback();f.configure(100);return f;}

test('intensity accepts zero, bounds values and rejects corrupt storage',()=>{
 assert.equal(feedbackIntensity(0),0);assert.equal(feedbackIntensity(-5),0);assert.equal(feedbackIntensity(200),100);
 for(const value of [NaN,Infinity,'50',null,undefined])assert.equal(feedbackIntensity(value),35);
});
test('only meaningful local player events produce personal camera feedback',()=>{
 for(const kind of ['burst','land','upgrade'] as const){
  const f=feedback();f.event(event(kind),false,pos);f.advance(.02);assert.equal(length(f.sample()),0);
  f.event(event(kind),true,pos);f.advance(.02);assert.ok(length(f.sample())>0,kind);
 }
 for(const kind of ['shot','hit','pickup','jump','spawn','ricochet','bounce'] as const){
  const f=feedback();f.event(event(kind),true,pos);assert.equal(length(f.sample()),0,kind);
 }
});
test('near impacts attenuate with distance and stop exactly at their range',()=>{
 function strength(distance:number){const f=feedback();f.event(event('explosion',{pos:{...pos,x:distance}}),false,pos);f.advance(.02);return length(f.sample());}
 assert.ok(strength(0)>strength(5));assert.ok(strength(5)>strength(15));assert.equal(strength(T.impact.range),0);assert.equal(strength(100),0);
 const f=feedback();f.event(event('kill',{enemy:'skull'}),true,pos);assert.equal(f.diagnostics.active.length,0);
 f.event(event('kill',{enemy:'squid'}),false,pos);assert.equal(f.diagnostics.active.length,1);
});
test('combined effects and chain reactions have fixed storage and bounded displacement',()=>{
 const f=feedback();for(let i=0;i<10000;i++)for(const kind of ['burst','land','upgrade','explosion'] as const)f.event(event(kind),true,pos);
 assert.equal(f.diagnostics.active.length,4);
 for(let i=0;i<100;i++){f.advance(.003);assert.ok(length(f.sample())<=T.maxOffset+1e-12);}
 f.advance(1);assert.deepEqual(f.sample(),{x:0,y:0,z:0});
});
test('shot and network identities deduplicate impulses without extending them',()=>{
 const f=feedback(),e=event('burst',{shotKey:'host:1'});f.event(e,true,pos);f.advance(.05);const before={...f.sample()};
 f.event(e,true,pos);assert.deepEqual(f.sample(),before);f.advance(1);f.event(e,true,pos);assert.equal(length(f.sample()),0);
 f.clear();f.event(e,true,pos);assert.ok(length(f.sample())>0);
 const a=feedback(),remote=event('explosion',{networkId:4});a.event(remote,false,pos);a.advance(.02);const sample={...a.sample()};a.event(remote,false,pos);assert.deepEqual(a.sample(),sample);
});
test('pause freezes and all impulses settle to the exact rest pose',()=>{
 const f=feedback();f.event(event('land'),true,pos);f.advance(.03);const before={...f.sample()};
 for(let i=0;i<30;i++){f.advance(0);assert.deepEqual(f.sample(),before);}
 f.advance(2);assert.deepEqual(f.sample(),{x:0,y:0,z:0});
 f.event(event('burst'),true,pos);f.configure(0);assert.deepEqual(f.sample(),{x:0,y:0,z:0});assert.deepEqual(f.diagnostics.active,[]);
 f.configure(100);assert.deepEqual(f.sample(),{x:0,y:0,z:0});
});
test('analytic response agrees at 30, 60 and 144 fps and does not mutate events',()=>{
 const e=event('explosion'),original=JSON.stringify(e),samples=[];
 for(const fps of [30,60,144]){const f=feedback();f.event(e,false,pos);for(let i=0;i<fps/6;i++)f.advance(1/fps);samples.push({...f.sample()});}
 for(const p of samples)assert.ok(Math.abs(p.y-samples[0].y)<1e-12);
 assert.equal(JSON.stringify(e),original);
});
test('death reaction needs a known contact and points away from that contact',()=>{
 const f=feedback();f.event(event('death'),true,pos);assert.equal(length(f.sample()),0);
 f.event(event('death'),true,pos,0,{...pos,x:-1});assert.ok(f.sample().x>0);assert.equal(f.sample().z,0);
});
test('local crystal reaction is bounded and always restores the base scale',()=>{
 for(let i=-10;i<=100;i++){const scale=crystalImpactScale(i*.005);assert.ok(scale>=.965&&scale<=1.035);}
 assert.equal(crystalImpactScale(-1),1);assert.equal(crystalImpactScale(.16),1);assert.equal(crystalImpactScale(Infinity),1);
});

test('intensity scales the entire response linearly and changing intensity does not restart it',()=>{
 const full=feedback(),scaled=feedback();scaled.configure(35);
 for(const f of [full,scaled]){f.event(event('burst'),true,pos);f.advance(.035);}
 const a={...full.sample()},b={...scaled.sample()};
 for(const k of ['x','y','z'] as const)assert.ok(Math.abs(b[k]-a[k]*.35)<1e-12);
 scaled.configure(70);const changed=scaled.sample();assert.ok(Math.abs(changed.z-a.z*.7)<1e-12);
});
test('light impact cannot replace a stronger active response',()=>{
 const f=feedback();f.event(event('explosion'),false,pos);f.advance(.03);const before={...f.sample()};
 f.event(event('explosion',{pos:{...pos,x:T.impact.range-.1}}),false,pos);
 assert.deepEqual(f.sample(),before);
});
test('landing strength and upgrade tiers convey different weights',()=>{
 function response(e:Effect){const f=feedback();f.event(e,true,pos);f.advance(.025);return length(f.sample());}
 assert.ok(response(event('land',{amount:2}))>response(event('land',{amount:1})));
 assert.ok(response(event('upgrade',{level:4}))>response(event('upgrade',{level:2})));
});
test('a shotgun jump does not create an additional camera channel',()=>{
 const f=feedback();f.event(event('burst'),true,pos);const before={...f.sample()};
 f.event(event('jump',{amount:2}),true,pos);assert.deepEqual(f.sample(),before);assert.deepEqual(f.diagnostics.active,['burst']);
});
test('effect allowlist includes centipede emergence but excludes generic spawns and skull kills',()=>{
 for(const [kind,enemy,expected] of [['emerge','centipede',true],['emerge','skull',false],['spawn','centipede',false],['kill','spider',true],['kill','leviathan',true],['kill','skull4',false]] as const){
  const f=feedback();f.event(event(kind,{enemy}),false,pos);assert.equal(f.diagnostics.active.length>0,expected,`${kind}:${enemy}`);
 }
});
test('invalid deltas do not contaminate or rewind the presentation clock',()=>{
 const f=feedback();f.event(event('burst'),true,pos);f.advance(.025);const before={...f.sample()};
 for(const dt of [-1,NaN,Infinity,-Infinity]){f.advance(dt);assert.deepEqual(f.sample(),before);}
});
test('directional death response respects camera yaw and ignores coincident contacts',()=>{
 const f=feedback();f.event(event('death'),true,pos,0,pos);assert.equal(length(f.sample()),0);
 f.event(event('death'),true,pos,Math.PI/2,{...pos,x:-1});assert.ok(Math.abs(f.sample().x)<1e-12);assert.ok(f.sample().z>0);
});
test('repeated effects across mixed frame times remain finite, bounded and settle',()=>{
 const f=feedback();let seed=17;
 const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<3000;i++){
  if(next()<.4)f.event(event((['burst','land','upgrade','explosion'] as const)[Math.floor(next()*4)],{amount:next()<.5?1:2}),true,pos);
  f.advance(next()*.08);const p=f.sample();assert.ok(Number.isFinite(length(p)));assert.ok(length(p)<=T.maxOffset+1e-12);
 }
 f.advance(10);assert.deepEqual(f.sample(),{x:0,y:0,z:0});
});
test('presentation leaves seeded combat and replay state identical at every tick',async()=>{
 const {World,idleInput}=await import('../src/simulation.ts');
 const control=new World(915),presented=new World(915),f=feedback();
 for(let tick=0;tick<720;tick++){
  const input={...idleInput(),yaw:tick*.001,pitch:tick%240<120?0:-.7,fire:tick%90<8,jump:tick%75===0};
  control.step(input);presented.step(input);
  for(const e of presented.effects)f.event(e,true,presented.player.pos,input.yaw,presented.deathSource?.contactBody);
  f.advance(1/120);f.sample();
  assert.deepEqual(presented.captureCrewCheckpoint(),control.captureCrewCheckpoint(),`tick ${tick}`);
  presented.effects=[];control.effects=[];
 }
});
