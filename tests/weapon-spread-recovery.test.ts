import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v} from '../src/simulation';
import {WEAPON_PRESENTATION} from '../src/weapon-tuning';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';

test('new solo and multiplayer games use the compact beam and shotgun cones at every tier',()=>{
 for(let level=1;level<=7;level++)for(const crew of [false,true])for(const burst of [false,true]){
  const w=crew?new World(71,{schedule:false}):createRun(71,{time:0,level,reserve:0});
  if(crew){w.addCrew('host');w.crew[0].level=level;(w as any).useCrew(w.crew[0]);}
  w.player.pos=v(0,100,0);
  assert.equal(w.wideWeaponSpreadEnabled,false);
  let outer=0;
  for(let shot=0;shot<40;shot++){
   w.projectiles=[];w.shoot(idleInput(),burst,false);
   for(const p of w.projectiles){
    const t=(-25-p.pos.z)/p.vel.z;
    outer=Math.max(outer,Math.hypot(p.pos.x+p.vel.x*t,p.pos.y+p.vel.y*t-100));
   }
  }
  const tuning=WEAPON_PRESENTATION[level-1],expected=25*Math.tan(burst?tuning.burstSpread:tuning.streamSpread);
  assert.ok(Math.abs(outer-expected)<.25,JSON.stringify({level,crew,burst,outer,expected}));
 }
});

test('compact and previously expanded patterns retain exact playback, rewind and crew checkpoints',()=>{
 for(const wide of [false,true]){
  const setup={time:0,level:7,reserve:0},w=new World(71,{schedule:false,legacyWeaponSpread:!wide});w.startAt(0,7,0);
  const recorder=new RunRecorder(71,setup);
  for(let tick=0;tick<100;tick++){
   const input={...idleInput(),fire:tick<2||tick>=65};recorder.record(input);w.step(input);
  }
  const run=recorder.finish(w),player=new ReplayPlayer(run);
  assert.equal(run.wideWeaponSpread,wide);
  while(!player.done)player.step();
  assert.deepEqual(player.world.projectiles,w.projectiles);
  player.seek(0);player.seek(100);assert.deepEqual(player.world.projectiles,w.projectiles);
  const restored=World.restoreCrewCheckpoint(w.captureCrewCheckpoint());
  assert.equal(restored.wideWeaponSpreadEnabled,wide);
 }
});
