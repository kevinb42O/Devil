import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** The imported arms are separate shells. Bridge their roots to the chest with
 * the original skin weights so both ends follow the surfaces they overlap. */
export function connectFirstPersonShoulders(mesh:THREE.SkinnedMesh):THREE.BufferGeometry{
 const source=mesh.geometry,position=source.getAttribute('position'),skin=source.getAttribute('skinIndex'),weights=source.getAttribute('skinWeight');
 const visible=new Set(Array.from(source.getIndex()!.array));
 const pieces:THREE.BufferGeometry[]=[source];
 for(const side of ['L','R']){
  const upper=mesh.skeleton.bones.findIndex(bone=>bone.name==='UpperArm'+side),lower=mesh.skeleton.bones.findIndex(bone=>bone.name==='LowerArm'+side);
  if(upper<0||lower<0)continue;
  const shoulder=new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[upper].clone().invert());
  const elbow=new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[lower].clone().invert());
  const axis=elbow.sub(shoulder),length=axis.length();axis.normalize();
  const points:THREE.Vector3[]=[],vertices:number[]=[],point=new THREE.Vector3(),offset=new THREE.Vector3();
  for(const i of visible){
   point.fromBufferAttribute(position,i);offset.copy(point).sub(shoulder);
   let arm=0,chest=0;
   for(let j=0;j<4;j++){
    const bone=skin.getComponent(i,j),weight=weights.getComponent(i,j);
    if(bone===upper)arm+=weight;
    if(['Torso','Neck','Abdomen'].includes(mesh.skeleton.bones[bone].name))chest+=weight;
   }
   const along=offset.dot(axis);
   if((arm>.5&&along<length*.35&&offset.length()<length*.65)||
      (chest>.5&&along<0&&offset.length()<length*.65)){
    points.push(point.clone());vertices.push(i);
   }
  }
  if(points.length<4)continue;
  const bridge=new ConvexGeometry(points),bridgePosition=bridge.getAttribute('position');
  // ConvexGeometry keeps the input coordinates. Copy every other attribute from
  // the matching source vertex, including all four bone indices and weights.
  const nearest=Array.from({length:bridgePosition.count},(_,i)=>{
   point.fromBufferAttribute(bridgePosition,i);let best=0,distance=Infinity;
   for(let j=0;j<points.length;j++){const d=point.distanceToSquared(points[j]);if(d<distance){distance=d;best=j;}}
   return vertices[best];
  });
  for(const [name,attribute]of Object.entries(source.attributes)){
   if(name==='position'||name==='normal')continue;
   const values=new (attribute.array.constructor as typeof Float32Array)(nearest.length*attribute.itemSize);
   for(let i=0;i<nearest.length;i++)for(let j=0;j<attribute.itemSize;j++)values[i*attribute.itemSize+j]=attribute.getComponent(nearest[i],j);
   bridge.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized));
  }
  bridge.setIndex(Array.from({length:bridgePosition.count},(_,i)=>i));pieces.push(bridge);
 }
 if(pieces.length===1)return source;
 const connected=mergeGeometries(pieces)!;
 for(const piece of pieces.slice(1))piece.dispose();
 return connected;
}

/** Find the demon's detached wing frames and membranes. Their weights follow
 * the neck and spine, so filtering head bones alone leaves them around the eye.
 * Weld duplicate seam vertices for component discovery; keep the actual mesh
 * vertices and skin weights untouched. */
export function firstPersonWingVertices(mesh:THREE.SkinnedMesh):Set<number>{
 const geometry=mesh.geometry,position=geometry.getAttribute('position'),skin=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight'),index=geometry.getIndex();
 const parents=Array.from({length:position.count},(_,i)=>i);
 const find=(i:number):number=>parents[i]===i?i:(parents[i]=find(parents[i]));
 const join=(a:number,b:number)=>{parents[find(a)]=find(b);};
 const seams=new Map<string,number>();
 for(let i=0;i<position.count;i++){
  const key=[position.getX(i),position.getY(i),position.getZ(i)].map(n=>n.toFixed(7)).join(',');
  const other=seams.get(key);if(other!==undefined)join(i,other);else seams.set(key,i);
 }
 for(let i=0;i<(index?.count??position.count);i+=3){const a=index?index.getX(i):i;join(a,index?index.getX(i+1):i+1);join(a,index?index.getX(i+2):i+2);}
 const components=new Map<number,{vertices:number[];bones:Set<string>}>();
 for(let i=0;i<position.count;i++){
  const root=find(i);let part=components.get(root);if(!part){part={vertices:[],bones:new Set()};components.set(root,part);}part.vertices.push(i);
  for(let j=0;j<4;j++)if(weights.getComponent(i,j)>.001)part.bones.add(mesh.skeleton.bones[skin.getComponent(i,j)].name);
 }
 const wings=new Set<number>(),wingBones=new Set(['Neck','Torso','Abdomen']);
 for(const part of components.values())if(part.bones.has('Neck')&&part.bones.has('Torso')&&[...part.bones].every(name=>wingBones.has(name)))for(const vertex of part.vertices)wings.add(vertex);
 return wings;
}
