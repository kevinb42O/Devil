import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v,STEP,TUNING} from '../src/simulation.ts';
import {HAND_MUZZLES,HAND_TIP_MUZZLES,weaponMuzzle} from '../src/weapon-origin.ts';
import {STREAM_RADIUS} from '../src/weapon-tuning.ts';
import {STREAM_COUNTS} from '../src/weapon-levels.ts';
test('stream radius fills multiple lanes with the full primary salvo at every hand',()=>{
 let previousWidth=0;
 for(let level=1;level<=4;level++){
  const world=new World(71,{schedule:false});world.level=level;world.player.pos=v(0,5,0);
  const lanes=new Set<string>();let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let salvo=0;salvo<100;salvo++){
   world.projectiles=[];world.effects=[];world.shoot(idleInput(),false,false);
   assert.equal(world.projectiles.length,STREAM_COUNTS[level-1],'every primary dagger is damage-bearing');
   for(let i=0;i<world.projectiles.length;i++){
    const p=world.projectiles[i],socket=weaponMuzzle(world.player.pos,0,0,level,i);
    const x=p.pos.x-socket.x,y=p.pos.y-socket.y;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    lanes.add(`${Math.floor(x/STREAM_RADIUS[level-1]*3)},${Math.floor(y/STREAM_RADIUS[level-1]*3)}`);
   }
  }
  assert.ok(lanes.size>20,'even hand I fills a disc instead of a single fixed firing lane');
  assert.ok(maxX-minX>STREAM_RADIUS[level-1]*1.7&&maxY-minY>STREAM_RADIUS[level-1]*1.7,'bullets fill both dimensions of the beam radius');
  assert.ok(maxX-minX>previousWidth,'each upgrade has a wider physical stream');previousWidth=maxX-minX;
 }
});
test('wider stream preserves damage per bullet and point-blank effectiveness',()=>{
 for(let level=1;level<=4;level++){
  const worlds=[new World(71,{schedule:false,legacyStreamRadius:true}),new World(71,{schedule:false})];
  const targets=worlds.map(world=>{world.level=level;world.player.pos=v(0,5,0);const target=world.spawn('skull3',v(0,5,-1.5));target.age=2;target.hp=10000;return target;});
  for(const world of worlds){for(let salvo=0;salvo<30;salvo++)world.shoot(idleInput(),false,false);for(let tick=0;tick<60;tick++)(world as any).updateProjectiles(STEP);}
  const damage=10000-targets[1].hp;
  assert.equal(damage,worlds[1].stats.hits,'every primary bullet still deals exactly one damage');
  assert.ok(damage>=worlds[1].stats.shots*.95,'close crosshair targets retain at least 95% of the shot damage');
  assert.ok(Math.abs(targets[0].hp-targets[1].hp)<=STREAM_COUNTS[level-1],'close-target damage differs by at most one stream salvo');
 }
});
test('physical stream expands toward aim as a cone rather than parallel or inward lanes',()=>{
 for(let level=1;level<=4;level++){
  const world=new World(71,{schedule:false});world.level=level;world.player.pos=v(0,5,0);
  for(let salvo=0;salvo<100;salvo++){
   world.projectiles=[];world.shoot(idleInput(),false,false);
   for(let i=0;i<world.projectiles.length;i++){
    const p=world.projectiles[i],socket=weaponMuzzle(world.player.pos,0,0,level,i);
    const x=p.pos.x-socket.x,y=p.pos.y-socket.y;
    // Measure about the central muzzle-to-crosshair ray, which includes the
    // hand's vertical parallax, rather than about a world-horizontal line.
    const centerX=(world.player.pos.x-socket.x)/(196+socket.z-world.player.pos.z);
    const centerY=(world.player.pos.y-socket.y)/(196+socket.z-world.player.pos.z);
    const slopeX=p.vel.x/-p.vel.z-centerX,slopeY=p.vel.y/-p.vel.z-centerY;
    assert.ok(x*slopeX+y*slopeY>0,'outward radial velocity');
    const atDistance=(distance:number)=>Math.hypot(x+slopeX*distance,y+slopeY*distance);
    const core=level>1&&i<(level===4?2:1);
    assert.ok(atDistance(10)>atDistance(2)*(core?1.5:4),core?'focused core still expands':'outer cone is over four times wider at 10m than at 2m');
   }
  }
 }
});
test('every hand launches compact bursts and streams throughout its circular firing area',()=>{
 for(let level=1;level<=4;level++)for(const burst of [false,true])for(const homing of [false,true]){
  if(homing&&level<3)continue;
  const world=new World(71,{schedule:false});world.level=level;world.reserve=200;world.player.pos=v(11,4,-7);
  const input={...idleInput(),yaw:1.3,pitch:.8};world.shoot(input,burst,homing);
  for(let i=0;i<world.projectiles.length;i++){
   const p=world.projectiles[i],origin=weaponMuzzle(world.player.pos,input.yaw,input.pitch,level,i%HAND_MUZZLES[level-1].length);
   if(burst){const center=weaponMuzzle(world.player.pos,input.yaw,input.pitch,level,0);assert.ok(Math.hypot(p.pos.x-center.x,p.pos.y-center.y,p.pos.z-center.z)<=.01+1e-9);assert.equal(p.kind,'shotgun');}
   else{
    const dx=p.pos.x-origin.x,dy=p.pos.y-origin.y,dz=p.pos.z-origin.z;
    assert.ok(Math.hypot(dx,dy,dz)<=STREAM_RADIUS[level-1]+1e-9,'stream launch stays inside its radius');
    const forward=v(-Math.sin(input.yaw)*Math.cos(input.pitch),Math.sin(input.pitch),-Math.cos(input.yaw)*Math.cos(input.pitch));
    assert.ok(Math.abs(dx*forward.x+dy*forward.y+dz*forward.z)<1e-9,'stream area is perpendicular to aim');
   }
   assert.deepEqual(p.previous,p.pos);assert.notDeepEqual(p.pos,world.player.pos);
   assert.ok(Math.abs(Math.hypot(p.vel.x,p.vel.y,p.vel.z)-(homing?42:TUNING.projectileSpeed))<1e-9);
  }
  const effect=world.effects.at(-1)!;assert.deepEqual(effect.pos,world.projectiles[0].pos);assert.equal(effect.muzzles?.length,burst?1:Math.min(world.projectiles.length,HAND_MUZZLES[level-1].length));
 }
});
test('under-hand origin follows horizontal and vertical aim using the camera basis',()=>{
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
import {localToEnemy,crystalToEnemy,towerOutletHeight} from '../src/enemy-presentation.ts';
import {sampleProjectile,projectileRoll} from '../src/projectile-presentation.ts';
import {samplePlayerPosition} from '../src/player-presentation.ts';
test('each projectile has a distinct stable axial roll, including predicted and host shots',()=>{
 const rolls=Array.from({length:1000},(_,i)=>projectileRoll({id:i+1}));assert.equal(new Set(rolls).size,1000);
 for(const roll of rolls)assert.ok(roll>=0&&roll<Math.PI*2);
 for(let i=0;i<60;i++){
  const shotKey=`guest:17:${i}`;
  assert.equal(projectileRoll({id:-i-1,shotKey}),projectileRoll({id:1000+i,shotKey}),'roll survives host confirmation');
 }
 const p={id:91};assert.equal(projectileRoll(p),projectileRoll(p),'roll is fixed through flight');
});
test('new emitters sit below and behind the original fingertips at every hand',()=>{
 for(let level=0;level<4;level++)for(let socket=0;socket<HAND_MUZZLES[level].length;socket++){
  const origin=HAND_MUZZLES[level][socket],tip=HAND_TIP_MUZZLES[level][socket];
  assert.ok(origin.y<tip.y);assert.ok(origin.z>tip.z,'emitter is closer to the palm and camera');
  assert.deepEqual(weaponMuzzle(v(),0,0,level+1,socket,true),tip,'historical origins stay available for saved replays');
 }
});
test('moving the shooter never adds strafe, forward or jump momentum to a fired dagger',()=>{
 for(let level=1;level<=4;level++)for(const burst of [false,true])for(const velocity of [v(18,0,0),v(-18,0,0),v(0,0,-18),v(12,9,-12)]){
  const still=new World(31,{schedule:false}),moving=new World(31,{schedule:false});
  for(const w of [still,moving]){w.level=level;w.player.pos=v(0,8,0);}
  moving.player.vel={...velocity};const input={...idleInput(),yaw:.7,pitch:.2};
  still.shoot(input,burst,false);moving.shoot(input,burst,false);
  assert.deepEqual(moving.projectiles,still.projectiles,'launch direction is independent of player momentum');
  const velocities=moving.projectiles.map(p=>({...p.vel}));
  for(let tick=0;tick<20;tick++){
   still.step(idleInput());moving.step({...input,strafe:1});
   assert.deepEqual(moving.projectiles,still.projectiles,'flight stays fixed in world space after launch');
   assert.deepEqual(moving.projectiles.map(p=>p.vel),velocities,'primary shots remain straight');
  }
 }
});
test('camera and projectiles share one render time through fast strafing, jumping and reversal',()=>{
 const w=new World(31,{schedule:false});w.player.pos=v(0,8,0);w.player.vel=v(18,9,0);w.shoot(idleInput(),false,false);
 for(let tick=0;tick<30;tick++){
  const before={...w.player.pos};w.step({...idleInput(),strafe:tick<15?1:-1});
  assert.deepEqual(w.previousPlayerPosition,before);assert.notEqual(w.previousPlayerPosition,w.player.pos);
  const p=w.projectiles[0];
  for(const alpha of [0,.1,.25,.5,.9,1]){
   const eye=samplePlayerPosition(w,alpha,v()),bullet=sampleProjectile(p,alpha,v());
   for(const axis of ['x','y','z'] as const){
    const start=p.previous![axis]-before[axis],end=p.pos[axis]-w.player.pos[axis];
    assert.ok(Math.abs(bullet[axis]-eye[axis]-(start+(end-start)*alpha))<1e-9,'relative position uses the same interpolation fraction');
   }
  }
 }
 assert.deepEqual(samplePlayerPosition(w,1,v()),w.player.pos);
 assert.deepEqual(samplePlayerPosition(new World(1),0,v()),new World(1).player.pos);
});
test('crew camera history follows the selected player and does not reuse another player position',()=>{
 const w=new World(7,{schedule:false});w.addCrew('host');w.addCrew('guest');
 const starts=w.crew.map(p=>({...p.player.pos}));
 w.stepCrew(new Map([['host',{...idleInput(),strafe:1}],['guest',{...idleInput(),forward:1}]]));
 for(let i=0;i<w.crew.length;i++){w.selectCrew(w.crew[i].id);assert.deepEqual(samplePlayerPosition(w,0,v()),starts[i]);assert.deepEqual(samplePlayerPosition(w,1,v()),w.player.pos);}
});
const tickProjectiles=(world:World)=>(world as any).updateProjectiles(STEP);
test('all tower tiers stop swept primary and homing shots on armor at the exact contact',()=>{
 for(const kind of ['squid','squid2','squid3'] as const)for(const age of [2,6,12])for(const homing of [false,true]){
  const w=new World(12,{schedule:false});w.player.pos=v(0,5,15);
  const e=w.spawn(kind,v(0,8,0));e.age=age;
  let a=v(),b=v(),hit:ReturnType<typeof sweepArmor>=null;
  a=crystalToEnemy(e,w.player.pos,v(0,towerOutletHeight(kind)*.4,8));b=crystalToEnemy(e,w.player.pos,v(0,towerOutletHeight(kind)*.4,-8));hit=sweepArmor(e,w.player.pos,a,b);
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
 const w=new World(1,{schedule:false});const e=w.spawn('centipede',v(0,5,0));e.age=4;e.status='hunting';e.statusUntil=20;e.nextMove=6;e.pos=v(0,5,0);e.vel=v(0,0,-8);for(let i=0;i<e.segments.length;i++)e.segments[i].pos=v(0,5,(i+1)*1.3);w.step(idleInput());e.segments[0].hp=0;
 const point=e.segments[0].pos;w.projectiles.push({id:900,pos:v(point.x+2,point.y,point.z),vel:v(-400,0,0),age:0,homing:false});tickProjectiles(w);
 assert.equal(w.projectiles.length,0);assert.equal(w.stats.hits,0);assert.ok(w.effects.some(e=>e.kind==='impact'));assert.equal(w.effects.filter(e=>e.kind==='ricochet').length,0);
});
test('floor impacts retain a damped reflection and a bent interpolated flight path',()=>{
 const w=new World(1,{schedule:false});const p={id:900,pos:v(0,1,0),vel:v(20,-200,0),age:0,homing:false};w.projectiles.push(p);tickProjectiles(w);
 assert.equal(w.projectiles.length,1);assert.ok(p.vel.y>0);assert.ok(Math.hypot(p.vel.x,p.vel.y,p.vel.z)<Math.hypot(20,200));assert.ok(w.projectiles[0].path?.length);assert.ok(w.effects.some(e=>e.kind==='ricochet'));
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
