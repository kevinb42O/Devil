import * as THREE from 'three';

type Batch={mesh:THREE.InstancedMesh;count:number;parts:{part:THREE.Mesh;z:number}[]};

/** Repeated centipede parts retain their geometry, materials and world transforms. */
export class SegmentBatches {
 private batches=new Map<string,Batch>();
 private parts=new WeakMap<THREE.Group,THREE.Mesh[]>();
 private frustum=new THREE.Frustum();
 private projection=new THREE.Matrix4();
 private center=new THREE.Vector4();
 constructor(private scene:THREE.Scene){}
 begin(camera:THREE.Camera){
  camera.updateWorldMatrix(true,false);
  this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  this.frustum.setFromProjectionMatrix(this.projection);
  for(const batch of this.batches.values())batch.count=0;
 }
 add(model:THREE.Group){
  let parts=this.parts.get(model);
  if(!parts){
   parts=[];
   for(const segment of model.children)if(segment.name==='segment')segment.traverse(o=>{
    if(o instanceof THREE.Mesh){parts!.push(o);o.layers.disable(0);}
   });
   this.parts.set(model,parts);
  }
  // Enemy glow positions have already refreshed the rig's world matrices.
  for(const part of parts){
   let visible=true;for(let node:THREE.Object3D|null=part;node;node=node.parent)if(!node.visible){visible=false;break;}
   if(!visible||(part.frustumCulled&&!this.frustum.intersectsObject(part)))continue;
   const material=part.material as THREE.Material,key=`${part.geometry.id}/${material.uuid}`;
   let batch=this.batches.get(key);
   if(!batch){
    const mesh=new THREE.InstancedMesh(part.geometry,material,128);mesh.count=0;mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.name='centipede-segment-batch';
    batch={mesh,count:0,parts:[]};this.batches.set(key,batch);this.scene.add(mesh);
   }
   if(batch.count===batch.mesh.instanceMatrix.count){
    const previous=batch.mesh,mesh=new THREE.InstancedMesh(previous.geometry,previous.material,previous.instanceMatrix.count*2);
    mesh.instanceMatrix.array.set(previous.instanceMatrix.array);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled=false;mesh.name=previous.name;this.scene.remove(previous);previous.dispose();this.scene.add(mesh);batch.mesh=mesh;
   }
   const entry=batch.parts[batch.count]??(batch.parts[batch.count]={part,z:0});entry.part=part;
   const center=part.geometry.boundingSphere!.center;
   this.center.set(center.x,center.y,center.z,1).applyMatrix4(part.matrixWorld).applyMatrix4(this.projection);
   entry.z=this.center.z;batch.count++;
  }
 }
 end(){
  for(const {mesh,count,parts} of this.batches.values()){
   mesh.count=count;
   parts.length=count;
   // Match Three's opaque depth/id ordering inside each material batch, so
   // coplanar contacts retain the same winner as the individual mesh draws.
   parts.sort((a,b)=>a.z-b.z||a.part.id-b.part.id);
   for(let i=0;i<count;i++)mesh.setMatrixAt(i,parts[i].part.matrixWorld);
   if(count){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,count*16);mesh.instanceMatrix.needsUpdate=true;}
  }
 }
 clear(){for(const batch of this.batches.values()){batch.count=0;batch.mesh.count=0;batch.parts.length=0;}}
}
