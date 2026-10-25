import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Heaven} from '../src/heaven';
import {createHeavenState,heavenAt} from '../src/heaven-state';

test('the threshold precedes a staged sanctuary, throne and floor reveal',()=>{
 assert.equal(heavenAt(488).gate,0);assert.ok(heavenAt(492).gate>0);
 assert.equal(heavenAt(492).presence,0);assert.ok(heavenAt(493).veil>0);
 assert.equal(heavenAt(494).throne,0);assert.ok(heavenAt(496).throne>0);
 assert.equal(heavenAt(498).throne,1);assert.equal(heavenAt(498).floor,1);
 assert.equal(heavenAt(504).veil,0);assert.equal(heavenAt(504).lift,0);
});
test('departure carries the sanctuary upward and reconstructs without history',()=>{
 assert.equal(heavenAt(510).presence,1);assert.ok(heavenAt(519).lift>0);
 assert.ok(heavenAt(519).throne>heavenAt(519).presence);
 assert.equal(heavenAt(528).presence,0);assert.equal(heavenAt(528).throne,0);
 const out=createHeavenState();for(const t of [1008,0,496,519,498,579])assert.deepEqual(heavenAt(t,out),heavenAt(t));
 for(const t of [492,494,498,510,528,1020]){
  const a=heavenAt(t-.00001),b=heavenAt(t+.00001);
  for(const key of ['gate','presence','throne','floor','veil'] as const)assert.ok(Math.abs(a[key]-b[key])<.00003,`${key} at ${t}`);
 }
});
test('the sanctuary surrounds combat without adding geometry to the playable deck',()=>{
 const scene=new THREE.Scene(),heaven=new Heaven(scene,new THREE.MeshBasicMaterial());
 const matrix=new THREE.Matrix4(),p=new THREE.Vector3();
 heaven.group.traverse(object=>{
  if(!(object instanceof THREE.InstancedMesh))return;
  const positions=object.geometry.getAttribute('position');
  for(let i=0;i<object.count;i++){object.getMatrixAt(i,matrix);for(let j=0;j<positions.count;j++){
   p.fromBufferAttribute(positions,j).applyMatrix4(matrix);
   assert.ok(Math.hypot(p.x,p.z)>35,'architecture intrudes into combat');
  }}
 });
 heaven.update(504);assert.equal(heaven.group.visible,true);assert.equal(heaven.diagnostics.throne,1);
 assert.ok(heaven.diagnostics.instances>800);assert.ok(heaven.diagnostics.batches<=10);
 heaven.configure('low',true);heaven.update(519);assert.equal(heaven.group.position.y,0);assert.equal(heaven.uniforms.heavenClock.value,0);
 heaven.update(579);assert.equal(heaven.group.visible,false);assert.equal(heaven.uniforms.heavenFloor.value,0);
 heaven.update(1008);assert.equal(heaven.group.visible,true);
 heaven.update(1008,false);assert.equal(heaven.group.visible,false);assert.equal(heaven.uniforms.heavenFloor.value,0);
});
