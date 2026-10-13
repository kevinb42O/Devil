import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,STEP} from '../src/simulation';
import {ENTRANCE_SPAWN,ENTRANCE_SEAL,touchesEntranceSeal} from '../src/entrance-layout';
test('entrance is seven meters ahead and moves without survival or weapons',()=>{
 const world=new World(42);world.player.pos={...ENTRANCE_SPAWN};
 assert.equal(Math.hypot(ENTRANCE_SEAL.x-world.player.pos.x,ENTRANCE_SEAL.z-world.player.pos.z),7);
 for(let i=0;i<1200;i++)world.stepEntrance({...idleInput(),fire:true,homing:true});
 assert.equal(world.time,0);assert.equal(world.tick,0);assert.equal(world.enemies.length,0);assert.equal(world.stats.shots,0);assert.equal(world.projectiles.length,0);
 let reached=false;for(let i=0;i<240;i++){world.stepEntrance({...idleInput(),forward:1});if(touchesEntranceSeal(world.player.pos)){reached=true;break;}}
 assert.ok(reached);assert.equal(world.time,0);
 assert.equal(touchesEntranceSeal({...ENTRANCE_SEAL,y:5}),false,'jumping above the seal does not activate it');
});
test('falling off the entrance returns to spawn without ending a run',()=>{
 const world=new World(42);world.player.pos={...ENTRANCE_SPAWN};
 for(let i=0;i<Math.ceil(2/STEP);i++)world.stepEntrance({...idleInput(),strafe:1});
 assert.equal(world.state,'playing');assert.equal(world.cause,'');assert.equal(world.time,0);assert.equal(world.stats.shots,0);
 world.player.pos={x:20,y:-9,z:0};world.stepEntrance(idleInput());assert.deepEqual(world.player.pos,ENTRANCE_SPAWN);
});
