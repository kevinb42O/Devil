import {UPGRADE_PULSE,upgradePulseRadius} from './upgrade-pulse-tuning';
import * as THREE from 'three';
import {PROJECTILE_COLORS,projectileStyleIndex} from './projectile-presentation';
import type {Vec} from './simulation';
const DURATION=UPGRADE_PULSE.duration;
/** Light travels through the actual arena tiles, including their height and gaps. */
export class UpgradeGroundPulse {
 private centers=Array.from({length:4},()=>new THREE.Vector4(0,0,0,0));
 private colors=Array.from({length:4},()=>new THREE.Vector3());
 private fresh=new Set<number>();private times=new Float64Array(4);private cursor=0;
 constructor(floor:THREE.MeshBasicMaterial){
  const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);
   shader.uniforms.upgradeCenters={value:this.centers};shader.uniforms.upgradeColors={value:this.colors};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 upgradeGroundPosition;')
    .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 upgradeVertex=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nupgradeVertex=instanceMatrix*upgradeVertex;\n#endif\nupgradeGroundPosition=(modelMatrix*upgradeVertex).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 upgradeGroundPosition;uniform vec4 upgradeCenters[4];uniform vec3 upgradeColors[4];')
    .replace('#include <opaque_fragment>',`
      for(int i=0;i<4;i++){
        if(upgradeCenters[i].w<.5)continue;
        vec2 delta=upgradeGroundPosition.xz-upgradeCenters[i].xy;
        float age=upgradeCenters[i].z;
        float distance=length(delta),angle=atan(delta.y,delta.x);
        float radius=${UPGRADE_PULSE.startRadius}+age*${UPGRADE_PULSE.speed.toFixed(1)};
        float front=distance-radius;
        float fade=(1.-smoothstep(.6,${UPGRADE_PULSE.duration},age))*smoothstep(0.,.04,age+.02);
        float ridge=exp(-pow(front/(.16+age*.12),2.));
        float wake=exp(-pow((front+.35)/(.45+age*.18),2.))*.2;
        float grain=.1+.9*clamp(dot(diffuseColor.rgb,vec3(.333))*3.,0.,1.);
        float broken=.7+.3*sin(angle*17.+sin(angle*9.)*2.);
        float ignition=exp(-distance*distance/3.)*exp(-age*13.)*.4;
        outgoingLight+=upgradeColors[i]*(ridge*.95*broken+wake+ignition)*fade*grain;
      }
      #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=>key+'-upgrade-ground-v1';
 }
 begin(position:Vec,level:number,time:number){
  const index=this.cursor++%this.centers.length;
  this.centers[index].set(position.x,position.z,0,1);this.times[index]=time;this.fresh.add(index);
  const color=PROJECTILE_COLORS[projectileStyleIndex(level,false)];
  this.colors[index].set(.75,.64,.47).lerp(new THREE.Vector3(...color),.24);
 }
 update(dt:number,time:number){
  for(let i=0;i<this.centers.length;i++){
   const pulse=this.centers[i];if(!pulse.w)continue;
   if(this.fresh.delete(i))continue;
   // Render time also settles the effect when simulation is paused by death.
   pulse.z=Math.max(pulse.z+Math.max(0,dt),time-this.times[i]);
   if(pulse.z>=DURATION)pulse.w=0;
  }
 }
 clear(){for(const center of this.centers)center.w=0;this.fresh.clear();}
 get diagnostics(){return this.centers.filter(c=>c.w>0).map(c=>({x:c.x,z:c.y,age:c.z,radius:upgradePulseRadius(c.z)}));}
}
