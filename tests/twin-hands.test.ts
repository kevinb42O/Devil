import {test} from 'node:test';import assert from 'node:assert/strict';
import {World,idleInput,v,STEP} from '../src/simulation';
import {HAND_THRESHOLDS,STREAM_COUNTS,BURST_COUNTS} from '../src/weapon-levels';
import {weaponMuzzle,projectileSocket} from '../src/weapon-origin';
import {shotLaunches} from '../src/projectile-launch';
import {packShotLaunch,unpackShotLaunch} from '../src/network-shots';
import {FriendsSession} from '../src/multiplayer';
import {encodeState,decodeState,snapshotBaseline} from '../src/network-state';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';
import {CrewRunRecorder,CrewReplayPlayer,packCrewReplay,unpackCrewReplay,crewCheckpointDigest} from '../src/crew-replay';

test('new thresholds upgrade exactly once and reserve spending never downgrades',()=>{
 const w=new World(1,{schedule:false});for(let n=1;n<=801;n++){w.effects=[];w.collect();const level=HAND_THRESHOLDS.filter(t=>t<=n).length;assert.equal(w.level,level);assert.equal(w.effects.filter(e=>e.kind==='upgrade').length,HAND_THRESHOLDS.includes(n as never)?1:0);}
 w.reserve=1;w.shoot(idleInput(),true,true);assert.equal(w.projectiles.length,1);assert.equal(w.reserve,0);assert.equal(w.level,7);assert.equal(w.projectiles[0].socket,0);
 const old=createRun(1,undefined,6,true,19);for(let n=0;n<801;n++)old.collect();assert.equal(old.level,4);assert.equal(old.stats.upgradeTimes.length,4);
});
test('paired primary and homing use one budget with symmetric physical origins',()=>{
 for(const level of [5,6,7])for(const burst of [false,true])for(const homing of [false,true]){
  const w=new World(4,{schedule:false});w.level=level;w.reserve=100;w.player.pos=v(0,20,0);w.shoot(idleInput(),burst,homing);
  const expected=homing?(burst?30:4):burst?BURST_COUNTS[level-1]:STREAM_COUNTS[level-1];assert.equal(w.projectiles.length,expected);assert.equal(w.effects.filter(e=>e.kind==='shot'||e.kind==='burst').length,1);
  assert.equal(w.projectiles.filter(p=>p.socket!%2===0).length,expected/2);assert.equal(w.projectiles.filter(p=>p.socket!%2===1).length,expected/2);
  assert.equal(w.reserve,homing?100-expected:100);assert.equal(w.stats.shots,expected);
  const a=weaponMuzzle(v(),0,0,level,0),b=weaponMuzzle(v(),0,0,level,1);assert.ok(Math.abs(a.x+b.x)<1e-12);assert.equal(a.y,b.y);assert.equal(a.z,b.z);
 }
});
test('new tiers keep IV cadence, homing priority and once-only shotgun floor launch',()=>{
 for(const level of [4,5,6,7]){
  const w=new World(1,{schedule:false});w.level=level;w.reserve=1000;for(let i=0;i<120;i++)w.step({...idleInput(),fire:true});assert.equal(w.stats.shots,12*STREAM_COUNTS[level-1]);
  const h=new World(1,{schedule:false});h.level=level;h.reserve=1000;for(let i=0;i<120;i++)h.step({...idleInput(),fire:true,homing:true});assert.equal(h.stats.shots,h.stats.homingFired);assert.equal(h.stats.shots,9*4);
  const j=new World(1,{schedule:false});j.startAt(0,level);j.shoot({...idleInput(),pitch:-1.4},true,false);assert.equal(j.player.vel.y,17);assert.equal(j.effects.filter(e=>e.kind==='jump').length,1);
 }
});
test('six-person upgrades celebrate for everyone but create one collector damage wave',()=>{
 const w=new World(1,{schedule:false});for(let i=0;i<6;i++)w.addCrew('p'+i);w.selectCrew('p2');for(let i=0;i<349;i++)w.collect();w.effects=[];const before=w.captureCrewCheckpoint().upgradePulses.length;w.collect();
 assert.ok(w.crew.every(p=>p.level===5));assert.equal(w.effects.filter(e=>e.kind==='upgrade').length,6);assert.equal(w.effects.filter(e=>e.sharedWave).length,1);assert.equal(w.captureCrewCheckpoint().upgradePulses.length,before+1);assert.equal(w.effects.find(e=>e.sharedWave)?.shooterId,'p2');
 w.effects=[];w.collect();assert.equal(w.effects.length,0);
});
test('network reproduces both origins, sparse pellet 95, homing and delta baselines',()=>{
 const session=new FriendsSession('host');try{session.running=true;for(const level of [5,6,7])for(const burst of [false,true]){
  const w=new World(42,{schedule:false});session.world=w;w.addCrew('host');w.crew[0].level=level;(w as any).useCrew(w.crew[0]);w.shoot(idleInput(),burst,false);
  const full=structuredClone(w.projectiles),count=full.length,spec=full[0].launch!,packed=packShotLaunch(spec,level)!;assert.ok(packed);assert.deepEqual(shotLaunches(unpackShotLaunch(packed,level),count,70),shotLaunches(spec,count,70));
  w.projectiles=full.filter((_,i)=>[0,1,2,3,count-1].includes(i));const first=decodeState(encodeState(session.snapshot()!,1,0),new Map())!;
  for(const p of first.snapshot.projectiles){const q=full.find(q=>q.id===p.id)!;assert.equal(p.level,level);assert.equal(p.kind,q.kind);assert.equal(p.socket,q.socket);assert.ok(Math.hypot(p.pos.x-q.pos.x,p.pos.y-q.pos.y,p.pos.z-q.pos.z)<1e-9);assert.ok(Math.hypot(p.vel.x-q.vel.x,p.vel.y-q.vel.y,p.vel.z-q.vel.z)<1e-9);}
  const send=snapshotBaseline(session.snapshot()!),receive=snapshotBaseline(first.snapshot);w.time+=.05;for(const p of w.projectiles){p.age+=.05;p.pos=v(p.pos.x+p.vel.x*.05,p.pos.y+p.vel.y*.05,p.pos.z+p.vel.z*.05);}const second=decodeState(encodeState(session.snapshot()!,2,1,send),new Map([[1,receive]]))!;assert.ok(second.snapshot.projectiles.every(p=>p.level===level));
  w.projectiles=[{...full[0],homing:true,floorBounces:1}];const corrected=decodeState(encodeState(session.snapshot()!,3,0),new Map())!;assert.equal(corrected.snapshot.projectiles[0].level,level);assert.equal(corrected.snapshot.projectiles[0].homing,true);assert.equal(corrected.snapshot.projectiles[0].kind,burst?'shotgun':undefined);
 }}finally{session.close();}
});
test('solo V–VII recordings import, replay and seek with exact paired trajectories',()=>{
 for(const level of [5,6,7]){const setup={time:0,level,reserve:30},w=createRun(42,setup),recorder=new RunRecorder(42,setup);for(let i=0;i<120;i++){const input={...idleInput(),fire:i%50<25,yaw:.1,pitch:.1};recorder.record(input);w.step(input);w.effects=[];}const run=unpackReplay(packReplay(recorder.finish(w))),p=new ReplayPlayer(run);p.seek(120);assert.deepEqual(p.world.projectiles,w.projectiles);assert.deepEqual(p.world.stats,w.stats);p.seek(5);p.seek(120);assert.deepEqual(p.world.projectiles,w.projectiles);}
});
test('new crew checkpoints retain dual routing across playback and seeking',()=>{
 const w=new World(42,{schedule:false});w.addCrew('host');w.crew[0].level=7;w.stats.collected=800;w.selectCrew('host');const recorder=new CrewRunRecorder(42,w,[],'twins',1);for(let i=0;i<125;i++){if(i===124){w.crew[0].alive=false;w.crew[0].cause='DISCONNECTED';w.crew[0].respawnAt=null;}const before=w.crew.map(p=>({...p})),input=new Map([['host',{...idleInput(),fire:i%40<20}]]);w.effects=[];w.stepCrew(input);recorder.record(w,input,new Set(),before);}const run=unpackCrewReplay(packCrewReplay(recorder.finish(w)!)),p=new CrewReplayPlayer(run);p.seek(125);assert.equal(crewCheckpointDigest(p.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);p.seek(25);assert.ok(p.world.projectiles.some(p=>p.socket===1));p.seek(125);assert.equal(crewCheckpointDigest(p.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
});
