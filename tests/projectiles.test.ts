import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v,STEP,TUNING} from '../src/simulation.ts';
import {HAND_MUZZLES,weaponMuzzle} from '../src/weapon-origin.ts';
test('every hand fires physical primary and homing daggers from its fingertip sockets',()=>{
 for(let level=1;level<=4;level++)for(const burst of [false,true])for(const homing of [false,true]){
  if(homing&&level<3)continue;
  const world=new World(71,{schedule:false});world.level=level;world.reserve=200;world.player.pos=v(11,4,-7);
  const input={...idleInput(),yaw:1.3,pitch:.8};world.shoot(input,burst,homing);
  for(let i=0;i<world.projectiles.length;i++){
   const p=world.projectiles[i],origin=weaponMuzzle(world.player.pos,input.yaw,input.pitch,level,i%HAND_MUZZLES[level-1].length);
   assert.deepEqual(p.pos,origin);assert.deepEqual(p.previous,origin);assert.notDeepEqual(p.pos,world.player.pos);
   assert.ok(Math.abs(Math.hypot(p.vel.x,p.vel.y,p.vel.z)-(homing?42:TUNING.projectileSpeed))<1e-9);
  }
  const effect=world.effects.at(-1)!;assert.deepEqual(effect.pos,world.projectiles[0].pos);assert.equal(effect.muzzles?.length,Math.min(world.projectiles.length,HAND_MUZZLES[level-1].length));
 }
});
test('fingertip origin follows horizontal and vertical aim using the camera basis',()=>{
 const eye=v(2,4,-3),local=HAND_MUZZLES[0][0];
 const forward=weaponMuzzle(eye,0,0,1),right=weaponMuzzle(eye,Math.PI/2,0,1),up=weaponMuzzle(eye,0,Math.PI/2,1);
 assert.deepEqual(forward,v(eye.x+local.x,eye.y+local.y,eye.z+local.z));
 assert.ok(Math.abs(right.x-eye.x-local.z)<1e-9);assert.ok(Math.abs(right.z-eye.z+local.x)<1e-9);
 assert.ok(Math.abs(up.y-eye.y+local.z)<1e-9);assert.ok(Math.abs(up.z-eye.z-local.y)<1e-9);
});
test('muzzle parallax converges on a close crosshair target instead of firing below it',()=>{
 for(const range of [1.5,4,15]){
  const world=new World(19,{schedule:false});world.player.pos=v(0,5,0);const target=world.spawn('skull',v(0,5,-range));target.age=2;
  world.shoot(idleInput(),false,false);let ticks=0;
  while(target.hp>0&&ticks++<120)(world as any).updateProjectiles(STEP);
  assert.equal(target.hp,0,'crosshair hit at '+range+'m');
 }
});
test('projectile interpolation keeps the actual prior swept position without aliasing',()=>{
 const world=new World(9,{schedule:false});world.player.pos=v(0,5,0);world.shoot(idleInput(),false,false);const p=world.projectiles[0],origin={...p.pos};
 (world as any).updateProjectiles(STEP);assert.deepEqual(p.previous,origin);assert.notDeepEqual(p.pos,origin);assert.notEqual(p.pos,p.previous);
 const previous={...p.pos};(world as any).updateProjectiles(STEP);assert.deepEqual(p.previous,previous);
});

