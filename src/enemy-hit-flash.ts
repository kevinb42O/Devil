import * as THREE from 'three';
import type {Enemy} from './simulation';
import {isSquid,isSpider,isPede} from './enemy-kinds';

/** One short pulse, driven by damage time so pause, replay and network agree. */
export function enemyHitFlash(enemy:Enemy,time:number){
 const elapsed=time-enemy.lastHit;
 return !isSquid(enemy.kind)&&!isSpider(enemy.kind)&&!isPede(enemy.kind)&&enemy.kind!=='leviathan'&&enemy.hp>0&&elapsed>=0&&elapsed<.15;
}

/** Shared materials and cached mesh lists keep feedback independent of population. */
export class EnemyHitFlash {
 private hitMaterials=new WeakMap<THREE.Material,THREE.Material>();
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
  for(const mesh of meshes){this.originals.set(mesh,mesh.material);mesh.material=Array.isArray(mesh.material)?mesh.material.map(material=>this.hitMaterial(material)):this.hitMaterial(mesh.material);}
 }
 private hitMaterial(source:THREE.Material){
  let material=this.hitMaterials.get(source);if(material)return material;
  material=source.clone();const compile=source.onBeforeCompile,key=source.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
   compile.call(source,shader,renderer);
   // Lift dark texels as well as highlights, before tone mapping, while
   // retaining texture and shading. Multiplication alone hides hits in shadow.
   if(shader.fragmentShader.includes('#include <opaque_fragment>')){
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
     'outgoingLight=outgoingLight*1.6+vec3(.06);\n#include <opaque_fragment>');
   }else{
    // The orb uses a custom fragment shader with no Three.js output chunk.
    shader.fragmentShader=shader.fragmentShader.replace(/}\s*$/, 'gl_FragColor.rgb=gl_FragColor.rgb*1.6+vec3(.06);\n}');
   }
  };
  material.customProgramCacheKey=()=>key+'-readable-hit-flash';
  this.hitMaterials.set(source,material);return material;
 }
 swarmMaterial(source:THREE.Material){
  let material=this.swarmMaterials.get(source);if(material)return material;
  material=source.clone();const compile=source.onBeforeCompile,key=source.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
   compile.call(source,shader,renderer);
   // Instance color carries a flash flag, rather than tinting dark texture pixels.
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','')
    .replace('#include <opaque_fragment>',`#ifdef USE_COLOR
outgoingLight+=(outgoingLight*.6+vec3(.06))*vColor.r;
#endif
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>key+'-readable-enemy-hit-flash';
  this.swarmMaterials.set(source,material);this.swarmMaterials.set(material,material);return material;
 }
}
