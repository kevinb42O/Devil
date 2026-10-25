import * as THREE from 'three';
import {PROJECTILE_COLORS,projectileStyleIndex} from './projectile-presentation';
import {COMBAT_ARM_SURFACE,COMBAT_ARM_COLOR,COMBAT_ARM_NORMAL} from './combat-arm-surface';
import {HAND_BLOOD_COLOR,BODY_BLOOD_NORMAL} from './hand-blood-surface';
import type {HandBloodState} from './hand-blood';
import type {Vec} from './simulation';

export type CombatHandFeedback={hands?:{firePower:number;recoil:number}[];blood?:HandBloodState;level:number;firePower:number;recoil:number;upgradeAge:number;upgradePower:number;upgradeTime:number;motion:Vec;motionRotation:Vec;counterSwing:number};
/** Share the hand surface across the skin; weapon flashes stay on the active arms. */
export function configureCombatHandMaterial(material:THREE.MeshStandardMaterial,feedback?:CombatHandFeedback,level=feedback?.level??1,blood=feedback?.blood){
 let state=material.userData.combatFeedback as {hook:THREE.Material['onBeforeCompile'];uniforms:Record<string,{value:any}>}|undefined;
 if(!state||material.onBeforeCompile!==state.hook){
  const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();
  const uniforms={combatSkin:{value:material.name==='Demon_Main'?1:0},combatBloodBody:{value:0},combatBloodAmount:{value:0},combatBloodFresh:{value:0},combatActive:{value:1},combatFire:{value:0},combatHandFire:{value:new THREE.Vector2()},combatUpgrade:{value:0},combatAge:{value:0},combatTier:{value:1},combatTint:{value:new THREE.Vector3()}};
  const hook:THREE.Material['onBeforeCompile']=(shader,renderer)=>{
   previous.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
   shader.vertexShader='attribute float combatBloodMask;varying float vCombatBloodMask;attribute vec2 combatArmMask;varying vec2 vCombatArm;varying vec3 vCombatPosition;varying vec3 vCombatSurface;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvCombatBloodMask=combatBloodMask;vCombatArm=combatArmMask;vCombatPosition=mvPosition.xyz;vCombatSurface=position;');
   shader.fragmentShader='varying float vCombatBloodMask;uniform float combatSkin,combatBloodBody,combatBloodAmount,combatBloodFresh,combatActive,combatFire,combatUpgrade,combatAge,combatTier;uniform vec3 combatTint;uniform vec2 combatHandFire;varying vec2 vCombatArm;varying vec3 vCombatPosition;varying vec3 vCombatSurface;\n'+COMBAT_ARM_SURFACE+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+COMBAT_ARM_COLOR+HAND_BLOOD_COLOR);
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,clamp(armRough+armSeam*.2+(armGrain-.5)*.16,.22,.95),armMask);\nroughnessFactor=mix(roughnessFactor,clamp(mix(.84,.16,bloodWet)+(handBloodFine-.5)*.055,.13,.88),handBloodMask);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,armMetal*(1.-armSeam*.7),armMask);\nmetalnessFactor=mix(metalnessFactor,0.,handBloodMask);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+COMBAT_ARM_NORMAL+BODY_BLOOD_NORMAL);
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    vec3 armCore=mix(combatTint,vec3(1.,.84,.52),combatTier>6.5?.65:.12);
    totalEmissiveRadiance=mix(totalEmissiveRadiance,armAlbedo*.24+armCore*armVein*armHeat*(.65+armCloud*.6+armFire*.5),armMask);
    totalEmissiveRadiance*=1.-handBloodMask;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
    float mask=armFeedbackMask;
    float rim=pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),2.);
    float sweep=exp(-pow((vCombatPosition.y-(-.65+combatAge*1.1))/.065,2.));
    vec3 upgrade=combatTint*combatUpgrade*(.16+rim*.65+sweep*.75)+mix(combatTint,vec3(1.),.7)*exp(-combatAge*6.)*step(.001,combatUpgrade)*.32;
    outgoingLight+=mask*(upgrade+combatTint*armFire*(.5+rim*.6));
    #include <opaque_fragment>`);
  };
  material.onBeforeCompile=hook;material.customProgramCacheKey=()=>cache+'-combat-body-surface-v6-independent-hands';material.needsUpdate=true;
  state={hook,uniforms};material.userData.combatFeedback=state;
 }
 const u=state.uniforms;u.combatBloodAmount.value=blood?.amount??0;u.combatBloodBody.value=blood?.bodyAmount??0;u.combatBloodFresh.value=blood?.freshness??0;u.combatActive.value=1;u.combatFire.value=(feedback?.firePower??0);u.combatUpgrade.value=(feedback?.firePower??0)>0?0:(feedback?.upgradePower??0);u.combatAge.value=(feedback?.upgradeAge??0);u.combatTier.value=level;
 u.combatHandFire.value.set(feedback?.hands?.[1]?.firePower??(feedback?.firePower??0),feedback?.hands?.[0]?.firePower??(level>=5?(feedback?.firePower??0):0));
 u.combatTint.value.fromArray(PROJECTILE_COLORS[projectileStyleIndex(level,false)]);
}
