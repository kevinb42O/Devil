import * as THREE from 'three';

/** The eye light is centimetres from the local chest. Soften its near field
 * on the body, where inverse-square falloff would otherwise bleach the skin.
 * Distant lights and the scene itself keep their normal illumination. */
export function configureFirstPersonMaterial(material:THREE.MeshStandardMaterial){
 const state=material.userData.firstPersonLighting as {hook:THREE.Material['onBeforeCompile']}|undefined;
 if(state&&(material.onBeforeCompile===state.hook||material.onBeforeCompile===material.userData.combatFeedback?.hook))return;
 const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();
 const hook:THREE.Material['onBeforeCompile']=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace(
   'getPointLightInfo( pointLight, geometryPosition, directLight );',
   `getPointLightInfo( pointLight, geometryPosition, directLight );
    directLight.color *= min( 1.0, dot( pointLight.position - geometryPosition, pointLight.position - geometryPosition ) / 4.0 );`
  ));
 };
 material.onBeforeCompile=hook;material.customProgramCacheKey=()=>cache+'-first-person-lighting-v1';
 material.userData.firstPersonLighting={hook};material.needsUpdate=true;
}
