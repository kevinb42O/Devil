import * as THREE from 'three';
import {createDescentState,descentAt} from './descent';

/** Shared by native unlit textures and the overlay hand, without extra lights. */
export const ENVIRONMENT_FRAGMENT=`
uniform vec3 environmentGain,environmentFill;
vec3 environmentLight(vec3 surface,vec3 normal){
  vec3 n=normalize(normal);
  float light=.65+.35*max(n.y,0.)+.25*max(dot(n,normalize(vec3(-.42,.82,-.38))),0.);
  float textureShade=.2+.8*smoothstep(.002,.10,dot(surface,vec3(.2126,.7152,.0722)));
  return surface*(vec3(1.)+(environmentGain-vec3(1.))*light)+environmentFill*textureShade*light;
}`;

export class EnvironmentLighting {
  readonly uniforms={environmentGain:{value:new THREE.Vector3(1,1,1)},environmentFill:{value:new THREE.Vector3()}};
  private state=createDescentState();
  daylight=0;
  update(time:number,menu=false){
    const s=descentAt(time,this.state),day=menu?0:s.daylight,fire=menu?0:s.furnace,ribs=menu?0:s.cathedral;
    this.daylight=day;
    this.uniforms.environmentGain.value.set(1+day*1.6+fire*.12,1+day*1.7,1+day*1.8+ribs*.04);
    this.uniforms.environmentFill.value.set(.025*day+.007*fire+.004*ribs,.032*day+.002*fire+.002*ribs,.042*day+.001*fire+.007*ribs);
    return s;
  }
  bindShader(material:THREE.ShaderMaterial){Object.assign(material.uniforms,this.uniforms);}
  attach(material:THREE.MeshBasicMaterial){
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 environmentNormal;')
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          vec3 environmentLocalNormal=normal;
          #ifdef USE_INSTANCING
          environmentLocalNormal=mat3(instanceMatrix)*environmentLocalNormal;
          #endif
          environmentNormal=normalize(mat3(modelMatrix)*environmentLocalNormal);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 environmentNormal;\n${ENVIRONMENT_FRAGMENT}`)
        .replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=environmentLight(diffuseColor.rgb,environmentNormal);');
    };
    material.customProgramCacheKey=()=>key+'-descent-environment-v1';
  }
}
