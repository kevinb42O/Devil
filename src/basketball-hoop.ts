import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {BASKETBALL as B} from './courtyard-basketball';

/** Restore believable proportions around the downloaded backboard and stand. */
export function finishBasketballHoop(model:THREE.Group){
 const remove:THREE.Object3D[]=[];
 model.traverse(o=>{if(o.name.startsWith('Net')||o.name.startsWith('Basketball_ring'))remove.push(o);});
 for(const part of remove)part.removeFromParent();
 const hoop=new THREE.Group();hoop.name='basketball-rim-assembly';hoop.position.set(0,B.hoopY,B.boardZ-B.hoopZ);model.add(hoop);
 const orange=new THREE.MeshStandardMaterial({color:0xe86722,metalness:.35,roughness:.4});
 const ring=new THREE.Mesh(new THREE.TorusGeometry(B.rim,B.rimTube,12,80),orange);ring.rotation.x=Math.PI/2;ring.name='basketball-rim';hoop.add(ring);
 const bracket=new THREE.Mesh(new THREE.BoxGeometry(.18,.065,B.boardZ-B.hoopZ-B.rim+.04),orange);bracket.position.set(0,-.025,-(B.rim+(B.boardZ-B.hoopZ))/2);hoop.add(bracket);
 const plate=new THREE.Mesh(new THREE.BoxGeometry(.22,.16,.035),orange);plate.position.set(0,-.015,-(B.boardZ-B.hoopZ)+.03);hoop.add(plate);
 const net=new THREE.Group();net.name='basketball-net';hoop.add(net);
 const cords:THREE.BufferGeometry[]=[],rows=6,columns=16,height=.53;
 const node=(row:number,col:number)=>{const t=row/rows,angle=(col+(row%2)*.5)/columns*Math.PI*2,radius=(B.rim-.02)*(1-t)+.235*t;return new THREE.Vector3(Math.cos(angle)*radius,-.025-t*height,Math.sin(angle)*radius);};
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)for(const delta of [0,row%2?1:-1]){
  const a=node(row,col),b=node(row+1,col+delta);cords.push(new THREE.TubeGeometry(new THREE.LineCurve3(a,b),1,.004,4,false));
 }
 const netMesh=new THREE.Mesh(mergeGeometries(cords),new THREE.MeshStandardMaterial({color:0xe3e0cf,roughness:.95}));netMesh.name='basketball-woven-net';net.add(netMesh);for(const geometry of cords)geometry.dispose();
 const hem=new THREE.Mesh(new THREE.TorusGeometry(.235,.005,4,48),netMesh.material);hem.rotation.x=Math.PI/2;hem.position.y=-height-.025;net.add(hem);
 model.name='basketball-hoop';
 // Keep the clear target visible against the stone without a dark opaque slab.
 model.traverse(o=>{if(o instanceof THREE.Mesh&&o.name==='Backboard'){const material=o.material as THREE.MeshStandardMaterial;material.transparent=true;material.opacity=.24;material.depthWrite=false;material.roughness=.24;material.color.setHex(0xd8e6e8);}});
 return {net,hoop};
}
