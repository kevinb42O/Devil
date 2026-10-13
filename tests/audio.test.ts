import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOUND_NAMES} from '../src/audio.ts';
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
  if(level>=3){for(let i=0;i<30;i++)w.step({...idleInput(),fire:true});w.step({...idleInput(),fire:true,homing:true});assert.equal(w.weaponAudio.primary,false);assert.equal(w.weaponAudio.homing,true);}
  w.die('skull');assert.deepEqual(w.weaponAudio,{primary:false,homing:false});
 }
});
test('sound events preserve hand and jump kind at emission and include landing',()=>{
 const w=new World(3,{schedule:false});w.shoot(idleInput(),true,false);w.level=4;assert.equal(w.effects[0].level,1);
 w.effects=[];w.step({...idleInput(),jump:true});assert.equal(w.effects.find(e=>e.kind==='jump')?.amount,1);
 for(let i=0;i<150;i++)w.step(idleInput());assert.ok(w.effects.some(e=>e.kind==='land'));
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
test('centipede emergence cue is positioned at the surface on first and later emergence',()=>{
 const w=new World(4,{schedule:false,invulnerable:true}),e=w.spawn('centipede',v(20,3,0));
 w.step(idleInput());assert.equal(e.pos.y,-5);
 e.age=3-STEP;w.effects=[];w.step(idleInput());
 assert.deepEqual(w.effects.find(e=>e.kind==='emerge')?.pos,v(20,3,0));
 e.status='burrowing';e.statusUntil=e.age+STEP;w.effects=[];w.step(idleInput());assert.equal(e.status,'emerging');
 w.step(idleInput());assert.equal(w.effects.find(e=>e.kind==='emerge')?.pos.y,3);
});
