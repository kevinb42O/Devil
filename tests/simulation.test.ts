import {floorHeight} from '../src/arena.ts';
import {SPIDER_GEM,spiderLocalPoint,localToEnemy} from '../src/enemy-presentation.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, STEP, idleInput, segmentSphere, v, TUNING } from '../src/simulation.ts';
const run=(w:World,ticks:number,input=idleInput())=>{for(let i=0;i<ticks;i++)w.step(input);};
test('identical seeds and inputs produce identical simulation results',()=>{
  const a=new World(123),b=new World(123);const input={...idleInput(),forward:1,strafe:.5,fire:true};
  run(a,1000,input);run(b,1000,input);assert.deepEqual(a,b);
});
test('opening summoner spawns at 3s and releases the complete reference-timed batch',()=>{
  const w=new World();run(w,359);assert.equal(w.enemies.length,0);w.step(idleInput());assert.equal(w.enemies[0].kind,'squid');run(w,405);assert.equal(w.enemies.filter(e=>e.kind==='skull').length,10);assert.equal(w.enemies.filter(e=>e.kind==='skull2').length,1);
});
test('tap releases ten physical daggers; holding uses stream without a release burst',()=>{
  const tap=new World();run(tap,5,{...idleInput(),fire:true});tap.step(idleInput());assert.equal(tap.stats.shots,10);assert.equal(tap.projectiles.length,10);
  const hold=new World();run(hold,40,{...idleInput(),fire:true});const before=hold.stats.shots;hold.step(idleInput());assert.equal(hold.stats.shots,before);assert.ok(before>0&&before<10);
});
test('swept projectile collision hits small targets between endpoints',()=>{
  assert.ok(segmentSphere(v(0,0,0),v(0,0,-10),v(0,0,-5),.1)!==null);
  assert.equal(segmentSphere(v(),v(0,0,-10),v(3,0,-5),.1),null);
  const w=new World();const e=w.spawn('skull',v(0,1.7,8));e.age=2;w.shoot(idleInput(),false,false);run(w,8);assert.equal(w.stats.kills,1);assert.equal(w.stats.hits,1);
});
test('squid body is protected while its crystal receives damage',()=>{
  const w=new World();const e=w.spawn('squid',v(0,6,0));e.age=1;
  // Shoot through the protected body above the crystal, with no orbit teleport.
  w.player.pos=v(0,6,20);e.phase=0;e.pos=v(0,6,26);
  w.projectiles.push({id:900,pos:v(0,7.2,24),vel:v(0,0,400),age:0,homing:false});
  w.step(idleInput());assert.equal(e.hp,10);
});
test('tower crystals accept edge shots within the enlarged radius',()=>{
 for(const kind of ['squid','squid2','squid3'] as const){
  for(const offset of [.55,.7]){
   const w=new World(1,{schedule:false}),e=w.spawn(kind,v(0,6,0));e.age=1;
   const point=w.weakPoint(e),outward=v(point.x-e.pos.x,0,point.z-e.pos.z),length=Math.hypot(outward.x,outward.z);
   outward.x/=length;outward.z/=length;
   // Approach the exposed face, avoiding the armored tower behind the crystal.
   w.projectiles.push({id:901,pos:v(point.x+outward.x,point.y+offset,point.z+outward.z),vel:v(-outward.x*240,0,-outward.z*240),age:0,homing:false});
   const hp=e.hp;(w as any).updateProjectiles(STEP);
   assert.equal(e.hp,hp-(offset===.55?1:0),`${kind}: offset ${offset}`);
  }
 }
});
test('gems are attracted only in collection windows and expire after ten seconds',()=>{
  const collect=new World();collect.dropGems(v(8,1.7,10),1);collect.gems[0].vel=v();run(collect,120);assert.equal(collect.stats.collected,1);
  const firing=new World();firing.dropGems(v(8,1.7,10),1);firing.gems[0].vel=v();run(firing,120,{...idleInput(),fire:true});assert.equal(firing.stats.collected,0);assert.ok(firing.gems[0].pos.x>7.9);
  firing.enemies=[];for(let i=0;i<1200;i++){firing.enemies=[];firing.step({...idleInput(),fire:true});}assert.equal(firing.stats.expired,1);assert.equal(firing.gems.length,0);
});
test('progression distinguishes total collection from unspent homing reserve',()=>{
  const w=new World();for(let i=0;i<10;i++)w.collect();assert.equal(w.level,2);for(let i=10;i<70;i++)w.collect();assert.equal(w.level,3);assert.equal(w.reserve,60);
  for(let i=0;i<30;i++)w.collect();w.shoot(idleInput(),true,true);assert.equal(w.reserve,70);
  for(let i=0;i<99;i++)w.collect();assert.equal(w.level,3);w.collect();assert.equal(w.level,4);assert.equal(w.stats.collected,200);
});
test('gem steering switches off for either fire button and resumes on release',()=>{
  for(const button of ['fire','homing'] as const){
    const w=new World();w.dropGems(v(8,1.7,10),1);const gem=w.gems[0];gem.vel=v();
    run(w,12);assert.ok(gem.vel.x<0,'idle gems automatically approach the player');
    const drift={...gem.vel};w.player.pos.x=-4;run(w,12,{...idleInput(),[button]:true});
    assert.deepEqual(gem.vel,drift,'holding fire adds no player attraction, even during cooldown');
    w.step(idleInput());assert.notDeepEqual(gem.vel,drift,'releasing fire resumes steering');
  }
});
test('tap release pushes gems away without attracting them on the burst tick',()=>{
  const w=new World();w.dropGems(v(8,1.7,10),1);const gem=w.gems[0];gem.vel=v();
  run(w,5,{...idleInput(),fire:true});w.step(idleInput());
  assert.equal(w.stats.shots,10);assert.ok(Math.abs(Math.hypot(gem.vel.x,gem.vel.y,gem.vel.z)-8)<1e-8);assert.ok(gem.vel.x>7.99);
  run(w,30);assert.ok(gem.vel.x<0,'idle steering brings pushed gems back');
});
test('released gems catch a moving player instead of overshooting into an orbit',()=>{
  const w=new World();w.dropGems(v(-12,1.7,10),1);w.gems[0].vel=v(17,0,0);
  run(w,150,{...idleInput(),forward:1});assert.equal(w.stats.collected,1);
});
test('homing cannot spend more daggers than held in reserve',()=>{
  const w=new World();w.level=3;w.reserve=3;w.shoot(idleInput(),true,true);assert.equal(w.reserve,0);assert.equal(w.projectiles.length,3);
});
test('jump requires a fresh press, keeps air momentum, and falls beyond the arena',()=>{
  const w=new World();run(w,10,{...idleInput(),forward:1});const speed=-w.player.vel.z;
  w.step({...idleInput(),jump:true});assert.ok(w.player.pos.y>TUNING.eyeHeight);assert.ok(-w.player.vel.z>=speed-.001);
  run(w,100,{...idleInput(),jump:true});assert.equal(w.player.grounded,true);assert.equal(w.player.pos.y,floorHeight(w.player.pos.x,w.player.pos.z,w.time)+TUNING.eyeHeight);
  w.player.pos=v(40,1.7,0);run(w,200);assert.equal(w.state,'dead');assert.equal(w.cause,'FALLEN');
});
test('floor shotgun taps gain height with hand level and still land',()=>{
 const heights:number[]=[];
 for(let level=1;level<=4;level++){
  const w=new World(1,{schedule:false});w.startAt(0,level);const startY=w.player.pos.y;
  w.step({...idleInput(),pitch:-1.5,fire:true});w.step({...idleInput(),pitch:-1.5});
  assert.equal(w.player.grounded,false);let peak=w.player.pos.y;
  for(let i=0;i<240;i++){w.step(idleInput());peak=Math.max(peak,w.player.pos.y);}
  heights.push(peak-startY);assert.equal(w.player.grounded,true);
 }
 assert.ok(heights[0]>2.1&&heights[0]<2.3);
 assert.ok(heights[1]>3&&heights[1]<3.1);
 assert.ok(heights[2]>4.2&&heights[2]<4.4);
 assert.ok(heights[3]>5.4&&heights[3]<5.6);
});
test('floor shotgun boost preserves upward momentum and requires a nearby downward burst',()=>{
 const w=new World(1,{schedule:false});w.startAt(0,4);
 w.player.vel.y=20;w.shoot({...idleInput(),pitch:-1.5},true,false);assert.equal(w.player.vel.y,20);
 for(const [pitch,burst,height] of [[0,true,0],[-1.5,false,0],[-1.5,true,4]] as const){
  w.player.pos.y=floorHeight(w.player.pos.x,w.player.pos.z,w.time)+TUNING.eyeHeight+height;w.player.vel.y=0;
  w.shoot({...idleInput(),pitch},burst,false);assert.equal(w.player.vel.y,0);
 }
});
test('contact is lethal after emergence and dead runs stop their clock',()=>{
  const w=new World();const e=w.spawn('skull',{...w.player.pos});e.age=2;w.step(idleInput());assert.equal(w.state,'dead');const time=w.time;run(w,60);assert.equal(w.time,time);
});
test('each gem consumed by an exposed spider ejects one egg that hatches five spiderlings',()=>{
  const w=new World();const e=w.spawn('spider',v(0,1.2,20));e.age=3.1;e.headExposure=1;w.step({...idleInput(),fire:true});
  const mouth=spiderLocalPoint(e,w.player.pos,SPIDER_GEM);w.dropGems(mouth,1);w.gems[0].vel=v();w.step({...idleInput(),fire:true});
  assert.equal(w.stats.eaten,1);assert.equal(w.enemies.filter(e=>e.kind==='egg').length,1);
  const egg=w.enemies.find(e=>e.kind==='egg')!;assert.ok(egg.vel.z<0);run(w,120,{...idleInput(),fire:true});assert.ok(Math.hypot(egg.pos.x,egg.pos.z)<w.radius,'eggs land on the field');
  egg.age=10;w.step(idleInput());assert.equal(w.enemies.filter(e=>e.kind==='spiderling').length,5);
});
test('both spider spawners release exactly one normal gem from their held crystal on death',()=>{
 for(const kind of ['spider','spider2'] as const){
  const w=new World(1,{schedule:false}),e=w.spawn(kind,v(0,0,20));e.age=12;e.headExposure=.7;
  const crystal=spiderLocalPoint(e,w.player.pos,SPIDER_GEM);
  w.damageEnemy(e,e.hp-1);assert.equal(w.gems.length,0,'nonlethal hits keep the crystal attached');
  w.damageEnemy(e,1);assert.equal(w.gems.length,1);assert.equal(w.stats.released,1);
  for(const gem of w.gems){
   assert.deepEqual(gem.pos,crystal);
   assert.equal(gem.age,0);
  }
  assert.equal(new Set(w.gems.map(g=>g.id)).size,1);
  w.damageEnemy(e,100);assert.equal(w.gems.length,1,'death reward cannot repeat');
 }
});
test('large spider stays outside the arena and does not chase the player or walk to gems',()=>{
  const w=new World();const e=w.spawn('spider',v(0,0,20));w.dropGems(v(0,1.7,10),1);
  for(let i=0;i<600;i++){w.step({...idleInput(),fire:true});assert.ok(Math.hypot(e.pos.x,e.pos.z)>w.radius+2.5);}
  assert.ok(e.headExposure>.9);assert.ok(e.pos.y>2.5);assert.equal(w.state,'playing');
});
test('spider holds its head exposed under fire, then shields after one second without a hit',()=>{
  const w=new World();const e=w.spawn('spider',v(0,0,20));e.age=3.1;e.headExposure=1;w.step(idleInput());
  w.projectiles.push({id:1000,pos:{...w.weakPoint(e)},vel:v(),age:0,homing:false});w.step(idleInput());assert.equal(e.hp,24);assert.ok(e.pendingDuck);
  run(w,60);assert.ok(e.headExposure>.95);run(w,90);assert.ok(e.headExposure<.2);run(w,120);assert.ok(e.headExposure>.9);
});
test('squid II crystals have independent health and release one gem each',()=>{
 const w=new World();const e=w.spawn('squid2',v(0,5.2,-20));e.age=2;w.step(idleInput());
 const first=w.weakPoint(e);w.projectiles.push({id:1001,pos:{...first},vel:v(),age:0,homing:true});w.step(idleInput());
 assert.equal(e.hp,10);assert.equal(e.weakpoints[0].hp,0);assert.equal(e.weakpoints[1].hp,10);assert.equal(w.gems.length,1);
 w.projectiles.push({id:1002,pos:{...w.weakPoint(e)},vel:v(),age:0,homing:true});w.step(idleInput());assert.equal(e.hp,0);assert.equal(w.gems.length,2);assert.equal(w.stats.kills,1);
});
test('centipede damage and rewards belong to individual living segments',()=>{
  const w=new World();const e=w.spawn('centipede',v(0,3,0));assert.equal(e.segments.length,25);assert.equal(e.segments.reduce((s,p)=>s+p.hp,0),75);
  const first=e.segments[0];w.damageEnemy(e,10,first.pos,0);
  assert.equal(first.hp,0);assert.equal(e.hp,72);assert.equal(w.gems.length,1);w.damageEnemy(e,10,first.pos,0);assert.equal(w.gems.length,1,'destroyed crystals cannot pay out twice');
});

