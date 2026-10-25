import {test} from 'node:test';
import assert from 'node:assert/strict';
import {towerDeathPose,enemyYaw,TOWER_SPIN_SPEED} from '../src/enemy-presentation';

import {towerEmissionTick} from '../src/tower-spawn';
import {World,v} from '../src/simulation';
const kinds=['squid','squid2','squid3'] as const;
test('spawning keeps the normal idle rotation throughout each burst',()=>{
 for(const kind of kinds){
  const world=new World(71,{schedule:false}),enemy=world.spawn(kind,v());
  for(const burst of [0,1,2]){
   const start=towerEmissionTick(kind,burst,0)/60;
   for(const offset of [-.4,-.1,0,.3,.8,1.5]){
    enemy.age=start+offset;const yaw=enemyYaw(enemy,world.player.pos);
    enemy.age+=.01;
    assert.ok(Math.abs(enemyYaw(enemy,world.player.pos)-yaw+.01*TOWER_SPIN_SPEED)<1e-10);
   }
  }
 }
});
test('death spin accelerates while the complete creature sinks beneath the floor',()=>{
 const a=towerDeathPose(.5,16),b=towerDeathPose(1,16),c=towerDeathPose(1.5,16),end=towerDeathPose(2,16);
 assert.ok(c.spin-b.spin>b.spin-a.spin);assert.ok(a.sink<b.sink&&b.sink<c.sink);
 assert.equal(end.sink,16);assert.equal(end.done,true);assert.deepEqual(towerDeathPose(1,16),b);
});
