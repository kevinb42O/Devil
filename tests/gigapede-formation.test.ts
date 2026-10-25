import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v,distance,type Enemy} from '../src/simulation';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';

function trio(seed:number,formation=true){
 const w=new World(seed,{invulnerable:true,legacyGigapedeFormation:!formation});w.startAt(259-STEP);w.step(idleInput());
 assert.equal(w.enemies.filter(e=>e.kind==='gigapede').length,3);return w;
}
function advance(w:World,input=idleInput()){
 // Retain actual scheduled spawn positions but isolate movement from later waves.
 w.enemies=w.enemies.filter(e=>e.kind==='gigapede');w.step(input);w.effects=[];
}
function overlaps(snakes:Enemy[]){let count=0;
 for(let i=0;i<snakes.length;i++)for(let j=i+1;j<snakes.length;j++)for(const a of [snakes[i].pos,...snakes[i].segments.map(s=>s.pos)])for(const b of [snakes[j].pos,...snakes[j].segments.map(s=>s.pos)])if(distance(a,b)<2)count++;
 return count;
}

test('actual 259-second trio takes turns and every snake gets repeated continuous passes',()=>{
 for(const seed of [1,29,83]){
  const w=trio(seed),snakes=[...w.enemies],passes=[0,0,0];
  for(let tick=0;tick<120*90;tick++){
   const before=snakes.map(e=>({head:{...e.pos},stage:e.gigapedeMotion?.sweep?.stage,body:e.segments.map(s=>({...s.pos}))}));
   advance(w);
   assert.ok(snakes.filter(e=>e.gigapedeMotion?.sweep?.stage==='pass').length<=1,'only one committed attacker at a time');
   snakes.forEach((e,i)=>{
    if(e.gigapedeMotion?.sweep?.stage==='pass'&&before[i].stage!=='pass')passes[i]++;
    if(e.age>3){
     assert.ok(distance(before[i].head,e.pos)<=10*STEP+.003,'head never jumps for spacing');
     e.segments.forEach((s,j)=>assert.ok(distance(before[i].body[j],s.pos)<=10*STEP+.003,'the body stays on its exact flight trail'));
    }
    assert.ok((e.gigapedeMotion?.path.length??0)<1500);
    if(e.age>15){assert.ok(e.pos.y>7);assert.ok(e.pos.y<27);assert.ok(Math.hypot(e.pos.x,e.pos.z)<70);}
   });
  }
  assert.ok(passes.every(n=>n>=3),`all snakes get turns: ${passes}`);
  assert.deepEqual(snakes.map(e=>e.gigapedeMotion!.formation!.slot),[0,1,2]);
 }
});

test('whole-body crowding is substantially reduced for stationary and circling players',()=>{
 for(const moving of [false,true]){
  const worlds=[trio(29,false),trio(29,true)],counts=[0,0];
  for(let tick=0;tick<120*60;tick++)for(const [i,w] of worlds.entries()){
   advance(w,moving?{...idleInput(),forward:1,yaw:tick*.005}:idleInput());
   if(tick>120*15&&tick%60===0)counts[i]+=overlaps(w.enemies);
  }
  assert.ok(counts[0]>0,'baseline reproduces body crowding');
  assert.ok(counts[1]<counts[0]*.25,`at least 75% fewer near-overlapping body samples (${counts})`);
 }
});

test('array ordering cannot change group planning or steering',()=>{
 const a=trio(83),b=trio(83);
 for(let tick=0;tick<120*35;tick++){
  b.enemies.reverse();advance(a);advance(b);
  const order=(w:World)=>[...w.enemies].sort((x,y)=>x.id-y.id);
  assert.deepEqual(order(a),order(b));
 }
});

test('killing one member preserves survivor lanes and never strands their attack queue',()=>{
 const w=trio(29);for(let i=0;i<120*25;i++)advance(w);
 const victim=w.enemies[0],survivors=w.enemies.slice(1),slots=survivors.map(e=>e.gigapedeMotion!.formation!.slot);victim.hp=0;
 let passes=0;
 for(let i=0;i<120*45;i++){
  const stages=survivors.map(e=>e.gigapedeMotion?.sweep?.stage);advance(w);
  survivors.forEach((e,j)=>{if(e.gigapedeMotion?.sweep?.stage==='pass'&&stages[j]!=='pass')passes++;});
 }
 assert.deepEqual(survivors.map(e=>e.gigapedeMotion!.formation!.slot),slots);assert.ok(passes>=4);
});

test('solo files, backward seeks and crew checkpoints retain group scheduling',()=>{
 for(const formation of [false,true]){
  const setup={time:259,level:4,reserve:0},w=createRun(29,setup,7,true,20,true,true,true,true,true,true,formation),recorder=new RunRecorder(29,setup);
  for(let i=0;i<120*14&&w.state==='playing';i++){const input=idleInput();recorder.record(input);w.step(input);w.effects=[];}
  const run=unpackReplay(packReplay(recorder.finish(w))),replay=new ReplayPlayer(run);
  replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
  replay.seek(0);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
  delete run.gigapedeFormation;assert.equal(new ReplayPlayer(run).world.gigapedeFormationEnabled,false);
 }
 const w=trio(29);w.addCrew('host');for(let i=0;i<120*22;i++)advance(w);
 const checkpoint=w.captureCrewCheckpoint(),restored=World.restoreCrewCheckpoint(checkpoint);
 assert.equal(restored.gigapedeFormationEnabled,true);
 for(let i=0;i<120*8;i++){advance(w);advance(restored);assert.deepEqual(restored.enemies,w.enemies);}
 delete checkpoint.options.legacyGigapedeFormation;assert.equal(World.restoreCrewCheckpoint(checkpoint).gigapedeFormationEnabled,false);
});
