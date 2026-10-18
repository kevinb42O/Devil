import * as THREE from 'three';
import {arenaRadius,floorHeight} from './arena';
import {descentAt} from './descent';
import flame from './furnace-flame-manifest.json';
import secondary from './furnace-flame-secondary.json';
import {createFireNoise,FIRE_VOLUME_VERTEX,FIRE_VOLUME_FRAGMENT} from './furnace-fire';
const ease=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
/** Stone heat leads the descent; decorative fire follows the furnace sky chapter. */
export function furnaceAt(time:number){const s=descentAt(time);return {fire:s.chapter===2?s.blend:s.chapter===3?1-s.blend:0,heat:ease((s.time-236)/30)*(1-ease((s.time-362)/48))};}
export const FURNACE_EMITTERS=Array.from({length:24},(_,i)=>{
 const r=(n:number)=>{const x=Math.sin(i*127.1+n*311.7)*43758.5453;return x-Math.floor(x);};
 const distant=i%2===1,angle=i*2.399963229728653,radius=(distant?70:47)+r(1)*(distant?8:3);
 return {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,y:distant?-8-r(2)*3:-3-r(2)*2,width:distant?32+r(3)*10:16+r(3)*6,height:distant?21+r(4)*8:11+r(4)*5,phase:r(5)};
});
const VERTEX=`
attribute vec4 furnaceAnchor;attribute vec2 furnaceSize;
uniform float furnaceClock,furnaceFire;uniform vec3 furnaceRight,furnaceCamera;
varying vec2 furnaceUV;varying float furnacePhase,furnaceDistance;
void main(){
 furnaceUV=uv;furnacePhase=furnaceAnchor.w;
 vec3 p=furnaceAnchor.xyz+furnaceRight*position.x*furnaceSize.x+vec3(0.,uv.y*furnaceSize.y,0.);
 furnaceDistance=distance(p,furnaceCamera);
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
const NOISE=`float fHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float fNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fHash(i),fHash(i+vec2(1,0)),f.x),mix(fHash(i+vec2(0,1)),fHash(i+vec2(1,1)),f.x),f.y);}`;
/** Turbulent fire banks, deck fires, chimney smoke and outward ember currents. */
export class Furnace {
 readonly group=new THREE.Group();readonly flames:THREE.Mesh;readonly smoke:THREE.Mesh;readonly embers:THREE.Mesh;readonly abyss:THREE.Mesh;readonly convection:THREE.Mesh;readonly deckFlames:THREE.Mesh;private emberOrigins=new Float32Array(520*4);private deckAnchors=new Float32Array(48*4);private convectionAnchors=new Float32Array(56*4);
 readonly ready:Promise<void>;
 private fireNoise=createFireNoise();private reduced=false;private quality='high';private texture:THREE.Texture|null=null;private secondary:THREE.Texture|null=null;
 readonly uniforms={fireLights:{value:Array.from({length:8},()=>new THREE.Vector4())},fireNoise:{value:this.fireNoise},fireSteps:{value:40},furnaceClock:{value:0},furnaceFire:{value:0},furnaceHeat:{value:0},furnaceRadius:{value:31},furnaceCamera:{value:new THREE.Vector3()},furnaceRight:{value:new THREE.Vector3(1,0,0)},furnaceUp:{value:new THREE.Vector3(0,1,0)},furnaceAtlas:{value:new THREE.Texture()},furnaceSecondary:{value:new THREE.Texture()}};
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.group.name='furnace-surround';scene.add(this.group);
  const loader=new THREE.TextureLoader();
  this.ready=Promise.all([loader.loadAsync(flame.url),loader.loadAsync(secondary.url)]).then(([a,b])=>{for(const t of [a,b]){t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;}this.texture=a;this.secondary=b;this.uniforms.furnaceAtlas.value=a;this.uniforms.furnaceSecondary.value=b;});
  const geometry=(smoke=false)=>{
   const base=new THREE.PlaneGeometry(1,1),g=new THREE.InstancedBufferGeometry(),anchors=new Float32Array(24*4),sizes=new Float32Array(24*2);g.index=base.index;g.attributes=base.attributes;
   FURNACE_EMITTERS.forEach((e,i)=>{anchors.set([e.x,e.y+(smoke?e.height*.38:0),e.z,e.phase],i*4);sizes.set([e.width*(smoke?1.6:1),e.height*(smoke?1.4:1.65)],i*2);});
   g.setAttribute('furnaceAnchor',new THREE.InstancedBufferAttribute(anchors,4));g.setAttribute('furnaceSize',new THREE.InstancedBufferAttribute(sizes,2));g.instanceCount=24;return g;
  };
  const fireMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:FIRE_VOLUME_VERTEX,fragmentShader:FIRE_VOLUME_FRAGMENT,transparent:true,depthWrite:false,side:THREE.BackSide,toneMapped:false});
  const fireGeometry=geometry();const box=new THREE.BoxGeometry(1,1,1);fireGeometry.index=box.index;fireGeometry.attributes.position=box.attributes.position;fireGeometry.attributes.normal=box.attributes.normal;fireGeometry.attributes.uv=box.attributes.uv;
  const bankSizes=fireGeometry.getAttribute('furnaceSize');FURNACE_EMITTERS.forEach((e,i)=>bankSizes.setXY(i,e.width*.72,e.height*1.15));
  this.flames=new THREE.Mesh(fireGeometry,fireMaterial);this.flames.renderOrder=6;this.flames.frustumCulled=false;this.group.add(this.flames);
  const deckGeometry=new THREE.InstancedBufferGeometry();deckGeometry.index=box.index;deckGeometry.attributes={...box.attributes};
  deckGeometry.setAttribute('furnaceAnchor',new THREE.InstancedBufferAttribute(this.deckAnchors,4).setUsage(THREE.DynamicDrawUsage));
  const deckSizes=new Float32Array(48*2);for(let i=0;i<48;i++){const size=.65+(i%7)*.16;deckSizes.set([size,size*(1.4+(i%3)*.25)],i*2);}
  deckGeometry.setAttribute('furnaceSize',new THREE.InstancedBufferAttribute(deckSizes,2));deckGeometry.instanceCount=48;
  this.deckFlames=new THREE.Mesh(deckGeometry,fireMaterial);this.deckFlames.frustumCulled=false;this.deckFlames.renderOrder=6;this.group.add(this.deckFlames);
  const smokeMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:VERTEX,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
   fragmentShader:`uniform float furnaceClock,furnaceFire;varying vec2 furnaceUV;varying float furnacePhase,furnaceDistance;${NOISE}
    void main(){vec2 uv=furnaceUV,p=uv*vec2(3.,4.5)+vec2(furnacePhase*31.,-furnaceClock*.21);
     float n=fNoise(p)+.45*fNoise(p*2.03+vec2(4.7,-furnaceClock*.13));
     float body=smoothstep(.40,.95,n),sides=pow(max(0.,1.-abs(uv.x*2.-1.)),1.5);
     float a=body*sides*smoothstep(0.,.10,uv.y)*(1.-smoothstep(.45,1.,uv.y))*furnaceFire*.27;
     vec3 color=mix(vec3(.018,.015,.014),vec3(.14,.038,.008),pow(1.-uv.y,3.)*.5);
     gl_FragColor=vec4(color,a*exp(-furnaceDistance*.004));
    }`});
  this.smoke=new THREE.Mesh(geometry(true),smokeMaterial);this.smoke.renderOrder=5;this.smoke.frustumCulled=false;this.group.add(this.smoke);
  const base=new THREE.PlaneGeometry(1,1),g=new THREE.InstancedBufferGeometry();g.index=base.index;g.attributes=base.attributes;
  const seeds=new Float32Array(520*4);let seed=9527;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<520;i++)seeds.set([random(),random(),random(),random()],i*4);
  g.setAttribute('emberOrigin',new THREE.InstancedBufferAttribute(this.emberOrigins,4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('emberSeed',new THREE.InstancedBufferAttribute(seeds,4));g.instanceCount=520;
  const emberMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`attribute vec4 emberSeed,emberOrigin;uniform float furnaceClock,furnaceFire;uniform vec3 furnaceRight,furnaceUp;varying vec2 emberUV;varying float emberAlpha;
    void main(){float phase=fract(furnaceClock*(.06+emberSeed.z*.04)+emberSeed.w),angle=emberSeed.x*6.283+phase*.12,radius=44.+emberSeed.y*26.+phase*8.;
     vec3 p=vec3(cos(angle)*radius,-8.+phase*(22.+emberSeed.z*14.),sin(angle)*radius);
     if(emberOrigin.w>.5){p=emberOrigin.xyz+vec3(sin(phase*7.+emberSeed.x*31.)*phase*.65,phase*(2.5+emberSeed.z*3.),cos(phase*6.+emberSeed.y*21.)*phase*.65);}
     p+=(furnaceRight*position.x+furnaceUp*position.y*(1.5+emberSeed.y))*mix(.028,.10,emberSeed.z)*mix(1.,.42,emberOrigin.w);
     emberUV=uv;emberAlpha=smoothstep(0.,.1,phase)*(1.-smoothstep(.65,1.,phase))*furnaceFire;
     gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    }`,fragmentShader:`varying vec2 emberUV;varying float emberAlpha;void main(){float r=length(emberUV-.5)*2.;gl_FragColor=vec4(1.6,.44,.055,pow(max(0.,1.-r),2.)*emberAlpha*.65);}`});
  this.embers=new THREE.Mesh(g,emberMaterial);this.embers.frustumCulled=false;this.embers.renderOrder=7;this.group.add(this.embers);
  // A continuous, depth-tested furnace below the deck unifies the photographed banks.
  const abyssMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
   vertexShader:`varying vec2 abyssUV;void main(){abyssUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform float furnaceClock,furnaceFire;varying vec2 abyssUV;${NOISE}
    void main(){vec2 uv=abyssUV;float a=uv.x*6.283185;
     // Periodic world-space turbulence closes the ring without a texture seam.
     vec2 p=vec2(cos(a),sin(a))*8.;float rise=uv.y*5.-furnaceClock*.24;
     float n=fNoise(p+vec2(rise*.3,rise))+ .5*fNoise(p*2.1-vec2(0.,furnaceClock*.43)+uv.y*9.);
     float pockets=smoothstep(.35,1.25,n),base=pow(1.-uv.y,1.7);
     vec3 glow=mix(vec3(.11,.012,.001),vec3(1.1,.24,.012),pockets)*base;
     float opacity=(1.-smoothstep(.35,1.,uv.y))*.82*furnaceFire;
     gl_FragColor=vec4(glow,opacity);
    }`});
  this.abyss=new THREE.Mesh(new THREE.CylinderGeometry(43,46,26,96,1,true),abyssMaterial);this.abyss.position.y=-17;this.abyss.renderOrder=4;this.group.add(this.abyss);
  const hazeGeometry=new THREE.InstancedBufferGeometry();hazeGeometry.index=base.index;hazeGeometry.attributes=base.attributes;
  hazeGeometry.setAttribute('furnaceAnchor',new THREE.InstancedBufferAttribute(this.convectionAnchors,4).setUsage(THREE.DynamicDrawUsage));
  const hazeSizes=new Float32Array(56*2);for(let i=0;i<56;i++)hazeSizes.set([4.5+(i%5)*.6,.45+(i%4)*.17],i*2);
  hazeGeometry.setAttribute('furnaceSize',new THREE.InstancedBufferAttribute(hazeSizes,2));hazeGeometry.instanceCount=56;
  const hazeMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:VERTEX,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
   fragmentShader:`uniform float furnaceClock,furnaceHeat;varying vec2 furnaceUV;varying float furnacePhase,furnaceDistance;${NOISE}
    void main(){vec2 uv=furnaceUV;vec2 p=uv*vec2(5.,2.)+vec2(-furnaceClock*.3,furnacePhase*61.);
     float curl=fNoise(p)+.45*fNoise(p*2.1+furnaceClock*.09);
     float edges=pow(max(0.,sin(uv.x*3.14159)),2.)*pow(max(0.,sin(uv.y*3.14159)),1.5);
     float body=smoothstep(.48,1.1,curl)*edges;
     float near=smoothstep(.6,3.,furnaceDistance);
     gl_FragColor=vec4(mix(vec3(.12,.105,.09),vec3(.30,.19,.10),curl*.5),body*furnaceHeat*.16*near);
    }`});
  this.convection=new THREE.Mesh(hazeGeometry,hazeMaterial);this.convection.frustumCulled=false;this.convection.renderOrder=8;this.group.add(this.convection);
  this.attachFloor(floor);this.group.visible=false;
 }
 private attachFloor(floor:THREE.MeshBasicMaterial){
  const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 heatedStonePosition,heatedStoneNormal;')
    .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
     vec4 hotVertex=vec4(transformed,1.);vec3 hotNormal=normal;
     #ifdef USE_INSTANCING
     hotVertex=instanceMatrix*hotVertex;hotNormal=mat3(instanceMatrix)*hotNormal;
     #endif
     heatedStonePosition=(modelMatrix*hotVertex).xyz;heatedStoneNormal=normalize(mat3(modelMatrix)*hotNormal);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 heatedStonePosition,heatedStoneNormal;uniform float furnaceHeat,furnaceClock,furnaceRadius,furnaceFire;uniform vec4 fireLights[8];
    uniform sampler2D furnaceAtlas,furnaceSecondary;
    ${NOISE}
    // World-space fractured basalt: stable seams with animated light beneath.
    float furnaceCrack(vec2 p){
     p+=vec2(fNoise(p*2.8),fNoise(p*2.8+31.))*.23;
     p+=vec2(fNoise(p*13.),fNoise(p*13.+17.))*.055;
     vec2 cell=floor(p),local=fract(p);float first=9.,second=9.;
     for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec2 offset=vec2(float(x),float(y));vec2 id=cell+offset;
      vec2 point=offset+vec2(fHash(id),fHash(id+47.))*.76+.12-local;
      float d=dot(point,point);if(d<first){second=first;first=d;}else{second=min(second,d);}
     }
     return sqrt(second)-sqrt(first);
    }
    vec3 heatedReflection(vec2 uv,float frame){vec2 cell=vec2(mod(frame,8.),7.-floor(frame/8.));return texture2D(furnaceAtlas,(cell+mix(vec2(.025),vec2(.975),clamp(uv,0.,1.)))/8.).rgb;}`)
    .replace('#include <opaque_fragment>',`
     if(furnaceHeat>.001){
      float distanceToRim=length(heatedStonePosition.xz),rim=smoothstep(furnaceRadius-8.,furnaceRadius+1.,distanceToRim);
      float flicker=.86+.08*sin(furnaceClock*3.7)+.06*sin(furnaceClock*6.1+heatedStonePosition.x*.13);
      float grain=clamp(dot(diffuseColor.rgb,vec3(.333))*3.,.15,1.);
      vec2 stone=heatedStonePosition.xz;
      float turbulence=fNoise(stone*.35+vec2(furnaceClock*.14,-furnaceClock*.21));
      float wash=fNoise(stone*.16+vec2(-furnaceClock*.27,furnaceClock*.11));
      float sweep=smoothstep(.18,.82,turbulence*.55+wash*.65);
      float top=smoothstep(.4,.8,heatedStoneNormal.y);
      vec3 warmStone=outgoingLight*vec3(.48,.30,.25);
      outgoingLight=mix(outgoingLight,warmStone,furnaceHeat*.8*top);
      float soot=fNoise(stone*1.7);
      outgoingLight*=mix(1.,.48+.38*soot,furnaceHeat*top*.85);
      float firelight=0.;
      for(int i=0;i<8;i++){vec2 delta=stone-fireLights[i].xy;firelight+=fireLights[i].z*exp(-dot(delta,delta)*fireLights[i].w);}
      outgoingLight+=vec3(.48,.10,.012)*firelight*furnaceFire*top*(.45+.55*grain);
      float seam=furnaceCrack(stone*.58);
      float seamAA=max(fwidth(seam)*.6,.002);
      float fissure=(1.-smoothstep(.004,.024+seamAA,seam))*.024/(.024+seamAA*.5);
      float halo=exp(-seam*12.);
      float molten=.72+.28*sin(furnaceClock*1.9+fNoise(stone*.4)*8.);
      outgoingLight*=1.-furnaceHeat*top*halo*.55;
      outgoingLight+=furnaceHeat*top*molten*(vec3(1.15,.12,.002)*fissure+vec3(.19,.018,.001)*halo);
      // Broad, turbulent incident firelight travels over the stone grain.
      outgoingLight+=vec3(.25,.065,.009)*furnaceHeat*flicker*(.15+sweep*sweep*2.)*(.40+.60*rim)*grain*top;
      vec3 eye=normalize(cameraPosition-heatedStonePosition);
      vec3 reflectedRay=reflect(-eye,normalize(heatedStoneNormal));
      float aa=dot(reflectedRay.xz,reflectedRay.xz);
      float bb=dot(stone,reflectedRay.xz);
      float rayDistance=(-bb+sqrt(max(0.,bb*bb-aa*(dot(stone,stone)-47.*47.))))/max(.001,aa);
      vec3 hit=heatedStonePosition+reflectedRay*rayDistance;
      float angle=atan(hit.z,hit.x);
      vec2 photoUV=vec2(fract(angle*1.91),clamp((hit.y+9.)/21.,.06,.94));
      float frame=mod(furnaceClock*12.,64.);
      vec3 radiance=mix(heatedReflection(photoUV,floor(frame)),heatedReflection(photoUV,mod(floor(frame)+1.,64.)),fract(frame));
      float grazing=pow(1.-max(dot(normalize(heatedStoneNormal),eye),0.),2.);
      // The reflection is broken by dry mineral grain, rather than a glossy water film.
      float mineral=smoothstep(.18,.72,grain)*(.45+.55*fNoise(stone*13.));
      outgoingLight+=radiance*vec3(1.1,.66,.3)*grazing*mineral*furnaceHeat*.75*top;
      // Pale ash skims the deck: tiny neutral flecks, never glowing sparks or fire patches.
      vec2 ash=stone*7.+vec2(furnaceClock*.56,furnaceClock*.21);
      vec2 ashCell=floor(ash);vec2 ashLocal=fract(ash)-.5;
      float dust=step(.965,fHash(ashCell))*exp(-dot(ashLocal,ashLocal)*110.);
      outgoingLight+=vec3(.14,.11,.085)*dust*furnaceHeat*top*(.5+.5*sweep);
      // Incandescence belongs to the outer cut stone, below the traversable deck.
      outgoingLight+=vec3(.23,.038,.003)*rim*furnaceHeat*(1.-top)*flicker;
     }
     #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=>key+'-furnace-volumetric-light-v4';
 }
 configure(quality:string,reduced:boolean){this.quality=quality;this.reduced=reduced;this.uniforms.fireSteps.value=quality==='high'?40:24;(this.deckFlames.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?48:28;(this.convection.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?56:24;for(const mesh of [this.flames,this.smoke])(mesh.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?24:16;(this.embers.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?520:180;}
 update(camera:THREE.Camera,time:number,enabled=true){
 const clock=this.reduced?0:Math.max(0,time-236);
 if(enabled&&time>236&&time<410){
 for(let i=0;i<48;i++){
  const angle=i*2.39996323+.7,radius=Math.sqrt((i+.5)/48)*arenaRadius(time)*.94;
  const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
  this.deckAnchors.set([x,floorHeight(x,z,time,0)+.015,z,(i*.75487766)%1],i*4);
 }
 this.deckFlames.geometry.getAttribute('furnaceAnchor').needsUpdate=true;
 for(let i=0;i<520;i+=3){const n=((i/3)%48)*4;this.emberOrigins.set([this.deckAnchors[n],this.deckAnchors[n+1]+.16,this.deckAnchors[n+2],1],i*4);}
 this.embers.geometry.getAttribute('emberOrigin').needsUpdate=true;
 const nearest=Array.from({length:48},(_,i)=>i).sort((a,b)=>{
  const distance=(i:number)=>(this.deckAnchors[i*4]-camera.position.x)**2+(this.deckAnchors[i*4+2]-camera.position.z)**2;
  return distance(a)-distance(b);
 });
 for(let i=0;i<8;i++){const n=nearest[i],flicker=.85+.15*Math.sin(clock*5.7+n*13.1);this.uniforms.fireLights.value[i].set(this.deckAnchors[n*4],this.deckAnchors[n*4+2],flicker,.32);}

 for(let i=0;i<56;i++){
  const angle=i*2.39996323,radius=Math.sqrt((i+.5)/56)*arenaRadius(time)*.92;
  const x=Math.cos(angle)*radius+Math.sin(clock*.14+i)*.7,z=Math.sin(angle)*radius+Math.cos(clock*.11+i)*.7;
  this.convectionAnchors.set([x,floorHeight(x,z,time,0)+.08,z,(i*.6180339)%1],i*4);
 }this.convection.geometry.getAttribute('furnaceAnchor').needsUpdate=true;}
 const state=furnaceAt(time);this.uniforms.furnaceFire.value=enabled?state.fire:0;this.uniforms.furnaceHeat.value=enabled?state.heat:0;this.uniforms.furnaceClock.value=this.reduced?0:Math.max(0,time-236);this.uniforms.furnaceRadius.value=arenaRadius(time);this.uniforms.furnaceCamera.value.copy(camera.position);this.uniforms.furnaceRight.value.setFromMatrixColumn(camera.matrixWorld,0);this.uniforms.furnaceUp.value.setFromMatrixColumn(camera.matrixWorld,1);this.group.visible=enabled&&state.fire>.001;}
 get diagnostics(){return {fire:this.uniforms.furnaceFire.value,heat:this.uniforms.furnaceHeat.value,visible:this.group.visible,loaded:!!this.texture,quality:this.quality,reduced:this.reduced,emitters:(this.flames.geometry as THREE.InstancedBufferGeometry).instanceCount,fireTechnique:'ray-marched-volume',fireSteps:this.uniforms.fireSteps.value,deckEmitters:(this.deckFlames.geometry as THREE.InstancedBufferGeometry).instanceCount,emberCount:(this.embers.geometry as THREE.InstancedBufferGeometry).instanceCount,minimumFireRadius:Math.min(...FURNACE_EMITTERS.map(e=>Math.hypot(e.x,e.z)-e.width/2)),platformRadius:this.uniforms.furnaceRadius.value,interactive:false};}
 dispose(){const materials=new Set<THREE.Material>();for(const mesh of [this.flames,this.deckFlames,this.smoke,this.embers,this.abyss,this.convection]){mesh.geometry.dispose();materials.add(mesh.material as THREE.Material);}for(const material of materials)material.dispose();this.fireNoise.dispose();this.texture?.dispose();this.secondary?.dispose();this.group.removeFromParent();}
}
