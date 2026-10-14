import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v,STEP} from '../src/simulation.ts';
import {UPGRADE_PULSE} from '../src/upgrade-pulse-tuning.ts';
import {createRun,RunRecorder} from '../src/replay.ts';

function arena(){const w=new World(42,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,0);return w;}
function target(w:World,x:number,hp=100,y=1.7){const e=w.spawn('skull4',v(x,y,0),false);e.age=10;e.status='hunting';e.hp=hp;return e;}
function upgrade(w:World,level=2){w.level=level;w.emit('upgrade',w.player.pos,level);}
// Isolate wave arrival from AI movement and projectile damage.
function wave(w:World,time:number){w.time=time;(w as unknown as {updateUpgradePulses():void}).updateUpgradePulses();}

test('pulse reaches targets progressively and hits each enemy once',()=>{
 const w=arena(),near=target(w,3),far=target(w,10),outside=target(w,19),high=target(w,3,100,15);
 upgrade(w);wave(w,.15);assert.equal(near.hp,95);assert.equal(far.hp,100);
 wave(w,.3);assert.equal(near.hp,95);wave(w,.9);assert.equal(far.hp,95);
 wave(w,1.5);wave(w,2);assert.equal(near.hp,95);assert.equal(far.hp,95);assert.equal(outside.hp,100);assert.equal(high.hp,100);
 assert.equal(w.stats.shots,0);assert.equal(w.stats.hits,0,'wave hits do not inflate dagger accuracy');
});

test('tier damage scales and distinct pulses can hit the same enemy',()=>{
 const w=arena(),e=target(w,2);
 for(const level of [2,3,4]){const start=w.time;upgrade(w,level);wave(w,start+.1);}
 assert.equal(e.hp,100-5-10-20);assert.deepEqual(UPGRADE_PULSE.damage.slice(2),[5,10,20]);
});

test('pulse origin stays at the upgrade position when player moves',()=>{
 const w=arena(),e=target(w,4);upgrade(w);w.player.pos=v(30,1.7,0);wave(w,.3);assert.equal(e.hp,95);
});

test('pulse respects inactive enemies and does not catch newly spawned enemies behind it',()=>{
 const w=arena(),hidden=target(w,3);hidden.age=-2;upgrade(w);wave(w,.5);assert.equal(hidden.hp,100);
 const late=target(w,2);wave(w,.7);assert.equal(late.hp,100);hidden.age=10;wave(w,.8);assert.equal(hidden.hp,100);
});

test('pulse damages one living weakpoint or segment without corrupting body health',()=>{
 const w=arena(),tower=w.spawn('squid2',v(3,0,0),false);tower.age=10;tower.status='idle';
 const pede=target(w,4);pede.segments=[{pos:v(4,1,0),hp:30},{pos:v(5,1,0),hp:30}];pede.hp=60;
 upgrade(w,3);wave(w,.5);wave(w,.9);
 assert.equal(tower.hp,10);assert.equal(tower.weakpoints.filter(p=>p.hp===0).length,1);
 assert.equal(pede.hp,50);assert.deepEqual(pede.segments.map(p=>p.hp),[20,30]);assert.equal(w.stats.released,1);
});

test('gem threshold triggers real pulse damage, kill effects and gem rewards',()=>{
 const w=arena();w.stats.collected=9;
 const e=w.spawn('skull2',v(4,1.7,0),false);e.age=10;e.status='hunting';
 w.collect();assert.equal(w.level,2);
 for(let i=0;i<65;i++)w.step(idleInput());
 assert.equal(e.hp,0);assert.equal(w.stats.kills,1);assert.equal(w.stats.killed.skull2,1);assert.equal(w.stats.released,1);
 assert.ok(w.effects.some(f=>f.kind==='hit'&&f.enemyId===e.id&&f.bloodId));assert.ok(w.effects.some(f=>f.kind==='kill'&&f.enemyId===e.id));
});

test('crew upgrades emit one damage wave for each living player, with attribution',()=>{
 const w=arena();w.addCrew('host');w.addCrew('guest');w.addCrew('dead');
 w.crew[0].player.pos=v(0,1.7,0);w.crew[1].player.pos=v(30,1.7,0);w.crew[2].player.pos=v(60,1.7,0);w.crew[2].alive=false;
 w.selectCrew('host');w.stats.collected=9;
 const hostEnemy=target(w,3),guestEnemy=target(w,33),deadEnemy=target(w,63);
 w.collect();wave(w,.2);
 assert.equal(hostEnemy.hp,95);assert.equal(guestEnemy.hp,95);assert.equal(deadEnemy.hp,100);
 assert.equal(w.effects.find(f=>f.kind==='hit'&&f.enemyId===hostEnemy.id)?.shooterId,'host');
 assert.equal(w.effects.find(f=>f.kind==='hit'&&f.enemyId===guestEnemy.id)?.shooterId,'guest');
 const before=guestEnemy.hp;for(let i=0;i<100;i++)w.predictCrew('guest',idleInput(),STEP);assert.equal(guestEnemy.hp,before,'guest prediction never runs area damage');
});

test('previous replay revisions retain harmless upgrades; current runs record new rules',()=>{
 const old=createRun(1,{time:0,level:1,reserve:0},6,true,17),current=createRun(1);
 for(const w of [old,current]){w.player.pos=v(0,1.7,0);target(w,3);w.stats.collected=9;w.collect();wave(w,.2);}
 assert.equal(old.enemies[0].hp,100);assert.equal(current.enemies[0].hp,95);
 assert.equal(new RunRecorder(1).finish(current).combatRevision,18);
});
