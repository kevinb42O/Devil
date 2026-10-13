import * as THREE from 'three';
import {floorHeight} from './arena';
import {isPede,type EnemyKind} from './enemy-kinds';
import {type World,type Vec,type Enemy} from './simulation';
import {type GlowSource} from './enemy-glow-sources';

// A shared palette keeps the aura and floor spill consistent.
export function enemyGlowColor(kind:string):THREE.Color {
 if(kind.startsWith('transmuted')||kind.includes('lev')||kind==='orb'||kind.includes('immortal'))return new THREE.Color(.23,.19,.65);
 if(kind.includes('ghost')||kind.includes('ultrapede'))return new THREE.Color(.12,.5,.46);
 if(kind.includes('spider')||kind.includes('egg'))return new THREE.Color(.18,.42,.08);
 return new THREE.Color(.65,.12,.025);
}

const FIELD_SIZE=128,FIELD_SPAN=160;
type Emitter={pos:Vec;color:THREE.Color;radius:number;strength:number};
/** One aura batch plus a fixed-size floor light field; never adds per-enemy lights. */
export class EnemyLighting {
 aura:THREE.InstancedMesh;
 private capacity=256;
 private pixels=new Uint8Array(FIELD_SIZE*FIELD_SIZE*4);
 private field=new THREE.DataTexture(this.pixels,FIELD_SIZE,FIELD_SIZE);
 private dummy=new THREE.Object3D();
 private tint=new THREE.Color();
 private palette=new Map<EnemyKind,THREE.Color>();
 constructor(private scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.field.minFilter=this.field.magFilter=THREE.LinearFilter;this.field.generateMipmaps=false;this.field.needsUpdate=true;
  const previous=floor.onBeforeCompile,previousKey=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);shader.uniforms.enemyLightField={value:this.field};
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D enemyLightField;')
    .replace('#include <opaque_fragment>',`vec3 enemySpill=texture2D(enemyLightField,gemFloorPosition.xz/${FIELD_SPAN.toFixed(1)}+.5).rgb;
     outgoingLight+=enemySpill*(.18+outgoingLight*.8);
     #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=>previousKey+'-enemy-field-v1';
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`varying vec2 glowUV;varying vec3 glowColor;void main(){glowUV=uv;glowColor=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec2 glowUV;varying vec3 glowColor;void main(){float r=length(glowUV-.5)*2.;float halo=pow(max(0.,1.-r),3.)*.32;float core=pow(max(0.,1.-r*5.),2.);gl_FragColor=vec4(glowColor*halo+mix(glowColor,vec3(1.),.8)*core*2.5,1.);}`});
  this.aura=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,this.capacity);this.aura.setColorAt(0,new THREE.Color(0,0,0));this.aura.count=0;this.aura.frustumCulled=false;this.aura.name='enemy-aura-batch';scene.add(this.aura);
 }
 update(world:World|null,camera:THREE.Camera,menu:boolean,sources:(e:Enemy)=>GlowSource[]){
  this.pixels.fill(0);
  const emitters:Emitter[]=[];
  if(world&&!menu)for(const e of world.enemies){
   let color=this.palette.get(e.kind);if(!color){color=enemyGlowColor(e.kind);this.palette.set(e.kind,color);}
   const emergence=isPede(e.kind)?1:Math.min(1,e.age/(e.kind==='spider2'?9:e.kind==='leviathan'?8.533333:1.1));
   emitters.push({pos:e.pos,color,radius:Math.min(6,2.5+e.radius*.7),strength:emergence});
   if(isPede(e.kind))for(const segment of e.segments)emitters.push({pos:segment.pos,color,radius:2.5,strength:segment.hp>0?.55:.15});
  }
  // Preserve real source positions. Only virtually coincident source dots
  // share a sprite; never place a glow at a crowd's average location.
  const dots=new Map<string,{pos:THREE.Vector3;color:THREE.Color;size:number;strength:number}>();
  if(world&&!menu)for(const e of world.enemies){
   const color=this.palette.get(e.kind)!;
   for(const source of sources(e)){
    const key=`${Math.round(source.pos.x*20)},${Math.round(source.pos.y*20)},${Math.round(source.pos.z*20)}`;
    if(!dots.has(key))dots.set(key,{...source,color,strength:Math.min(1,e.age/1.1)});
   }
  }
  emitters.forEach(e=>{
   const ground=floorHeight(e.pos.x,e.pos.z,world!.time),altitude=e.pos.y-ground;
   const visible=altitude>=-.4?e.strength:0;
   if(!visible||ground<-30)return;
   const radius=e.radius*(1+Math.min(8,Math.max(0,altitude))*.08),strength=visible/(1+Math.max(0,altitude)*.22);
   const cx=(e.pos.x/FIELD_SPAN+.5)*FIELD_SIZE-.5,cz=(e.pos.z/FIELD_SPAN+.5)*FIELD_SIZE-.5,r=radius/FIELD_SPAN*FIELD_SIZE;
   for(let z=Math.max(0,Math.floor(cz-r));z<=Math.min(FIELD_SIZE-1,Math.ceil(cz+r));z++)for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(FIELD_SIZE-1,Math.ceil(cx+r));x++){
    const falloff=Math.max(0,1-Math.hypot(x-cx,z-cz)/r)**2*strength*255,index=(z*FIELD_SIZE+x)*4;
    // Maximum rather than sum: overlapping emitters cannot bleach the floor.
    this.pixels[index]=Math.max(this.pixels[index],e.color.r*falloff);this.pixels[index+1]=Math.max(this.pixels[index+1],e.color.g*falloff);this.pixels[index+2]=Math.max(this.pixels[index+2],e.color.b*falloff);
   }
  });
  const auras=[...dots.values()];
  if(auras.length>this.capacity){
   while(this.capacity<auras.length)this.capacity*=2;
   const previous=this.aura;this.aura=new THREE.InstancedMesh(previous.geometry,previous.material,this.capacity);this.aura.setColorAt(0,new THREE.Color(0,0,0));this.aura.name=previous.name;this.aura.frustumCulled=false;this.scene.remove(previous);previous.dispose();this.scene.add(this.aura);
  }
  this.aura.count=auras.length;
  for(let i=0;i<this.aura.count;i++){
   const g=auras[i];this.dummy.position.copy(g.pos);this.dummy.quaternion.copy(camera.quaternion);this.dummy.scale.setScalar(g.size);this.dummy.updateMatrix();this.aura.setMatrixAt(i,this.dummy.matrix);
   this.tint.copy(g.color).multiplyScalar(g.strength);this.aura.setColorAt(i,this.tint);
  }
  if(this.aura.count){this.aura.instanceMatrix.clearUpdateRanges();this.aura.instanceMatrix.addUpdateRange(0,this.aura.count*16);this.aura.instanceMatrix.needsUpdate=true;this.aura.instanceColor!.clearUpdateRanges();this.aura.instanceColor!.addUpdateRange(0,this.aura.count*3);this.aura.instanceColor!.needsUpdate=true;}
  this.field.needsUpdate=true;
 }
 clear(){this.aura.count=0;this.pixels.fill(0);this.field.needsUpdate=true;}
}
