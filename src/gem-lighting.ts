import * as THREE from 'three';
import {type World} from './simulation';

/** Batched gem halos and local light pools on the otherwise unlit arena. */
export class GemLighting {
 readonly halo:THREE.InstancedMesh;
 private positions={value:Array.from({length:8},()=>new THREE.Vector3())};
 private count={value:0};
 private playerPosition={value:new THREE.Vector3()};
 private playerStrength={value:0};
 private dummy=new THREE.Object3D();
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  floor.onBeforeCompile=shader=>{
   shader.uniforms.gemLightPositions=this.positions;shader.uniforms.gemLightCount=this.count;
   shader.uniforms.playerLightPosition=this.playerPosition;shader.uniforms.playerLightStrength=this.playerStrength;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 gemFloorPosition;').replace('#include <project_vertex>',`#include <project_vertex>
    vec4 gemFloorWorld=vec4(transformed,1.);
    #ifdef USE_INSTANCING
    gemFloorWorld=instanceMatrix*gemFloorWorld;
    #endif
    gemFloorPosition=(modelMatrix*gemFloorWorld).xyz;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 gemFloorPosition;uniform vec3 gemLightPositions[8];uniform int gemLightCount;
    uniform vec3 playerLightPosition;uniform float playerLightStrength;`).replace('#include <opaque_fragment>',`
    float playerDistance=distance(gemFloorPosition,playerLightPosition);
    float playerFalloff=pow(max(0.,1.-playerDistance/11.),2.);
    // Preserve the stone texture while lifting nearby tiles with warm light.
    outgoingLight*=1.+vec3(1.,.64,.34)*playerFalloff*playerLightStrength*2.4;
    outgoingLight+=vec3(.065,.032,.012)*playerFalloff*playerLightStrength;
    for(int i=0;i<8;i++){
     if(i>=gemLightCount)break;
     float distanceToGem=distance(gemFloorPosition,gemLightPositions[i]);
     float falloff=pow(max(0.,1.-distanceToGem/3.),2.);
     outgoingLight+=vec3(1.,.13,.025)*falloff*.8;
    }
    #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=> 'gem-and-player-lit-floor-v2';
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:'varying vec2 glowUV;void main(){glowUV=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
   fragmentShader:'varying vec2 glowUV;void main(){float r=length(glowUV-.5)*2.;float a=pow(max(0.,1.-r),3.)*.48;gl_FragColor=vec4(1.,.12,.02,a);}'
  });
  this.halo=new THREE.InstancedMesh(new THREE.PlaneGeometry(1.7,1.7),material,1200);this.halo.frustumCulled=false;this.halo.count=0;scene.add(this.halo);
 }
 /** Reuse the player's floor illumination around a fixed world object. */
 setPlayerLight(position:THREE.Vector3,enabled=true){this.playerPosition.value.copy(position);this.playerStrength.value=enabled?1:0;}
 update(world:World|null,camera:THREE.Camera,menu:boolean){
  this.playerPosition.value.copy(camera.position);this.playerPosition.value.y-=.35;
  this.playerStrength.value=!menu&&world?1:0;
  const gems=!menu&&world?world.gems:[];this.halo.count=Math.min(1200,gems.length);
  for(let i=0;i<this.halo.count;i++){
   const g=gems[i];this.dummy.position.set(g.pos.x,g.pos.y,g.pos.z);this.dummy.quaternion.copy(camera.quaternion);this.dummy.scale.setScalar(g.age>8?.65:1);this.dummy.updateMatrix();this.halo.setMatrixAt(i,this.dummy.matrix);
  }
  if(this.halo.count){this.halo.instanceMatrix.clearUpdateRanges();this.halo.instanceMatrix.addUpdateRange(0,this.halo.count*16);this.halo.instanceMatrix.needsUpdate=true;}
  // Pick nearby gems without adding hundreds of per-object lights or draw calls.
  const nearest:{index:number;distance:number}[]=[];
  for(let i=0;i<gems.length;i++){const p=gems[i].pos,d=(p.x-camera.position.x)**2+(p.y-camera.position.y)**2+(p.z-camera.position.z)**2;
   let j=0;while(j<nearest.length&&nearest[j].distance<=d)j++;if(j<8){nearest.splice(j,0,{index:i,distance:d});if(nearest.length>8)nearest.pop();}
  }
  this.count.value=nearest.length;nearest.forEach((g,i)=>{const p=gems[g.index].pos;this.positions.value[i].set(p.x,p.y,p.z);});
 }
 clear(){this.halo.count=0;this.count.value=0;this.playerStrength.value=0;}
}
