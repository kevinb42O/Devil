import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v,type Projectile} from '../src/simulation';
import {STREAM_COUNTS,LEGACY_STREAM_COUNTS} from '../src/weapon-levels';
import {weaponMuzzle,projectileSocket} from '../src/weapon-origin';
import {STREAM_RADIUS} from '../src/weapon-tuning';
import {RunRecorder,ReplayPlayer} from '../src/replay';

test('dense beams keep every dagger assigned to its exact launch socket',()=>{
 for(let level=4;level<=7;level++){
  const w=new World(71,{schedule:false});w.level=level;w.player.pos=v(10,20,30);
  w.shoot({...idleInput(),yaw:.8,pitch:1.1},false,false);
  assert.equal(w.projectiles.length,STREAM_COUNTS[level-1]);
  for(let i=0;i<w.projectiles.length;i++){
   const p=w.projectiles[i],socket=projectileSocket(level,i),origin=weaponMuzzle(w.player.pos,.8,1.1,level,socket);
   assert.equal(p.socket,socket);assert.ok(Math.hypot(p.pos.x-origin.x,p.pos.y-origin.y,p.pos.z-origin.z)<=STREAM_RADIUS[level-1]+1e-9);
  }
 }
});

test('new and historical beam density survive recording, playback and rewind',()=>{
 for(const dense of [false,true]){
  const setup={time:0,level:7,reserve:0},w=new World(71,{schedule:false,legacyBeamDensity:!dense});w.startAt(0,7,0);
  const recorder=new RunRecorder(71,setup);
  for(let tick=0;tick<70;tick++){const input={...idleInput(),fire:tick<60};recorder.record(input);w.step(input);}
  const run=recorder.finish(w);if(!dense)delete run.denseBeam;
  const player=new ReplayPlayer(run);while(!player.done)player.step();
  assert.equal(player.world.denseBeamEnabled,dense);assert.deepEqual(player.world.projectiles,w.projectiles);
  player.seek(5);player.seek(70);assert.deepEqual(player.world.projectiles,w.projectiles);
  assert.ok(w.stats.shots>=(dense?STREAM_COUNTS:LEGACY_STREAM_COUNTS)[6]);
 }
});
