import {constrainEnemyFloor} from '../src/enemy-floor';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,TUNING,idleInput,v,distance} from '../src/simulation.ts';
import {ENEMY_KINDS,ENEMY_STATS,isPede,isSpider} from '../src/enemy-kinds.ts';
import {floorHeight} from '../src/arena.ts';
import {touchesPlayer} from '../src/player-contact.ts';
import {enemyYaw,towerOutletHeight,enemyEmergenceScale} from '../src/enemy-presentation.ts';

const advance=(w:World,count:number)=>{for(let i=0;i<count;i++){w.step(idleInput());w.effects=[];}};

test('running into every tower body at ground level is lethal in solo and crew',()=>{
 for(const kind of ['squid','squid2','squid3'] as const)for(const crew of [false,true]){
  const w=new World(23,{schedule:false});if(crew){w.addCrew('runner');w.addCrew('safe');w.selectCrew('runner');w.crew[1].player.pos=v(20,TUNING.eyeHeight,0);}
  const e=w.spawnAt(kind,0);e.age=2;e.nextSpawn=Infinity;e.pos.x=0;e.pos.z=0;
  w.player.pos=v(-3,TUNING.eyeHeight,0);w.player.vel=v(18,0,0);w.player.grounded=false;
  if(crew){w.stepCrew(new Map(),.35);assert.equal(w.crew[0].alive,false,kind);assert.equal(w.crew[0].cause,ENEMY_STATS[kind].death);assert.equal(w.crew[1].alive,true);}
  else {w.step(idleInput(),.35);assert.equal(w.state,'dead',kind);assert.equal(w.cause,ENEMY_STATS[kind].death);}
 }
});

test('tower contact is bounded above the crown and outside the body',()=>{
 for(const kind of ['squid','squid2','squid3'] as const)for(const above of [false,true]){
  const w=new World(23,{schedule:false}),e=w.spawnAt(kind,0);e.age=2;e.nextSpawn=Infinity;e.pos.x=0;e.pos.z=0;
  constrainEnemyFloor(e,w.time);
  w.player.pos=above?v(0,e.pos.y+towerOutletHeight(kind)*enemyEmergenceScale(e)+e.radius+TUNING.eyeHeight+1,0):v(e.radius+1,TUNING.eyeHeight,0);
  w.step(idleInput());assert.equal(w.state,'playing',kind);
 }
});

test('jumping into the upper half of a grounded remake tower still touches its visible body',()=>{
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(23,{schedule:false}),e=w.spawn(kind,v());e.age=20;e.nextSpawn=Infinity;
  w.player.pos=v(0,e.pos.y+towerOutletHeight(kind)*enemyEmergenceScale(e)*.7+TUNING.eyeHeight,0);
  w.player.grounded=false;w.step(idleInput());
  assert.equal(w.state,'dead',kind);assert.equal(w.cause,ENEMY_STATS[kind].death);
 }
});

test('all 22 enemy types have lethal active body contact in solo and crew',()=>{
 for(const kind of ENEMY_KINDS)for(const crew of [false,true]){
  const w=new World(23,{schedule:false});if(crew)w.addCrew('player');
  if(crew)w.selectCrew('player');
  const e=w.spawn(kind,v(0,2,0));e.age=12;e.status='hunting';e.nextSpawn=Infinity;e.nextBeckon=Infinity;
  if(isSpider(kind)){e.headExposure=1;e.orbitSpeed=0;e.phase=0;e.pos=v(0,2.7*e.size,w.radius+e.radialOffset);}
  if(kind==='thorn')e.pos.y=0;
  if(isPede(kind)){e.pos=v(0,2,0);e.statusUntil=100;for(const s of e.segments)s.pos=v(20,2,20);}
  if(kind==='ghostpede')e.pos=v(Math.sin(e.phase)*w.radius*.7,9+Math.sin(e.age)*1.2,Math.cos(e.phase)*w.radius*.7);
  // Put the player on the body and hold altitude to exercise airborne enemies too.
  w.player.pos={...e.pos};w.player.grounded=false;w.player.vel=v();
  // Eggs older than ten seconds have hatched; exercise living eggs instead.
  if(kind==='egg'||kind==='egg2')e.age=2;
  if(crew){w.stepCrew(new Map());assert.equal(w.crew[0].alive,false,kind);assert.equal(w.crew[0].cause,ENEMY_STATS[kind].death,kind);}
  else {w.step(idleInput());assert.equal(w.state,'dead',kind);assert.equal(w.cause,ENEMY_STATS[kind].death,kind);}
 }
});

test('ground eggs and spiderlings hit the legs of a standing player',()=>{
 for(const kind of ['egg','egg2','spiderling'] as const){
  const w=new World(1,{schedule:false});w.player.pos=v(0,floorHeight(0,0,0)+TUNING.eyeHeight,0);
  const e=w.spawn(kind,v(0,floorHeight(0,0,0,0)+.55,0));e.age=2;
  w.step(idleInput());assert.equal(w.cause,ENEMY_STATS[kind].death,kind);
 }
});

