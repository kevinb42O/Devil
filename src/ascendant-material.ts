import * as THREE from 'three';
import {PODIUM_METALS,type PodiumRank} from './player-skins';

/** Skin-only shader: no geometry, lights, particles, textures, or extra draw calls. */
export function configureAscendantMaterial(material:THREE.MeshStandardMaterial,rank:PodiumRank|null,time:{value:number}){
 if(material.userData.ascendantRank===rank)return;
 material.userData.ascendantRank=rank;
 material.metalness=rank ? .42 : 0;material.roughness=rank ? .38 : .85;
 material.emissiveIntensity=rank?0:.12;
 material.onBeforeCompile=rank?shader=>{
  shader.uniforms.ascendantTime=time;
  shader.uniforms.ascendantMetal={value:new THREE.Color(PODIUM_METALS[rank-1])};
  shader.vertexShader='varying vec3 vAscendantPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvAscendantPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader='uniform float ascendantTime;\nuniform vec3 ascendantMetal;\nvarying vec3 vAscendantPosition;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p = vAscendantPosition;
   float flow = sin(p.y * 9.0 - ascendantTime * 2.1 + sin(p.x * 6.0 + p.z * 5.0 + ascendantTime * 0.7) * 1.8);
   float veins = pow(0.5 + 0.5 * flow, 10.0);
   float shimmer = 0.5 + 0.5 * sin(p.y * 3.1 + p.x * 2.0 - ascendantTime * 0.65);
   vec3 night = mix(vec3(0.025, 0.013, 0.065), ascendantMetal * 0.22, shimmer);
   diffuseColor.rgb = mix(night, ascendantMetal * 0.85, 0.23 + veins * 0.6);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   totalEmissiveRadiance += ascendantMetal * (0.08 + veins * 0.95) + vec3(0.11, 0.025, 0.22) * shimmer * 0.3;`);
 }:()=>{};
 material.customProgramCacheKey=()=>rank?'abyss-ascendant-v1':'abyss-player-solid';
 material.needsUpdate=true;
}
