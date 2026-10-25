import * as THREE from 'three';
import {floorHeight} from './arena';
import type {Ring,World} from './simulation';

const SEGMENTS=160,ROWS=8,GROUND_SLOTS=12;
const vertex=`attribute vec2 waveCoord;varying vec2 vWave;void main(){vWave=waveCoord;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`
uniform float waveAge,waveFade;varying vec2 vWave;
void main(){
 float angle=vWave.x,h=vWave.y;
 // Broad, drifting density supports a thin luminous leading foot. It never
 // becomes an opaque cylinder, and fades before the top of the mesh.
 float folds=.5+.5*sin(angle*23.+sin(angle*9.-waveAge*1.7)*1.2+h*7.);
 float filaments=pow(.5+.5*sin(angle*71.+h*11.-waveAge*2.4),10.);
 float canopy=exp(-h*4.)*(1.-smoothstep(.55,1.,h));
 float foot=exp(-pow(h/.055,2.));
 float torn=smoothstep(.18,.7,folds)*canopy;
 float opacity=(torn*.15+filaments*canopy*.12+foot*.58)*waveFade;
 vec3 tint=mix(vec3(.58,.008,.003),vec3(1.,.12,.025),foot*.65+filaments*.2);
 gl_FragColor=vec4(tint,opacity);
}`;
const dischargeVertex=`varying vec3 vNormal,vEye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vEye=-p.xyz;gl_Position=projectionMatrix*p;}`;
const dischargeFragment=`uniform float age;varying vec3 vNormal,vEye;void main(){
 float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vEye))),5.);
 float pulse=sin(clamp(age/.48,0.,1.)*3.14159265);
 gl_FragColor=vec4(vec3(1.,.035,.008),rim*pulse*pulse*.14);
}`;
function curtainGeometry(){
 const positions:number[]=[],coords:number[]=[],indices:number[]=[];
 for(let row=0;row<=ROWS;row++)for(let i=0;i<=SEGMENTS;i++){positions.push(0,0,0);coords.push(i/SEGMENTS*Math.PI*2,row/ROWS);}
 for(let row=0;row<ROWS;row++)for(let i=0;i<SEGMENTS;i++){const a=row*(SEGMENTS+1)+i,b=a+SEGMENTS+1;indices.push(a,b,a+1,a+1,b,b+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('waveCoord',new THREE.Float32BufferAttribute(coords,2));g.setIndex(indices);return g;
}
type Wave={curtain:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;discharge:THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>};
/** Match-time presentation of the actual expanding gameplay rings. No RNG,
 * collision changes, per-wave lights or effects driven by accumulated render dt. */
export class TransmutationWaves {
 private active=new Map<number,Wave>();
 private ground=Array.from({length:GROUND_SLOTS},()=>new THREE.Vector4());
 private phase=Array.from({length:GROUND_SLOTS},()=>new THREE.Vector2());
 private sourceGeometry=new THREE.SphereGeometry(2.46,48,24);
 constructor(private scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);
   shader.uniforms.transmutationFronts={value:this.ground};shader.uniforms.transmutationPhases={value:this.phase};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 transmutationFloorPosition;')
    .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
     vec4 transmutationVertex=vec4(transformed,1.);
     #ifdef USE_INSTANCING
     transmutationVertex=instanceMatrix*transmutationVertex;
     #endif
     transmutationFloorPosition=(modelMatrix*transmutationVertex).xyz;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 transmutationFloorPosition;uniform vec4 transmutationFronts[${GROUND_SLOTS}];uniform vec2 transmutationPhases[${GROUND_SLOTS}];`)
    .replace('#include <opaque_fragment>',`
     for(int i=0;i<${GROUND_SLOTS};i++){
      vec4 front=transmutationFronts[i];if(front.w<.001)continue;
      vec2 delta=transmutationFloorPosition.xz-front.xy;
      float distance=length(delta),d=distance-front.z,angle=atan(delta.y,delta.x);
      float aa=max(fwidth(distance),.035);
      float leading=exp(-pow(d/max(.09,aa),2.));
      float wake=exp(-pow((d+.72)/.85,2.));
      float ripple=pow(.5+.5*sin(d*12.+sin(angle*17.)*.65),9.)*exp(-pow((d+1.2)/1.25,2.));
      float broken=.72+.28*sin(angle*31.+transmutationPhases[i].x*1.4);
      // The tile's own texture modulates reflected light; gaps remain gaps.
      float grain=clamp(dot(outgoingLight,vec3(.333))*2.,.18,1.);
      outgoingLight+=vec3(1.,.025,.006)*(leading*.48+wake*.08+ripple*.06)*broken*front.w*grain;
     }
     #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=>key+'-transmutation-pressure-v1';
 }
 private create(id:number){
  const material=new THREE.ShaderMaterial({uniforms:{waveAge:{value:0},waveFade:{value:0}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
  const curtain=new THREE.Mesh(curtainGeometry(),material);curtain.name='transmutation-pressure-front';curtain.frustumCulled=false;curtain.renderOrder=3;
  const discharge=new THREE.Mesh(this.sourceGeometry,new THREE.ShaderMaterial({uniforms:{age:{value:0}},vertexShader:dischargeVertex,fragmentShader:dischargeFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.FrontSide}));discharge.name='transmutation-source-discharge';discharge.frustumCulled=false;
  const wave={curtain,discharge};this.active.set(id,wave);this.scene.add(curtain,discharge);return wave;
 }
 update(world:World|null,menu=false){
  for(const v of this.ground)v.set(0,0,0,0);
  const present=new Set<number>();let slot=0;
  for(const ring of menu?[]:world?.rings??[]){
   present.add(ring.id);const wave=this.active.get(ring.id)??this.create(ring.id);
   this.place(wave,ring,world!.time,world!.radius,world!.enemies.find(e=>e.id===ring.owner)?.radius??2.4);
   if(slot<GROUND_SLOTS){this.ground[slot].set(ring.pos.x,ring.pos.z,ring.radius,wave.curtain.material.uniforms.waveFade.value);this.phase[slot].set(ring.age,ring.id);slot++;}
  }
  for(const [id,wave]of this.active)if(!present.has(id)){this.release(wave);this.active.delete(id);}
 }
 private place(wave:Wave,ring:Ring,time:number,arenaRadius:number,sourceRadius:number){
  const fade=THREE.MathUtils.smoothstep(ring.age,0,.16)*(1-THREE.MathUtils.smoothstep(ring.radius,arenaRadius+2,arenaRadius+8));
  const u=wave.curtain.material.uniforms;u.waveAge.value=ring.age;u.waveFade.value=fade;
  const p=wave.curtain.geometry.getAttribute('position'),height=2.1+.5*Math.exp(-ring.age*3);
  // Sample the actual tiled surface around the ring. Constant world-space
  // thickness/height avoids the old torus growing thicker with its radius.
  for(let i=0;i<=SEGMENTS;i++){
   const angle=i/SEGMENTS*Math.PI*2,s=Math.sin(angle),c=Math.cos(angle);
   for(let row=0;row<=ROWS;row++){
    const h=row/ROWS,radius=Math.max(.01,ring.radius-Math.sin(h*Math.PI*.5)*.38),x=ring.pos.x+s*radius,z=ring.pos.z+c*radius;
    const ground=floorHeight(x,z,time),floor=Math.max(-3,ground);
    p.setXYZ(row*(SEGMENTS+1)+i,x,floor+.065+h*height,z);
   }
  }
  p.needsUpdate=true;
  wave.discharge.visible=ring.age>=0&&ring.age<.48;wave.discharge.position.set(ring.pos.x,ring.pos.y,ring.pos.z);wave.discharge.scale.setScalar(sourceRadius/2.4*(1+ring.age*.18));wave.discharge.material.uniforms.age.value=ring.age;
 }
 private release(wave:Wave){this.scene.remove(wave.curtain,wave.discharge);wave.curtain.geometry.dispose();wave.curtain.material.dispose();wave.discharge.material.dispose();}
 clear(){for(const wave of this.active.values())this.release(wave);this.active.clear();for(const v of this.ground)v.set(0,0,0,0);}
}
