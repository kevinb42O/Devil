import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v,STEP} from '../src/simulation';
import {jumpCue,pickupCue,ricochetCues,enemyDamageCue} from '../src/original-audio-cues';
import {weaponShots} from '../src/weapon-audio';
import {encodeEffects,decodeEffects} from '../src/network-effects';

test('real takeoffs distinguish normal, bunnyhop, and precise bunnyhop without changing the jump boost',()=>{
 for(const [delay,expected] of [[0,'jump3'],[3,'jump2'],[9,'jump1']] as const){
  const w=new World(9,{schedule:false});w.startAt(0);w.player.landedAt=w.tick;
  for(let i=0;i<delay;i++)w.step(idleInput());
  w.step({...idleInput(),jump:true});
  const event=w.effects.find(e=>e.kind==='jump')!;assert.ok(event);
  assert.equal(jumpCue(event),expected);assert.ok(w.player.vel.y>0);
 }
 const w=new World(9,{schedule:false});w.startAt(0);w.step({...idleInput(),jump:true});
 assert.equal(jumpCue(w.effects.find(e=>e.kind==='jump')!),'jump1');
});
test('shotgun lift does not masquerade as a foot takeoff or bunnyhop',()=>{
 const w=new World(2,{schedule:false});w.startAt(0,4);w.shoot({...idleInput(),pitch:-1.5},true,false);
 const lift=w.effects.find(e=>e.kind==='jump')!;assert.ok(lift);assert.equal(jumpCue(lift),undefined);
 assert.ok(w.effects.some(e=>e.kind==='burst'));assert.ok(w.player.vel.y>0);
});
test('native shotgun variants exclude the unused shot3 recording and duplicate aliases',()=>{
 assert.deepEqual(weaponShots(1),['shot1']);assert.deepEqual(weaponShots(2),['shot2']);
 assert.deepEqual(weaponShots(3),['shot3alt1','shot3alt2','shot3alt3','shot3alt4']);
 assert.deepEqual(weaponShots(4),['shot4alt1','shot4alt2','shot4alt3','shot4alt4','shot4alt5']);
});
test('native pickups and normal versus homing ricochets use their actual banks',()=>{
 assert.deepEqual([1,2,3,4].map(pickupCue),['gibcollect','gibcollect','gibcollectmagic','gibcollect']);
 for(const [level,amount,stem] of [[1,1,'ricochet'],[2,1,'ricochetmed'],[3,1,'gigaricochet'],[4,1,'gigaricochet'],[3,3,'ricochetmagic'],[4,4,'ricochetmagenta']] as const){
  assert.equal(ricochetCues({kind:'ricochet',pos:v(),level,amount})[0],stem+'1');
 }
});
test('real attached-crystal hits and detachments retain enemy-specific cues',()=>{
 for(const [kind,hit,detach] of [['squid2','damagesquid','damagesquid2'],['squid3','damagesquid','damagesquid3'],['leviathan','damagesquid','damageleviathan']] as const){
  const w=new World(3,{schedule:false}),e=w.spawn(kind,v(8,5,0));w.effects=[];
  const index=e.weakpoints.findIndex(p=>p.hp>1);assert.ok(index>=0);
  w.damageEnemy(e,1,w.weakPoint(e),index,true);
  assert.equal(enemyDamageCue(w.effects.find(e=>e.kind==='hit')!),hit);w.effects=[];
  w.damageEnemy(e,999,w.weakPoint(e),index,true);
  assert.equal(enemyDamageCue(w.effects.find(e=>e.kind==='hit')!),detach);
 }
});
test('tower ejection emits one source-specific gush at the start of each burst',()=>{
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(3,{schedule:false,invulnerable:true}),e=w.spawn(kind,v(15,0,0));w.effects=[];
  for(let i=0;i<8/STEP;i++)w.step(idleInput());
  const gush=w.effects.filter(f=>f.kind==='gush'&&f.enemyId===e.id);assert.equal(gush.length,1,kind);assert.equal(gush[0].enemy,kind);
 }
});
test('jump classification and homing impact metadata survive crew transport',()=>{
 const events=[{kind:'jump' as const,pos:v(),jumpAudio:2 as const,networkId:1},{kind:'hit' as const,pos:v(),homing:true,level:4,networkId:2},{kind:'gush' as const,pos:v(),enemy:'squid2' as const,networkId:3}];
 const decoded=decodeEffects(JSON.parse(encodeEffects(2,events)))!;
 assert.deepEqual(JSON.parse(JSON.stringify(decoded.events)),events);
});

test('large-body death contacts sound once at floor contact and clear without stale playback',async()=>{
 const THREE=await import('three');const {EnemyDeaths}=await import('../src/enemy-death');
 const scene=new THREE.Scene(),model=new THREE.Group();model.name='spider';model.position.y=5;
 model.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));
 const contacts:string[]=[];const deaths=new EnemyDeaths(scene,kind=>contacts.push(kind));
 deaths.begin(1,model,0);deaths.update(.1,new Set());assert.equal(contacts.length,0);
 for(let t=.2;t<2.6;t+=.1)deaths.update(t,new Set());assert.deepEqual(contacts,['spider']);
 deaths.clear();deaths.update(4,new Set());assert.deepEqual(contacts,['spider']);
});
