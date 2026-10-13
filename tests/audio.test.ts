import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOUND_NAMES,entranceSounds} from '../src/audio.ts';
import {World,STEP,idleInput,v} from '../src/simulation.ts';
const ROOT=new URL('../assets/original/devil-daggers/audio/',import.meta.url);
test('every imported original recording is intact PCM, and every runtime cue exists',()=>{
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',ROOT),'utf8'));
 const available=new Set<string>();
 for(const entry of manifest.files){
  const data=readFileSync(new URL(entry.name+'.wav',ROOT));available.add(entry.name);
  assert.equal(data.length,entry.bytes,entry.name);assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256,entry.name);
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');
  let format=false,samples=false;
  for(let offset=12;offset+8<=data.length;){const name=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4);assert.ok(offset+8+size<=data.length,entry.name+' truncated chunk');
   if(name==='fmt '){assert.equal(data.readUInt16LE(offset+8),1,entry.name+' PCM');format=true;}
   if(name==='data'){assert.ok(size>0,entry.name+' empty');samples=true;}
   offset+=8+size+(size%2);
  }
  assert.ok(format&&samples,entry.name);
 }
 for(const name of SOUND_NAMES)assert.ok(available.has(name),'missing runtime recording '+name);
 assert.equal(manifest.files.length,275);
});
test('audio stream state follows release, primary/homing priority and death at every hand',()=>{
 for(let level=1;level<=4;level++){
  const w=new World(7,{schedule:false});w.level=level;w.reserve=100;
  for(let i=0;i<30;i++)w.step({...idleInput(),fire:true});assert.equal(w.weaponAudio.primary,true);
  w.step(idleInput());assert.equal(w.weaponAudio.primary,false);
  if(level>=2){for(let i=0;i<30;i++)w.step({...idleInput(),fire:true});w.step({...idleInput(),fire:true,homing:true});assert.equal(w.weaponAudio.primary,false);assert.equal(w.weaponAudio.homing,true);}
  w.die('skull');assert.deepEqual(w.weaponAudio,{primary:false,homing:false});
 }
});
test('sound events preserve hand and jump kind at emission and include landing',()=>{
 const w=new World(3,{schedule:false});w.shoot(idleInput(),true,false);w.level=4;assert.equal(w.effects[0].level,1);
 w.effects=[];w.step({...idleInput(),jump:true});assert.equal(w.effects.find(e=>e.kind==='jump')?.amount,1);
 for(let i=0;i<150;i++)w.step(idleInput());assert.ok(w.effects.some(e=>e.kind==='land'));
});
test('walking over uneven arena tiles does not emit landing thuds',()=>{
 for(const yaw of [0,.4,.8,1.6]){
  const w=new World(1,{schedule:false,invulnerable:true});
  for(let i=0;i<300;i++){
   w.effects=[];w.step({...idleInput(),forward:1,yaw});
   assert.ok(!w.effects.some(e=>e.kind==='land'),`walking landing at yaw ${yaw}, tick ${i}`);
  }
 }
});
test('real falls retain soft and heavy landing cues',()=>{
 for(const [height,amount] of [[.5,1],[3,2]]){
  const w=new World(1,{schedule:false});w.startAt(0);w.player.pos.y+=height;w.player.grounded=false;
  for(let i=0;i<120;i++)w.step(idleInput());
  assert.deepEqual(w.effects.filter(e=>e.kind==='land').map(e=>e.amount),[amount]);
 }
});
test('egg hatch and projectile ricochet emit positional sound events',()=>{
 const w=new World(4,{schedule:false}),egg=w.spawn('egg2',v(10,2,0));egg.age=10-STEP;w.step(idleInput());assert.ok(w.effects.some(e=>e.kind==='hatch'&&e.enemy==='egg2'));
 w.projectiles.push({id:999,pos:v(0,.2,0),vel:v(0,-50,0),age:0,homing:false});w.step(idleInput());assert.ok(w.effects.some(e=>e.kind==='ricochet'));
});
test('damage and death effects identify the enemy that made the sound',()=>{
 const w=new World(4,{schedule:false}),a=w.spawn('skull2',v(10,3,0)),b=w.spawn('skull2',v(15,3,0));w.effects=[];
 w.damageEnemy(a,1);w.damageEnemy(b,1);w.damageEnemy(a,100);
 assert.deepEqual(w.effects.filter(e=>e.kind==='hit').map(e=>e.enemyId),[a.id,b.id,a.id]);
 assert.equal(w.effects.find(e=>e.kind==='kill')?.enemyId,a.id);
});
test('centipede emergence cues occur at the ground crossing on each cycle',()=>{
 const w=new World(4,{schedule:false,invulnerable:true}),e=w.spawn('centipede',v(20,3,0));
 const cues=[];let dives=0;
 for(let i=0;i<120*70;i++){
  w.effects=[];w.step(idleInput());
  for(const effect of w.effects){if(effect.kind==='emerge')cues.push(effect);if(effect.kind==='burrow')dives++;}
 }
 assert.ok(cues.length>=2);assert.ok(dives>=2);
 assert.ok(cues.every(c=>c.pos.y>=0&&c.pos.y<.3));assert.notDeepEqual(cues[0].pos,cues[1].pos);
});

test('solo dagger recordings follow the original best-time tiers',()=>{
 const thresholds=[0,60,120,250,500,1000];const suffixes=['','1bronze','2silver','3gold','4devil','5'];
 thresholds.forEach((time,i)=>{assert.deepEqual(entranceSounds(time),{call:'daggercall'+suffixes[i],collect:'daggercollect'+suffixes[i]});if(i)assert.equal(entranceSounds(time-.01).collect,'daggercollect'+suffixes[i-1]);});
});
