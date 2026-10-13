import * as THREE from 'three';
import {BloodField,BLOOD_CAPACITY,BLOOD_SPAN} from './blood';
import type {Effect,World} from './simulation';

/** One transient droplet batch; persistent stains are part of the existing floor pass. */
export class BloodRenderer {
 readonly field=new BloodField();
 readonly ready:Promise<void>;
 private texture=new THREE.DataTexture(this.field.pixels,this.field.size,this.field.size);
 private time={value:0};
 private uploaded=-1;
 private uploadBytes=0;
 private dummy=new THREE.Object3D();
 private mesh:THREE.InstancedMesh;
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.texture.generateMipmaps=false;this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;
  this.texture.needsUpdate=true;this.texture.onUpdate=()=>this.field.clearDirty();
  const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);
   shader.uniforms.bloodField={value:this.texture};shader.uniforms.bloodTime=this.time;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float bloodTop;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nbloodTop=normal.y;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D bloodField;uniform float bloodTime;varying float bloodTop;')
    .replace('#include <map_fragment>',`#include <map_fragment>
     vec4 blood=texture2D(bloodField,gemFloorPosition.xz/${BLOOD_SPAN.toFixed(4)}+.5);
     float landed=(blood.g*255.+blood.b*65280.)*.25;
     float fresh=exp(-max(0.,bloodTime-landed)*.24);
     float coverage=blood.r*.88*smoothstep(.65,.95,bloodTop);
     vec3 bloodColor=diffuseColor.rgb*vec3(.82,.07,.045)+mix(vec3(.0025,.0002,.0001),vec3(.015,.001,.0004),fresh);
     diffuseColor.rgb=mix(diffuseColor.rgb,bloodColor,coverage);`);
  };
  floor.customProgramCacheKey=()=>key+'-blood-v1';
  const material=new THREE.MeshBasicMaterial({color:0x9c160b,toneMapped:false});
  this.mesh=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1),material,BLOOD_CAPACITY);
  this.mesh.name='blood-droplets';this.mesh.count=0;this.mesh.frustumCulled=false;scene.add(this.mesh);
  this.ready=this.loadMask().catch(()=>{/* Deterministic generated mask remains available offline. */});
 }
 private async loadMask(){
  const image=new Image();image.src='/assets/effects/blood-splat.png';await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const context=canvas.getContext('2d')!;context.drawImage(image,0,0,32,32);
  const pixels=context.getImageData(0,0,32,32).data;
  for(let i=0;i<this.field.mask.length;i++)this.field.mask[i]=Math.round(pixels[i*4+3]*(.25+.75*Math.max(pixels[i*4],pixels[i*4+1],pixels[i*4+2])/255));
 }
 effect(effect:Effect,world:World){this.field.emit(effect,world.time);}
 advance(time:number){this.field.advance(time);this.time.value=time;}
 update(world:World|null,menu:boolean){
  if(world&&!menu)this.advance(world.time);
  this.mesh.count=menu||!world?0:this.field.drops.length;
  for(let i=0;i<this.mesh.count;i++){
   const drop=this.field.drops[i];this.dummy.position.set(drop.pos.x,drop.pos.y,drop.pos.z);
   this.dummy.rotation.set(drop.age*5,drop.angle,drop.age*3);
   this.dummy.scale.set(drop.size*.23,drop.size*.65,drop.size*.23);this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);
  }
  if(this.mesh.count){this.mesh.instanceMatrix.clearUpdateRanges();this.mesh.instanceMatrix.addUpdateRange(0,this.mesh.count*16);this.mesh.instanceMatrix.needsUpdate=true;}
  this.uploadBytes=0;
  if(this.uploaded!==this.field.revision){
   // Small splashes upload their changed rows. Large bursts use one full upload
   // rather than issuing hundreds of tiny GPU commands.
   let rows=0;for(let y=0;y<this.field.size;y++)if(this.field.dirtyMax[y]>=0)rows++;
   this.texture.clearUpdateRanges();
   if(!this.field.fullUpload&&rows>0&&rows<=48){
    for(let y=0;y<this.field.size;y++)if(this.field.dirtyMax[y]>=0){
     const start=(y*this.field.size+this.field.dirtyMin[y])*4,count=(this.field.dirtyMax[y]-this.field.dirtyMin[y]+1)*4;
     this.texture.addUpdateRange(start,count);this.uploadBytes+=count;
    }
   }else this.uploadBytes=this.field.pixels.byteLength;
   this.texture.needsUpdate=true;this.uploaded=this.field.revision;
  }
 }
 get diagnostics(){return {active:this.field.drops.length,capacity:BLOOD_CAPACITY,landings:this.field.landings,discarded:this.field.discarded,revision:this.field.revision,textureBytes:this.field.pixels.byteLength,uploadBytes:this.uploadBytes,stainDrawCalls:0,dropletDrawCalls:this.mesh.count?1:0};}
 clear(){this.field.clear();this.mesh.count=0;this.time.value=0;}
}
