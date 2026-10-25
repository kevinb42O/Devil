import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tileHeight,floorHeight,sweepFloor,sweepFloorLegacy,ARENA_DIMENSION} from '../src/arena';
import * as previous from '../artifacts/fps-deep-audit/arena-before';

test('cached tile shrink thresholds preserve every floor height across the descent',()=>{
 for(const time of [0,120,450,800,1200,2000,8000])for(let z=0;z<ARENA_DIMENSION;z++)for(let x=0;x<ARENA_DIMENSION;x++)assert.equal(tileHeight(x,z,time),previous.tileHeight(x,z,time));
});

test('floor fast paths preserve swept contacts, raised sides, voids, and footprint sampling',()=>{
 let seed=71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<4000;i++){
  const time=i%4*400,a={x:(random()-.5)*140,y:random()*20-8,z:(random()-.5)*140},b={x:a.x+(random()-.5)*10,y:a.y+(random()-.5)*8,z:a.z+(random()-.5)*10};
  for(const footprint of [0,.18,1.5])assert.equal(floorHeight(a.x,a.z,time,footprint),previous.floorHeight(a.x,a.z,time,footprint));
  assert.deepEqual(sweepFloor(a,b,time),previous.sweepFloor(a,b,time));assert.deepEqual(sweepFloorLegacy(a,b,time),previous.sweepFloorLegacy(a,b,time));
 }
});
