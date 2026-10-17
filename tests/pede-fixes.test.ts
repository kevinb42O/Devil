import {CREATURE_SCALE_RATIO} from '../src/enemy-presentation.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,v,idleInput,distance} from '../src/simulation.ts';
import {touchesPede,pedeContactCenter} from '../src/pede-contact.ts';
import {touchesPlayer} from '../src/player-contact.ts';
import {GIGAPEDE_TUNING} from '../src/gigapede-motion.ts';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay.ts';

test('standing beneath visible pede armor no longer hits the oversized downward sphere',()=>{
 for(const size of [1,1.5,2]){
  const player=v(0,1.7,0),body=v(0,2.2+.19*CREATURE_SCALE_RATIO*size,0),forward=v(0,0,1);
  assert.equal(touchesPlayer(body,body,player,player,.8*CREATURE_SCALE_RATIO*size),true,'reproduces old invisible contact');
  assert.equal(touchesPede(body,body,forward,forward,player,player,size),false,'clearance below the actual underside is safe');
  const touching=v(0,body.y+.43*CREATURE_SCALE_RATIO*size,0);
  assert.equal(touchesPede(body,body,forward,forward,touching,touching,size),true,'armor contact remains lethal');
 }
});

test('pede armor offsets rotate with the rendered segment and fast contacts still sweep',()=>{
 const body=v(0,5,0),upward=v(0,1,0);
 const center=pedeContactCenter(body,upward,1);
 assert.ok(Math.abs(center.y-5)<1e-9);assert.ok(Math.abs(center.z+.43*CREATURE_SCALE_RATIO)<1e-9);
 assert.equal(touchesPede(body,body,upward,upward,center,center,1),true);
 assert.equal(touchesPede(v(-5,1.3,0),v(5,1.3,0),v(0,0,1),v(0,0,1),v(0,1.7,0),v(0,1.7,0),1),true);
 assert.equal(touchesPede(body,body,v(0,0,1),v(0,0,1),v(0,5,1.8),v(0,5,1.8),1,true),true,'visible head nose has contact');
});

test('multiple gigapedes emerge head first with continuous head and tail positions',()=>{
 const w=new World(32,{schedule:false,invulnerable:true});
 const snakes=[w.spawnAt('gigapede',0,.4),w.spawnAt('gigapede',Math.PI,.4)];
 for(const e of snakes)assert.ok(e.segments.every(s=>s.pos.y<e.pos.y));
 let mixed=false,allAbove=false,warned=false;
 for(let tick=0;tick<120*18;tick++){
  const before=snakes.map(e=>[{...e.pos},...e.segments.map(s=>({...s.pos}))]);w.step(idleInput());
  if(snakes[0].age+1e-7<3&&w.effects.some(f=>f.kind==='spawn'&&f.amount===-1&&f.pos.y>=0))warned=true;
  w.effects=[];
  for(let j=0;j<snakes.length;j++){
   const e=snakes[j],points=[e.pos,...e.segments.map(s=>s.pos)];
   if(e.age+1e-7<3)assert.equal(w.active(e),false);
   if(e.age+1e-7>=3){
    for(let i=0;i<points.length;i++)assert.ok(distance(before[j][i],points[i])<=GIGAPEDE_TUNING.speed*STEP+.003,'no whole-body pop or shortcut around a turn');
    if(e.pos.y>2&&e.segments.some(s=>s.pos.y<0))mixed=true;
    if(e.segments.every(s=>s.pos.y>0))allAbove=true;
   }
   assert.ok((e.gigapedeMotion?.path.length??0)<1500,'trail memory is bounded');
  }
 }
 assert.ok(warned,'dust marks the emergence location during the warning');
 assert.ok(mixed,'head is airborne while the tail is still below the exit');assert.ok(allAbove,'the entire tail eventually emerges');
});

test('saved revision twelve retains its spawn and contact while revision thirteen replays new flight',()=>{
 for(const revision of [12,13]){
  const setup={time:259,level:4,reserve:0},w=createRun(29,setup,6,true,revision),recorder=new RunRecorder(29,setup);
  for(let i=0;i<120*6&&w.state==='playing';i++){
   const input={...idleInput(),strafe:1,yaw:i*.003};recorder.record(input);w.step(input);w.effects=[];
  }
  const run={...recorder.finish(w),combatRevision:revision},replay=new ReplayPlayer(run);
  replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
  replay.seek(80);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,w);
  assert.equal(w.enemies.some(e=>e.gigapedeMotion!==undefined),revision===13);
 }
});
