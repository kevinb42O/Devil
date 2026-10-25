import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v} from '../src/simulation';
import {RunRecorder,ReplayPlayer,createRun} from '../src/replay';
import {BURST_COUNTS} from '../src/weapon-levels';
function world(level=1){const w=new World(42,{schedule:false,invulnerable:true});w.level=level;w.player.pos=v(0,20,0);return w;}
const left={...idleInput(),fire:true,fireLeft:true},right={...idleInput(),fire:true,fireRight:true};
test('holding either hand starts a clean beam and never fires a shotgun on press or release',()=>{
 for(const level of [1,2,3,4,5,6,7])for(const input of [left,right]){
  const w=world(level);for(let i=0;i<36;i++)w.step(input);assert.equal(w.stats.shots,0);
  w.step(input);assert.ok(w.stats.shots>0);assert.equal(w.weaponAudio.primary,true);
  assert.equal(w.effects.filter(e=>e.kind==='burst').length,0);
  for(let i=0;i<30;i++)w.step(input);const shots=w.stats.shots;w.step(idleInput());assert.equal(w.stats.shots,shots);
 }
});
test('a short tap fires exactly once on release for either hand',()=>{
 for(const level of [1,2,3,4,5,6,7])for(const input of [left,right]){
  const w=world(level);w.step(input);assert.equal(w.stats.shots,0);w.step(idleInput());
  assert.equal(w.stats.shots,BURST_COUNTS[level-1]/(level>=5?2:1));for(let i=0;i<20;i++)w.step(idleInput());
  assert.equal(w.effects.filter(e=>e.kind==='burst').length,1);
 }
});
test('left and right shotgun recoveries are independent at every tier',()=>{
 for(const level of [1,2,3,4,5,6,7]){
  const w=world(level),burst=BURST_COUNTS[level-1]/(level>=5?2:1);
  w.step(left);w.step(idleInput());assert.equal(w.stats.shots,burst);
  w.step(right);w.step(idleInput());assert.equal(w.stats.shots,burst*2,'other hand fires during the first hand cooldown');
  w.step(left);w.step(idleInput());w.step(right);w.step(idleInput());assert.equal(w.stats.shots,burst*2,'each hand keeps its own cooldown');
  while(w.tick<60)w.step(idleInput());w.step(left);w.step(idleInput());assert.equal(w.stats.shots,burst*3);
  w.step(right);w.step(idleInput());assert.equal(w.stats.shots,burst*4);
 }
});
test('one hand can hold a beam while the other fires and recovers from shotgun taps',()=>{
 const w=world(5);for(let i=0;i<40;i++)w.step(left);w.effects=[];
 w.step({...left,fireRight:true});w.step(left);assert.ok(w.effects.some(e=>e.kind==='burst'&&e.hand===0));
 w.effects=[];for(let i=0;i<18;i++)w.step(left);assert.ok(w.effects.some(e=>e.kind==='shot'&&e.hand===1));assert.ok(w.effects.every(e=>e.kind!=='burst'));
});
test('shotgun recovery cannot delay the clean beam on the same hand',()=>{
 const w=world(5);w.step(left);w.step(idleInput());w.effects=[];
 for(let i=0;i<37;i++)w.step(left);assert.ok(w.effects.some(e=>e.kind==='shot'&&e.hand===1));assert.equal(w.effects.filter(e=>e.kind==='burst').length,0);
});
test('recordings from the former press-fire behavior retain their exact timing',()=>{
 const w=createRun(42),recorder=new RunRecorder(42);Object.assign((w as any).options,{legacyTapFiring:true,legacyClickFiring:false});
 for(let i=0;i<8;i++){const input=i<5?left:idleInput();recorder.record(input);w.step(input);if(i===0)assert.equal(w.stats.shots,10);}
 const run=recorder.finish(w);delete run.tapFire;const replay=new ReplayPlayer(run);replay.step();assert.equal(replay.world.stats.shots,10);replay.seek(0);replay.seek(8);assert.equal(replay.world.stats.shots,10);
});

test('deliberate shotgun presses stay blasts throughout the extended tap window',()=>{
 for(const level of [1,2,3,4,5,6,7])for(const input of [left,right,{...idleInput(),fire:true}])for(const duration of [17,24,36]){
  const w=world(level);for(let i=0;i<duration;i++)w.step(input);
  assert.equal(w.stats.shots,0);assert.equal(w.weaponAudio.primary,false);
  w.step(idleInput());assert.equal(w.stats.shots,BURST_COUNTS[level-1]/(level>=5&&('fireLeft' in input||'fireRight' in input)?2:1));
  assert.equal(w.effects.filter(e=>e.kind==='burst').length,1);
 }
});
test('older tap-fire recordings preserve the shorter beam hold through replay seeks',()=>{
 const w=createRun(42),recorder=new RunRecorder(42);Object.assign((w as any).options,{legacyBeamHold:true});
 for(let i=0;i<40;i++){const input=i<24?left:idleInput();recorder.record(input);w.step(input);}
 const run=recorder.finish(w);delete run.extendedBeamHold;
 const replay=new ReplayPlayer(run);replay.seek(40);assert.deepEqual(replay.world.stats,w.stats);
 replay.seek(0);replay.seek(40);assert.deepEqual(replay.world.stats,w.stats);
});
