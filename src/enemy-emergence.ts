import * as THREE from 'three';
import {isPede} from './enemy-kinds';
import {towerRadius} from './enemy-presentation';
import {floorHeight} from './arena';
import type {World,Enemy,Vec} from './simulation';

const TAU=Math.PI*2,CAPACITY=2048;
const hash=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
type Exit={pos:Vec;activeAt:number;age:number};
/** Presentation follows simulation age, so pause, replay and network snapshots
 * share the same rupture. No random numbers or gameplay state are consumed. */
export class EnemyEmergence{
 private exits=new Map<number,Exit>();
 private dummy=new THREE.Object3D();private billboard=new THREE.Object3D();private color=new THREE.Color();
 private cracks:THREE.InstancedMesh;private waves:THREE.InstancedMesh;private rocks:THREE.InstancedMesh;private smoke:THREE.InstancedMesh;
 private counts=[0,0,0,0];
 private batches:THREE.InstancedMesh[]=[];
 private opacities:THREE.InstancedBufferAttribute[]=[];
 constructor(scene:THREE.Scene){
  const glow=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.48,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide});
  this.cracks=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),glow,CAPACITY);
  const noise=`
   float hashNoise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hashNoise(i),hashNoise(i+vec2(1,0)),f.x),mix(hashNoise(i+vec2(0,1)),hashNoise(i+vec2(1,1)),f.x),f.y);}
   float fbm(vec2 p){return noise(p)*.53+noise(p*2.07+13.7)*.27+noise(p*4.13+7.3)*.13+noise(p*8.31)*.07;}`;
  const vertex=`attribute vec2 emergenceParams;varying vec2 vUv;varying vec3 tint;varying vec2 params;
   void main(){vUv=uv;tint=instanceColor;params=emergenceParams;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
  // A broken, dusty pressure front replaces the bright concentric spell rings.
  const wake=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,vertexShader:vertex,fragmentShader:`
   varying vec2 vUv;varying vec3 tint;varying vec2 params;${noise}
   void main(){vec2 p=vUv*2.-1.;float n=fbm(p*5.+params.y);float r=length(p)+ (n-.5)*.3;
    float edge=smoothstep(.25,.55,r)*(1.-smoothstep(.65,1.,r));
    gl_FragColor=vec4(tint,edge*smoothstep(.28,.7,n)*params.x*.45);}`});
  this.waves=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),wake,256);
  const rubble=new THREE.IcosahedronGeometry(1,0),vertices=rubble.getAttribute('position');
  for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),jitter=.8+hash(x*31+y*57+z*91)*.35;vertices.setXYZ(i,x*jitter,y*jitter,z*jitter);}rubble.computeVertexNormals();
  this.rocks=new THREE.InstancedMesh(rubble,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.98,metalness:.02,flatShading:true}),CAPACITY);
  const mist=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,vertexShader:vertex,fragmentShader:`
   varying vec2 vUv;varying vec3 tint;varying vec2 params;${noise}
   void main(){vec2 p=vUv*2.-1.;float n=fbm(p*3.4+params.y);float r=length(p*vec2(.94,1.));
    float body=1.-smoothstep(.3,1.,r+(n-.5)*.5);
    float density=smoothstep(.18,.75,n)*body;
    vec3 light=mix(tint*.42,tint*1.45,smoothstep(-.8,.9,p.y+n*.35));
    gl_FragColor=vec4(light,density*params.x*.62);}`});
  this.smoke=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),mist,CAPACITY);
  this.batches=[this.cracks,this.waves,this.rocks,this.smoke];
  for(const mesh of this.batches){
   mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count*3).fill(1),3);
   const opacity=new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count*2),2);mesh.geometry.setAttribute('emergenceParams',opacity);this.opacities.push(opacity);
   mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
  }
 }
 private put(batch:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,rx:number,ry:number,rz:number,color:THREE.Color,opacity=1,seed=0){
  const mesh=this.batches[batch],i=this.counts[batch];if(i>=mesh.instanceMatrix.count)return;
  this.dummy.position.set(x,y,z);this.dummy.rotation.set(rx,ry,rz);this.dummy.scale.set(sx,sy,sz);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);mesh.setColorAt(i,color);this.opacities[batch].setXY(i,opacity,seed);this.counts[batch]++;
 }
 update(world:World|null,camera:THREE.Camera){
  this.counts.fill(0);const present=new Set<number>();
  for(const e of world?.enemies??[]){
   if(e.hp<=0||e.age<0)continue;
   const tower=e.kind.startsWith('squid'),snake=isPede(e.kind);if(!tower&&!snake)continue;present.add(e.id);
   let exit=this.exits.get(e.id);
   if(!exit||e.age<exit.age||exit.activeAt!==e.activeAt){
    let pos={...e.pos};
    // A viewer may first receive this enemy halfway through its breach.
    // Recover the exit from the trailing body rather than the airborne head.
    if(snake&&e.age>=e.activeAt){
     const trail=[e.pos,...e.segments.map(segment=>segment.pos)];
     for(let i=1;i<trail.length;i++)if(trail[i-1].y>=0&&trail[i].y<0){
      const a=trail[i-1],b=trail[i],u=a.y/(a.y-b.y);pos={x:a.x+(b.x-a.x)*u,y:0,z:a.z+(b.z-a.z)*u};break;
     }
    }
    exit={pos,activeAt:e.activeAt,age:e.age};this.exits.set(e.id,exit);
   }
   exit.age=e.age;
   // Keep the warning anchored beneath the head until it breaks the surface.
   if(snake&&e.age<e.activeAt)exit.pos={...e.pos};
   const elapsed=tower?e.age:e.age-e.activeAt;
   const duration=tower?3.4:Math.min(6,2+e.segments.length*.16);
   if(elapsed>=duration)continue;
   const p=tower?e.pos:exit.pos,radius=tower?towerRadius(e.kind):e.kind==='ghostpede'?3.1:e.kind==='gigapede'?2.6:1.8;
   this.rupture(e,p,elapsed,duration,radius,world!.time,camera);
  }
  for(const id of this.exits.keys())if(!present.has(id))this.exits.delete(id);
  this.batches.forEach((mesh,i)=>{this.opacities[i].needsUpdate=true;mesh.count=this.counts[i];mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;});
 }
 private rupture(e:Enemy,p:Vec,t:number,duration:number,radius:number,time:number,camera:THREE.Camera){
  const tower=e.kind.startsWith('squid'),warning=t<0;
  const anticipation=warning?THREE.MathUtils.clamp(1+t/3,0,1):1;
  const fade=warning?anticipation:Math.max(0,1-t/duration);
  const hue=e.kind==='ghostpede'?0x63ba9d:e.kind==='gigapede'?0xd99436:0xc75024;
  const ground=(x:number,z:number)=>Math.max(0,floorHeight(x,z,time,0))+.035;
  // Connected fracture paths have uneven lengths, widths and branching points.
  // Their dim incandescent edges remain close to the base rather than forming a sigil.
  for(let arm=0;arm<9;arm++){
   const seed=e.id*97+arm*17,angle=hash(seed)*TAU,length=radius*(.5+hash(seed+2)*1.1);
   let x=p.x+Math.sin(angle)*radius*.55,z=p.z+Math.cos(angle)*radius*.55;
   for(let j=0;j<5;j++){
    const direction=angle+(hash(seed+j*13)-.5)*.9,step=length*(.14+hash(seed+j+6)*.12);
    const nx=x+Math.sin(direction)*step,nz=z+Math.cos(direction)*step;
    const visible=warning?anticipation:Math.min(1,t*6+.2)*fade;
    this.color.setHex(hue).multiplyScalar(visible*(.2+hash(seed+j)*.55)*(1-j*.13));
    this.put(0,(x+nx)/2,ground((x+nx)/2,(z+nz)/2),(z+nz)/2,(.012+hash(seed+j+4)*.024)*radius,step*1.08,1,-Math.PI/2,0,-direction,this.color);
    x=nx;z=nz;
   }
  }
  if(!warning)for(let i=0;i<3;i++){
   const age=t-.12-i*.18;if(age<0||age>1.7)continue;
   const r=radius*(.85+age*1.2);this.color.setHex(0x49413a);
   this.put(1,p.x,ground(p.x,p.z)+.012*i,p.z,r,r*.9,1,-Math.PI/2,0,hash(e.id+i)*TAU,this.color,Math.sin(age/1.7*Math.PI)*fade,e.id+i*11);
  }
  // Slabs heave, break free once, then fall and settle. No looping rock fountain.
  for(let i=0;i<34;i++){
   const seed=e.id*67+i*11,angle=hash(seed)*TAU,delay=hash(seed+2)*.38;
   const age=warning?0:Math.max(0,t-delay),speed=1+hash(seed+3)*2.2;
   const launch=3+hash(seed+4)*3.2,land=launch/5.8,flight=Math.min(age,land);
   const distance=radius*(.65+hash(seed+1)*.5)+flight*speed;
   const x=p.x+Math.sin(angle)*distance,z=p.z+Math.cos(angle)*distance;
   const heave=warning?Math.sin(t*24+i*3)*.045*anticipation:Math.max(0,flight*launch-5.8*flight*flight);
   const settle=warning?1:1-THREE.MathUtils.smoothstep(t,duration*.5,duration);
   const size=(.13+hash(seed+5)*.27)*(tower?1.15:1)*settle;
   this.color.setRGB(.13,.145,.16).multiplyScalar(.7+hash(seed+8)*.7);
   this.put(2,x,ground(x,z)+heave+size*.15,z,size*(1.3+hash(seed+6)),size*.28,size*.85,flight*2.4+i,angle,flight*1.5,this.color);
  }
  // Low rolling clouds carry most of the weight; smaller wisps peel upward.
  for(let i=0;i<38;i++){
   const seed=e.id*131+i*19,angle=hash(seed)*TAU;
   const start=warning?0:Math.max(0,t-hash(seed+1)*.55),life=warning?anticipation:Math.min(1,start*5)*Math.max(0,1-start/(duration+.1));
   const roll=warning?anticipation*.12:start*.8,spread=radius*(.65+hash(seed+2)*.45)+roll*(.6+hash(seed+3));
   const x=p.x+Math.sin(angle)*spread,z=p.z+Math.cos(angle)*spread;
   const plume=i%5===0,height=warning?.08:Math.min(1.9,start*(plume?1.25:.35));
   const scale=radius*(.55+hash(seed+4)*.6)+(warning?.1:start*.65);
   this.color.setHex(0x72685e).multiplyScalar(.75+hash(seed+5)*.35);
   const look=this.billboard;look.position.set(x,ground(x,z)+height+.12,z);look.lookAt(camera.position);
   this.put(3,x,look.position.y,z,scale*(plume?.8:1.5),scale*(plume?1.2:.65),1,look.rotation.x,look.rotation.y,look.rotation.z,this.color,life*(warning?.3:.8),seed*.17+start*.12);
  }
 }
 clear(){this.exits.clear();this.counts.fill(0);for(const mesh of [this.cracks,this.waves,this.rocks,this.smoke])mesh.count=0;}
 get diagnostics(){return {exits:this.exits.size,cracks:this.counts[0],waves:this.counts[1],debris:this.counts[2],dust:this.counts[3]};}
}
