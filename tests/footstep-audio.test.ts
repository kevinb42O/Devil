import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {MOVEMENT_MOTION} from '../src/movement-motion.ts';
import assert from 'node:assert/strict';
import {FootstepGait,FOOTSTEP_SOUNDS,WET_FOOTSTEP_SOUNDS,ALL_FOOTSTEP_SOUNDS,footstepSurface} from '../src/footstep-audio.ts';
import {World,idleInput,STEP} from '../src/simulation.ts';
import {remakeAudioAsset} from '../src/remake-audio.ts';
import {hearingProfile,distanceEnvelope} from '../src/spatial-audio.ts';
import {arenaReverbSend} from '../src/arena-reverb.ts';

function walk(fps:number,speed=11,diagonal=false){
 const w=new World(1,{schedule:false}),gait=new FootstepGait(),steps:{time:number;side:number}[]=[];
 gait.update('local',w.player,0);
 for(let frame=1;frame<=fps*4;frame++){
  const component=speed/(diagonal?Math.sqrt(2):1);w.player.vel.x=component;w.player.vel.z=diagonal?component:0;
  w.player.pos.x+=component/fps;w.player.pos.z+=(diagonal?component:0)/fps;
  const step=gait.update('local',w.player,frame/fps);if(step)steps.push({time:frame/fps,side:step.side});
 }
 return steps;
}
test('distance cadence is stable across frame rates and diagonals, without an artificial early first contact',()=>{
 const base=walk(120);assert.ok(base.length>=18&&base.length<=19);
 for(const fps of [30,60,144])assert.ok(Math.abs(walk(fps).length-base.length)<=1);
 assert.equal(walk(60,11,true).length,walk(60).length);
 assert.ok(Math.abs(base[0].time-MOVEMENT_MOTION.stride/2/11)<1/120);
 for(let i=1;i<base.length;i++)assert.ok(Math.abs(base[i].time-base[i-1].time-MOVEMENT_MOTION.stride/2/11)<1/120);
 for(let i=1;i<base.length;i++){assert.notEqual(base[i].side,base[i-1].side);assert.ok(base[i].time-base[i-1].time>=.17);}
 assert.ok(walk(60,3).length<base.length);
});
test('no idle, blocked, airborne, landing double, teleport, or resumed backlog footsteps',()=>{
 const w=new World(1,{schedule:false}),g=new FootstepGait();g.update('a',w.player,0);
 w.player.vel.x=11;
 for(let i=1;i<=60;i++)assert.equal(g.update('a',w.player,i/60),undefined,'wall pushing');
 w.player.grounded=false;
 for(let i=61;i<=90;i++){w.player.pos.x+=11/60;assert.equal(g.update('a',w.player,i/60),undefined);}
 w.player.grounded=true;w.player.pos.x+=.1;assert.equal(g.update('a',w.player,91/60),undefined,'landing owns its impact');
 w.player.pos.x+=15;assert.equal(g.update('a',w.player,92/60),undefined,'teleport');
 w.player.pos.x+=1;assert.equal(g.update('a',w.player,5),undefined,'tab gap');
 assert.equal(g.update('a',w.player,5),undefined,'duplicate frame');
 g.clear();assert.equal(g.update('a',w.player,6),undefined);
});
test('real arena movement emits footsteps without changing simulation effects or random state',()=>{
 const w=new World(4,{schedule:false,invulnerable:true}),control=new World(4,{schedule:false,invulnerable:true}),g=new FootstepGait();let count=0;
 for(let i=0;i<180;i++){
  const input={...idleInput(),forward:1};w.step(input);control.step(input);
  if(g.update('a',w.player,i*STEP))count++;
 }
 assert.ok(count>=5);assert.deepEqual(w.player,control.player);assert.deepEqual(w.effects,control.effects);
});
test('all twelve distinct cues use the licensed catalog and restrained positional room profile',()=>{
 assert.equal(new Set(FOOTSTEP_SOUNDS).size,12);
 for(const name of ALL_FOOTSTEP_SOUNDS){const asset=remakeAudioAsset(name);assert.equal(asset.role,'footstep');assert.ok(asset.duration>=.19&&asset.duration<=.21);assert.equal(asset.loop,false);}
 const range=hearingProfile(FOOTSTEP_SOUNDS[0],'footstep');assert.equal(distanceEnvelope(20,range.maxDistance),0);
 assert.ok(arenaReverbSend('footstep').tail<arenaReverbSend('movement').tail);
});
test('packet-spaced remote motion preserves stride phase without phantom idle contacts',()=>{
 const w=new World(1,{schedule:false}),g=new FootstepGait();let count=0;
 w.player.vel.x=11;g.update('remote',w.player,0);
 for(let i=1;i<=240;i++){
  if(i%3===0)w.player.pos.x+=11/20;
  if(g.update('remote',w.player,i/60))count++;
 }
 assert.ok(count>=17&&count<=19,`remote contacts: ${count}`);
});

test('every shuffled recording has the same prompt impact and a quiet bounded output',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/assets/audio/remake/manifest.json',import.meta.url),'utf8'));
 for(const name of ALL_FOOTSTEP_SOUNDS){
  const asset=manifest[name],data=readFileSync(new URL('../public/assets/audio/remake/'+asset.file,import.meta.url));
  let pcm=Buffer.alloc(0),sampleRate=0;
  for(let i=12;i+8<=data.length;){const chunk=data.toString('ascii',i,i+4),size=data.readUInt32LE(i+4);if(chunk==='fmt ')sampleRate=data.readUInt32LE(i+12);if(chunk==='data')pcm=data.subarray(i+8,i+8+size);i+=8+size+(size%2);}
  const window=240,energy=[];
  for(let start=0;start+window<=pcm.length/2;start+=window){let sum=0;for(let j=0;j<window;j++)sum+=(pcm.readInt16LE((start+j)*2)/32768)**2;energy.push(sum/window);}
  const attack=energy.indexOf(Math.max(...energy))*window/sampleRate;
  assert.ok(attack<=.015,`${name}: main impact delayed by ${attack}s`);
  assert.ok(asset.peak*asset.gain*.9*.55<.0053,`${name}: first-person peak ceiling`);
  assert.ok(asset.rms*asset.gain*.9*.55<.00075,`${name}: first-person RMS ceiling`);
 }
});

test('footstep material matches the visible wet floor, remains quiet, and reconstructs on seeks',()=>{
 assert.equal(WET_FOOTSTEP_SOUNDS.length,12);
 for(const t of [0,30,50,241,400])assert.deepEqual(footstepSurface(t),{dry:1,wet:0});
 assert.deepEqual(footstepSurface(100),{dry:0,wet:1});
 assert.deepEqual(footstepSurface(144),{dry:0,wet:1},'wet floor persists after rain');
 assert.ok(footstepSurface(180).wet>0&&footstepSurface(180).wet<1);
 for(const t of [100,60,180,100,241]){
  const surface=footstepSurface(t);assert.equal(surface.dry+surface.wet,1,'no additive gain boost');
  assert.deepEqual(footstepSurface(t,true),{dry:1,wet:0},'sheltered courtyard stays dry');
 }
 let previous=0;
 for(let t=51;t<=83;t+=.1){const wet=footstepSurface(t).wet;assert.ok(wet>=previous&&wet-previous<.005);previous=wet;}
});
