import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v} from '../src/simulation.ts';
import {DeathHistory,DEATH_HISTORY_BUDGET,killerName} from '../src/death-analysis.ts';
import {floorHeight} from '../src/arena.ts';

test('first lethal enemy is attributed once, with owned positions; falls have no killer',()=>{
 const w=new World(1,{schedule:false});const first=w.spawn('skull',{...w.player.pos}),second=w.spawn('skull2',{...w.player.pos});first.age=second.age=2;
 w.step(idleInput());assert.equal(w.deathSource?.enemyId,first.id);assert.equal(w.deathSource?.segment,-1);w.die('IMPALED',second);assert.equal(w.deathSource?.enemyId,first.id);
 const old=w.deathSource!.contactBody.x;first.pos.x+=10;assert.equal(w.deathSource!.contactBody.x,old);
 const fall=new World(1,{schedule:false});fall.player.pos=v(100,-9,0);fall.step(idleInput());assert.equal(fall.cause,'FALLEN');assert.equal(fall.deathSource,null);
 const crew=new World(1,{schedule:false});crew.addCrew('a');crew.selectCrew('a');crew.spawn('skull',{...crew.player.pos}).age=2;crew.stepCrew(new Map());assert.equal(crew.deathSource,null);
});

test('destroyed pede armor retains the actual lethal segment',()=>{
 const w=new World(1,{schedule:false});const e=w.spawn('gigapede',v(20,3,0));e.age=4;e.status='hunting';e.pos=v(20,3,0);
 for(let i=0;i<e.segments.length;i++)e.segments[i].pos=v(20+(i+1)*1.95,3,0);
 e.segments[0].hp=0;w.player.pos={...e.segments[0].pos};w.step(idleInput());assert.equal(w.deathSource?.enemyId,e.id);assert.equal(w.deathSource?.segment,0);
});

test('rolling history keeps five seconds, exact terminal tick, and never aliases the gameplay world',()=>{
 const h=new DeathHistory(),w=new World(1,{schedule:false,invulnerable:true});const e=w.spawn('skull',v(9,2,-10));e.age=2;h.capture(w,0,0,true);
 for(let i=1;i<=1201;i++){w.tick=i;w.time=i*STEP;w.player.pos.x=i*.01;e.pos.x=i*.02;h.capture(w,.2,0);}
 w.die('test'); // invulnerable deliberately does not kill
 h.capture(w,.2,0,true);const clip=h.clip(null)!;assert.ok(clip);assert.equal(clip.duration,5);assert.equal(clip.end,w.time);assert.ok(h.diagnostics.samples<=154);
 e.pos.x=999;w.player.pos.x=999;clip.sample(5);assert.ok(Math.abs(clip.view.player.pos.x-12.01)<1e-5);assert.ok(Math.abs(clip.view.enemies[0].pos.x-24.02)<1e-5);assert.equal(w.player.pos.x,999);
 assert.ok(h.diagnostics.bytes<DEATH_HISTORY_BUDGET);
});

test('samples interpolate by identity and apply spawn, removal, kind and health discretely',()=>{
 const h=new DeathHistory(),w=new World(1,{schedule:false});const a=w.spawn('skull',v(0,2,0)),b=w.spawn('skull2',v(10,2,0));h.capture(w,0,0,true);
 w.tick=4;w.time=4*STEP;a.pos.x=4;b.pos.x=14;w.enemies.reverse();h.capture(w,0,0);w.tick=8;w.time=8*STEP;w.enemies=[b];b.kind='transmuted2';h.capture(w,0,0);
 const clip=h.clip(null)!;clip.sample(2*STEP);assert.equal(clip.view.enemies[0].id,a.id);assert.equal(clip.view.enemies[0].pos.x,2);assert.equal(clip.view.enemies[1].pos.x,12);
 clip.sample(8*STEP);assert.equal(clip.view.enemies.length,1);assert.equal(clip.view.enemies[0].kind,'transmuted2');
});

