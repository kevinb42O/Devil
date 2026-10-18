import * as THREE from 'three';
import {arenaRadius,floorHeight} from './arena';
import {descentAt} from './descent';
import flame from './furnace-flame-manifest.json';
import secondary from './furnace-flame-secondary.json';
const ease=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
/** Warm stone announces the descent; fire stays outside the deck and follows its sky chapter. */
export function furnaceAt(time:number){const s=descentAt(time);return {fire:s.chapter===2?s.blend:s.chapter===3?1-s.blend:0,heat:ease((s.time-236)/30)*(1-ease((s.time-362)/48))};}
export const FURNACE_EMITTERS=Array.from({length:24},(_,i)=>{
 const r=(n:number)=>{const x=Math.sin(i*127.1+n*311.7)*43758.5453;return x-Math.floor(x);};
 const distant=i%2===1,angle=i*2.399963229728653,radius=(distant?70:47)+r(1)*(distant?8:3);
 return {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,y:distant?-16-r(2)*3:-7-r(2)*2,width:distant?32+r(3)*10:16+r(3)*6,height:distant?21+r(4)*8:11+r(4)*5,phase:r(5)};
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
/** Photographed fire, chimney smoke and outward ember currents, all beyond the platform. */
export class Furnace {
 readonly group=new THREE.Group();readonly flames:THREE.Mesh;readonly smoke:THREE.Mesh;readonly embers:THREE.Mesh;readonly abyss:THREE.Mesh;readonly convection:THREE.Mesh;private convectionAnchors=new Float32Array(56*4);
 readonly ready:Promise<void>;
 private reduced=false;private quality='high';private texture:THREE.Texture|null=null;private secondary:THREE.Texture|null=null;
 readonly uniforms={furnaceClock:{value:0},furnaceFire:{value:0},furnaceHeat:{value:0},furnaceRadius:{value:31},furnaceCamera:{value:new THREE.Vector3()},furnaceRight:{value:new THREE.Vector3(1,0,0)},furnaceUp:{value:new THREE.Vector3(0,1,0)},furnaceAtlas:{value:new THREE.Texture()},furnaceSecondary:{value:new THREE.Texture()}};
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.group.name='furnace-surround';scene.add(this.group);
  const loader=new THREE.TextureLoader();
  this.ready=Promise.all([loader.loadAsync(flame.url),loader.loadAsync(secondary.url)]).then(([a,b])=>{for(const t of [a,b]){t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;}this.texture=a;this.secondary=b;this.uniforms.furnaceAtlas.value=a;this.uniforms.furnaceSecondary.value=b;});
  const geometry=(smoke=false)=>{
   const base=new THREE.PlaneGeometry(1,1),g=new THREE.InstancedBufferGeometry(),anchors=new Float32Array(24*4),sizes=new Float32Array(24*2);g.index=base.index;g.attributes=base.attributes;
   FURNACE_EMITTERS.forEach((e,i)=>{anchors.set([e.x,e.y+(smoke?e.height*.38:0),e.z,e.phase],i*4);sizes.set([e.width*(smoke?1.6:1),e.height*(smoke?1.4:1)],i*2);});
   g.setAttribute('furnaceAnchor',new THREE.InstancedBufferAttribute(anchors,4));g.setAttribute('furnaceSize',new THREE.InstancedBufferAttribute(sizes,2));g.instanceCount=24;return g;
  };
  const fireMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:VERTEX,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
   fragmentShader:`uniform sampler2D furnaceAtlas,furnaceSecondary;uniform float furnaceClock,furnaceFire;
    varying vec2 furnaceUV;varying float furnacePhase,furnaceDistance;
    vec3 flameFrame(float frame,vec2 uv){vec2 cell=vec2(mod(frame,8.),7.-floor(frame/8.));vec2 st=(cell+mix(vec2(.016),vec2(.984),uv))/8.;return furnacePhase>.5?texture2D(furnaceSecondary,st).rgb:texture2D(furnaceAtlas,st).rgb;}
    void main(){
     float frame=mod(furnaceClock*12.*(.80+furnacePhase*.38)+furnacePhase*64.,64.);
     vec2 photoUV=furnaceUV;photoUV.x+=sin(furnaceUV.y*5.+furnaceClock*.43+furnacePhase*7.)*.009*furnaceUV.y;
     vec3 fire=mix(flameFrame(floor(frame),photoUV),flameFrame(mod(floor(frame)+1.,64.),photoUV),fract(frame));
     float edges=smoothstep(0.,.14,furnaceUV.x)*(1.-smoothstep(.86,1.,furnaceUV.x))*smoothstep(0.,.06,furnaceUV.y)*(1.-smoothstep(.83,1.,furnaceUV.y));
     float density=smoothstep(.008,.24,max(fire.r,max(fire.g,fire.b)));
     float depth=exp(-furnaceDistance*.007);
     gl_FragColor=vec4(fire*vec3(1.45,1.02,.62),density*edges*depth*furnaceFire*.48);
    }`});
  this.flames=new THREE.Mesh(geometry(),fireMaterial);this.flames.renderOrder=6;this.flames.frustumCulled=false;this.group.add(this.flames);
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
  g.setAttribute('emberSeed',new THREE.InstancedBufferAttribute(seeds,4));g.instanceCount=520;
  const emberMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`attribute vec4 emberSeed;uniform float furnaceClock,furnaceFire;uniform vec3 furnaceRight,furnaceUp;varying vec2 emberUV;varying float emberAlpha;
    void main(){float phase=fract(furnaceClock*(.06+emberSeed.z*.04)+emberSeed.w),angle=emberSeed.x*6.283+phase*.12,radius=44.+emberSeed.y*26.+phase*8.;
     vec3 p=vec3(cos(angle)*radius,-8.+phase*(22.+emberSeed.z*14.),sin(angle)*radius);
     p+=(furnaceRight*position.x+furnaceUp*position.y*(1.5+emberSeed.y))*mix(.028,.10,emberSeed.z);
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
    varying vec3 heatedStonePosition,heatedStoneNormal;uniform float furnaceHeat,furnaceClock,furnaceRadius;
    uniform sampler2D furnaceAtlas,furnaceSecondary;
    ${NOISE}
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
      vec3 warmStone=outgoingLight*vec3(1.18,.66,.36);
      outgoingLight=mix(outgoingLight,warmStone,furnaceHeat*.8*top);
      float soot=fNoise(stone*1.7);
      outgoingLight*=mix(1.,.78+.22*soot,furnaceHeat*top*.7);
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
  floor.customProgramCacheKey=()=>key+'-furnace-radiant-stone-v2';
 }
 configure(quality:string,reduced:boolean){this.quality=quality;this.reduced=reduced;(this.convection.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?56:24;for(const mesh of [this.flames,this.smoke])(mesh.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?24:16;(this.embers.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?520:180;}
 update(camera:THREE.Camera,time:number,enabled=true){
 const clock=this.reduced?0:Math.max(0,time-236);
 if(enabled&&time>236&&time<410){for(let i=0;i<56;i++){
  const angle=i*2.39996323,radius=Math.sqrt((i+.5)/56)*arenaRadius(time)*.92;
  const x=Math.cos(angle)*radius+Math.sin(clock*.14+i)*.7,z=Math.sin(angle)*radius+Math.cos(clock*.11+i)*.7;
  this.convectionAnchors.set([x,floorHeight(x,z,time,0)+.08,z,(i*.6180339)%1],i*4);
 }this.convection.geometry.getAttribute('furnaceAnchor').needsUpdate=true;}
 const state=furnaceAt(time);this.uniforms.furnaceFire.value=enabled?state.fire:0;this.uniforms.furnaceHeat.value=enabled?state.heat:0;this.uniforms.furnaceClock.value=this.reduced?0:Math.max(0,time-236);this.uniforms.furnaceRadius.value=arenaRadius(time);this.uniforms.furnaceCamera.value.copy(camera.position);this.uniforms.furnaceRight.value.setFromMatrixColumn(camera.matrixWorld,0);this.uniforms.furnaceUp.value.setFromMatrixColumn(camera.matrixWorld,1);this.group.visible=enabled&&state.fire>.001;}
 get diagnostics(){return {fire:this.uniforms.furnaceFire.value,heat:this.uniforms.furnaceHeat.value,visible:this.group.visible,loaded:!!this.texture,quality:this.quality,reduced:this.reduced,emitters:(this.flames.geometry as THREE.InstancedBufferGeometry).instanceCount,emberCount:(this.embers.geometry as THREE.InstancedBufferGeometry).instanceCount,minimumFireRadius:Math.min(...FURNACE_EMITTERS.map(e=>Math.hypot(e.x,e.z)-e.width/2)),platformRadius:this.uniforms.furnaceRadius.value,interactive:false};}
 dispose(){for(const mesh of [this.flames,this.smoke,this.embers,this.abyss,this.convection]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.texture?.dispose();this.secondary?.dispose();this.group.removeFromParent();}
}
