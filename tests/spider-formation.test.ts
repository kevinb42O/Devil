import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput} from '../src/simulation';
import {survivalSchedule,type ScheduledSpawn} from '../src/survival';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';

const groups:ScheduledSpawn[]=[];
for(const event of survivalSchedule()){
 if(event.time>1200)break;
 if(event.spiderGroup?.index===0)groups.push(event);
}
function births(world:World){
 const positions:{x:number;z:number}[]=[],spawn=world.spawnAt.bind(world);
 world.spawnAt=(kind,angle,radial)=>{const e=spawn(kind,angle,radial);if(kind==='spider'||kind==='spider2')positions.push({...e.pos});return e;};
 world.step(idleInput());return positions;
}

test('every simultaneous spider group forms a regular polygon across seeds and loop waves',()=>{
 assert.ok(groups.some(e=>e.kind==='spider'&&e.spiderGroup?.count===3));
 assert.ok(groups.some(e=>e.kind==='spider2'));
 for(const event of groups)for(const seed of [1,29,83,917,80421]){
  const w=new World(seed,{invulnerable:true});w.startAt(event.time-STEP);
  const points=births(w);assert.equal(points.length,event.spiderGroup!.count);
  const angles=points.map(p=>(Math.atan2(p.x,p.z)+Math.PI*2)%(Math.PI*2)).sort((a,b)=>a-b);
  for(let i=0;i<angles.length;i++){
   const gap=(angles[(i+1)%angles.length]-angles[i]+Math.PI*2)%(Math.PI*2);
   assert.ok(Math.abs(gap-Math.PI*2/angles.length)<1e-10,`seed ${seed}, time ${event.time}: equal angular gaps`);
   assert.ok(Math.abs(Math.hypot(points[i].x,points[i].z)-Math.hypot(points[0].x,points[0].z))<1e-10);
  }
 }
});

test('new replay files and backward seeking reproduce spider formation; old files retain old angles',()=>{
 const setup={time:174,level:1,reserve:0};
 for(const enabled of [false,true]){
  const w=createRun(29,setup,7,true,20,true,true,true,true,true,true,true,true,enabled);
  const recorder=new RunRecorder(29,setup);
  for(let i=0;i<12;i++){const input=idleInput();recorder.record(input);w.step(input);w.effects=[];}
  const run=unpackReplay(packReplay(recorder.finish(w)));
  if(!enabled)delete run.spiderFormation;
  const replay=new ReplayPlayer(run);assert.equal(replay.world.spiderFormationEnabled,enabled);
  replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world.captureCrewCheckpoint(),w.captureCrewCheckpoint());
  replay.seek(0);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world.captureCrewCheckpoint(),w.captureCrewCheckpoint());
 }
});

test('crew checkpoints preserve formation rules before the trio spawns',()=>{
 const w=new World(83,{invulnerable:true});w.startAt(174-STEP);
 const restored=World.restoreCrewCheckpoint(w.captureCrewCheckpoint());
 assert.equal(restored.spiderFormationEnabled,true);assert.deepEqual(births(restored),births(w));
 const old=w.captureCrewCheckpoint();delete old.options.legacySpiderFormation;
 assert.equal(World.restoreCrewCheckpoint(old).spiderFormationEnabled,false);
});