test('off-cadence deaths, short clips and full terminal entity fields are captured',()=>{
 const h=new DeathHistory(),w=new World(1,{schedule:false});w.spawn('gigapede',v(10,3,-10));w.projectiles.push({id:200,pos:v(1,2,3),vel:v(4,5,6),age:.2,homing:true,level:4});w.gems.push({id:300,pos:v(2,3,4),vel:v(5,6,7),age:.3});w.rings.push({id:400,owner:1,pos:v(3,4,5),radius:6,previous:5,age:.4});h.capture(w,0,0,true);
 w.tick=1;w.time=STEP;w.die('FALLEN');h.capture(w,0,0);const clip=h.clip(null)!;assert.equal(clip.duration,STEP);clip.sample(STEP);assert.deepEqual(clip.view.projectiles[0].pos,w.projectiles[0].pos);assert.equal(clip.view.projectiles[0].homing,true);assert.equal(clip.view.gems[0].id,300);assert.equal(clip.view.rings[0].radius,6);assert.equal(clip.view.enemies[0].segments.length,50);
 clip.advance(1);assert.ok(clip.elapsed<=.05);for(let i=0;i<40;i++)clip.advance(.05);assert.equal(clip.done,true);
});

test('capture fails safely at the memory cap and resets/release cleanly; crew is excluded',()=>{
 const h=new DeathHistory(),w=new World(1,{schedule:false});for(let i=0;i<10000;i++)w.spawn('skull',v());
 for(let i=0;i<100;i++){w.tick=i*4;w.time=w.tick*STEP;h.capture(w,0,0);}
 assert.equal(h.disabled,true);assert.equal(h.clip(null),null);assert.ok(h.diagnostics.bytes<=DEATH_HISTORY_BUDGET);h.release();assert.equal(h.diagnostics.bytes,0);assert.equal(h.disabled,false);
 w.addCrew('a');h.capture(w,0,0,true);assert.equal(h.diagnostics.samples,0);
});

test('killer camera is finite, above terrain, and freeze holds do not drift',()=>{
 for(const kind of ['skull','squid3','centipede','gigapede','leviathan','thorn'] as const){
  const h=new DeathHistory(),w=new World(1,{schedule:false});const e=w.spawn(kind,v(3,3,-8));e.age=5;w.player.pos=v(0,1.7,0);h.capture(w,0,0,true);w.tick=4;w.time=4*STEP;w.die('contact',e,kind==='gigapede'?0:-1);h.capture(w,0,0);const c=h.clip(w.deathSource)!;c.sample(c.duration);
  const p=c.camera.position;assert.ok([p.x,p.y,p.z,c.camera.yaw,c.camera.pitch].every(Number.isFinite));assert.ok(p.y>=floorHeight(p.x,p.z,c.view.time,0)+1.4);const old={...c.camera.position};c.sample(c.duration+1);assert.deepEqual(c.camera.position,old);
 }
 assert.equal(killerName('skull2'),'Skull II');assert.equal(killerName('transmuted4'),'Transmuted Skull IV');
});

test('terminal playback preserves a killer removed or transmuted after lethal contact',()=>{
 const h=new DeathHistory(),w=new World(1,{schedule:false});const e=w.spawn('skull2',v(0,2,0));e.age=2;h.capture(w,0,0,true);w.tick=1;w.time=STEP;w.die('IMPALED',e);e.kind='transmuted2';e.pos.x=999;w.enemies=[];h.capture(w,0,0);
 const c=h.clip(w.deathSource)!;c.sample(c.duration);assert.equal(c.killerVisible,true);assert.equal(c.view.enemies[0].kind,'skull2');assert.equal(c.view.enemies[0].pos.x,0);assert.equal(w.enemies.length,0);
});

test('memory pressure reduces sampling density while retaining all entities and five seconds',()=>{
 const h=new DeathHistory(),w=new World(1,{schedule:false});for(let n=0;n<1000;n++)w.spawn('skull',v());for(let n=0;n<280;n++)w.projectiles.push({id:2000+n,pos:v(),vel:v(),age:0,homing:false});for(let n=0;n<3;n++)w.spawn('gigapede',v());
 for(let n=0;n<400;n++){w.tick=n*4;w.time=n/30;h.capture(w,0,0);}h.capture(w,0,0,true);const c=h.clip(null)!;
 assert.ok(c);assert.equal(c.duration,5);assert.equal(h.diagnostics.sampleHz,15);assert.ok(h.diagnostics.bytes<=DEATH_HISTORY_BUDGET);c.sample(c.duration);assert.equal(c.view.enemies.length,1003);assert.equal(c.view.projectiles.length,280);
});
