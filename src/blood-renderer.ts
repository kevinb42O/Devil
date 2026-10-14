import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {BloodField,BLOOD_CAPACITY,BLOOD_SPAN} from './blood';
import type {Effect,World} from './simulation';

const BLOOD_VARIANTS=11,ROOT='/assets/original/devil-daggers/';

/** Original textured gore meshes in fixed batches; stains stay in the floor pass. */
export class BloodRenderer {
 readonly field=new BloodField();
 readonly ready:Promise<void>;
 private texture=new THREE.DataTexture(this.field.pixels,this.field.size,this.field.size);
 private time={value:0};
 private uploaded=-1;
 private uploadBytes=0;
 private dummy=new THREE.Object3D();
 private cameraForward=new THREE.Vector3();
 private meshes:THREE.InstancedMesh[]=[];
 private assetsReady=false;
 private spray:THREE.InstancedMesh;
 private sprayMaterial=new THREE.MeshBasicMaterial({color:0xa51b10,transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false});
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
  const material=new THREE.MeshBasicMaterial({color:0xc52b1b,side:THREE.DoubleSide,toneMapped:false});
  // Hidden until the native assets load: no geometric placeholder gore.
  for(let i=0;i<BLOOD_VARIANTS;i++){
   const mesh=new THREE.InstancedMesh(new THREE.BufferGeometry(),material,BLOOD_CAPACITY);
   mesh.name=`blood-native-${i+1}`;mesh.count=0;mesh.frustumCulled=false;
   mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);this.meshes.push(mesh);
  }
  this.spray=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),this.sprayMaterial,BLOOD_CAPACITY);
  this.spray.name='enemy-death-blood-spray';this.spray.count=0;this.spray.frustumCulled=false;scene.add(this.spray);
  this.spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.ready=Promise.all([this.loadMask(),this.loadGore(material)]).then(()=>{}).catch(error=>console.warn('Blood assets unavailable:',error));
 }
 private async loadGore(material:THREE.MeshBasicMaterial){
  const loader=new OBJLoader();
  const [geometries,texture]=await Promise.all([
   Promise.all(Array.from({length:BLOOD_VARIANTS},async(_,i)=>{
    const response=await fetch(ROOT+`meshes/blood${i+1}.obj`);if(!response.ok)throw Error('Missing native blood mesh');
    const model=loader.parse(await response.text());let geometry:THREE.BufferGeometry|undefined;
    model.traverse(object=>{if(object instanceof THREE.Mesh)geometry=object.geometry;});
    if(!geometry)throw Error('Empty native blood mesh');
    geometry.computeBoundingSphere();const radius=geometry.boundingSphere!.radius;
    geometry.center();geometry.scale(1/radius,1/radius,1/radius);return geometry;
   })),new THREE.TextureLoader().loadAsync(ROOT+'textures/blood.png'),
  ]);
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;
  material.map=texture;material.needsUpdate=true;
  for(let i=0;i<BLOOD_VARIANTS;i++){this.meshes[i].geometry.dispose();this.meshes[i].geometry=geometries[i];}
  this.assetsReady=true;
 }
 private async loadMask(){
  const image=new Image();image.src='/assets/effects/blood-splat.png';await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const context=canvas.getContext('2d')!;context.drawImage(image,0,0,32,32);
  const pixels=context.getImageData(0,0,32,32).data;
  for(let i=0;i<this.field.mask.length;i++)this.field.mask[i]=Math.round(pixels[i*4+3]*(.25+.75*Math.max(pixels[i*4],pixels[i*4+1],pixels[i*4+2])/255));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  this.sprayMaterial.map=texture;this.sprayMaterial.needsUpdate=true;
 }
 effect(effect:Effect,world:World){this.field.emit(effect,world.time);}
 advance(time:number){this.field.advance(time);this.time.value=time;}
 update(world:World|null,menu:boolean,presentationTime=world?.time,camera?:THREE.Camera){
  if(world&&!menu)this.advance(presentationTime??world.time);
  const count=menu||!world?0:this.field.drops.length;
  for(const mesh of this.meshes)mesh.count=0;
  if(camera)camera.getWorldDirection(this.cameraForward);
  this.spray.count=0;
  for(let i=0;i<count;i++){
   const drop=this.field.drops[i];this.dummy.position.set(drop.pos.x,drop.pos.y,drop.pos.z);
   this.dummy.rotation.set(drop.age*5,drop.angle,drop.age*3);
   // Player explosions already have their own gore/cloud pass. Enemy kills
   // need substantial airborne chunks; suppress geometry only at the lens.
   const depth=camera?(drop.pos.x-camera.position.x)*this.cameraForward.x+(drop.pos.y-camera.position.y)*this.cameraForward.y+(drop.pos.z-camera.position.z)*this.cameraForward.z:2;
   const size=drop.size*(drop.enemyBurst?.75:.35)*THREE.MathUtils.smoothstep(depth,.15,.8);
   this.dummy.scale.set(size,size*drop.stretch,size);this.dummy.updateMatrix();
   if(this.assetsReady){const mesh=this.meshes[drop.seed%BLOOD_VARIANTS];mesh.setMatrixAt(mesh.count++,this.dummy.matrix);}
   if(drop.enemyBurst&&drop.age<.36&&camera&&this.sprayMaterial.map){
    // A broad, fast spray sells the instant of death independently of stains.
    const age=drop.age,fade=Math.pow(1-age/.36,1.3);
    this.dummy.position.set(drop.origin.x+drop.velocity.x*age*.6,drop.origin.y+drop.velocity.y*age*.45-9*age*age,drop.origin.z+drop.velocity.z*age*.6);
    this.dummy.quaternion.copy(camera.quaternion);this.dummy.rotateZ(drop.angle);
    const splash=drop.size*2.1*(1+age*2)*fade*THREE.MathUtils.smoothstep(depth,.15,.8);
    this.dummy.scale.set(splash*drop.stretch,splash,1);this.dummy.updateMatrix();this.spray.setMatrixAt(this.spray.count++,this.dummy.matrix);
   }
  }
  for(const mesh of this.meshes)if(mesh.count){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);mesh.instanceMatrix.needsUpdate=true;}
  if(this.spray.count){this.spray.instanceMatrix.clearUpdateRanges();this.spray.instanceMatrix.addUpdateRange(0,this.spray.count*16);this.spray.instanceMatrix.needsUpdate=true;}
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
 get diagnostics(){return {active:this.field.drops.length,capacity:BLOOD_CAPACITY,landings:this.field.landings,discarded:this.field.discarded,revision:this.field.revision,textureBytes:this.field.pixels.byteLength,uploadBytes:this.uploadBytes,stainDrawCalls:0,assetsReady:this.assetsReady,goreVariants:BLOOD_VARIANTS,dropletDrawCalls:this.meshes.filter(mesh=>mesh.count>0).length,sprayDrawCalls:this.spray.count?1:0,sprayActive:this.spray.count};}
 clear(){this.field.clear();for(const mesh of this.meshes)mesh.count=0;this.spray.count=0;this.time.value=0;}
}
