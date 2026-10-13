import {sampleProjectile,projectileLaunchScale,PROJECTILE_COLORS,projectileStyleIndex} from './projectile-presentation';
import * as THREE from 'three';
import {type World} from './simulation';

const FIELD_SIZE=128,FIELD_SPAN=160;

/** One procedural glow draw and one fixed-size floor texture, independent of light count. */
export class ProjectileLighting {
 readonly glow:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>;
 private capacity=256;
 private sample={x:0,y:0,z:0};
 private sampleVelocity={x:0,y:0,z:0};
 private centers!:THREE.InstancedBufferAttribute;
 private velocities!:THREE.InstancedBufferAttribute;
 private sizes!:THREE.InstancedBufferAttribute;
 private colors!:THREE.InstancedBufferAttribute;
 private pixels=new Uint8Array(FIELD_SIZE*FIELD_SIZE*4);
 private field=new THREE.DataTexture(this.pixels,FIELD_SIZE,FIELD_SIZE);
 private active=false;
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.field.minFilter=this.field.magFilter=THREE.LinearFilter;this.field.generateMipmaps=false;this.field.needsUpdate=true;
  const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);shader.uniforms.projectileLightField={value:this.field};
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D projectileLightField;')
    .replace('#include <opaque_fragment>',`vec3 shotSpill=texture2D(projectileLightField,gemFloorPosition.xz/${FIELD_SPAN.toFixed(1)}+.5).rgb;
     outgoingLight+=shotSpill*(.22+outgoingLight*.5);
     #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=>key+'-projectile-field-v1';
  const plane=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=plane.index;geometry.attributes.position=plane.attributes.position;geometry.attributes.uv=plane.attributes.uv;
  geometry.instanceCount=0;
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   uniforms:{viewportHeight:{value:720}},
   vertexShader:`attribute vec3 shotCenter;attribute vec3 shotVelocity;attribute vec3 shotColor;attribute float shotSize;
    uniform float viewportHeight;varying vec2 glowUV;varying vec3 glowColor;
    void main(){
     glowUV=uv;glowColor=shotColor*shotSize;
     vec4 center=modelViewMatrix*vec4(shotCenter,1.);
     vec3 velocity=mat3(modelViewMatrix)*shotVelocity;
     // Project the flight direction relative to the perspective ray. Looking
     // straight down a shot still leaves a readable hot dot.
     vec2 flight=velocity.xy-center.xy*velocity.z/min(-.05,center.z);
     float speed=length(flight);vec2 along=speed>.001?flight/speed:vec2(0.,1.);
     vec2 across=vec2(along.y,-along.x);
     float pixelWorld=2.*max(.05,-center.z)/(projectionMatrix[1][1]*viewportHeight);
     float width=max(.42,pixelWorld*6.)*shotSize;
     float trail=min(1.3,speed*.014)*shotSize;
     center.xy+=across*position.x*width+along*(position.y*(width+trail)-trail*.35);
     gl_Position=projectionMatrix*center;
    }`,
   fragmentShader:`varying vec2 glowUV;varying vec3 glowColor;
    void main(){vec2 p=(glowUV-.5)*2.;float edge=max(0.,1.-dot(p,p));
     float halo=edge*edge*.22;
     float core=pow(max(0.,1.-abs(p.x)*4.),2.)*pow(max(0.,1.-abs(p.y)),2.);
     float brightness=max(glowColor.r,max(glowColor.g,glowColor.b));
     gl_FragColor=vec4(glowColor*halo+mix(glowColor,vec3(brightness),.22)*core*1.8,1.);
    }`});
  this.glow=new THREE.Mesh(geometry,material);this.glow.name='projectile-glow-batch';this.glow.frustumCulled=false;this.glow.visible=false;scene.add(this.glow);this.allocate();
 }
 private allocate(){
  const geometry=this.glow.geometry;
  this.centers=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  this.velocities=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  this.sizes=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1).setUsage(THREE.DynamicDrawUsage);
  this.colors=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('shotSize',this.sizes);
  geometry.setAttribute('shotCenter',this.centers);geometry.setAttribute('shotVelocity',this.velocities);geometry.setAttribute('shotColor',this.colors);
 }
 update(world:World|null,menu:boolean,alpha:number,height:number){
  const shots=world&&!menu?world.projectiles:[],count=shots.length;
  this.glow.visible=count>0;this.glow.geometry.instanceCount=count;this.glow.material.uniforms.viewportHeight.value=height;
  if(!count){if(this.active)this.clear();return;}
  if(count>this.capacity){while(this.capacity<count)this.capacity*=2;
   // Replace the geometry too: Three caches its maximum instance count after
   // the first draw, so simply resizing attributes would still truncate it.
   const previous=this.glow.geometry,geometry=new THREE.InstancedBufferGeometry();
   geometry.index=previous.index;geometry.attributes.position=previous.attributes.position;geometry.attributes.uv=previous.attributes.uv;geometry.instanceCount=count;
   previous.dispose();this.glow.geometry=geometry;this.allocate();
  }
  this.active=true;this.pixels.fill(0);alpha=Math.max(0,Math.min(1,alpha));
  for(let i=0;i<count;i++){
   const p=shots[i],position=sampleProjectile(p,alpha,this.sample,this.sampleVelocity);
   const {x,y,z}=position;const launch=projectileLaunchScale(p,alpha);this.sizes.setX(i,launch);
   const color=PROJECTILE_COLORS[projectileStyleIndex(p.level??world!.level,p.homing)];
   this.centers.setXYZ(i,x,y,z);this.velocities.setXYZ(i,this.sampleVelocity.x,this.sampleVelocity.y,this.sampleVelocity.z);this.colors.setXYZ(i,color[0],color[1],color[2]);
   // Compact splats into a world-space field. Maximum blending prevents dense
   // bursts bleaching the arena; altitude dims spill from overhead shots.
   if(y<-.5||y>9)continue;
   const cx=(x/FIELD_SPAN+.5)*FIELD_SIZE-.5,cz=(z/FIELD_SPAN+.5)*FIELD_SIZE-.5,r=1.9/FIELD_SPAN*FIELD_SIZE,strength=100*launch/(1+Math.max(0,y)*.6);
   for(let iz=Math.max(0,Math.ceil(cz-r));iz<=Math.min(FIELD_SIZE-1,Math.floor(cz+r));iz++)for(let ix=Math.max(0,Math.ceil(cx-r));ix<=Math.min(FIELD_SIZE-1,Math.floor(cx+r));ix++){
    const falloff=Math.max(0,1-((ix-cx)**2+(iz-cz)**2)/(r*r))**2*strength,offset=(iz*FIELD_SIZE+ix)*4;
    for(let channel=0;channel<3;channel++)this.pixels[offset+channel]=Math.max(this.pixels[offset+channel],color[channel]*falloff);
   }
  }
  for(const attribute of [this.centers,this.velocities,this.colors]){attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*3);attribute.needsUpdate=true;}
  this.sizes.clearUpdateRanges();this.sizes.addUpdateRange(0,count);this.sizes.needsUpdate=true;
  this.field.needsUpdate=true;
 }
 clear(){this.glow.visible=false;this.glow.geometry.instanceCount=0;this.pixels.fill(0);this.field.needsUpdate=true;this.active=false;}
 get diagnostics(){return {count:this.glow.geometry.instanceCount,drawCalls:this.glow.visible?1:0,capacity:this.capacity,fieldSize:FIELD_SIZE};}
}
