import {sampleProjectile} from './projectile-presentation';
import {DAGGER_PRESENTATION,PROJECTILE_HAND_CLEARANCE,PROJECTILE_TRAIL_OFFSET} from './weapon-tuning';
import {projectileTrail} from './projectile-trail';
import {projectileChroma} from './projectile-chroma';
import * as THREE from 'three';
import {type World,type Projectile,type Vec} from './simulation';

const FIELD_SIZE=128,FIELD_SPAN=160;

/** Two batched glow/trail draws and a fixed-size floor texture, independent of light count. */
export class ProjectileLighting {
 readonly glow:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>;
 readonly trail:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>;
 private capacity=256;
 private sample={x:0,y:0,z:0};
 private velocity={x:0,y:0,z:0};
 private centers!:THREE.InstancedBufferAttribute;
 private colors!:THREE.InstancedBufferAttribute;
 private profiles!:THREE.InstancedBufferAttribute;
 private travel!:THREE.InstancedBufferAttribute;
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
   vertexShader:`attribute vec3 shotCenter;attribute vec3 shotColor;attribute float shotPellet;
    uniform float viewportHeight;varying vec2 glowUV;varying vec3 glowColor;varying float glowDistance;varying float glowPellet;
    void main(){
     glowUV=uv;glowColor=shotColor;glowPellet=shotPellet;
     vec4 center=modelViewMatrix*vec4(shotCenter,1.);glowDistance=length(center.xyz);
     // A centered, round light cannot acquire a false flight angle as the
     // camera strafes past it. The physical dagger supplies the silhouette.
     float pixelWorld=2.*max(.05,-center.z)/(projectionMatrix[1][1]*viewportHeight);
     float width=max(mix(.9,1.05,shotPellet),pixelWorld*mix(11.,12.,shotPellet));
     center.xy+=position.xy*width;
     gl_Position=projectionMatrix*center;
    }`,
   fragmentShader:`varying vec2 glowUV;varying vec3 glowColor;varying float glowDistance;varying float glowPellet;
    void main(){if(glowDistance<mix(${(PROJECTILE_HAND_CLEARANCE+.25).toFixed(2)},.8,glowPellet))discard;vec2 p=(glowUV-.5)*2.;float radius=length(p);if(radius>1.)discard;
     float edge=1.-smoothstep(.65,1.,radius);
     float halo=exp(-radius*radius*6.)*edge*.095;
     float corona=exp(-radius*radius*35.)*.18;
     float core=exp(-radius*radius*180.);
     float brightness=max(glowColor.r,max(glowColor.g,glowColor.b));
     gl_FragColor=vec4(glowColor*(halo+corona)+mix(glowColor,vec3(brightness),.45)*core*.9,1.);
    }`});
  this.glow=new THREE.Mesh(geometry,material);this.glow.name='projectile-glow-batch';this.glow.frustumCulled=false;this.glow.visible=false;
  this.trail=projectileTrail(geometry);this.glow.add(this.trail);scene.add(this.glow);this.allocate();
 }
 private allocate(){
  const geometry=this.glow.geometry;
  this.centers=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  this.colors=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  this.profiles=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1).setUsage(THREE.DynamicDrawUsage);
  this.travel=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('shotPellet',this.profiles);geometry.setAttribute('shotCenter',this.centers);geometry.setAttribute('shotColor',this.colors);
  const trail=this.trail.geometry;
  trail.setAttribute('shotPellet',this.profiles);trail.setAttribute('shotCenter',this.centers);trail.setAttribute('shotColor',this.colors);trail.setAttribute('shotTravel',this.travel);
 }
 update(world:World|null,menu:boolean,alpha:number,height:number,projectileView?:(p:Projectile,position:Vec)=>Vec){
  const shots=world&&!menu?world.projectiles:[],count=shots.length;
  this.glow.visible=count>0;this.glow.geometry.instanceCount=count;this.glow.material.uniforms.viewportHeight.value=height;
  this.trail.geometry.instanceCount=count;this.trail.material.uniforms.viewportHeight.value=height;
  if(!count){if(this.active)this.clear();return;}
  if(count>this.capacity){while(this.capacity<count)this.capacity*=2;
   // Replace the geometry too: Three caches its maximum instance count after
   // the first draw, so simply resizing attributes would still truncate it.
   const previous=this.glow.geometry,geometry=new THREE.InstancedBufferGeometry();
   geometry.index=previous.index;geometry.attributes.position=previous.attributes.position;geometry.attributes.uv=previous.attributes.uv;geometry.instanceCount=count;
   previous.dispose();this.glow.geometry=geometry;
   this.trail.geometry.dispose();const trailGeometry=new THREE.InstancedBufferGeometry();
   trailGeometry.index=geometry.index;trailGeometry.setAttribute('position',geometry.attributes.position);trailGeometry.setAttribute('uv',geometry.attributes.uv);
   this.trail.geometry=trailGeometry;trailGeometry.instanceCount=count;
   this.allocate();
  }
  this.active=true;this.pixels.fill(0);alpha=Math.max(0,Math.min(1,alpha));const chroma=projectileChroma(world!);
  for(let i=0;i<count;i++){
   const p=shots[i],position=sampleProjectile(p,alpha,this.sample,this.velocity);
   const {x,y,z}=position;
   const speed=Math.hypot(this.velocity.x,this.velocity.y,this.velocity.z);
   let length=Math.min(p.kind==='shotgun'?1.2:2.1,speed*.026,speed*Math.max(0,p.age));
   // The ribbon's rear must never extend behind the palm where this beam began.
   if(p.kind!=='shotgun'&&(p.level??1)>=4)length=Math.min(length,Math.max(0,speed*Math.max(0,p.age)-PROJECTILE_TRAIL_OFFSET));
   // A ribbon cannot extend through a floor or armor contact after a bounce.
   // Limit it to the currently displayed segment of the swept path.
   if(p.path?.length){let start=p.previous??p.pos;for(const point of p.path){if(point.t>alpha)break;start=point.pos;}
    length=Math.min(length,Math.max(0,Math.hypot(x-start.x,y-start.y,z-start.z)-PROJECTILE_TRAIL_OFFSET*(p.kind==='shotgun'?DAGGER_PRESENTATION.shotgunScale:1)));}
   const scale=speed>0?length/speed:0;
   this.travel.setXYZ(i,this.velocity.x*scale,this.velocity.y*scale,this.velocity.z*scale);
   const color=chroma.color(p,world!.level);this.profiles.setX(i,p.kind==='shotgun'?1:0);
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
  for(const attribute of [this.centers,this.colors,this.profiles,this.travel]){attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*attribute.itemSize);attribute.needsUpdate=true;}
  this.field.needsUpdate=true;
 }
 clear(){this.glow.visible=false;this.glow.geometry.instanceCount=0;this.trail.geometry.instanceCount=0;this.pixels.fill(0);this.field.needsUpdate=true;this.active=false;}
 get diagnostics(){return {count:this.glow.geometry.instanceCount,drawCalls:this.glow.visible?2:0,capacity:this.capacity,fieldSize:FIELD_SIZE};}
}
