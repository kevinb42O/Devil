import * as THREE from 'three';
import {floorHeight} from './arena';
import {BloodField} from './blood';
import {FootstepGait,setBloodFootWetness} from './footstep-audio';
import type {World} from './simulation';

export const BLOODY_FEET_SECONDS=5,FOOTPRINT_SECONDS=24,FOOTPRINT_CAPACITY=256;
type Coating={player:World['player'];wet:number;time:number;x:number;z:number;grounded:boolean;vertical:number;airtime:number};
export type BloodyPrint={x:number;y:number;z:number;angle:number;side:number;strength:number;born:number};
/** Separate from the puddle field: prints cannot recoat feet indefinitely. */
export class BloodFootprints{
 readonly prints:BloodyPrint[]=[];
 private actors=new Map<string,Coating>();
 private gait=new FootstepGait();
 private lastTime=-Infinity;
 private world:World|null=null;
 constructor(private field:BloodField){}
 coverage(x:number,z:number){
  return this.field.coverageAt(x,z);
 }
 update(world:World,time:number){
  if(time<this.lastTime||(this.world!==world&&(!world.crew.length||!this.world?.crew.length)))this.clear();
  this.world=world;this.lastTime=time;
  for(let i=this.prints.length-1;i>=0;i--)if(time-this.prints[i].born>=FOOTPRINT_SECONDS)this.prints.splice(i,1);
  if(world.state!=='playing'||world.courtyard){this.resetActors();return;}
  const actors=world.crew.length?world.crew.filter(p=>p.alive).map(p=>({id:p.id,player:p.player})):[{id:'local',player:world.player}];
  const ids=new Set(actors.map(p=>p.id));this.gait.retain(ids);
  for(const [id,old]of this.actors)if(!ids.has(id)){setBloodFootWetness(old.player,0,id);this.actors.delete(id);}
  for(const {id,player}of actors){
   const {x,z}=player.pos,old=this.actors.get(id),dt=old?time-old.time:0,travel=old?Math.hypot(x-old.x,z-old.z):0;
   if(old&&old.player!==player)setBloodFootWetness(old.player,0);
   let wet=old?Math.max(0,old.wet-dt/BLOODY_FEET_SECONDS):0;
   if(dt>.2||travel>Math.max(1.8,dt*23))wet=0;
   const continuous=!!old&&dt>0&&dt<=.2&&travel<=Math.max(1.8,dt*23);
   const airtime=player.grounded?0:(continuous?(old.airtime+dt):0);
   if(continuous&&old.grounded!==player.grounded){
    const landing=player.grounded,impact=landing?Math.max(0,-old.vertical):Math.max(0,player.vel.y)*.24;
    if((landing&&old.airtime>.045&&impact>1.5)||(!landing&&player.vel.y>1)){
     // Separate foot contacts make an asymmetric pair of crowns, not an explosion at eye level.
     const heading=Math.atan2(player.vel.x,player.vel.z),sx=Math.cos(heading)*.16,sz=-Math.sin(heading)*.16;
     const seed=Math.round(time*60000)^Array.from(id).reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0),17);
     for(const side of [-1,1])this.field.splash(x+sx*side,z+sz*side,time,impact,player.vel,seed^(side===1?0x75ab:0x13ce));
    }
   }
   if(player.grounded)wet=Math.max(wet,this.coverage(x,z));
   const step=this.gait.update(id,player,time);
   if(step&&wet>.035){
    const speed=Math.hypot(player.vel.x,player.vel.z),fx=player.vel.x/speed,fz=player.vel.z/speed,side=step.side?1:-1;
    const px=x+fz*.16*side,pz=z-fx*.16*side,ground=floorHeight(px,pz,time,0);
    if(ground>-20&&Math.abs(ground-floorHeight(x,z,time,0))<.15){
     if(this.prints.length>=FOOTPRINT_CAPACITY)this.prints.shift();
     this.prints.push({x:px,y:ground+.025,z:pz,angle:Math.atan2(fx,fz)+Math.PI,side,strength:wet,born:time});
    }
    wet=Math.max(0,wet-.085);
   }
   this.actors.set(id,{player,wet,time,x,z,grounded:player.grounded,vertical:player.vel.y,airtime});setBloodFootWetness(player,wet,id);
  }
 }
 private resetActors(){for(const [id,old]of this.actors)setBloodFootWetness(old.player,0,id);this.actors.clear();this.gait.clear();}
 clear(){this.resetActors();this.prints.length=0;this.lastTime=-Infinity;this.world=null;}
}

/** One bounded draw call, with distinct heel, forefoot and worn tread. */
export class BloodFootprintRenderer{
 readonly trail:BloodFootprints;
 private mesh:THREE.InstancedMesh;
 private dummy=new THREE.Object3D();
 private time={value:0};
 constructor(scene:THREE.Scene,field:BloodField){
  this.trail=new BloodFootprints(field);
  const geometry=new THREE.PlaneGeometry(.34,.7);geometry.rotateX(-Math.PI/2);
  geometry.setAttribute('printState',new THREE.InstancedBufferAttribute(new Float32Array(FOOTPRINT_CAPACITY*3),3));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
   uniforms:{time:this.time},
   vertexShader:`attribute vec3 printState; varying vec2 soleUV; varying vec3 state;
    void main(){soleUV=uv;state=printState;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform float time;varying vec2 soleUV;varying vec3 state;
    void main(){
     vec2 p=(soleUV-.5)*2.;p.x*=state.z;
     float heel=1.-smoothstep(.78,1.,length((p-vec2(-.08,-.57))/vec2(.65,.35)));
     float fore=1.-smoothstep(.83,1.,length((p-vec2(.04,.34))/vec2(.91,.59)));
     float shape=max(heel,fore);
     float grain=fract(sin(dot(floor(soleUV*vec2(27.,46.)),vec2(127.1,311.7)))*43758.5453);
     float tread=smoothstep(.06,.15,abs(sin(p.y*26.+p.x*3.)));
     float fade=1.-smoothstep(12.,24.,time-state.x);
     float alpha=shape*mix(.52,1.,grain)*mix(.65,1.,tread)*state.y*fade*.88;
     if(alpha<.015)discard;
     gl_FragColor=vec4(vec3(.24,.009,.015)*mix(.7,1.2,grain),alpha);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`});
  this.mesh=new THREE.InstancedMesh(geometry,material,FOOTPRINT_CAPACITY);this.mesh.name='bloody-footprints';
  this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.renderOrder=2;this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(this.mesh);
 }
 update(world:World|null,menu:boolean,time:number){
  if(!world||menu){this.mesh.count=0;return;}
  this.trail.update(world,time);this.time.value=time;this.mesh.count=this.trail.prints.length;
  const state=this.mesh.geometry.getAttribute('printState') as THREE.InstancedBufferAttribute;
  this.trail.prints.forEach((print,i)=>{
   this.dummy.position.set(print.x,floorHeight(print.x,print.z,time,0)+.025,print.z);this.dummy.rotation.set(0,print.angle,0);this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);
   state.setXYZ(i,print.born,print.strength,print.side);
  });
  if(this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;state.needsUpdate=true;}
 }
 clear(){this.trail.clear();this.mesh.count=0;}
}
