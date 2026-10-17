import test from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v,type Enemy} from '../src/simulation';
import {planTowerMovement,towerFootprint,TOWER_SPACING} from '../src/tower-movement';
import {RunRecorder,ReplayPlayer,createRun} from '../src/replay';

function assertSeparated(enemies:Enemy[]){
 for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){
  const a=enemies[i],b=enemies[j];
  assert.ok(Math.hypot(a.pos.x-b.pos.x,a.pos.z-b.pos.z)>=towerFootprint(a)+towerFootprint(b)+TOWER_SPACING-1e-5,`${a.kind}/${b.kind} overlap at ${a.age}`);
 }
}
function quiet(e:Enemy){e.nextSpawn=Infinity;return e;}

test('mixed towers stay separated through entrance and three minutes of convergence',()=>{
 const w=new World(17,{schedule:false,invulnerable:true});
 for(let i=0;i<9;i++)quiet(w.spawnAt((['squid','squid2','squid3'] as const)[i%3],i*Math.PI*2/9));
 for(let tick=0;tick<180/STEP;tick++){
  w.step(idleInput(),STEP);w.effects=[];assertSeparated(w.enemies);
 }
 const before=w.enemies.map(e=>({...e.pos}));
 for(let i=0;i<120;i++){w.step(idleInput(),STEP);w.effects=[];}
 assertSeparated(w.enemies);
 assert.ok(Math.max(...w.enemies.map((e,i)=>Math.hypot(e.pos.x-before[i].x,e.pos.z-before[i].z)))<.02,'settled towers should not jitter or orbit');
});

test('dense coincident towers recover deterministically without consuming random state',()=>{
 const w=new World(1,{schedule:false,invulnerable:true});
 for(let i=0;i<100;i++)quiet(w.spawn((['squid','squid2','squid3'] as const)[i%3],v()));
 const moves=planTowerMovement(w.enemies,0,STEP,.5),reversed=planTowerMovement([...w.enemies].reverse(),0,STEP,.5);
 for(const e of w.enemies){assert.deepEqual(moves.get(e),reversed.get(e));Object.assign(e.pos,moves.get(e));}
 assertSeparated(w.enemies);
});

test('isolated towers keep measured entrance and inward drift, and dead towers release space',()=>{
 const w=new World(3,{schedule:false,invulnerable:true}),legacy=new World(3,{schedule:false,invulnerable:true,legacyTowerSeparation:true});
 const a=quiet(w.spawnAt('squid3',.2)),b=quiet(legacy.spawnAt('squid3',.2));
 for(let tick=0;tick<1200;tick++){w.step(idleInput(),STEP);legacy.step(idleInput(),STEP);w.effects=[];legacy.effects=[];}
 assert.ok(Math.hypot(a.pos.x-b.pos.x,a.pos.z-b.pos.z)<1e-10);assert.equal(a.pos.y,b.pos.y);
 const blocker=quiet(w.spawn('squid3',v()));a.pos=v(towerFootprint(a)+towerFootprint(blocker)+TOWER_SPACING,10,0);delete a.towerEntrance;
 for(let tick=0;tick<120;tick++){w.step(idleInput(),STEP);w.effects=[];assertSeparated(w.enemies);}
 blocker.hp=0;const x=a.pos.x;
 for(let tick=0;tick<120;tick++){w.step(idleInput(),STEP);w.effects=[];}
 assert.ok(Math.abs(a.pos.x-(x-.5))<1e-8);
});

test('checkpoint restores and new recordings keep separation while older recordings retain their motion',()=>{
 const w=new World(1,{schedule:false,invulnerable:true});quiet(w.spawn('squid',v(-2,5,0)));quiet(w.spawn('squid2',v(2,5,0)));
 const restored=World.restoreCrewCheckpoint(w.captureCrewCheckpoint());
 for(let i=0;i<240;i++){w.step(idleInput(),STEP);restored.step(idleInput(),STEP);w.effects=[];restored.effects=[];}
 assert.deepEqual(restored.enemies,w.enemies);assertSeparated(w.enemies);
 const recorder=new RunRecorder(1),run=recorder.finish(createRun(1));
 assert.equal(run.towerSeparation,true);assert.equal(new ReplayPlayer(run).world.towerSeparationEnabled,true);
 delete run.towerSeparation;const old=new ReplayPlayer(run);assert.equal(old.world.towerSeparationEnabled,false);old.seek(0);
 const checkpoint=w.captureCrewCheckpoint();Reflect.deleteProperty(checkpoint.options,'legacyTowerSeparation');
 assert.equal(World.restoreCrewCheckpoint(checkpoint).towerSeparationEnabled,false);
});
