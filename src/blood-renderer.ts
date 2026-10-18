import * as THREE from 'three';
import {HandBlood} from './hand-blood';
import {bloodMaterial} from './blood-material';
import {BloodSplashRenderer} from './blood-splash-renderer';
import {BloodFootprintRenderer} from './blood-footsteps';
import {attachBloodFloor} from './blood-floor';
import {BloodField,BLOOD_CAPACITY} from './blood';
import type {Effect,World} from './simulation';

const MICRO_DROPS=9;
const ENEMY_BURST_SCALE=1.6;

/** Volumetric liquid beads and breaking ligaments; stains stay in the floor pass. */
export class BloodRenderer {
 readonly field=new BloodField(2048);
 readonly handBlood=new HandBlood();
 readonly ready:Promise<void>;
 readonly footsteps:BloodFootprintRenderer;
 private splashCrowns:BloodSplashRenderer;
 private texture=new THREE.DataTexture(this.field.pixels,this.field.size,this.field.size);
 private time={value:0};
 private surface:ReturnType<typeof attachBloodFloor>;
 private keyLight:THREE.DirectionalLight|undefined;
 private skyLight:THREE.HemisphereLight|undefined;
 private airFill={value:new THREE.Color(.32,.2,.18)};
 cosmic=0;
 private uploaded=-1;
 private uploadBytes=0;
 private dummy=new THREE.Object3D();
 private cameraForward=new THREE.Vector3();
 private assetsReady=false;
 private droplets:THREE.InstancedMesh;
 private spray:THREE.InstancedMesh;
 private viewVelocity=new THREE.Vector3();
 private axis=new THREE.Vector3(0,1,0);
 private flow=new THREE.Vector3();
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.splashCrowns=new BloodSplashRenderer(scene,this.airFill);
  this.footsteps=new BloodFootprintRenderer(scene,this.field);
  this.texture.generateMipmaps=false;this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;
  this.texture.needsUpdate=true;this.texture.onUpdate=()=>this.field.clearDirty();
  this.surface=attachBloodFloor(floor,this.texture,this.field.size,this.time);
  this.keyLight=scene.children.find((light):light is THREE.DirectionalLight=>light instanceof THREE.DirectionalLight);
  this.skyLight=scene.children.find((light):light is THREE.HemisphereLight=>light instanceof THREE.HemisphereLight);
  const batch=(name:string,capacity:number,strands:boolean)=>{
   // Wrap the parameter grid around a closed liquid surface in the vertex shader.
   const geometry=new THREE.PlaneGeometry(1,1,strands?12:8,strands?20:6);
   // The parameter wrap reverses the grid's winding. Keep the liquid exterior facing out.
   const indices=geometry.index!;
   for(let i=0;i<indices.count;i+=3){const b=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,b);}
   geometry.setAttribute('liquid',new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage));
   const mesh=new THREE.InstancedMesh(geometry,bloodMaterial(strands,this.airFill),capacity);
   mesh.name=name;mesh.count=0;mesh.frustumCulled=false;
   mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);return mesh;
  };
  this.droplets=batch('blood-liquid-droplets',BLOOD_CAPACITY*MICRO_DROPS,false);
  this.spray=batch('enemy-death-liquid-strands',BLOOD_CAPACITY,true);
  this.assetsReady=true;
  this.ready=this.loadMask().catch(error=>console.warn('Blood stain mask unavailable:',error));
 }
 private async loadMask(){
  const image=new Image();image.src='/assets/effects/blood-splat.png';await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const context=canvas.getContext('2d')!;context.drawImage(image,0,0,32,32);
  const pixels=context.getImageData(0,0,32,32).data;
  for(let i=0;i<this.field.mask.length;i++)this.field.mask[i]=Math.round(pixels[i*4+3]*(.25+.75*Math.max(pixels[i*4],pixels[i*4+1],pixels[i*4+2])/255));
 }
 setReflections(cosmic:THREE.Texture,storm:THREE.Texture){this.surface.bloodSky.value=cosmic;this.surface.bloodStorm.value=storm;this.surface.bloodReflectionReady.value=1;}
 effect(effect:Effect,world:World){this.handBlood.effect(effect,world);this.field.emit(effect,world.time);}
 advance(time:number){this.field.advance(time);this.time.value=time;}
 update(world:World|null,menu:boolean,presentationTime=world?.time,camera?:THREE.Camera){
  this.surface.bloodCosmic.value=this.cosmic;
  this.airFill.value.setRGB(.32,.2,.18);
  if(this.skyLight){
   const sky=this.skyLight,color=this.airFill.value,strength=sky.intensity*.7;
   color.r+=sky.color.r*strength;color.g+=sky.color.g*strength;color.b+=sky.color.b*strength;
  }
  if(this.keyLight){
   this.surface.bloodKeyDirection.value.copy(this.keyLight.position).sub(this.keyLight.target.position).normalize();
   this.surface.bloodKeyColor.value.copy(this.keyLight.color).multiplyScalar(this.keyLight.intensity);
  }
  if(world&&!menu)this.advance(presentationTime??world.time);
  this.footsteps.update(world,menu,presentationTime??world?.time??0);
  this.splashCrowns.update(this.field,presentationTime??world?.time??0,!!world&&!menu);
  const count=menu||!world?0:this.field.drops.length;
  this.droplets.count=this.spray.count=0;
  if(camera)camera.getWorldDirection(this.cameraForward);
  const append=(mesh:THREE.InstancedMesh,width:number,length:number,age:number,seed:number,opacity:number)=>{
   this.dummy.scale.set(width,length,width);this.dummy.updateMatrix();
   const index=mesh.count++;mesh.setMatrixAt(index,this.dummy.matrix);
   (mesh.geometry.getAttribute('liquid') as THREE.InstancedBufferAttribute).setXYZW(index,age,seed,opacity,0);
  };
  for(let i=0;i<count;i++){
   const drop=this.field.drops[i],age=drop.age;
   const sizeScale=drop.enemyBurst?(drop.sprayScale??1):1;
   const burstScale=drop.enemyBurst?ENEMY_BURST_SCALE*sizeScale:1;
   const depth=camera?(drop.pos.x-camera.position.x)*this.cameraForward.x+(drop.pos.y-camera.position.y)*this.cameraForward.y+(drop.pos.z-camera.position.z)*this.cameraForward.z:2;
   const lens=THREE.MathUtils.smoothstep(depth,.2,.85);if(!lens)continue;
   const seed=(drop.seed>>>0)/4294967296;
   this.viewVelocity.set(drop.velocity.x,drop.velocity.y-18*age,drop.velocity.z);
   const speed=this.viewVelocity.length();
   // Actual 3D surfaces rotate with the flow, retaining volume when viewed side-on.
   this.dummy.quaternion.setFromUnitVectors(this.axis,this.flow.copy(this.viewVelocity).normalize());
   const members=drop.puddleSplash?1:drop.enemyBurst?MICRO_DROPS:3;
   for(let j=0;j<members;j++){
    const variation=((drop.seed>>> ((j%6)*5))&31)/31;
    // A coherent core sheds a fan of fine beads, each at a different speed.
    const lag=j===0?1:.78+variation*.2;
    const t=age*lag;
    const spread=j===0?0:Math.min(age,.32)*(.2+variation*.55)*burstScale;
    this.dummy.position.set(
     drop.origin.x+drop.velocity.x*t+Math.sin(seed*91+j*2.4)*spread,
     drop.origin.y+drop.velocity.y*t-9*t*t+Math.abs(Math.sin(seed*57+j*4.1))*spread*.5,
     drop.origin.z+drop.velocity.z*t+Math.cos(seed*73+j*2.4)*spread);
    const width=drop.size*(drop.puddleSplash?1:j===0?.24:j<3?.09+variation*.09:.025+variation*.045)*lens*burstScale;
    // Larger beads remain rounded; only fine spray stretches with speed.
    const tail=Math.min(width*(j===0?1.2:2.2),speed*(j===0?.003:.0018));
    append(this.droplets,width,width+tail,age,variation,.98);
   }
   if(drop.enemyBurst&&age<.32&&seed<.56){
    // The trailing ligament spans back toward the wound instead of floating
    // as an isolated splat at the leading bead's position.
    const t=age*(.55+seed*.25),pressure=drop.sprayDirection;
    this.flow.set(drop.velocity.x,drop.velocity.y,drop.velocity.z);
    if(pressure)this.flow.multiplyScalar(.42).addScaledVector(this.viewVelocity.set(pressure.x,pressure.y,pressure.z).normalize(),4.5+seed*2.5);
    this.flow.multiplyScalar(1.25*Math.sqrt(sizeScale));
    this.dummy.position.set(drop.origin.x+this.flow.x*t,drop.origin.y+this.flow.y*t-9*t*t,drop.origin.z+this.flow.z*t);
    this.flow.y-=18*t;
    const strandSpeed=this.flow.length();
    this.dummy.quaternion.setFromUnitVectors(this.axis,this.flow.normalize());
    const fade=1-THREE.MathUtils.smoothstep(age,.16,.32);
    const length=Math.min(1.3,drop.size*.32+strandSpeed/Math.sqrt(sizeScale)*age*(.65+seed*.4));
    append(this.spray,drop.size*(.28+seed*.24)*lens*burstScale,length*lens*burstScale,age,seed,fade*.94);
   }
  }
  for(const mesh of [this.droplets,this.spray])if(mesh.count){
   mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);mesh.instanceMatrix.needsUpdate=true;
   const state=mesh.geometry.getAttribute('liquid') as THREE.InstancedBufferAttribute;
   state.clearUpdateRanges();state.addUpdateRange(0,mesh.count*4);state.needsUpdate=true;
  }
  this.uploadBytes=0;
  if(this.uploaded!==this.field.revision){
   // Small splashes upload their changed rows. Large bursts use one full upload
   // rather than issuing hundreds of tiny GPU commands.
   let rows=0;for(let y=0;y<this.field.size;y++)if(this.field.dirtyMax[y]>=0)rows++;
   this.texture.clearUpdateRanges();
   if(!this.field.fullUpload&&rows>0&&rows<=192){
    for(let y=0;y<this.field.size;y++)if(this.field.dirtyMax[y]>=0){
     const start=(y*this.field.size+this.field.dirtyMin[y])*4,count=(this.field.dirtyMax[y]-this.field.dirtyMin[y]+1)*4;
     this.texture.addUpdateRange(start,count);this.uploadBytes+=count;
    }
   }else this.uploadBytes=this.field.pixels.byteLength;
   this.texture.needsUpdate=true;this.uploaded=this.field.revision;
  }
 }
 get diagnostics(){return {puddleSplashes:this.field.splashes.length,puddleSplashDrops:this.field.drops.filter(d=>d.puddleSplash).length,active:this.field.drops.length,capacity:BLOOD_CAPACITY,landings:this.field.landings,discarded:this.field.discarded,revision:this.field.revision,textureBytes:this.field.pixels.byteLength,uploadBytes:this.uploadBytes,stainDrawCalls:0,assetsReady:this.assetsReady,goreVariants:0,dropletDrawCalls:this.droplets.count?1:0,dropletActive:this.droplets.count,sprayDrawCalls:this.spray.count?1:0,sprayActive:this.spray.count};}
 clear(){this.handBlood.clear();this.splashCrowns.clear();this.footsteps.clear();this.field.clear();this.droplets.count=this.spray.count=0;this.time.value=0;}
}
