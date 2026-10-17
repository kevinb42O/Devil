import test from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,STEP,type Input} from '../src/simulation';
import {RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';
import {CrewRunRecorder,CrewReplayPlayer,packCrewReplay,unpackCrewReplay,crewCheckpointDigest} from '../src/crew-replay';

test('combat gestures do not alter projectile simulation, movement, damage or upgrade rules',()=>{
 for(let level=1;level<=7;level++){
  const plain=new World(971,{schedule:false,invulnerable:true}),gesturing=new World(971,{schedule:false,invulnerable:true});
  for(const world of [plain,gesturing]){world.addCrew('host');world.selectCrew('host');world.level=world.crew[0].level=level;world.reserve=world.crew[0].reserve=100;}
  for(let tick=0;tick<180;tick++){
   const input={...idleInput(),fire:tick%60<45,homing:tick%70<30,pitch:-.4,yaw:.3,strafe:.2,jump:tick===90};
   plain.stepCrew(new Map([['host',input]]));
   gesturing.stepCrew(new Map([['host',{...input,leftArm:true,rightArm:tick<120}]]));
  }
  assert.deepEqual(gesturing.projectiles,plain.projectiles,`tier ${level} projectiles`);
  assert.deepEqual(gesturing.stats,plain.stats);assert.deepEqual(gesturing.player,plain.player);
  assert.equal(gesturing.crew[0].input.leftArm,true);assert.equal(gesturing.crew[0].input.rightArm,undefined);
 }
});

test('solo recording preserves gesture-only changes through binary export and seeking',()=>{
 const world=new World(1,{schedule:false}),recorder=new RunRecorder(1);
 const sequence:Input[]=[idleInput(),{...idleInput(),leftArm:true},{...idleInput(),leftArm:true,rightArm:true},{...idleInput(),rightArm:true},idleInput()];
 for(const input of sequence){recorder.record(input);world.step(input);}
 const run=unpackReplay(packReplay(recorder.finish(world)));
 assert.equal(run.frames.length,sequence.length);assert.deepEqual(run.frames.map(f=>f.input),sequence);
 const replay=new ReplayPlayer(run);replay.seek(3);assert.equal(replay.lastInput.leftArm,true);assert.equal(replay.lastInput.rightArm,true);
 replay.seek(1);assert.equal(replay.lastInput.leftArm,undefined);
});

test('team recording preserves combat gestures and exact checkpoints through binary export and seek',()=>{
 const world=new World(725,{schedule:false});world.addCrew('host');world.addCrew('guest');world.selectCrew('host');
 const recorder=new CrewRunRecorder(725,world,[{id:'host',name:'Host',host:true},{id:'guest',name:'Guest',host:false}],'gesture-test',1);
 for(let tick=0;tick<650;tick++){
  const inputs=new Map<string,Input>([['host',{...idleInput(),fire:tick%40<20,...(tick%60<30?{leftArm:true}:{})}],['guest',{...idleInput(),...(tick%80<40?{rightArm:true}:{})}]]);
  if(tick===649)for(const player of world.crew)player.player.pos.y=-10;
  const before=world.crew.map(p=>({id:p.id,alive:p.alive,life:p.life,cause:p.cause}));
  world.effects=[];world.stepCrew(inputs,STEP);recorder.record(world,inputs,new Set(),before);
 }
 const run=recorder.finish(world)!;assert.ok(run);
 const decoded=unpackCrewReplay(packCrewReplay(run)),replay=new CrewReplayPlayer(decoded);
 replay.seek(610);assert.equal(replay.world.crew[0].input.leftArm,true);assert.equal(replay.world.crew[1].input.rightArm,undefined);
 replay.seek(1);assert.equal(replay.world.crew[1].input.rightArm,true);
 replay.seek(run.ticks);assert.equal(crewCheckpointDigest(replay.world.captureCrewCheckpoint()),crewCheckpointDigest(world.captureCrewCheckpoint()));
});
