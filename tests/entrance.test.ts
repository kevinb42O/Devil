import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,STEP} from '../src/simulation';
import {ENTRANCE_SPAWN,ENTRANCE_SEAL,ENTRANCE_COURTYARD,touchesEntranceSeal} from '../src/entrance-layout';
test('entrance is seven meters ahead and moves without survival or weapons',()=>{
 const world=new World(42);world.player.pos={...ENTRANCE_SPAWN};
 assert.equal(Math.hypot(ENTRANCE_SEAL.x-world.player.pos.x,ENTRANCE_SEAL.z-world.player.pos.z),7);
 for(let i=0;i<1200;i++)world.stepEntrance({...idleInput(),fire:true,homing:true});
 assert.equal(world.time,0);assert.equal(world.tick,0);assert.equal(world.enemies.length,0);assert.equal(world.stats.shots,0);assert.equal(world.projectiles.length,0);
 let reached=false;for(let i=0;i<240;i++){world.stepEntrance({...idleInput(),forward:1});if(touchesEntranceSeal(world.player.pos)){reached=true;break;}}
 assert.ok(reached);assert.equal(world.time,0);
 assert.equal(touchesEntranceSeal({...ENTRANCE_SEAL,y:5}),false,'jumping above the seal does not activate it');
});
test('courtyard walls keep movement safe and falls outside return to spawn',()=>{
 const world=new World(42);world.player.pos={...ENTRANCE_SPAWN};
 for(let i=0;i<Math.ceil(2/STEP);i++)world.stepEntrance({...idleInput(),strafe:1});
 assert.equal(world.state,'playing');assert.equal(world.cause,'');assert.equal(world.time,0);assert.equal(world.stats.shots,0);
 assert.equal(world.player.pos.x,ENTRANCE_COURTYARD.halfWidth);
 world.player.pos={x:20,y:-9,z:0};world.stepEntrance(idleInput());assert.deepEqual(world.player.pos,ENTRANCE_SPAWN);
});
test('courtyard walls allow sliding into the entrance without snagging',()=>{
 const world=new World(42,{schedule:false});world.player.pos={x:6.2,y:1.7,z:0};
 for(let i=0;i<45;i++)world.stepEntrance({...idleInput(),forward:1,strafe:1});
 assert.equal(world.player.pos.x,ENTRANCE_COURTYARD.halfWidth);assert.ok(world.player.pos.z<-1);
 world.player.pos={x:3,y:1.7,z:ENTRANCE_COURTYARD.frontZ};world.player.vel={x:0,y:0,z:0};
 let reached=false;for(let i=0;i<60;i++){
  world.stepEntrance({...idleInput(),forward:1,strafe:-1});
  if(touchesEntranceSeal(world.player.pos,world.previousPlayerPosition)){reached=true;break;}
 }
 assert.ok(reached,'sliding along the front wall reaches the full-width trigger');
});
test('the entire visible seal accepts off-center and jumping approaches',()=>{
 for(const x of [-1.5,-.9,0,.9,1.5])for(const jump of [false,true]){
  const world=new World(42,{schedule:false});world.player.pos={x,y:1.7,z:-4};
  let reached=false;
  for(let i=0;i<120;i++){
   const previous={...world.player.pos};world.stepEntrance({...idleInput(),forward:1,jump});
   if(touchesEntranceSeal(world.player.pos,previous)){reached=true;break;}
  }
  assert.ok(reached,`approach at x=${x}, jump=${jump}`);
 }
 assert.equal(touchesEntranceSeal({...ENTRANCE_SEAL,x:2.2}),false,'walking beside the gateway does not start a run');
 assert.equal(touchesEntranceSeal({...ENTRANCE_SEAL,y:-1}),false,'falling below the platform does not start a run');
});
test('swept entrance contact catches fast crossings and respects height at contact',()=>{
 assert.ok(touchesEntranceSeal({x:1.4,y:3.2,z:-9},{x:1.4,y:3.2,z:-5}));
 assert.ok(touchesEntranceSeal({x:2,y:1.7,z:-8},{x:-2,y:1.7,z:-6}),'diagonal crossing');
 assert.equal(touchesEntranceSeal({x:3,y:1.7,z:-9},{x:3,y:1.7,z:-5}),false);
 assert.equal(touchesEntranceSeal({x:0,y:5,z:-9},{x:0,y:5,z:-5}),false);
 assert.equal(touchesEntranceSeal({x:0,y:1.7,z:-9},{x:0,y:12,z:-5}),false,'vertical and horizontal overlap must occur together');
});
