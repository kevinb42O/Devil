import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v} from '../src/simulation.ts';
import {survivalSchedule,TIMELINE} from '../src/survival.ts';
import {ENEMY_KINDS,ENEMY_STATS} from '../src/enemy-kinds.ts';
import {SURVIVAL_HEIGHTS} from '../src/survival-data.ts';
import {tileHeight,floorHeight,arenaRadius,TILE_SIZE} from '../src/arena.ts';
const step=(w:World,count:number,input=idleInput())=>{for(let i=0;i<count;i++){w.step(input);w.effects=[];}};
test('Survival preserves simultaneous groups, boss milestones, and accelerating third-wave Ghostpede',()=>{
 assert.deepEqual(TIMELINE.filter(e=>e.time<=24).map(e=>[e.time,e.kind]),[[3,'squid'],[14,'squid'],[19,'squid'],[24,'squid']]);
 assert.equal(TIMELINE.filter(e=>e.time===174&&e.kind==='spider').length,3);
 assert.equal(TIMELINE.filter(e=>e.time===259&&e.kind==='gigapede').length,3);
 assert.equal(TIMELINE.find(e=>e.kind==='leviathan')?.time,350);
 const waves=[[],[],[]] as {time:number;kind:string}[][];
 for(const event of survivalSchedule()){if(event.wave>2)break;if(event.wave>=0)waves[event.wave].push(event);}
 assert.deepEqual(waves.map(w=>w.length),[17,17,17]);
 assert.ok(Math.abs(waves[0][0].time-456)<.04);
 assert.equal(waves[0].filter(e=>e.kind==='gigapede').length,1);assert.equal(waves[2].filter(e=>e.kind==='ghostpede').length,1);
 assert.ok(waves[2].at(-1)!.time-waves[2][0].time<waves[0].at(-1)!.time-waves[0][0].time);
});
test('arena shrinks by lowering reference tiles and preserves the center',()=>{
 assert.equal(tileHeight(24,25,0),SURVIVAL_HEIGHTS[25*51+24]*.62,'serialized x is the fast coordinate');assert.ok(Math.abs(arenaRadius(1200)-12.4)<.001);assert.equal(tileHeight(25,25,1200),tileHeight(25,25,0));
 assert.ok(tileHeight(36,25,800)<tileHeight(36,25,0)-5);
 assert.equal(floorHeight(11*TILE_SIZE,0,800,0),tileHeight(36,25,800));
 assert.ok(floorHeight(100,100,0)<-900);
});
test('all 22 reference enemy entries have the right aggregate HP and own rewards',()=>{
 assert.equal(ENEMY_KINDS.length,22);const w=new World(1,{schedule:false});
 for(const kind of ENEMY_KINDS){const e=w.spawn(kind,v(20,3,20));assert.equal(e.hp,ENEMY_STATS[kind].hp);if(e.weakpoints.length)assert.equal(e.weakpoints.reduce((n,s)=>n+s.hp,0),e.hp);if(e.segments.length)assert.equal(e.segments.reduce((n,s)=>n+s.hp,0),e.hp);}
 assert.equal(w.enemies.find(e=>e.kind==='gigapede')?.segments.length,50);assert.equal(w.enemies.find(e=>e.kind==='ghostpede')?.segments.length,10);
});
test('squid tiers generate their own distinct offspring after three seconds',()=>{
 for(const [kind,count,skull] of [['squid',10,'skull2'],['squid2',10,'skull3'],['squid3',15,'skull4']] as const){const w=new World(1,{schedule:false});w.spawn(kind,v(20,5,20));step(w,360);assert.equal(w.enemies.filter(e=>e.kind==='skull').length,count);assert.equal(w.enemies.filter(e=>e.kind===skull).length,1);}
});
test('regular stream throughput remains exact over sustained firing at every hand',()=>{
 for(const [level,ticks,expected] of [[1,240,40],[2,240,80],[3,240,160],[4,270,240]]){
  const w=new World(1,{schedule:false});w.level=level;const input={...idleInput(),fire:true};step(w,120,input);const before=w.stats.shots;step(w,ticks,input);assert.equal(w.stats.shots-before,expected,'level '+level);
 }
});
test('homing uses tap release, sustained 40/s, and inherits primary stream without a burst',()=>{
 const tap=new World(1,{schedule:false});tap.level=3;tap.reserve=100;step(tap,5,{...idleInput(),homing:true});assert.equal(tap.stats.homingFired,0);step(tap,1);assert.equal(tap.stats.homingFired,20);
 const stream=new World(1,{schedule:false});stream.level=3;stream.reserve=1000;step(stream,120,{...idleInput(),homing:true});const before=stream.stats.homingFired;step(stream,240,{...idleInput(),homing:true});assert.equal(stream.stats.homingFired-before,80);
 const combined=new World(1,{schedule:false});combined.level=3;combined.reserve=100;step(combined,30,{...idleInput(),fire:true});step(combined,1,{...idleInput(),fire:true,homing:true});assert.equal(combined.stats.homingFired,4);
});
test('pede crystals cannot be damaged before their three-second emergence',()=>{
 const w=new World(1,{schedule:false});const e=w.spawn('gigapede',v(10,3,10));e.age=1;w.projectiles.push({id:999,pos:{...e.segments[0].pos},vel:v(),age:0,homing:false});step(w,1);assert.equal(e.hp,250);
});
test('Spider II lifts for nine seconds and converts gems to its own egg type',()=>{
 const w=new World(1,{schedule:false});const e=w.spawn('spider2',v(20,3,20));e.eaten=1;step(w,1000,{...idleInput(),fire:true});assert.equal(w.enemies.filter(e=>e.kind==='egg2').length,0);step(w,81,{...idleInput(),fire:true});assert.equal(w.enemies.filter(e=>e.kind==='egg2').length,1);
});
test('Leviathan death schedules Orb drop and activation relative to kill time',()=>{
 const w=new World(1,{schedule:false});const e=w.spawn('leviathan',v(0,15,0));w.damageEnemy(e,1500);step(w,397);assert.equal(w.enemies.some(e=>e.kind==='orb'),false);step(w,2);const orb=w.enemies.find(e=>e.kind==='orb')!;assert.ok(orb);assert.equal(w.active(orb),false);step(w,802);assert.equal(w.active(orb),true);
});
test('beckoning transmutation resets damaged skull HP; sustained Orb hits suppress beckons',()=>{
 const w=new World(1,{schedule:false});const skull=w.spawn('skull3',v(8,2,0));skull.hp=1;w.rings.push({id:900,owner:901,pos:v(),radius:7,previous:7,age:0});step(w,6);assert.equal(skull.kind,'transmuted3');assert.equal(skull.hp,100);
 const orb=w.spawn('orb',v(0,7,0));orb.age=10;orb.nextBeckon=10;for(let i=0;i<120;i++){orb.lastHit=w.time;step(w,1);}assert.equal(w.rings.some(r=>r.owner===orb.id),false);step(w,26);assert.equal(w.rings.some(r=>r.owner===orb.id),true);
});

