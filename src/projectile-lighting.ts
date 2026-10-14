import {sampleProjectile,PROJECTILE_COLORS,projectileStyleIndex} from './projectile-presentation';
import {PROJECTILE_HAND_CLEARANCE} from './weapon-tuning';
import * as THREE from 'three';
import {type World,type Projectile,type Vec} from './simulation';

const FIELD_SIZE=128,FIELD_SPAN=160;

/** One procedural glow draw and one fixed-size floor texture, independent of light count. */
export class ProjectileLighting {
 readonly glow:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>;
 private capacity=256;
 private sample={x:0,y:0,z:0};
 private centers!:THREE.InstancedBufferAttribute;
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
   vertexShader:`attribute vec3 shotCenter;attribute vec3 shotColor;
    uniform float viewportHeight;varying vec2 glowUV;varying vec3 glowColor;varying float glowDistance;
    void main(){
     glowUV=uv;glowColor=shotColor;
     vec4 center=modelViewMatrix*vec4(shotCenter,1.);glowDistance=length(center.xyz);
     // A centered, round light cannot acquire a false flight angle as the
     // camera strafes past it. The physical dagger supplies the silhouette.
     float pixelWorld=2.*max(.05,-center.z)/(projectionMatrix[1][1]*viewportHeight);
     float width=max(.32,pixelWorld*6.);
     center.xy+=position.xy*width;
     gl_Position=projectionMatrix*center;
    }`,
   fragmentShader:`varying vec2 glowUV;varying vec3 glowColor;varying float glowDistance;
    void main(){if(glowDistance<${(PROJECTILE_HAND_CLEARANCE+.25).toFixed(2)})discard;vec2 p=(glowUV-.5)*2.;float edge=max(0.,1.-dot(p,p));
     float halo=edge*edge*.16;
     float core=pow(max(0.,1.-length(p)*4.),2.);
     float brightness=max(glowColor.r,max(glowColor.g,glowColor.b));
     gl_FragColor=vec4(glowColor*halo+mix(glowColor,vec3(brightness),.22)*core*1.8,1.);
    }`});
  this.glow=new THREE.Mesh(geometry,material);this.glow.name='projectile-glow-batch';this.glow.frustumCulled=false;this.glow.visible=false;scene.add(this.glow);this.allocate();
 }
 private allocate(){
  const geometry=this.glow.geometry;
  this.centers=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  this.colors=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('shotCenter',this.centers);geometry.setAttribute('shotColor',this.colors);
 }
 update(world:World|null,menu:boolean,alpha:number,height:number,projectileView?:(p:Projectile,position:Vec)=>Vec){
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
   const p=shots[i],position=sampleProjectile(p,alpha,this.sample);
   const {x,y,z}=position;
   const color=PROJECTILE_COLORS[projectileStyleIndex(p.level??world!.level,p.homing)];
   if(projectileView)projectileView(p,position);
   this.centers.setXYZ(i,position.x,position.y,position.z);this.colors.setXYZ(i,color[0],color[1],color[2]);
   // Compact splats into a world-space field. Maximum blending prevents dense
   // bursts bleaching the arena; altitude dims spill from overhead shots.
   if(y<-.5||y>9)continue;
   const cx=(x/FIELD_SPAN+.5)*FIELD_SIZE-.5,cz=(z/FIELD_SPAN+.5)*FIELD_SIZE-.5,r=1.9/FIELD_SPAN*FIELD_SIZE,strength=100/(1+Math.max(0,y)*.6);
   for(let iz=Math.max(0,Math.ceil(cz-r));iz<=Math.min(FIELD_SIZE-1,Math.floor(cz+r));iz++)for(let ix=Math.max(0,Math.ceil(cx-r));ix<=Math.min(FIELD_SIZE-1,Math.floor(cx+r));ix++){
    const falloff=Math.max(0,1-((ix-cx)**2+(iz-cz)**2)/(r*r))**2*strength,offset=(iz*FIELD_SIZE+ix)*4;
    for(let channel=0;channel<3;channel++)this.pixels[offset+channel]=Math.max(this.pixels[offset+channel],color[channel]*falloff);
   }
  }
  for(const attribute of [this.centers,this.colors]){attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*3);attribute.needsUpdate=true;}
  this.field.needsUpdate=true;
 }
 clear(){this.glow.visible=false;this.glow.geometry.instanceCount=0;this.pixels.fill(0);this.field.needsUpdate=true;this.active=false;}
 get diagnostics(){return {count:this.glow.geometry.instanceCount,drawCalls:this.glow.visible?1:0,capacity:this.capacity,fieldSize:FIELD_SIZE};}
}
