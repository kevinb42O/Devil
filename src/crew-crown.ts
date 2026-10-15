import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

let loading:Promise<{geometry:THREE.BufferGeometry;material:THREE.MeshStandardMaterial}|null>|undefined;
/** Existing relic, flattened once into one texture-free, shared draw call. */
export function loadCrewCrown(){
 return loading??=new GLTFLoader().loadAsync('/models/relics/crown.glb').then(({scene})=>{
  scene.updateMatrixWorld(true);const parts:THREE.BufferGeometry[]=[],sources=new Set<THREE.Material>();
  scene.traverse(object=>{
   if(!(object instanceof THREE.Mesh))return;
   const source=object.material as THREE.Material;sources.add(source);
   const geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);
   const color=new THREE.Color(source.name==='Red'?0x8c2524:0xd8ad52),colors=new Float32Array(geometry.getAttribute('position').count*3);
   for(let i=0;i<colors.length;i+=3)color.toArray(colors,i);
   geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry);
  });
  const geometry=mergeGeometries(parts)!;for(const part of parts)part.dispose();
  scene.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});for(const material of sources)material.dispose();
  geometry.computeBoundingBox();const bounds=geometry.boundingBox!,center=bounds.getCenter(new THREE.Vector3()),width=bounds.max.x-bounds.min.x;
  geometry.translate(-center.x,-bounds.min.y,-center.z);geometry.scale(1/width,.72/width,1/width);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({name:'crew-crown-gold',vertexColors:true,metalness:.72,roughness:.38,emissive:0xb88c3b,emissiveIntensity:.12});
  return {geometry,material};
 }).catch(error=>{console.warn('Player crown could not load.',error);return null;});
}