import {sweepArmor} from '../src/projectile-collision.ts';
import {localToEnemy} from '../src/enemy-presentation.ts';
import {sampleProjectile} from '../src/projectile-presentation.ts';
const tickProjectiles=(world:World)=>(world as any).updateProjectiles(STEP);
test('all tower tiers stop swept primary and homing shots on armor at the exact contact',()=>{
 for(const kind of ['squid','squid2','squid3'] as const)for(const age of [2,6,12])for(const homing of [false,true]){
  const w=new World(12,{schedule:false});w.player.pos=v(0,5,15);
  const e=w.spawn(kind,v(0,8,0));e.age=age;
  let a=v(),b=v(),hit:ReturnType<typeof sweepArmor>=null;
  for(let y=-2;y<-.5&&!hit;y+=.2){a=localToEnemy(e,w.player.pos,v(0,y,8));b=localToEnemy(e,w.player.pos,v(0,y,-8));hit=sweepArmor(e,w.player.pos,a,b);}
  assert.ok(hit,kind+' has solid armor');
  const p={id:900,pos:{...a},vel:v((b.x-a.x)/STEP,(b.y-a.y)/STEP,(b.z-a.z)/STEP),age:0,homing,level:3};w.projectiles.push(p);tickProjectiles(w);
  assert.equal(e.hp,kind==='squid'?10:kind==='squid2'?20:90);
  assert.equal(w.projectiles.length,0);assert.ok(w.effects.some(e=>e.kind==='impact'));assert.equal(w.effects.filter(e=>e.kind==='ricochet').length,0);
  // Homing steering changes the ray before sweeping, so check contact against
  // its actual steered segment, rather than the originally requested endpoint.
  const end=v(a.x+p.vel.x*STEP,a.y+p.vel.y*STEP,a.z+p.vel.z*STEP),actual=sweepArmor(e,w.player.pos,a,end)!;
  assert.ok(Math.abs(p.pos.x-(a.x+(end.x-a.x)*actual.t))<.001);assert.ok(Math.abs(p.pos.z-(a.z+(end.z-a.z)*actual.t))<.001);
 }
});
test('empty space near a tower remains traversable, with no giant invisible hit sphere',()=>{
 const w=new World(1,{schedule:false});const e=w.spawn('squid3',v(0,8,0));e.age=2;
 const a=v(8,12,6),b=v(8,12,-6);assert.equal(sweepArmor(e,w.player.pos,a,b),null);
 const p={id:900,pos:{...a},vel:v(0,0,-12/STEP),age:0,homing:false};w.projectiles.push(p);tickProjectiles(w);
 assert.deepEqual(p.pos,b);assert.equal(w.effects.filter(e=>e.kind==='ricochet').length,0);
});
test('destroyed pede segments absorb shots without damage or ricochets',()=>{
 const w=new World(1,{schedule:false});const e=w.spawn('centipede',v(0,5,0));e.age=4;e.segments[0].hp=0;
 w.projectiles.push({id:900,pos:v(0,5,2),vel:v(0,0,-400),age:0,homing:false});tickProjectiles(w);
 assert.equal(w.projectiles.length,0);assert.equal(w.stats.hits,0);assert.ok(w.effects.some(e=>e.kind==='impact'));assert.equal(w.effects.filter(e=>e.kind==='ricochet').length,0);
});
test('floor impacts retain a damped reflection and a bent interpolated flight path',()=>{
 const w=new World(1,{schedule:false});const p={id:900,pos:v(0,1,0),vel:v(20,-200,0),age:0,homing:false};w.projectiles.push(p);tickProjectiles(w);
 assert.equal(w.projectiles.length,1);assert.ok(p.vel.y>0);assert.ok(p.vel.x<20);assert.ok(w.projectiles[0].path?.length);assert.ok(w.effects.some(e=>e.kind==='ricochet'));
 const out=v();sampleProjectile(w.projectiles[0],w.projectiles[0].path![0].t,out);assert.deepEqual(out,w.projectiles[0].path![0].pos);
 const rebound=p.vel.y;tickProjectiles(w);assert.ok(p.vel.y<rebound,'gravity curves the reflected flight');
});
test('damage impacts expire at contact and never create a ricochet after death',()=>{
 const w=new World(1,{schedule:false});const e=w.spawn('skull',v(0,3,0));e.age=2;
 const p={id:900,pos:v(0,3,2),vel:v(0,-400,-400),age:0,homing:false};
 // Aim through the skull before the floor with a long swept step.
 p.vel.y=-50;w.projectiles.push(p);tickProjectiles(w);
 assert.equal(e.hp,0);assert.equal(w.projectiles.length,0);assert.ok(p.pos.z>0);assert.deepEqual(w.effects.find(e=>e.kind==='hit')?.pos,p.pos);assert.equal(w.effects.filter(e=>e.kind==='ricochet').length,0);
});
test('bent interpolation follows the contact instead of cutting through the obstacle',()=>{
 const p={id:1,pos:v(-1,1,0),previous:v(-1,0,0),vel:v(-1,1,0),age:0,homing:false,path:[{t:.5,pos:v(0,.5,0)}]};
 assert.deepEqual(sampleProjectile(p,.25,v()),v(-.5,.25,0));
 assert.deepEqual(sampleProjectile(p,.75,v()),v(-.5,.75,0));
});

import {projectileLaunchScale} from '../src/projectile-presentation.ts';
test('launch presentation clears fingertip clusters without moving physical shots',()=>{
 const p={id:1,pos:v(0,3,-1),previous:v(0,3,-1),vel:v(0,0,-70),age:STEP,homing:false};
 assert.equal(projectileLaunchScale(p,0),0);
 const mid=projectileLaunchScale(p,.5),end=projectileLaunchScale(p,1);
 assert.ok(mid>0&&mid<end&&end<1);
 p.age=.03;assert.equal(projectileLaunchScale(p,0),1);
 assert.deepEqual(p.pos,v(0,3,-1));assert.deepEqual(p.vel,v(0,0,-70));
});
