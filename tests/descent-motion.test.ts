import assert from 'node:assert/strict';
import {test} from 'node:test';
import {descentDistance,descentBoundary,passageHeight,PASSAGE_BOTTOM,PASSAGE_SPAN} from '../src/descent-motion';
import * as THREE from 'three';
import {DescentPassage} from '../src/descent-passage';
import {arenaRadius} from '../src/arena';

test('release accelerates smoothly and descent continues after the last chapter',()=>{
  assert.equal(descentDistance(0),0);assert.equal(descentDistance(-1),0);assert.equal(descentDistance(NaN),0);
  const early=descentDistance(.2)-descentDistance(.1),cruise=descentDistance(20.1)-descentDistance(20);
  assert.ok(early>0&&early<cruise*.15);
  assert.ok(Math.abs(cruise-.48)<.001);
  assert.ok(descentDistance(1000)>descentDistance(999));
});

test('landmarks pass upward continuously and only wrap outside the visible band',()=>{
  for(const offset of [-92,-20,0,120,148])for(let t=0;t<80;t+=.1){
    const y=passageHeight(descentDistance(t),offset),next=passageHeight(descentDistance(t+.01),offset);
    assert.ok(y>=PASSAGE_BOTTOM&&y<PASSAGE_BOTTOM+PASSAGE_SPAN);
    assert.ok(next>=y||y>147.9&&next<-91.9);
  }
});

test('chapter layer heights and distance reconstruct exactly on backward seeks',()=>{
  const frame=(t:number)=>[descentDistance(t),descentBoundary(t),passageHeight(descentDistance(t),51)];
  const before=frame(137);frame(540);assert.deepEqual(frame(137),before);
  for(const t of [27,64,137,253,372,465])assert.equal(descentBoundary(t),t);
});

test('passing stone stays outside the largest arena and reduced motion freezes the fall',()=>{
  const passage=new DescentPassage(new THREE.Scene(),new THREE.MeshBasicMaterial()),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  for(const mesh of [passage.rocks,passage.masonry]){
    const positions=mesh.geometry.attributes.position;
    for(let instance=0;instance<mesh.count;instance++){
      mesh.getMatrixAt(instance,matrix);
      for(let vertex=0;vertex<positions.count;vertex++){
        point.fromBufferAttribute(positions,vertex).applyMatrix4(matrix);
        assert.ok(Math.hypot(point.x,point.z)>arenaRadius(0)+3,`${mesh.name} intrudes into the deck`);
      }
    }
  }
  const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld();
  passage.configure('low',true);passage.update(camera,137);const first=passage.uniforms.fallBoundary.value;
  passage.update(camera,410);assert.equal(passage.diagnostics.distance,0);assert.equal(passage.uniforms.fallBoundary.value,first);
  passage.update(camera,410,false);assert.equal(passage.group.visible,false);
});
