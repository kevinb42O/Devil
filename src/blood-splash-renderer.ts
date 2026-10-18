import * as THREE from 'three';
import {BloodField,BLOOD_SPLASH_CAPACITY,BLOOD_SPLASH_SECONDS} from './blood';

/** Thin crown sheets catch the same lights as the droplets, then collapse into the pool. */
export class BloodSplashRenderer{
 private mesh:THREE.InstancedMesh;
 private dummy=new THREE.Object3D();
 constructor(scene:THREE.Scene,fill:{value:THREE.Color}){
  const geometry=new THREE.PlaneGeometry(1,1,64,8);
  geometry.setAttribute('splash',new THREE.InstancedBufferAttribute(new Float32Array(BLOOD_SPLASH_CAPACITY*4),4).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.MeshPhysicalMaterial({color:0xd91b2c,emissive:0x9a0713,emissiveIntensity:.35,roughness:.16,clearcoat:1,clearcoatRoughness:.1,side:THREE.DoubleSide,transparent:true,depthWrite:false});
  material.onBeforeCompile=shader=>{
   shader.uniforms.bloodAirFill=fill;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
    attribute vec4 splash;varying vec4 splashState;varying vec2 crownUV;
    vec3 crown(vec2 p){
     float phase=clamp(splash.x/${BLOOD_SPLASH_SECONDS},0.,1.);
     float theta=p.x*6.28318530718;
     float fingers=pow(.5+.5*sin(theta*9.+splash.z*31.),2.);
     float lift=sin(pow(phase,.65)*3.14159265);
     float radius=.28+phase*(.85+splash.y*.6)+p.y*p.y*(.2+phase*.4);
     radius+=sin(theta*7.+splash.z*17.)*.025*p.y;
     float height=sin(p.y*1.57079633)*lift*(.18+splash.y*.65)*(.68+fingers*.32);
     return vec3(cos(theta)*radius,height,sin(theta)*radius);
    }
   `).replace('#include <beginnormal_vertex>',`
    vec3 du=crown(uv+vec2(.001,0.))-crown(uv-vec2(.001,0.));
    vec3 dv=crown(uv+vec2(0.,.001))-crown(uv-vec2(0.,.001));
    vec3 objectNormal=normalize(cross(dv,du));
   `).replace('#include <begin_vertex>',`
    splashState=splash;crownUV=uv;vec3 transformed=crown(uv);
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    uniform vec3 bloodAirFill;varying vec4 splashState;varying vec2 crownUV;
   `).replace('#include <color_fragment>',`#include <color_fragment>
    float fade=(1.-smoothstep(.25,${BLOOD_SPLASH_SECONDS},splashState.x))*smoothstep(0.,.025,splashState.x);
    // The raised rim stays dense while the stretched sheet thins and opens beneath it.
    float lace=.5+.5*sin(crownUV.x*69.115+splashState.z*31.);
    float tear=smoothstep(.13,.35,splashState.x)*(1.-smoothstep(.12,.4,lace))*smoothstep(.15,.45,crownUV.y)*(1.-smoothstep(.78,.96,crownUV.y));
    diffuseColor.a*=fade*splashState.w*(1.-tear)*mix(.46,.95,crownUV.y);
    if(diffuseColor.a<.015)discard;
   `).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    vec3 bloodUp=normalize(mat3(viewMatrix)*vec3(0.,1.,0.));
    float wrap=.62+.38*max(dot(normal,bloodUp),0.);
    reflectedLight.indirectDiffuse+=diffuseColor.rgb*bloodAirFill*wrap;
   `).replace('#include <opaque_fragment>',`
    // Thin sheets transmit red light even on the side facing away from the key light.
    // Keep a readable blood-colored scattering floor under the physical reflections.
    outgoingLight=max(outgoingLight,diffuseColor.rgb*(bloodAirFill*.85+vec3(.22,.025,.025)));
    #include <opaque_fragment>
   `);
  };
  material.customProgramCacheKey=()=> 'blood-puddle-crown-v2-red';
  this.mesh=new THREE.InstancedMesh(geometry,material,BLOOD_SPLASH_CAPACITY);this.mesh.name='blood-puddle-crowns';this.mesh.count=0;this.mesh.frustumCulled=false;
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(this.mesh);
 }
 update(field:BloodField,time:number,visible:boolean){
  this.mesh.count=visible?field.splashes.length:0;
  const state=this.mesh.geometry.getAttribute('splash') as THREE.InstancedBufferAttribute;
  for(let i=0;i<this.mesh.count;i++){
   const splash=field.splashes[i];this.dummy.position.set(splash.x,splash.y,splash.z);this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);
   state.setXYZW(i,Math.max(0,time-splash.born),splash.impact,splash.seed,splash.coverage);
  }
  if(this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;state.needsUpdate=true;}
 }
 clear(){this.mesh.count=0;}
}
