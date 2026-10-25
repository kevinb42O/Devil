import * as THREE from 'three';
import {DAGGER_PRESENTATION,PROJECTILE_HAND_CLEARANCE} from './weapon-tuning';

/** Lit obsidian metal with an incandescent cutting edge. Uses the existing scene
 * lights and instance batches, including when postprocessing is disabled. */
export function projectileMaterial(shapeScale=1){
 const material=new THREE.MeshStandardMaterial({
  color:0x454e60,metalness:.68,roughness:.24,
  emissive:0xffffff,emissiveIntensity:1,toneMapped:true,
 });
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute float projectileEdge;
   varying float daggerEdge;varying vec3 daggerTint;varying vec3 daggerCenter;varying vec3 daggerLocal;`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    daggerLocal=position/vec3(${(DAGGER_PRESENTATION.width/.094*shapeScale).toFixed(4)},${(DAGGER_PRESENTATION.width/.094*shapeScale).toFixed(4)},${(DAGGER_PRESENTATION.length/.72*shapeScale).toFixed(4)});daggerEdge=projectileEdge;
    daggerCenter=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;`);
  shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
   daggerTint=vec3(1.);
   #ifdef USE_INSTANCING_COLOR
   daggerTint=instanceColor;
   #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying float daggerEdge;varying vec3 daggerTint;varying vec3 daggerCenter;varying vec3 daggerLocal;`)
   .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    if(length(daggerCenter-cameraPosition)<${PROJECTILE_HAND_CLEARANCE.toFixed(2)})discard;`)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    // The narrow bevels carry the heat; broad faces retain a dark reflective
    // body. Fine longitudinal scoring follows the shape rather than a decal.
    float fresnel=pow(1.-max(0.,dot(normal,normalize(vViewPosition))),3.);
    float edge=pow(clamp(daggerEdge,0.,1.),5.);
    float spine=exp(-abs(daggerLocal.x)*700.)*.42;
    float tip=smoothstep(.25,.49,daggerLocal.z);
    float score=.94+.06*sin(daggerLocal.z*410.+daggerLocal.x*2300.);
    float heat=edge*1.9+spine+tip*.75;
    vec3 whiteHot=mix(daggerTint,vec3(1.,.94,.80),.48);
    totalEmissiveRadiance=daggerTint*(.20+heat*.85)*score
      +whiteHot*(pow(edge,3.)*.9+pow(tip,4.)*.65);
    diffuseColor.rgb*=score*(.65+fresnel*.35);
   `);
 };
 material.customProgramCacheKey=()=>`projectile-shard-chroma-v5-${shapeScale}`;
 return material;
}
