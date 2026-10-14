import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MistLightField} from '../src/mist-light-field';

function fixture(){
 const field=new MistLightField(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.7,9);
 const enemies=new THREE.InstancedMesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial(),100);
 enemies.count=0;enemies.setColorAt(0,new THREE.Color(1,0,0));
 const geometry=new THREE.InstancedBufferGeometry();geometry.instanceCount=0;
 geometry.setAttribute('shotCenter',new THREE.InstancedBufferAttribute(new Float32Array(300),3));
 geometry.setAttribute('shotColor',new THREE.InstancedBufferAttribute(new Float32Array(300),3));
 const shots=new THREE.Mesh(geometry,new THREE.ShaderMaterial());
 return {field,camera,enemies,shots};
}
test('crowds and volleys have bounded fog illumination, and vanished sources leave no light',()=>{
 const {field,camera,enemies,shots}=fixture(),matrix=new THREE.Matrix4();
 enemies.count=100;shots.geometry.instanceCount=100;
 for(let i=0;i<100;i++){
  matrix.makeTranslation((i%10)-5,2,Math.floor(i/10)-5);enemies.setMatrixAt(i,matrix);enemies.setColorAt(i,new THREE.Color(.6,.1,.02));
  (shots.geometry.getAttribute('shotCenter') as THREE.InstancedBufferAttribute).setXYZ(i,i%10-5,2,Math.floor(i/10));
  (shots.geometry.getAttribute('shotColor') as THREE.InstancedBufferAttribute).setXYZ(i,.02,.12,1);
 }
 field.update(camera,enemies,shots);assert.equal(field.count,16);
 const pixels=field.texture.image.data as Uint8Array;assert.ok(pixels.some(n=>n>0));
 enemies.count=0;shots.visible=false;field.update(camera,enemies,shots);assert.equal(field.count,0);assert.ok(pixels.every(n=>n===0));
 field.dispose();
});
test('fog light follows emissive position and excludes sources far outside the local volume',()=>{
 const {field,camera,enemies,shots}=fixture(),matrix=new THREE.Matrix4();enemies.count=1;
 matrix.makeTranslation(-8,2,0);enemies.setMatrixAt(0,matrix);field.update(camera,enemies,shots);
 const left=Array.from(field.texture.image.data as Uint8Array);assert.equal(field.count,1);
 matrix.makeTranslation(8,2,0);enemies.setMatrixAt(0,matrix);field.update(camera,enemies,shots);
 assert.notDeepEqual(Array.from(field.texture.image.data as Uint8Array),left);
 matrix.makeTranslation(100,2,0);enemies.setMatrixAt(0,matrix);field.update(camera,enemies,shots);assert.equal(field.count,0);
 field.dispose();
});
