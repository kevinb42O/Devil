import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createSkullAnatomy} from './skull-anatomy';
import {sweepAnatomy,type AnatomyPoint} from './creature-geometry';
import type {EnemySurfaceRole} from './enemy-surface-material';

/** Heavy grounded tier IV. Newly authored lateral horn anatomy replaces the
 * dragon membranes; the six-unit silhouette retains its existing floor frame. */
export function createDrakeAnatomy(material:(role:EnemySurfaceRole)=>THREE.Material){
 const root=new THREE.Group();root.name='drake-anatomy';const parts:THREE.BufferGeometry[]=[];
 const head=createSkullAnatomy(1,material('body'));
 const skull=head.geometry;skull.scale(3.05,1.65,2.05);skull.translate(0,.1,.12);parts.push(skull);
 const add=(source:THREE.BufferGeometry,region:number)=>{
  const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose();const count=g.getAttribute('position').count;
  g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
  g.setAttribute('creatureCoord',new THREE.BufferAttribute(new Float32Array(count*3),3));
  const regions=new Float32Array(count);regions.fill(region);g.setAttribute('creatureRegion',new THREE.BufferAttribute(regions,1));
  g.setAttribute('motionWeight',new THREE.BufferAttribute(new Float32Array(count),1));parts.push(g);
 };
 for(const side of [-1,1]){
  // The lateral mass curls down and back inward, with bone growth collars.
  const centers:AnatomyPoint[]=[[side*1.2,.65,-.32],[side*1.95,.77,-.68],[side*2.55,.45,-.85],[side*2.68,-.06,-.71],[side*2.40,-.48,-.40],[side*2.03,-.61,.08],[side*1.88,-.97,.57]];
  add(sweepAnatomy(centers,[.38,.55,.51,.38,.29,.16,.002],8,18),0);
  for(let i=0;i<5;i++){
   const p=centers[i],out=new THREE.Vector3(side*(i<2?.35:.8),i<2?.9:i<3?.3:-.4,-.3).normalize();
   const base=new THREE.Vector3(...p).addScaledVector(out,.33),tip=base.clone().addScaledVector(out,.35+(i%2)*.12);
   add(sweepAnatomy([base.toArray() as AnatomyPoint,tip.toArray() as AnatomyPoint],[.20,.002],5),3);
  }
  add(sweepAnatomy([[side*.90,-.29,1.02],[side*1.03,-.62,1.24],[side*.81,-1.02,1.38]],[.13,.085,.002],6,7),3);
  add(sweepAnatomy([[side*.70,.97,-.52],[side*.94,1.50,-.95],[side*1.00,1.73,-1.31]],[.22,.14,.002],6,8),3);
 }
 const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());geometry.computeBoundingBox();
 const size=geometry.boundingBox!.getSize(new THREE.Vector3()),scale=6/Math.max(size.x,size.y,size.z);geometry.scale(scale,scale,scale);geometry.computeBoundingBox();
 geometry.translate(0,-1.28-geometry.boundingBox!.min.y,0);
 const p=geometry.getAttribute('position'),coords=geometry.getAttribute('creatureCoord'),weights=geometry.getAttribute('motionWeight');
 for(let i=0;i<p.count;i++){coords.setXYZ(i,p.getX(i)/6,p.getY(i)/6,p.getZ(i)/6);weights.setX(i,0);}
 geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const mesh=new THREE.Mesh(geometry,material('body'));mesh.name='drake-skull';root.add(mesh);root.userData.anatomy='authored-grounded-horned-skull';return root;
}
