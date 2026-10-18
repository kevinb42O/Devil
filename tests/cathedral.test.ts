import test from 'node:test';import assert from 'node:assert/strict';
import {cathedralAt,CATHEDRAL_OPENINGS} from '../src/cathedral-state';
test('cathedral arrival, cooling plateau, occlusion and depth are continuous at the actual match clock',()=>{
 assert.equal(cathedralAt(356).presence,0);assert.equal(cathedralAt(380).presence,1);assert.equal(cathedralAt(410).light,1);assert.equal(cathedralAt(440).closure,0);assert.equal(cathedralAt(472).light,0);assert.equal(cathedralAt(482).presence,0);assert.equal(cathedralAt(490).crown,1);assert.equal(CATHEDRAL_OPENINGS,7);
 for(let t=350;t<490;t+=.1){const a=cathedralAt(t),b=cathedralAt(t+.001);for(const key of ['presence','light','closure','rise','crown'] as const){assert.ok(Number.isFinite(a[key]));assert.ok(Math.abs(a[key]-b[key])<.01);}}
 assert.deepEqual(cathedralAt(NaN),cathedralAt(0));
});

test('all cathedral stone is outside the playable footprint in both quality layouts',async()=>{
 const THREE=await import('three');const {Cathedral}=await import('../src/cathedral');
 const cathedral=new Cathedral(new THREE.Scene(),new THREE.MeshBasicMaterial()),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
 for(let i=0;i<cathedral.architecture.count;i++){cathedral.architecture.getMatrixAt(i,matrix);for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){point.set(x,y,z).applyMatrix4(matrix);assert.ok(Math.hypot(point.x,point.z)>35,'decorative masonry stays well beyond the arena');}}
 cathedral.dispose();
});
