import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v} from '../src/simulation';
import {armorBottom} from '../src/projectile-collision';
import {constrainEnemyFloor,towerFloorHeight,TOWER_FLOOR_CLEARANCE} from '../src/enemy-floor';
import {towerHoverOffset} from '../src/tower-anatomy-motion';
import {shotgunFeedback} from '../src/weapon-tuning';

test('all enlarged tower tiers clear the full footprint during entrance, spitting and inward travel',()=>{
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawnAt(kind,0);e.nextSpawn=Infinity;
  for(let tick=0;tick<120*35;tick++){
   w.step(idleInput(),STEP);w.effects=[];
   assert.ok(e.pos.y+armorBottom(e)>=towerFloorHeight(e,w.time)+TOWER_FLOOR_CLEARANCE-1e-8,`${kind} buried at ${e.age}s`);
  }
 }
});
test('clearance handles mature towers on raised tiles and over the sinking perimeter without cumulative lift',()=>{
 for(const kind of ['squid','squid2','squid3'] as const)for(const time of [0,120,600])for(const x of [0,12,32]){
  const w=new World(1,{schedule:false,invulnerable:true}),e=w.spawn(kind,v(x,-10,0));e.age=20;
  constrainEnemyFloor(e,time);const height=e.pos.y;
  assert.ok(e.pos.y+armorBottom(e)>=towerFloorHeight(e,time)+TOWER_FLOOR_CLEARANCE-1e-8);
  for(let i=0;i<10;i++)constrainEnemyFloor(e,time);assert.equal(e.pos.y,height);
 }
});
test('shotgun depth pullback increases at every one of the seven tiers',()=>{
 let previousKick=0;
 for(let level=1;level<=7;level++){
  const t=shotgunFeedback(level);assert.ok(t.kick>previousKick);
  assert.ok(t.kick>=.08);assert.ok(Math.exp(-t.recovery*.5)<.001,'kick fully settles between salvos');
  previousKick=t.kick;
 }
 assert.ok(shotgunFeedback(7).kick>shotgunFeedback(1).kick*3);
});

test('floating spawners bob at a deterministic altitude and never grow a ground attachment',()=>{
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawn(kind,v(0,-10,0));e.balance=true;
  const heights:number[]=[];
  for(const age of [12,13,14,15,16]){
   e.age=age;constrainEnemyFloor(e,12);
   const floor=towerFloorHeight(e,12),expected=floor+TOWER_FLOOR_CLEARANCE+towerHoverOffset(age,kind);
   assert.ok(Math.abs(e.pos.y-expected)<1e-8);assert.ok(e.pos.y-floor>.9);heights.push(e.pos.y);
  }
  assert.ok(Math.max(...heights)-Math.min(...heights)>.1,'hover visibly changes over match time');
  e.age=12;constrainEnemyFloor(e,12);assert.equal(e.pos.y,heights[0],'seeking restores the same levitation pose');
 }
});
