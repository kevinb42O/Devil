import type * as THREE from 'three';

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