test('fast eggs and moving players cannot tunnel through contact between ticks',()=>{
 const eggWorld=new World(1,{schedule:false});eggWorld.player.pos=v(0,TUNING.eyeHeight,0);
 const egg=eggWorld.spawn('egg',v(-3,1,0));egg.age=2;egg.vel=v(720,0,0);
 eggWorld.step(idleInput());assert.equal(eggWorld.cause,'INTOXICATED');
 const w=new World(1,{schedule:false});w.player.pos=v(-2,TUNING.eyeHeight,0);w.player.vel=v(18,0,0);w.player.grounded=false;
 const skull=w.spawn('skull',v(0,TUNING.eyeHeight,0));skull.age=2;
 w.step(idleInput(),.25);assert.equal(w.cause,'SWARMED');
});

test('capsule sweep keeps jumps above short enemies safe and thorns bounded',()=>{
 assert.equal(touchesPlayer(v(0,.55,0),v(0,.55,0),v(0,3,0),v(0,3,0),.4),false);
 assert.equal(touchesPlayer(v(0,.55,0),v(0,.55,0),v(0,1.7,0),v(0,1.7,0),.4),true);
 assert.equal(touchesPlayer(v(),v(),v(0,12,0),v(0,12,0),1.5,7),false);
 assert.equal(touchesPlayer(v(),v(),v(0,6,0),v(0,6,0),1.5,7),true);
 assert.equal(touchesPlayer(v(),v(),v(5,6,0),v(5,6,0),1.5,7),false);
});

test('centipede commits to an overhead pass beneath its head after the grace period',()=>{
 for(const age of [7,10]){
  const w=new World(1,{schedule:false,invulnerable:true});w.player.pos=v(0,TUNING.eyeHeight,0);
  const e=w.spawn('centipede',v(0,3,0));e.age=age;e.status='hunting';e.statusUntil=20;e.nextMove=6;e.pos=v(0,4,0);
  w.step(idleInput());assert.equal(e.centipedeMotion?.stage,age===7?'flying':'overpass');
 }
});

test('gigapede vertical sweep is independent of player altitude',()=>{
 for(const kind of ['gigapede'] as const){
  const worlds=[1.7,15].map(height=>{const w=new World(4,{schedule:false,invulnerable:true});w.player.pos=v(0,height,0);w.spawn(kind,v(8,3,0));return w;});
  for(let i=0;i<960;i++)for(const w of worlds){w.player.pos.y=w===worlds[0]?1.7:15;w.player.grounded=false;w.player.vel.y=0;w.step(idleInput());}
  assert.deepEqual(worlds[0].enemies[0].pos,worlds[1].enemies[0].pos,kind);
  assert.ok(worlds[0].enemies[0].pos.y>2);
 }
});

test('snake body remains lethal after its crystals have been destroyed',()=>{
 const w=new World(1,{schedule:false});const e=w.spawn('gigapede',v(20,3,0));e.age=4;e.status='hunting';e.pos=v(20,3,0);
 for(let i=0;i<e.segments.length;i++)e.segments[i].pos=v(20+(i+1)*1.95,3,0);
 const segment=e.segments[0];segment.hp=0;w.player.pos=v(segment.pos.x,segment.pos.y,segment.pos.z);
 // Collision checks include the armor even when its gem is destroyed.
 w.step(idleInput());assert.equal(w.cause,'ANNIHILATED');
});

test('crew contacts use each player body height and kill only overlapping members',()=>{
 const w=new World(1,{schedule:false});w.addCrew('high');w.addCrew('low');
 w.crew[0].player.pos=v(0,12,0);w.crew[1].player.pos=v(0,1.7,0);
 const thorn=w.spawn('thorn',v());thorn.age=4;w.stepCrew(new Map());
 assert.equal(w.crew[0].alive,true);assert.equal(w.crew[1].alive,false);assert.equal(w.crew[1].cause,'ENTANGLED');assert.equal(w.state,'playing');
});

test('emerging and fully dead enemies cannot kill; invulnerability applies to crew',()=>{
 for(const kind of ENEMY_KINDS){
  const w=new World(1,{schedule:false}),e=w.spawn(kind,{...w.player.pos});w.step(idleInput());assert.equal(w.state,'playing',kind);
 }
 const w=new World(1,{schedule:false,invulnerable:true});w.addCrew('player');w.selectCrew('player');
 const e=w.spawn('skull',{...w.player.pos});e.age=2;w.stepCrew(new Map());assert.equal(w.crew[0].alive,true);
 const dead=new World(1,{schedule:false});dead.spawn('skull',{...dead.player.pos}).hp=0;dead.step(idleInput());assert.equal(dead.state,'playing');
});

test('ghostpede flight does not react to player position',()=>{
 const worlds=[v(-12,1.7,-12),v(12,12,12)].map(pos=>{const w=new World(4,{schedule:false,invulnerable:true});w.player.pos=pos;w.spawn('ghostpede',v(8,9,0));return w;});
 for(const w of worlds)advance(w,1200);
 assert.deepEqual(worlds[0].enemies[0].pos,worlds[1].enemies[0].pos);
 assert.deepEqual(worlds[0].enemies[0].segments,worlds[1].enemies[0].segments);
});
