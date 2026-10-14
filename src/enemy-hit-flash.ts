import * as THREE from 'three';
import type {Enemy} from './simulation';
import {isSquid} from './enemy-kinds';

/** Two short pulses, driven by damage time so pause, replay and network agree. */
export function enemyHitFlash(enemy:Enemy,time:number){
 const elapsed=time-enemy.lastHit;
 return !isSquid(enemy.kind)&&enemy.hp>0&&elapsed>=0&&(elapsed<.065||elapsed>=.095&&elapsed<.15);
}

/** Shared materials and cached mesh lists keep feedback independent of population. */
export class EnemyHitFlash {
 private material=new THREE.MeshBasicMaterial({color:0xffead6,side:THREE.DoubleSide,toneMapped:false});
 private meshes=new WeakMap<THREE.Group,THREE.Mesh[]>();
 private originals=new WeakMap<THREE.Mesh,THREE.Material|THREE.Material[]>();
 private swarmMaterials=new WeakMap<THREE.Material,THREE.Material>();
 readonly normal=new THREE.Color(0,0,0);
 readonly hit=new THREE.Color(1,1,1);
 restore(model:THREE.Group){
  for(const mesh of this.meshes.get(model)??[]){const original=this.originals.get(mesh);if(original){mesh.material=original;this.originals.delete(mesh);}}
 }
 apply(model:THREE.Group){
  let meshes=this.meshes.get(model);
  if(!meshes){meshes=[];model.traverse(node=>{
   // Preserve the distinct colors and existing feedback of attached crystals.
   if(node instanceof THREE.Mesh&&!node.name.includes('weak-point')&&node.name!=='spider-held-gem')meshes!.push(node);
  });this.meshes.set(model,meshes);}
  for(const mesh of meshes){this.originals.set(mesh,mesh.material);mesh.material=this.material;}
 }
 swarmMaterial(source:THREE.Material){
  let material=this.swarmMaterials.get(source);if(material)return material;
  material=source.clone();const compile=source.onBeforeCompile,key=source.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
   compile.call(source,shader,renderer);
   // Instance color carries a flash flag, rather than tinting dark texture pixels.
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','')
    .replace('#include <opaque_fragment>',`#ifdef USE_COLOR
outgoingLight=mix(outgoingLight,vec3(1.,.82,.67),vColor.r);
#endif
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>key+'-enemy-hit-flash';
  this.swarmMaterials.set(source,material);this.swarmMaterials.set(material,material);return material;
 }
}
