import {encodeEffects,decodeEffects} from '../src/network-effects';
import {packShotLaunch,unpackShotLaunch} from '../src/network-shots';
import {encodeState,decodeState} from '../src/network-state';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v} from '../src/simulation';
import {inputRuns} from '../src/network-input';
import {FriendsSession,cleanInput,applySnapshot} from '../src/multiplayer';
import {RunRecorder,createRun,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';
import {BURST_COUNTS,STREAM_COUNTS} from '../src/weapon-levels';

function world(level:number){const w=new World(4,{schedule:false,invulnerable:true});w.level=level;w.player.pos=v(0,20,0);return w;}
test('mouse hands launch from the matching sockets and retain the combined firing budget',()=>{
 for(const level of [5,6,7])for(const burst of [true,false]){
  for(const hand of [0,1]){const w=world(level),input={...idleInput(),fire:true,fireLeft:hand===1,fireRight:hand===0};
   if(burst){w.step(input);w.step(idleInput());}else for(let i=0;i<37;i++)w.step(input);
   assert.equal(w.stats.shots,Math.ceil((burst?BURST_COUNTS:STREAM_COUNTS)[level-1]/2));
   assert.ok(w.projectiles.every(p=>p.socket!%2===hand));
   if(burst)assert.ok(w.effects.filter(e=>e.kind==='burst').every(e=>e.muzzles?.every(p=>hand===1?p.x<0:p.x>0))); 
  }
  const w=world(level),input={...idleInput(),fire:true,fireLeft:true,fireRight:true};
  if(burst){w.step(input);w.step(idleInput());}else for(let i=0;i<37;i++)w.step(input);
  assert.equal(w.stats.shots,(burst?BURST_COUNTS:STREAM_COUNTS)[level-1]);
 }
});
test('one hand can tap a burst while the other continues streaming; homing retains priority',()=>{
 const w=world(5),right={...idleInput(),fire:true,fireRight:true};for(let i=0;i<38;i++)w.step(right);
 w.step({...right,fireLeft:true});w.effects=[];w.step(right);
 assert.ok(w.effects.some(e=>e.kind==='burst'&&e.muzzles?.every(m=>m.x<0)));
 w.reserve=100;w.effects=[];for(let i=0;i<30;i++)w.step({...right,fireLeft:true,homing:true});
 assert.ok(w.effects.some(e=>e.kind==='shot'&&e.amount===1));assert.ok(w.projectiles.some(p=>p.homing));
 assert.ok(w.effects.filter(e=>e.kind==='shot'||e.kind==='burst').every(e=>e.amount===1));
});
test('hand flags survive multiplayer normalization, compression and replay packing',()=>{
 const inputs=[{...idleInput(),fire:true,fireLeft:true},{...idleInput(),fire:true,fireRight:true},{...idleInput(),fire:true,fireLeft:true,fireRight:true}];
 assert.deepEqual(inputRuns(inputs.map((input,i)=>({seq:i+1,input}))).map(r=>r[6]),[34,66,98]);
 for(const input of inputs)assert.deepEqual(cleanInput(input),input);
 const w=world(5),recorder=new RunRecorder(4);for(const input of inputs){recorder.record(input);w.step(input);}
 const run=recorder.finish(w);assert.equal(run.frames.length,3);assert.deepEqual(unpackReplay(packReplay(run)),run);
});

test('independent hand launch descriptions and sockets survive compact multiplayer snapshots',()=>{
 const session=new FriendsSession('host');try{session.running=true;
 for(const level of [5,6,7])for(const burst of [false,true])for(const hand of [0,1]){
  const w=world(level);session.world=w;w.addCrew('host');w.crew[0].level=level;(w as any).useCrew(w.crew[0]);w.shoot(idleInput(),burst,false,hand);
  const spec=w.projectiles[0].launch!,packed=packShotLaunch(spec,level);assert.ok(packed);
  assert.deepEqual(unpackShotLaunch(packed!,level).muzzles,spec.muzzles);
  const decoded=decodeState(encodeState(session.snapshot()!,1,0),new Map())!.snapshot;
  for(const p of decoded.projectiles){const original=w.projectiles.find(q=>q.id===p.id)!;assert.equal(p.socket,original.socket);assert.equal(p.hand,hand);assert.ok(Math.hypot(p.pos.x-original.pos.x,p.pos.y-original.pos.y,p.pos.z-original.pos.z)<1e-8);}
  w.projectiles=w.projectiles.slice(0,1);const correction=decodeState(encodeState(session.snapshot()!,2,0),new Map())!.snapshot.projectiles[0];assert.equal(correction.hand,hand);assert.equal(correction.socket,w.projectiles[0].socket);
 }
 }finally{session.close();}
});

test('independent hand bursts and streams replay deterministically',()=>{
 const setup={time:0,level:5,reserve:100},w=createRun(42,setup),recorder=new RunRecorder(42,setup);
 for(let i=0;i<120;i++){const fireLeft=i%40<25,fireRight=i%30<20,input={...idleInput(),fire:fireLeft||fireRight,...(fireLeft?{fireLeft:true}:{}),...(fireRight?{fireRight:true}:{})};recorder.record(input);w.step(input);w.effects=[];}
 const replay=new ReplayPlayer(unpackReplay(packReplay(recorder.finish(w))));replay.seek(120);replay.world.effects=[];assert.deepEqual(replay.world,w);
});

test('firing hand survives effect transport and restored multiplayer inputs',()=>{
 const session=new FriendsSession('host');try{session.running=true;const w=world(5);session.world=w;w.addCrew('host');w.crew[0].level=5;
 for(let i=0;i<38;i++)w.stepCrew(new Map([['host',{...idleInput(),fire:true,fireLeft:true}]]));
 const effect=w.effects.find(e=>e.kind==='shot')!;assert.equal(effect.hand,1);
 const decoded=decodeEffects(JSON.parse(encodeEffects(1,[{...effect,networkId:1}])));assert.equal(decoded!.events[0].hand,1);
 const restored=world(5);applySnapshot(restored,session.snapshot()!,'host');assert.equal(restored.crew[0].input.fireLeft,true);assert.equal(restored.crew[0].input.fireRight,undefined);
 }finally{session.close();}
});

test('every weapon tier retains the mouse hand through beam and shotgun effects without changing damage budget',()=>{
 for(let level=1;level<=7;level++)for(const hand of [0,1])for(const burst of [true,false]){
  const w=world(level),input={...idleInput(),fire:true,fireLeft:hand===1,fireRight:hand===0};
  if(burst){w.step(input);w.step(idleInput());}else for(let i=0;i<37;i++)w.step(input);
  assert.equal(w.stats.shots,Math.ceil((burst?BURST_COUNTS:STREAM_COUNTS)[level-1]/(level>=5?2:1)));
  assert.ok(w.projectiles.length>0&&w.projectiles.every(p=>p.hand===hand));
  assert.ok(w.effects.some(e=>(e.kind==='shot'||e.kind==='burst')&&e.hand===hand));
  // Crew launch descriptions must reconstruct the same origins at early tiers too.
  const crew=world(level);crew.addCrew('host');crew.crew[0].level=level;(crew as any).useCrew(crew.crew[0]);crew.shoot(input,burst,false,hand);
  const launch=crew.projectiles[0].launch!,packed=packShotLaunch(launch,level);assert.ok(packed);assert.deepEqual(unpackShotLaunch(packed!,level).muzzles,launch.muzzles);
 }
});
