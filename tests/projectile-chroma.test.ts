import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectileChroma,sprayColor,shotgunPelletColor,SHOTGUN_RAINBOW} from '../src/projectile-chroma';
import {World,type Projectile,v} from '../src/simulation';
import {ALL_PROJECTILE_COLORS} from '../src/projectile-presentation';

const base=ALL_PROJECTILE_COLORS[0];
const shot=(id:number,age=0,shotKey?:string):Projectile=>({id,age,shotKey,pos:v(0,1,-5),vel:v(0,0,-70),level:1,homing:false});
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(...a.map((c,i)=>c-b[i]));

test('spray begins at the weapon colour and evolves smoothly across every loop',()=>{
 assert.deepEqual(sprayColor(0,base),base);
 let previous=sprayColor(0,base),maxStep=0;
 for(let i=1;i<30*240;i++){
  const color=sprayColor(i/240,base);maxStep=Math.max(maxStep,distance(color,previous));
  assert.ok(color.every(c=>c>=0&&c<=1));previous=color;
 }
 assert.ok(maxStep<.02);assert.ok(distance(sprayColor(3.4,base),base)>1);
});

test('salvos retain their colour in flight, across snapshot replacement and seeking lifetime',()=>{
 const world=new World(1,{schedule:false}),chroma=new ProjectileChroma();
 for(let i=0;i<=40;i++){world.time=i*.1;world.projectiles=[shot(i)];chroma.update(world);}
 const original=chroma.color(world.projectiles[0]);
 world.time=11.9;world.projectiles=[shot(40,7.9)];chroma.update(world);
 assert.deepEqual(chroma.color(world.projectiles[0]),original);
});

test('a short pause retains warmth and a long pause returns to the base colour',()=>{
 const run=(pause:number)=>{
  const world=new World(2,{schedule:false}),chroma=new ProjectileChroma();
  for(let i=0;i<=20;i++){world.time=i*.1;world.projectiles=[shot(i)];chroma.update(world);}
  world.time+=pause;world.projectiles=[shot(21)];chroma.update(world);return chroma.color(world.projectiles[0]);
 };
 assert.ok(distance(run(.4),base)>.4);assert.deepEqual(run(3),base);
});

test('each shooter builds their own progression and simultaneous salvo pellets match',()=>{
 const world=new World(3,{schedule:false}),chroma=new ProjectileChroma();
 for(let i=0;i<=30;i++){world.time=i*.1;world.projectiles=[shot(i,0,`a:${i}:0`)];chroma.update(world);}
 const hot=chroma.color(world.projectiles[0]);
 world.projectiles=[...world.projectiles,shot(100,0,'b:1:0'),shot(101,0,'b:1:1')];chroma.update(world);
 assert.ok(distance(hot,base)>.5);assert.deepEqual(chroma.color(world.projectiles[1]),base);
 assert.deepEqual(chroma.color(world.projectiles[1]),chroma.color(world.projectiles[2]));
});

test('snapshot batch order and render cadence produce the same launch colours',()=>{
 const run=(batch:number)=>{
  const world=new World(4,{schedule:false}),chroma=new ProjectileChroma(),colors=[];
  for(let end=batch;end<=60;end+=batch){
   world.time=end*.05;world.projectiles=Array.from({length:end},(_,i)=>shot(i,(end-i)*.05)).reverse();chroma.update(world);
  }
  for(const p of world.projectiles)colors.push(chroma.color(p));return colors;
 };
 const a=run(1),b=run(4);assert.equal(a.length,b.length);
 for(let i=0;i<a.length;i++)assert.ok(distance(a[i],b[i])<1e-12);
});

test('replay rewind resets progression and shotgun pellets retain their rainbow colours',()=>{
 const world=new World(5,{schedule:false}),chroma=new ProjectileChroma();
 for(let i=0;i<=30;i++){world.time=i*.1;world.projectiles=[shot(i)];chroma.update(world);}
 world.time=0;world.projectiles=[shot(0)];chroma.update(world);assert.deepEqual(chroma.color(world.projectiles[0]),base);
 const burst={...shot(10),kind:'shotgun' as const};world.projectiles=[burst];chroma.update(world);
 assert.deepEqual(chroma.color(burst),shotgunPelletColor(burst));
});

test('every shotgun blast contains the full rainbow, with stable colours across shots and prediction',()=>{
 const world=new World(6,{schedule:false}),chroma=new ProjectileChroma();
 for(const sequence of [1,2,17])for(const homing of [false,true]){
  world.time=sequence;
  world.projectiles=Array.from({length:24},(_,i)=>({...shot(sequence*100+i,0,`player:${sequence}:${i}`),kind:'shotgun' as const,homing}));chroma.update(world);
  const colors=world.projectiles.map(p=>chroma.color(p));
  assert.equal(new Set(colors.map(c=>c.join(','))).size,SHOTGUN_RAINBOW.length);
  for(let i=0;i<colors.length;i++)assert.deepEqual(colors[i],SHOTGUN_RAINBOW[i%SHOTGUN_RAINBOW.length]);
  assert.deepEqual(shotgunPelletColor({...world.projectiles[3],id:-999}),colors[3]);
  world.time+=.3;world.projectiles=world.projectiles.map(p=>({...p,age:.3}));chroma.update(world);
  assert.deepEqual(world.projectiles.map(p=>chroma.color(p)),colors);
 }
 const solo=Array.from({length:24},(_,i)=>shotgunPelletColor(shot(321+i)));
 assert.equal(new Set(solo.map(c=>c.join(','))).size,SHOTGUN_RAINBOW.length);
});
