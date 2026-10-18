import test from 'node:test';
import assert from 'node:assert/strict';
import {rainAt,StormRain} from '../src/storm-rain';
import {descentAt} from '../src/descent';
import {floorHeight,TILE_SIZE,ARENA_DIMENSION} from '../src/arena';
import * as THREE from 'three';

test('rain follows the storm chapter and puddles accumulate then dry before the furnace',()=>{
 for(const t of [0,21,30,50])assert.deepEqual(rainAt(t),{rain:0,wetness:0});
 assert.ok(rainAt(60).rain>0&&rainAt(60).rain<1);assert.equal(rainAt(69).rain,1);
 assert.equal(rainAt(100).wetness,1);assert.ok(rainAt(135).rain>0&&rainAt(135).rain<1);
 assert.equal(rainAt(144).rain,0);assert.equal(rainAt(144).wetness,1);
 assert.ok(rainAt(180).wetness>0);assert.deepEqual(rainAt(241),{rain:0,wetness:0});
 for(let t=0;t<260;t+=.5){const sky=descentAt(t);assert.equal(rainAt(t).rain,sky.chapter===0?sky.blend:sky.chapter===1?1-sky.blend:0);}
});
test('GPU floor contacts use actual shrinking tile heights; rewind and reduced motion reconstruct deterministically',()=>{
 const scene=new THREE.Scene(),floor=new THREE.MeshBasicMaterial(),rain=new StormRain(scene,floor),camera=new THREE.PerspectiveCamera();
 camera.position.set(0,2,5);camera.updateMatrixWorld();
 for(const t of [85,142,60,85]){
  rain.update(camera,t);const texture=rain.uniforms.rainFloor.value.image.data as Float32Array;
  for(const [x,z] of [[0,0],[5,5],[-12,8]]){
   const ix=Math.floor(x/TILE_SIZE+25.5),iz=Math.floor(z/TILE_SIZE+25.5);
   assert.ok(Math.abs(texture[iz*ARENA_DIMENSION+ix]-floorHeight(x,z,t,0))<.00001);
  }
 }
 rain.configure('low',true);rain.update(camera,85);assert.equal(rain.diagnostics.instances,3000);assert.equal(rain.streaks.visible,false);assert.equal(rain.diagnostics.wetness,1);
 rain.update(camera,85,false);assert.equal(rain.group.visible,false);assert.equal(rain.diagnostics.wetness,0);rain.dispose();floor.dispose();
});

test('global drops cover all arena quadrants and remain fixed as the camera moves',()=>{
 const scene=new THREE.Scene(),floor=new THREE.MeshBasicMaterial(),rain=new StormRain(scene,floor),camera=new THREE.PerspectiveCamera();
 const geometry=rain.streaks.geometry as THREE.InstancedBufferGeometry;
 const seeds=geometry.getAttribute('rainSeed'),near=geometry.getAttribute('rainNear');
 for(const count of [3000,7200]){
  const quadrants=[0,0,0,0];let far=0;
  for(let i=0;i<count;i++)if(near.getX(i)===0){const x=seeds.getX(i),z=seeds.getY(i);quadrants[Number(x>0)+2*Number(z>0)]++;if(Math.hypot(x,z)>25)far++;}
  assert.ok(quadrants.every(n=>n>count*.12));assert.ok(far>count*.12,'rain reaches the far edge of the field');
 }
 const before=seeds.array.slice();camera.position.set(27,2,-10);camera.updateMatrixWorld();rain.update(camera,90);assert.deepEqual(seeds.array,before,'moving camera cannot move the global rain anchors');rain.dispose();floor.dispose();
});
