import * as THREE from 'three';
import {goreGeometry} from './remake-geometry';
import {floorHeight} from './arena';
import {bloodRandom,type BloodField} from './blood';
import type {Vec} from './simulation';

const VARIANTS=11,PER_VARIANT=16,COUNT=VARIANTS*PER_VARIANT,GRAVITY=18,STEP=1/120;
type Fragment={offset:Vec;velocity:Vec;size:number;spin:number;landing:number;x:number;z:number;y:number};

/** Project-authored gore shapes, sampled from replay time; no simulation or gameplay RNG. */
export class PlayerDeathBurst {
 readonly mesh:THREE.InstancedMesh;
 readonly ready:Promise<void>;
 assetsReady=false;
 private batches:THREE.InstancedMesh[]=[];
 private spray:THREE.InstancedMesh;
 private sprayMaterial:THREE.MeshBasicMaterial;
 private fragments:Fragment[]=[];
 private dummy=new THREE.Object3D();
 constructor(scene:THREE.Scene,private blood:BloodField,template?:PlayerDeathBurst){
  const material=new THREE.MeshStandardMaterial({color:0xc43627,emissive:0x290200,emissiveIntensity:.2,roughness:.32,side:THREE.DoubleSide});
  const fallback=new THREE.IcosahedronGeometry(1,0),random=bloodRandom(0xdeadbeef),color=new THREE.Color();
  for(let variant=0;variant<VARIANTS;variant++){
   const batch=new THREE.InstancedMesh(fallback,material,PER_VARIANT);
   batch.name=variant===0?'death-analysis-blood-explosion':`death-analysis-gore-${variant+1}`;
   batch.frustumCulled=false;batch.visible=false;batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   for(let i=0;i<PER_VARIANT;i++){
    color.setRGB(.35+random()*.5,.12+random()*.13,.09);batch.setColorAt(i,color);
    const angle=random()*Math.PI*2,speed=2+random()*7;
    this.fragments.push({offset:{x:(random()-.5)*.65,y:-1.4+random()*1.7,z:(random()-.5)*.65},velocity:{x:Math.cos(angle)*speed,y:-1+random()*9,z:Math.sin(angle)*speed},size:i%7===0?.2+random()*.13:.065+random()*.12,spin:(random()-.5)*22,landing:Infinity,x:0,z:0,y:0});
   }
   scene.add(batch);this.batches.push(batch);
  }
  this.mesh=this.batches[0];
  this.sprayMaterial=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,opacity:.8,side:THREE.DoubleSide,toneMapped:false});
  this.spray=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),this.sprayMaterial,64);
  this.spray.name='death-analysis-blood-cloud';this.spray.frustumCulled=false;this.spray.visible=false;scene.add(this.spray);
  this.ready=template?template.ready.then(()=>{
   // Concurrent crew deaths share the loaded assets, but own their animation buffers.
   for(let i=0;i<VARIANTS;i++)this.batches[i].geometry=template.batches[i].geometry;
   material.map=(template.mesh.material as THREE.MeshStandardMaterial).map;material.needsUpdate=true;
   this.sprayMaterial.map=template.sprayMaterial.map;this.sprayMaterial.needsUpdate=true;
   fallback.dispose();this.assetsReady=template.assetsReady;
  }):this.load(material,fallback).catch(error=>console.warn('Death gore assets unavailable; using fallback:',error));
 }
 private async load(_material:THREE.MeshStandardMaterial,fallback:THREE.BufferGeometry){
  const splat=await new THREE.TextureLoader().loadAsync('/assets/effects/blood-splat.png');
  splat.colorSpace=THREE.SRGBColorSpace;this.sprayMaterial.map=splat;this.sprayMaterial.needsUpdate=true;
  for(let i=0;i<VARIANTS;i++)this.batches[i].geometry=goreGeometry(i);
  fallback.dispose();this.assetsReady=true;
 }
 begin(position:Vec,time:number){
  // The existing droplet pool deposits the downloaded splatter mask onto the floor.
  for(let i=0;i<8;i++){
   const pos={x:position.x,y:position.y-1.35+i*.22,z:position.z};
   this.blood.emit({kind:'kill',pos,amount:10,enemyId:-1000-i,bloodTime:time},time);
  }
  for(const f of this.fragments){
   f.landing=Infinity;
   const originGround=floorHeight(position.x+f.offset.x,position.z+f.offset.z,time,0);
   // Victims below the arena burst into the void instead of painting its top.
   if(position.y+f.offset.y<originGround-.2)continue;
   for(let age=0;age<=1.9;age+=STEP){
    const x=position.x+f.offset.x+f.velocity.x*age,z=position.z+f.offset.z+f.velocity.z*age;
    const y=position.y+f.offset.y+f.velocity.y*age-GRAVITY*age*age*.5,ground=floorHeight(x,z,time+age,0);
    if(ground>-20&&y<=ground+.025){f.landing=age;f.x=x;f.z=z;f.y=ground+f.size*.18;break;}
   }
  }
 }
 update(position:Vec|null,age:number,camera:THREE.Camera){
  for(const batch of this.batches)batch.visible=!!position&&age>=0;
  this.spray.visible=!!position&&age>=0&&age<.55;
  if(!this.mesh.visible||!position)return;
  for(let i=0;i<COUNT;i++){
   const f=this.fragments[i],landed=age>=f.landing;
   this.dummy.position.set(landed?f.x:position.x+f.offset.x+f.velocity.x*age,landed?f.y:position.y+f.offset.y+f.velocity.y*age-GRAVITY*age*age*.5,landed?f.z:position.z+f.offset.z+f.velocity.z*age);
   this.dummy.rotation.set(landed?0:f.spin*age,i*2.4,landed?0:f.spin*age*.7);
   this.dummy.scale.set(f.size*(landed?1.4:1),f.size*(landed?.3:1.4),f.size);
   this.dummy.updateMatrix();this.batches[Math.floor(i/PER_VARIANT)].setMatrixAt(i%PER_VARIANT,this.dummy.matrix);
  }
  for(const batch of this.batches)batch.instanceMatrix.needsUpdate=true;
  if(this.spray.visible){
   this.sprayMaterial.opacity=.65*Math.pow(Math.max(0,1-age/.55),1.5);
   for(let i=0;i<64;i++){
    const f=this.fragments[i],size=(.4+f.size*3)*(1+age*3);
    this.dummy.position.set(position.x+f.offset.x+f.velocity.x*age*.55,position.y+f.offset.y+f.velocity.y*age*.35,position.z+f.offset.z+f.velocity.z*age*.55);
    this.dummy.quaternion.copy(camera.quaternion);this.dummy.rotateZ(i*2.4);
    this.dummy.scale.set(size,size,1);this.dummy.updateMatrix();this.spray.setMatrixAt(i,this.dummy.matrix);
   }
   this.spray.instanceMatrix.needsUpdate=true;
  }
 }
 get diagnostics(){return {assetsReady:this.assetsReady,goreVariants:VARIANTS,goreFragments:COUNT,sprayVisible:this.spray.visible};}
 clear(){for(const batch of this.batches)batch.visible=false;this.spray.visible=false;}
}
