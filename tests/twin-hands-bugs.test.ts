import {test} from 'node:test';import assert from 'node:assert/strict';
import {World,idleInput} from '../src/simulation';
import {HAND_THRESHOLDS} from '../src/weapon-levels';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';
import {unpackShotLaunch,packShotLaunch} from '../src/network-shots';
import {shotLaunches} from '../src/projectile-launch';
import {Sound} from '../src/audio';

test('practice reserve does not skip the selected tier after a pickup',()=>{
 for(const level of [2,3,4,5,6]){const w=new World(1,{schedule:false});w.startAt(0,level,1000);assert.equal(w.reserve,1000);assert.equal(w.stats.collected,HAND_THRESHOLDS[level-1]);w.collect();assert.equal(w.level,level);}
});
test('dual network launches reject camera or historical origins before reconstruction',()=>{
 for(const level of [5,6,7])for(const mode of [1,2,5,6,9,10,13,14])assert.throws(()=>unpackShotLaunch([0,2,0,0,0,.155,196,.015,mode,71],level),/Invalid/);
});
test('a mismatched paired launch cannot silently use single-hand compact reconstruction',()=>{
 const w=new World(1,{schedule:false});w.level=5;w.addCrew('host');w.crew[0].level=5;(w as any).useCrew(w.crew[0]);w.shoot(idleInput(),true,false);const spec=w.projectiles[0].launch!;
 assert.equal(packShotLaunch({...spec,dual:false},5),null);
 const decoded=unpackShotLaunch(packShotLaunch(spec,5)!,5);assert.ok(shotLaunches(decoded,14,70).every(p=>Object.values(p.pos).every(Number.isFinite)));
});
test('replay speed preserves tier pitch for existing weapon sounds',()=>{
 const sound=new Sound(),s=sound as any;const voice=(rate:number)=>({source:{playbackRate:{value:rate}},rate});
 const loop=voice(.85),shot=voice(.9),plain=voice(1);s.loops.set(-10,loop);s.shots.add(shot);s.shots.add(plain);
 sound.setPlaybackRate(.5);assert.equal(loop.source.playbackRate.value,.425);assert.equal(shot.source.playbackRate.value,.45);assert.equal(plain.source.playbackRate.value,.5);
});

test('new practice recordings retain independent reserves through import and seeking',()=>{
 const setup={time:0,level:4,reserve:1000},w=createRun(42,setup),recorder=new RunRecorder(42,setup);
 for(let i=0;i<60;i++){const input={...idleInput(),fire:i<30};recorder.record(input);w.step(input);w.effects=[];}
 const run=unpackReplay(packReplay(recorder.finish(w)));assert.equal(run.independentPracticeReserve,true);const player=new ReplayPlayer(run);player.seek(run.ticks);assert.deepEqual(player.world.stats,w.stats);assert.deepEqual(player.world.projectiles,w.projectiles);player.seek(1);player.seek(run.ticks);assert.deepEqual(player.world.projectiles,w.projectiles);
 player.world.collect();assert.equal(player.world.level,4);
});
test('pre-fix revision-20 recordings keep the original practice setup after import and seeking',()=>{
 const setup={time:0,level:4,reserve:1000},w=createRun(42,setup,7,true,20,false),recorder=new RunRecorder(42,setup);
 for(let i=0;i<60;i++){recorder.record(idleInput());w.step(idleInput());w.effects=[];}
 const old=recorder.finish(w);delete old.independentPracticeReserve;const player=new ReplayPlayer(unpackReplay(packReplay(old)));
 assert.equal(player.world.stats.collected,1010);player.seek(60);assert.deepEqual(player.world.stats,w.stats);player.seek(1);player.seek(60);assert.deepEqual(player.world.stats,w.stats);player.world.collect();assert.equal(player.world.level,7);
});
