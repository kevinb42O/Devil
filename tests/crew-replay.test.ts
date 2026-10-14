import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v,STEP} from '../src/simulation';
import {CrewRunRecorder,CrewReplayPlayer,crewCheckpointDigest,encodeCrewReplay,decodeCrewReplay,packCrewReplay,unpackCrewReplay,validateCrewReplay} from '../src/crew-replay';

function fixture(){
 const w=new World(98423,{schedule:false});w.addCrew('host');w.addCrew('guest');w.crew[1].player.pos=v(90,-9,90);w.selectCrew('host');
 const recorder=new CrewRunRecorder(98423,w,[{id:'host',name:'Host',host:true},{id:'guest',name:'Guest',host:false}],'session',7),states=new Map<number,string>();
 for(let n=0;n<4000&&w.state==='playing';n++){
  const inputs=new Map([['host',{...idleInput(),yaw:.13,forward:n>2000?1:0,fire:n%7===0}],['guest',{...idleInput(),yaw:1.5,forward:n>2000?1:0,homing:n%9===0}]]),waiting=n%13===0?new Set(['guest']):new Set<string>();
  const before=w.crew.map(p=>({id:p.id,alive:p.alive,life:p.life,cause:p.cause}));w.effects=[];w.stepCrew(inputs,STEP,waiting);recorder.record(w,inputs,waiting,before);states.set(w.tick,crewCheckpointDigest(w.captureCrewCheckpoint()));
 }
 assert.equal(w.state,'dead');const run=recorder.finish(w);assert.ok(run);return {run,states,w};
}
test('complete crew checkpoints preserve hidden scheduling/RNG/channel/alias state',()=>{
 const w=new World(3854,{invulnerable:true});w.addCrew('host');w.addCrew('guest');w.selectCrew('host');
 const inputs=new Map([['host',{...idleInput(),fire:true,forward:.2}],['guest',{...idleInput(),jump:true,yaw:.3}]]);
 for(let n=0;n<1250;n++){w.effects=[];w.stepCrew(inputs);}
 const checkpoint=w.captureCrewCheckpoint(),restored=World.restoreCrewCheckpoint(checkpoint);
 assert.deepEqual(restored.captureCrewCheckpoint(),checkpoint);
 for(let n=0;n<600;n++){w.effects=[];restored.effects=[];w.stepCrew(inputs);restored.stepCrew(inputs);assert.equal(crewCheckpointDigest(restored.captureCrewCheckpoint()),crewCheckpointDigest(w.captureCrewCheckpoint()));}
 checkpoint.crew[0].player.pos.x=999;assert.notEqual(restored.crew[0].player.pos.x,999);
});
test('replay reproduces every tick including waiting, death, revival and terminal wipe',()=>{
 const {run,states}=fixture(),player=new CrewReplayPlayer(run);
 assert.ok(run.events.some(e=>e.kind==='respawn'));assert.equal(run.events.at(-1)?.kind,'wipe');
 while(!player.done){player.step();assert.equal(crewCheckpointDigest(player.world.captureCrewCheckpoint()),states.get(player.tick));}
 assert.deepEqual(player.world.stats,run.stats);
 for(const tick of [1700,1,600,1801,run.ticks,0,1200]){player.seek(tick);if(tick)assert.equal(crewCheckpointDigest(player.world.captureCrewCheckpoint()),states.get(tick));}
});
test('external disconnect boundaries and RLE checkpoint cursors reconstruct exactly',()=>{
 const w=new World(42,{schedule:false});w.addCrew('host');w.addCrew('guest');w.selectCrew('host');const recorder=new CrewRunRecorder(42,w,[],'session',1);
 for(let n=0;n<602;n++){if(n===600){w.crew[0].alive=false;w.crew[0].cause='DISCONNECTED';w.crew[0].respawnAt=null;w.crew[1].alive=false;w.crew[1].cause='DISCONNECTED';w.crew[1].respawnAt=null;}const before=w.crew.map(p=>({...p})),inputs=new Map<string,ReturnType<typeof idleInput>>();w.effects=[];w.stepCrew(inputs);recorder.record(w,inputs,new Set(),before);if(w.state==='dead')break;}
 const run=recorder.finish(w)!;assert.ok(run);const p=new CrewReplayPlayer(run);p.seek(600);p.step();assert.equal(p.world.state,'dead');assert.equal(crewCheckpointDigest(p.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
});
test('binary compressed replay round trip preserves infinite enemy timers and validates corruption',async()=>{
 const {run}=fixture();const packed=packCrewReplay(run),decoded=unpackCrewReplay(packed);assert.deepEqual(packCrewReplay(decoded),packed);assert.deepEqual(packCrewReplay(await decodeCrewReplay(await encodeCrewReplay(run))),packed);const playback=new CrewReplayPlayer(decoded);while(!playback.done)playback.step();assert.equal(crewCheckpointDigest(playback.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
 const corrupt={...run,frames:[...run.frames]};corrupt.frames[0].inputs[0].forward=NaN;assert.throws(()=>validateCrewReplay(corrupt));
 const bad={...run,checkpoints:structuredClone(run.checkpoints)};bad.checkpoints[0].state.rng++;assert.throws(()=>validateCrewReplay(bad));assert.throws(()=>unpackCrewReplay(packed.subarray(0,packed.length-1)));
});
test('latest asynchronous seek wins and cancellation never installs a stale world',async()=>{
 const {run}=fixture(),player=new CrewReplayPlayer(run);const first=player.seekAsync(1788),second=player.seekAsync(10);assert.equal(await first,false);assert.equal(await second,true);assert.equal(player.tick,10);const next=player.seekAsync(1789);player.cancelSeek();assert.equal(await next,false);assert.equal(player.tick,10);
});
test('recording bounds fail honestly without affecting gameplay',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');const recorder=new CrewRunRecorder(1,w,[],'s',1,1);const before=w.crew.map(p=>({...p}));w.stepCrew(new Map());recorder.record(w,new Map(),new Set(),before);assert.match(recorder.error,/unavailable/);assert.equal(w.state,'playing');assert.equal(recorder.finish(w),null);
});
test('crew lethal metadata captures the first enemy contact and stays observational',()=>{
 const w=new World(9876,{schedule:false});w.addCrew('host');w.addCrew('guest');w.crew[1].player.pos=v(15,1.7,15);w.selectCrew('host');const enemy=w.spawn('skull',{...w.crew[0].player.pos},false);enemy.age=12;const recorder=new CrewRunRecorder(9876,w,[],'source',1),before=w.crew.map(p=>({...p}));w.stepCrew(new Map());recorder.record(w,new Map(),new Set(),before);assert.equal(w.crew[0].deathSource?.enemyId,enemy.id);assert.equal(w.crew[0].deathSource?.kind,'skull');assert.equal(w.crew[0].alive,false);assert.equal(w.crew[1].alive,true);
});
test('batched host ticks record only new effects and preserve uint32 seeds',()=>{
 const w=new World(0xf314823c,{schedule:false});w.addCrew('host');w.selectCrew('host');const recorder=new CrewRunRecorder(0xf314823c,w,[],'source',1);let before=w.crew.map(p=>({...p}));w.stepCrew(new Map());w.emit('upgrade',w.player.pos,2);recorder.record(w,new Map(),new Set(),before);const offset=w.effects.length;before=w.crew.map(p=>({...p}));w.crew[0].alive=false;w.crew[0].cause='DISCONNECTED';w.crew[0].respawnAt=null;w.stepCrew(new Map());recorder.record(w,new Map(),new Set(),before,offset);const run=recorder.finish(w)!;assert.equal(run.events.filter(e=>e.kind==='upgrade').length,1);assert.doesNotThrow(()=>validateCrewReplay(run));
});
test('tower death poses survive removal and remain independent of mutable enemies',async()=>{
 const {crystalToEnemy}=await import('../src/enemy-presentation');const w=new World(6543,{schedule:false});w.addCrew('host');w.selectCrew('host');const tower=w.spawn('squid',v(0,3.3,-10),false);tower.age=20;tower.hp=1;tower.weakpoints[0].hp=1;const crystal=crystalToEnemy(tower,w.player.pos,tower.weakpoints[0].local);w.projectiles.push({id:10000,pos:{...crystal},vel:v(),age:0,homing:false,level:4,energy:5});const recorder=new CrewRunRecorder(6543,w,[],'pose',1),before=w.crew.map(p=>({...p}));w.stepCrew(new Map());assert.equal(tower.hp,0);recorder.record(w,new Map(),new Set(),before,0,0,[tower]);tower.pos.x=999;w.crew[0].alive=false;w.crew[0].cause='DISCONNECTED';w.crew[0].respawnAt=null;w.effects=[];const end=w.crew.map(p=>({...p}));w.stepCrew(new Map());recorder.record(w,new Map(),new Set(),end);const run=recorder.finish(w)!;assert.equal(run.towerDeaths?.length,1);assert.notEqual(run.towerDeaths?.[0].enemy.pos.x,999);assert.doesNotThrow(()=>packCrewReplay(run));
});
test('replay freezes the public roster whitelist and never stores lobby readiness fields',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');const member={id:'host',name:'Captain',host:true,ready:true,readyRevision:9},recorder=new CrewRunRecorder(1,w,[member],'s',1);assert.deepEqual(recorder.roster,[{id:'host',name:'Captain',host:true}]);member.name='Changed';assert.equal(recorder.roster[0].name,'Captain');
});
