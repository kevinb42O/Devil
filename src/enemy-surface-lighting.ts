import * as THREE from 'three';

/** A shared shader highlight, independent of enemy count and bloom quality. */
export const ENEMY_SURFACE_FRAGMENT=`
uniform float enemySurfaceStrength;
vec3 enemySurfaceLight(vec3 surface,vec3 normal,vec3 toEye){
 vec3 n=normalize(normal);
 float key=max(0.,dot(n,normalize(vec3(-.45,.7,.5))));
 float rim=pow(1.-abs(dot(n,normalize(toEye))),2.2);
 float detail=.3+.7*smoothstep(.003,.16,dot(surface,vec3(.2126,.7152,.0722)));
 return surface+vec3(1.,.29,.085)*(.012+key*.085+rim*.13)*detail*enemySurfaceStrength;
}`;

export function attachEnemySurfaceLight(material:THREE.MeshBasicMaterial,strength:{value:number}){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);shader.uniforms.enemySurfaceStrength=strength;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 enemySurfaceNormal,enemySurfacePosition;')
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vec3 enemyNormal=normal;vec4 enemyPosition=vec4(transformed,1.);
    #ifdef USE_INSTANCING
    enemyNormal=mat3(instanceMatrix)*enemyNormal;enemyPosition=instanceMatrix*enemyPosition;
    #endif
    enemySurfaceNormal=normalize(mat3(modelMatrix)*enemyNormal);
    enemySurfacePosition=(modelMatrix*enemyPosition).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 enemySurfaceNormal,enemySurfacePosition;\n${ENEMY_SURFACE_FRAGMENT}`)
   .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=enemySurfaceLight(diffuseColor.rgb,enemySurfaceNormal,cameraPosition-enemySurfacePosition);');
 };
 material.customProgramCacheKey=()=>key+'-enemy-surface-v1';
}