test('practice start skips previous events, preserves equal-time spawns, and initializes hand/reserve',()=>{
 const w=new World(1);w.startAt(229,4,150);step(w,1);assert.equal(w.enemies.filter(e=>e.kind==='squid').length,6);assert.equal(w.enemies.length,6);assert.equal(w.level,4);assert.equal(w.reserve,150);assert.equal(w.tick,229*120+1);
});

test('level IV splash damages adjacent weak points without double-damaging the direct target',()=>{
 const w=new World(1,{schedule:false});w.level=4;const spider=w.spawn('spider',v(0,3,20));spider.age=4;spider.headExposure=1;const point=w.weakPoint(spider);w.projectiles.push({id:500,pos:{...point},vel:v(),age:0,homing:true,level:4});
 (w as any).updateProjectiles(STEP);assert.equal(spider.hp,15);w.tick+=2;(w as any).updateProjectiles(STEP);assert.equal(spider.hp,15,'own splash must not double generic 10-damage homing');
 const squid=w.spawn('squid2',v());squid.age=1;const first=w.weakPoint(squid);w.projectiles.push({id:501,pos:{...first},vel:v(),age:0,homing:true,level:4});(w as any).updateProjectiles(STEP);assert.equal(squid.hp,10);w.tick+=2;(w as any).updateProjectiles(STEP);assert.equal(squid.hp,0,'splash reaches the second crystal');
});
test('homing does only one direct damage to bosses and cannot directly damage Ghostpede',()=>{
 for(const kind of ['leviathan','orb'] as const){const w=new World(1,{schedule:false}),e=w.spawn(kind,v(0,8,0));e.age=10;w.projectiles.push({id:600,pos:{...w.weakPoint(e)},vel:v(),age:0,homing:true,level:3});(w as any).updateProjectiles(STEP);assert.equal(e.hp,ENEMY_STATS[kind].hp-1);}
 const w=new World(1,{schedule:false}),ghost=w.spawn('ghostpede',v(0,9,0));ghost.age=4;ghost.status='hunting';w.projectiles.push({id:601,pos:{...ghost.pos},vel:v(),age:0,homing:true,level:3});(w as any).updateProjectiles(STEP);assert.equal(ghost.hp,500);assert.equal(w.stats.homingEaten,1);
});
test('homing stops on its first enemy and respects Squid III level-dependent damage',()=>{
 const w=new World(1,{schedule:false});for(let i=0;i<4;i++){const e=w.spawn('skull',v(0,4,-i*.3));e.age=1;}w.projectiles.push({id:700,pos:v(0,4,1),vel:v(0,0,-240),age:0,homing:true,level:3});(w as any).updateProjectiles(STEP);assert.equal(w.stats.kills,1);assert.equal(w.projectiles.length,0);
 for(const level of [3,4]){const w=new World(1,{schedule:false}),squid=w.spawn('squid3',v(0,5,0));squid.age=1;w.projectiles.push({id:701,pos:{...w.weakPoint(squid)},vel:v(),age:0,homing:true,level});(w as any).updateProjectiles(STEP);w.tick+=2;(w as any).updateProjectiles(STEP);assert.equal(squid.weakpoints[0].hp,level===3?0:20);}
});
