import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,v,STEP,idleInput,type Projectile} from '../src/simulation';
import {tileHeight,TILE_SIZE,sweepFloor} from '../src/arena';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
const tick=(w:World)=>(w as any).updateProjectiles(STEP);
const pair=(()=>{for(let x=20;x<30;x++)for(let z=20;z<30;z++){
 const high=tileHeight(x,z,0),low=tileHeight(x+1,z,0);if(high-low>.01)return {x,z,high,low};
}throw Error('Unequal tiles required');})();
test('raised tile sides reflect descending, horizontal and ascending shots without lifting them',()=>{
 const {x,z,low}=pair,edge=(x-25+.5)*TILE_SIZE,zz=(z-25)*TILE_SIZE;
 for(const vy of [-.1,0,.1]){
  const w=new World(1,{schedule:false}),p:Projectile={id:900,pos:v(edge+.05,low+.081,zz),vel:v(-70,vy,0),age:0,homing:false};
  w.projectiles.push(p);tick(w);
  assert.equal(p.floorBounces,1);assert.ok(p.vel.x>0);
  const effect=w.effects.find(e=>e.kind==='ricochet')!;
  assert.ok(Math.abs(effect.pos.y-(low+.081+vy*.05/70))<1e-9);
  assert.ok(effect.direction!.x>0);assert.ok(p.pos.x>edge);
 }
});
test('a shallow floor shot gets useful travel rather than repeated tiny rebounds',()=>{
 const w=new World(1,{schedule:false}),p:Projectile={id:900,pos:v(0,.081,0),vel:v(70,-.1,0),age:0,homing:false};
 w.projectiles.push(p);tick(w);tick(w);assert.ok(p.vel.y>2);
 let furthest=p.pos.x;for(let i=0;i<118&&w.projectiles.length;i++){tick(w);furthest=Math.max(furthest,p.pos.x);}
 assert.ok(furthest>10);assert.ok((p.floorBounces??0)<7);assert.ok(w.projectiles.length>0);
});
test('steep floor bursts fan outward at every hand level without increasing damage or energy',()=>{
 for(let level=1;level<=4;level++){
  const w=new World(71,{schedule:false});w.level=level;
  w.shoot({...idleInput(),pitch:-Math.PI/2},true,false);
  const count=w.projectiles.length;
  for(let i=0;i<15;i++)tick(w);
  assert.equal(w.projectiles.length,count);
  for(const p of w.projectiles){assert.equal(p.floorBounces,1);assert.ok(Math.hypot(p.vel.x,p.vel.z)>20);assert.ok(p.vel.y>0);assert.equal(p.energy,1);}
 }
});
test('floor sweep ignores clear flight and missing arena but reflects either side of a seam',()=>{
 assert.equal(sweepFloor(v(0,4,0),v(1,5,0),0),null);
 assert.equal(sweepFloor(v(1000,0,1000),v(1001,-1,1000),0),null);
 const {x,z,high,low}=pair,edge=(x-25+.5)*TILE_SIZE,zz=(z-25)*TILE_SIZE;
 assert.equal(sweepFloor(v(edge-.05,high+.081,zz),v(edge+.5,high+.081,zz),0),null);
 assert.ok(sweepFloor(v(edge+.05,low+.081,zz),v(edge-.5,low+.081,zz),0)?.normal?.x===1);
});
test('revision 16 preserves old ricochets and new floor-burst replays remain deterministic after seeking',()=>{
 const old=createRun(71,undefined,6,true,16),current=createRun(71);
 for(const w of [old,current]){w.projectiles.push({id:900,pos:v(0,.081,0),vel:v(70,-.1,0),age:0,homing:false});tick(w);tick(w);}
 assert.ok(old.projectiles[0].age>current.projectiles[0].age+.2);
 const w=createRun(71),recorder=new RunRecorder(71);
 for(let i=0;i<240;i++){const input={...idleInput(),pitch:-1.5,fire:i%75<5};recorder.record(input);w.step(input);w.effects=[];}
 const run=recorder.finish(w),replay=new ReplayPlayer(run);assert.equal(run.combatRevision,18);
 replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
 replay.seek(30);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
});

test('tile-side contacts at the exact start and end cannot tunnel',()=>{
 const {x,z,low}=pair,edge=(x-25+.5)*TILE_SIZE,zz=(z-25)*TILE_SIZE;
 const start=sweepFloor(v(edge,low+.081,zz),v(edge-.5,low+.081,zz),0);
 assert.equal(start?.t,0);assert.equal(start?.normal?.x,1);
 for(let ix=20;ix<30;ix++)for(let iz=20;iz<30;iz++){
  const lo=tileHeight(ix,iz,0),hi=tileHeight(ix+1,iz,0);if(hi-lo<=.01)continue;
  const boundary=(ix-25+.5)*TILE_SIZE,zpos=(iz-25)*TILE_SIZE;
  const hit=sweepFloor(v(boundary-.5,lo+.081,zpos),v(boundary,lo+.081,zpos),0);
  assert.equal(hit?.t,1);assert.equal(hit?.normal?.x,-1);return;
 }
 assert.fail('Positive-direction seam required');
});
