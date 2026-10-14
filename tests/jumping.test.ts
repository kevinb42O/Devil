import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,TUNING,v} from '../src/simulation';
import {floorHeight} from '../src/arena';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';

function seamWorld(){
 const w=new World(1,{schedule:false});
 w.player.pos=v(-13.6,floorHeight(-13.6,-15,0)+TUNING.eyeHeight,-15);w.player.vel=v(11,0,0);
 return w;
}
function fallingWorld(height:number){
 const w=new World(1,{schedule:false});w.startAt(0);
 w.player.pos.y+=height;w.player.vel.y=-1;w.player.grounded=false;return w;
}

test('walking down tiny tile seams stays grounded without manufacturing a timed hop',()=>{
 const w=seamWorld();
 for(let i=0;i<4;i++){w.step({...idleInput(),strafe:1});assert.equal(w.player.grounded,true);}
 assert.equal(w.player.landedAt,-1000);assert.equal(w.effects.filter(e=>e.kind==='land').length,0);
 w.step({...idleInput(),strafe:1,jump:true});
 assert.equal(w.player.vel.x,11);assert.equal(w.effects.find(e=>e.kind==='jump')?.amount,1);
 const immediate=seamWorld();immediate.step({...idleInput(),strafe:1});immediate.step({...idleInput(),strafe:1});
 immediate.step({...idleInput(),jump:true});assert.ok(immediate.player.vel.y>0,'jump works at the seam');
});

test('an airborne player near the floor is not snapped down and arena edges still fall',()=>{
 const air=fallingWorld(.04);air.step(idleInput());assert.equal(air.player.grounded,false);
 const edge=new World(1,{schedule:false});edge.player.pos=v(40,1.7,0);
 for(let i=0;i<120;i++)edge.step(idleInput());assert.equal(edge.state,'dead');assert.equal(edge.cause,'FALLEN');
});

test('a short jump tap before landing survives release, fires once, and earns a real hop bonus',()=>{
 const w=fallingWorld(.025);w.player.vel.x=11;
 w.step({...idleInput(),jump:true});assert.equal(w.player.grounded,false);
 for(let i=0;i<12&&!w.effects.some(e=>e.kind==='jump');i++)w.step(idleInput());
 assert.equal(w.effects.filter(e=>e.kind==='jump').length,1);assert.equal(w.effects.find(e=>e.kind==='jump')?.amount,3);
 assert.ok(w.player.vel.y>0);assert.ok(w.player.vel.x>11);
 for(let i=0;i<120;i++)w.step(idleInput());assert.equal(w.player.grounded,true);
 assert.equal(w.effects.filter(e=>e.kind==='jump').length,1);
});

test('an expired airborne jump press does not jump on landing or auto-repeat while held',()=>{
 const w=fallingWorld(2);
 for(let i=0;i<180;i++)w.step({...idleInput(),jump:true});
 assert.equal(w.player.grounded,true);assert.equal(w.player.jumpBuffer,0);assert.equal(w.effects.filter(e=>e.kind==='jump').length,0);
 w.step(idleInput());w.step({...idleInput(),jump:true});assert.ok(w.player.vel.y>0);
});

test('floor bursts reject a floor above the feet and missing floor, while nearby airborne boosts work',()=>{
 for(const [x,height] of [[0,-2],[0,1],[0,1.69],[40,1.7]]){
  const w=new World(1,{schedule:false});w.level=4;w.player.pos=v(x,height,0);w.player.vel.y=-10;w.player.grounded=false;
  w.shoot({...idleInput(),pitch:-1.5},true,false);assert.equal(w.player.vel.y,-10,`no boost at ${x}, ${height}`);
 }
 const w=fallingWorld(.5);w.level=4;w.shoot({...idleInput(),pitch:-1.5},true,false);assert.equal(w.player.vel.y,17);
});

test('saved movement revisions keep their original jumps and current buffered runs replay exactly',()=>{
 const old=createRun(1,undefined,6,true,15),current=createRun(1);
 for(const w of [old,current]){w.player.pos=v(-13.6,floorHeight(-13.6,-15,0)+1.7,-15);w.player.vel=v(11,0,0);}
 for(let i=0;i<2;i++)for(const w of [old,current])w.step({...idleInput(),strafe:1});
 assert.equal(old.player.grounded,false);assert.equal(current.player.grounded,true);
 for(const revision of [15,16]){
  const world=createRun(7,undefined,6,true,revision),recorder=new RunRecorder(7);
  // A normal jump lands after ~82 ticks; press shortly before touchdown.
  for(let i=0;i<200;i++){const input={...idleInput(),jump:i===0||i===79};recorder.record(input);world.step(input);world.effects=[];}
  const run={...recorder.finish(world),combatRevision:revision},replay=new ReplayPlayer(run);
  replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
  replay.seek(70);replay.seek(run.ticks);replay.world.effects=[];assert.deepEqual(replay.world,world);
 }
});
