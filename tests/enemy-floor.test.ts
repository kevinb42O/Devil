import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v,type Enemy} from '../src/simulation';
import {ENEMY_KINDS,isEgg,isSkull} from '../src/enemy-kinds';
import {floorHeight,tileHeight,TILE_SIZE} from '../src/arena';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {SnapshotTimeline} from '../src/network-presentation';

function aboveFloor(e:Enemy,time:number){
 assert.ok(e.pos.y-e.radius>=Math.max(0,floorHeight(e.pos.x,e.pos.z,time,0)),`${e.kind} crossed the floor at ${JSON.stringify(e.pos)}`);
}

test('all mobile enemy spawns are safe even when requested below the floor or beyond the arena',()=>{
 for(const kind of ENEMY_KINDS.filter(k=>isSkull(k)||isEgg(k)||k==='spiderling'))for(const x of [0,30,80]){
  const w=new World(1,{schedule:false,invulnerable:true});w.startAt(900);
  const e=w.spawn(kind,v(x,-20,0));aboveFloor(e,w.time);
 }
});

test('tower skulls never dive beneath the void and then return through the arena',()=>{
 for(const seed of [1,17,81])for(const kind of ['skull','skull2','skull3','skull4','transmuted1','transmuted2','transmuted3','transmuted4'] as const){
  const w=new World(seed,{schedule:false,invulnerable:true});w.startAt(600);
  const e=w.spawn(kind,v(40,4,0));e.age=2;e.activeAt=0;
  e.towerFlight={gravity:22,height:1.1,descentSpeed:7.5,agility:2,curl:1.2};
  let returned=false;
  for(let i=0;i<2400;i++){
   w.player.pos=v(0,i<1200?-25:1.7,0);w.player.vel=v();
   w.step(idleInput());w.effects=[];aboveFloor(e,w.time);
   if(Math.hypot(e.pos.x,e.pos.z)<20)returned=true;
  }
  assert.ok(returned,'enemy actually returns from beyond the sunken perimeter');
 }
});

test('ejection, eggs, spiderlings and separation retain floor clearance after high downward velocity',()=>{
 for(const kind of ['skull','skull4','egg','egg2','spiderling'] as const){
  const w=new World(3,{schedule:false,invulnerable:true}),e=w.spawn(kind,v(0,0,0));
  e.vel=v(200,-1000,0);e.statusUntil=2;
  w.spawn('orb',v(.1,2,0));
  w.step(idleInput(),STEP);aboveFloor(e,w.time);if(kind!=='spiderling')assert.ok(e.vel.y>=0);
 }
});

test('a body overlapping a higher neighboring tile is kept above that tile',()=>{
 let tested=false;
 for(let x=20;x<30&&!tested;x++)for(let z=20;z<30&&!tested;z++){
  const high=tileHeight(x,z,0),low=tileHeight(x+1,z,0);if(high-low<.01)continue;
  const boundary=(x-25+.5)*TILE_SIZE,w=new World(1,{schedule:false,invulnerable:true});
  const e=w.spawn('skull4',v(boundary+.3,low+1.3,(z-25)*TILE_SIZE));
  assert.ok(e.pos.y-e.radius>=high,'clearance includes adjacent tiles under the body');
  w.step(idleInput());assert.ok(e.pos.y-e.radius>=high);tested=true;
 }
 assert.ok(tested);
});

test('multiplayer interpolation is constrained without mutating host samples',()=>{
 const host=new FriendsSession('host');
 try{
  host.world=new World(1,{schedule:false});host.world.addCrew('host');host.world.addCrew('guest');
  host.world.spawn('skull',v(0,2,0));
  const a=host.snapshot()!;a.time=1;a.enemies[0].pos.y=-3;
  const b=structuredClone(a);b.time=1.1;b.enemies[0].pos.y=-2;
  const saved=structuredClone([a,b]),timeline=new SnapshotTimeline();timeline.push(a,1000);timeline.push(b,1100);
  const guest=new World(1);applySnapshot(guest,b,'guest');
  const authoritative=structuredClone(guest.enemies),view=timeline.view(guest,'guest',1100,v());
  aboveFloor(view.enemies[0],view.time);assert.deepEqual(guest.enemies,authoritative);assert.deepEqual([a,b],saved);
 }finally{host.close();}
});

test('historical recordings retain prior floor rules while new recordings replay the fix',()=>{
 assert.equal(createRun(1,undefined,6,true,11).enemyFloorEnabled,false);
 assert.equal(createRun(1).enemyFloorEnabled,true);
 for(const revision of [11,12]){
  const setup={time:38.9,level:4,reserve:0},w=createRun(91,setup,6,true,revision),recorder=new RunRecorder(91,setup);
  for(let i=0;i<1200&&w.state==='playing';i++){const input={...idleInput(),strafe:Math.sin(i/80),jump:i%120===0};recorder.record(input);w.step(input);w.effects=[];}
  const run={...recorder.finish(w),combatRevision:revision},replay=new ReplayPlayer(run);
  replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
  replay.seek(40);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
 }
});
