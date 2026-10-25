import * as THREE from 'three';
import {floorHeight} from './arena';
import {isPede,isSkull,isEgg,type EnemyKind} from './enemy-kinds';
import {type World,type Vec,type Enemy} from './simulation';
import {type GlowSource} from './enemy-glow-sources';

// A shared palette keeps the aura and floor spill consistent.
export function enemyGlowColor(kind:string):THREE.Color {
 if(kind==='skull')return new THREE.Color(.65,.22,.055);
 if(kind==='skull2')return new THREE.Color(.10,.40,.48);
 if(kind==='skull3')return new THREE.Color(.52,.045,.10);
 if(kind==='orb')return new THREE.Color(1.,.025,.004);
 if(kind.startsWith('transmuted')||kind.includes('lev')||kind.includes('immortal'))return new THREE.Color(.23,.19,.65);
 if(kind.includes('ghost')||kind.includes('ultrapede'))return new THREE.Color(.12,.5,.46);
 if(kind.includes('spider')||kind.includes('egg'))return new THREE.Color(.18,.42,.08);
 return new THREE.Color(.65,.12,.025);
}

const FIELD_SIZE=128,FIELD_SPAN=160;
/** One aura batch plus a fixed-size floor light/contact field; no per-enemy lights. */
export class EnemyLighting {
 aura:THREE.InstancedMesh;
 private capacity=256;
 private pixels=new Uint8Array(FIELD_SIZE*FIELD_SIZE*4);
 private field=new THREE.DataTexture(this.pixels,FIELD_SIZE,FIELD_SIZE);
 private dummy=new THREE.Object3D();
 private tint=new THREE.Color();
 private xDistances=new Float64Array(FIELD_SIZE);
 private dotKeys=new Set<number|string>();
 private dots:{pos:THREE.Vector3;color:THREE.Color;size:number;strength:number}[]=[];
 private palette=new Map<EnemyKind,THREE.Color>();
 constructor(private scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.field.minFilter=this.field.magFilter=THREE.LinearFilter;this.field.generateMipmaps=false;this.field.needsUpdate=true;
  const previous=floor.onBeforeCompile,previousKey=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);shader.uniforms.enemyLightField={value:this.field};
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D enemyLightField;')
    .replace('#include <opaque_fragment>',`vec4 enemyField=texture2D(enemyLightField,gemFloorPosition.xz/${FIELD_SPAN.toFixed(1)}+.5);
     outgoingLight*=1.-enemyField.a*.55;
     outgoingLight+=enemyField.rgb*(.18+outgoingLight*.8);
     #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=>previousKey+'-enemy-field-contact-v2';
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`varying vec2 glowUV;varying vec3 glowColor;void main(){glowUV=uv;glowColor=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec2 glowUV;varying vec3 glowColor;void main(){float r=length(glowUV-.5)*2.;float halo=pow(max(0.,1.-r),3.)*.32;float core=pow(max(0.,1.-r*5.),2.);gl_FragColor=vec4(glowColor*halo+mix(glowColor,vec3(1.),.8)*core*2.5,1.);}`});
  this.aura=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,this.capacity);this.aura.setColorAt(0,new THREE.Color(0,0,0));this.aura.count=0;this.aura.frustumCulled=false;this.aura.name='enemy-aura-batch';scene.add(this.aura);
 }
 update(world:World|null,camera:THREE.Camera,menu:boolean,sources:(e:Enemy)=>GlowSource[]){
  this.pixels.fill(0);
  if(world&&!menu)for(const e of world.enemies){
   // The new brood shells and juvenile bone faces have no lantern or crystal.
   if(isEgg(e.kind)||e.kind==='spiderling')continue;
   let color=this.palette.get(e.kind);if(!color){color=enemyGlowColor(e.kind);this.palette.set(e.kind,color);}
   const emergence=isPede(e.kind)?1:Math.min(1,e.age/(e.kind==='spider2'?9:e.kind==='leviathan'?8.533333:1.1));
   this.spill(e.pos,color,e.kind==='orb'?10.5:e.kind==='thorn'?2.6:Math.min(6,2.5+e.radius*.7),emergence,world.time,e.radius,e.kind==='orb',isSkull(e.kind));
   if(isPede(e.kind))for(const segment of e.segments)this.spill(segment.pos,color,2.5,segment.hp>0?.55:.15,world.time,e.radius*.7);
  }
  // Preserve real source positions. Only virtually coincident source dots
  // share a sprite; never place a glow at a crowd's average location.
  this.dotKeys.clear();let dotCount=0;
  if(world&&!menu)for(const e of world.enemies){
   const color=this.palette.get(e.kind)!;
   for(const source of sources(e)){
    const x=Math.round(source.pos.x*20),y=Math.round(source.pos.y*20),z=Math.round(source.pos.z*20);
    // Three signed 17-bit coordinates fit exactly into a JS number (51 bits).
    // The fallback preserves the original key for positions beyond that range.
    const key=x>=-65536&&x<65536&&y>=-65536&&y<65536&&z>=-65536&&z<65536
     ?(x+65536)*17179869184+(y+65536)*131072+z+65536:`${x},${y},${z}`;
    if(this.dotKeys.has(key))continue;this.dotKeys.add(key);
    const dot=this.dots[dotCount]??(this.dots[dotCount]={pos:source.pos,color,size:0,strength:0});
    dot.pos=source.pos;dot.color=color;dot.size=source.size;dot.strength=Math.min(1,e.age/1.1)*(source.strength??1);dotCount++;
   }
  }
  if(dotCount>this.capacity){
   while(this.capacity<dotCount)this.capacity*=2;
   const previous=this.aura;this.aura=new THREE.InstancedMesh(previous.geometry,previous.material,this.capacity);this.aura.setColorAt(0,new THREE.Color(0,0,0));this.aura.name=previous.name;this.aura.frustumCulled=false;this.scene.remove(previous);previous.dispose();this.scene.add(this.aura);
  }
  this.aura.count=dotCount;
  this.dummy.quaternion.copy(camera.quaternion);this.dummy.updateMatrix();
  const rotation=this.dummy.matrix.elements,matrices=this.aura.instanceMatrix.array;
  for(let i=0;i<this.aura.count;i++){
   const g=this.dots[i],offset=i*16;
   // All billboards share the same camera rotation. Compose it once, then
   // apply each scale and translation directly to the upload buffer.
   for(let j=0;j<12;j++)matrices[offset+j]=rotation[j]*g.size;
   matrices[offset+12]=g.pos.x;matrices[offset+13]=g.pos.y;matrices[offset+14]=g.pos.z;matrices[offset+15]=1;
   this.tint.copy(g.color).multiplyScalar(g.strength);this.aura.setColorAt(i,this.tint);
  }
  if(this.aura.count){this.aura.instanceMatrix.clearUpdateRanges();this.aura.instanceMatrix.addUpdateRange(0,this.aura.count*16);this.aura.instanceMatrix.needsUpdate=true;this.aura.instanceColor!.clearUpdateRanges();this.aura.instanceColor!.addUpdateRange(0,this.aura.count*3);this.aura.instanceColor!.needsUpdate=true;}
  this.field.needsUpdate=true;
 }
 private spill(pos:Vec,color:THREE.Color,baseRadius:number,emergence:number,time:number,footprint:number,annular=false,surfaceOnly=false){
  const ground=floorHeight(pos.x,pos.z,time),altitude=pos.y-ground;
  if(altitude<-.4||!emergence||ground<-30)return;
  const height=Math.max(0,altitude);
  const radius=baseRadius*(1+Math.min(8,height)*.08),strength=emergence/(1+height*.22);
  // Broad, soft contact occlusion uses the otherwise unused alpha channel.
  // It follows the moving floor, fades with height and never stacks to black
  // when a swarm overlaps. Crystals still add their light after the occlusion.
  const contactRadius=Math.max(1.6,footprint*1.15)*(1+Math.min(12,height)*.08);
  const contactStrength=emergence*Math.exp(-height*.42);
  const cx=(pos.x/FIELD_SPAN+.5)*FIELD_SIZE-.5,cz=(pos.z/FIELD_SPAN+.5)*FIELD_SIZE-.5,r=radius/FIELD_SPAN*FIELD_SIZE;
  const contactR=contactRadius/FIELD_SPAN*FIELD_SIZE,bounds=Math.max(r,contactR);
  const minX=Math.max(0,Math.floor(cx-bounds)),maxX=Math.min(FIELD_SIZE-1,Math.ceil(cx+bounds));
  const minZ=Math.max(0,Math.floor(cz-bounds)),maxZ=Math.min(FIELD_SIZE-1,Math.ceil(cz+bounds));
  for(let x=minX;x<=maxX;x++)this.xDistances[x]=(x-cx)*(x-cx);
  for(let z=minZ;z<=maxZ;z++){
   const dz2=(z-cz)*(z-cz);let index=(z*FIELD_SIZE+minX)*4;
   for(let x=minX;x<=maxX;x++,index+=4){
    const distance2=this.xDistances[x]+dz2;
    const radial=Math.sqrt(distance2)/r;
    const falloff=(surfaceOnly?0:annular?Math.exp(-(((radial-.75)/.115)**2))*(.68+.12*Math.sin(time*1.9)):Math.max(0,1-radial)**2)*strength*255;
    const red=color.r*falloff,green=color.g*falloff,blue=color.b*falloff;
    if(red>this.pixels[index])this.pixels[index]=red;
    if(green>this.pixels[index+1])this.pixels[index+1]=green;
    if(blue>this.pixels[index+2])this.pixels[index+2]=blue;
    const contact=Math.exp(-distance2/(contactR*contactR)*3.5)*contactStrength*255;
    if(contact>this.pixels[index+3])this.pixels[index+3]=contact;
   }
  }
 }
 clear(){this.dots.length=0;this.dotKeys.clear();this.aura.count=0;this.pixels.fill(0);this.field.needsUpdate=true;}
}