test('spatial projectile lookup agrees with exhaustive swept hits across cell boundaries',()=>{
 for(let seed=1;seed<=100;seed++){
  const w=new World(seed,{schedule:false});
  for(let i=0;i<40;i++){const e=w.spawn('skull',v((w.random()-.5)*40,5,(w.random()-.5)*40));e.age=2;}
  const a=v((w.random()-.5)*40,5,(w.random()-.5)*40),b=v((w.random()-.5)*40,5,(w.random()-.5)*40);
  // Half the sweeps end at an enemy, ensuring both hit and miss cases.
  if(seed%2===0)Object.assign(b,w.enemies[seed%40].pos);
  const expected=w.enemies.map(e=>({e,t:segmentSphere(a,b,e.pos,e.radius)})).filter(h=>h.t!==null).sort((a,b)=>a.t!-b.t!)[0]?.e;
  w.projectiles.push({id:900,pos:{...a},vel:v((b.x-a.x)/STEP,0,(b.z-a.z)/STEP),age:0,homing:false});
  (w as any).updateProjectiles(STEP);
  assert.equal(w.stats.kills,expected?1:0,`seed ${seed}`);if(expected)assert.equal(expected.hp,0);
 }
});

test('all towers drift inward without orbiting and spin clockwise independently',()=>{
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(1,{schedule:false,invulnerable:true}),e=w.spawn(kind,v(18,6,-24));e.nextSpawn=Infinity;
  const initialTarget=localToEnemy(e,w.player.pos,e.weakpoints[0].local);if(kind==='squid')assert.ok((initialTarget.x-e.pos.x)*e.pos.x+(initialTarget.z-e.pos.z)*e.pos.z>0,'first gem faces outward');
  run(w,1200);assert.ok(Math.abs(Math.hypot(e.pos.x,e.pos.z)-25)<1e-8);
  assert.ok(Math.abs(e.pos.x*(-24)-e.pos.z*18)<1e-8,'translation stays on original radius');
  assert.equal(e.pos.y,6);assert.ok(e.age>9.99);
  // Reaching the middle must never teleport back to the perimeter or overshoot.
  e.pos=v(.01,6,0);run(w,120);assert.equal(e.pos.x,0);assert.equal(e.pos.z,0);
 }
});
