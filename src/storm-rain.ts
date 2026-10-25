import {environmentClock} from './descent';
import * as THREE from 'three';
import {ARENA_DIMENSION,ARENA_TILES,TILE_SIZE,tileHeight} from './arena';
import {rainAt} from './rain-state';
export {rainAt} from './rain-state';
const HASH=`float rainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float rainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rainHash(i),rainHash(i+vec2(1,0)),f.x),mix(rainHash(i+vec2(0,1)),rainHash(i+vec2(1,1)),f.x),f.y);}`;
export const RAIN_HIGH_COUNT=7200,RAIN_LOW_COUNT=3000;
const COMMON=`
attribute vec4 rainSeed;attribute float rainNear;
uniform float rainClock,rainAmount,rainRange;
uniform vec3 rainCamera,rainRight;
uniform sampler2D rainFloor;
varying vec2 rainUV;varying float rainAlpha;varying float rainRandom,rainAge;varying float rainWorldY;varying float rainGround;
vec3 rainAnchor(){
 vec2 nearXZ=mod(rainSeed.xy-rainCamera.xz+7.,14.)-7.+rainCamera.xz;
 vec2 xz=mix(rainSeed.xy,nearXZ,rainNear);
 vec2 tile=floor(xz/${TILE_SIZE.toFixed(8)}+25.5);
 float ground=texture2D(rainFloor,(tile+.5)/${ARENA_DIMENSION.toFixed(1)}).r;
 if(any(lessThan(tile,vec2(0)))||any(greaterThanEqual(tile,vec2(${ARENA_DIMENSION.toFixed(1)}))))ground=-1000.;
 return vec3(xz.x,ground+.025,xz.y);
}
float rainPhase(){return fract(rainClock*(.62+rainSeed.z*.25)+rainSeed.w);}
float rainVisibility(vec3 p){
 float distance=length(p.xz-rainCamera.xz);
 float nearFade=1.-smoothstep(4.,7.,distance);
 float depthFade=exp(-distance*.012);
 float threshold=smoothstep(rainSeed.z-.025,rainSeed.z+.025,rainAmount);
 return threshold*smoothstep(-8.,-1.,p.y)*mix(depthFade,nearFade,rainNear);
}
`;
/** Three bounded GPU batches plus a floor shader: no per-drop simulation or extra lights. */
export class StormRain {
 readonly group=new THREE.Group();
 readonly streaks:THREE.Mesh;readonly impacts:THREE.Mesh;readonly crowns:THREE.Mesh;
 private heights=new Float32Array(ARENA_DIMENSION*ARENA_DIMENSION);
 private heightTexture=new THREE.DataTexture(this.heights,ARENA_DIMENSION,ARENA_DIMENSION,THREE.RedFormat,THREE.FloatType);
 private quality='high';private reduced=false;private floorTick=-1;
 readonly uniforms={rainClock:{value:0},rainAmount:{value:0},rainWetness:{value:0},rainRange:{value:48},rainCamera:{value:new THREE.Vector3()},rainRight:{value:new THREE.Vector3(1,0,0)},rainFloor:{value:this.heightTexture},rainSky:{value:new THREE.Texture()},rainSkyReady:{value:0},rainSkyTravel:{value:0},rainDetail:{value:1}};
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.group.name='storm-rain';this.heightTexture.minFilter=THREE.NearestFilter;this.heightTexture.magFilter=THREE.NearestFilter;this.heightTexture.generateMipmaps=false;
  let seed=8319;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const seeds=new Float32Array(RAIN_HIGH_COUNT*4),layers=new Float32Array(RAIN_HIGH_COUNT);
  for(let i=0;i<RAIN_HIGH_COUNT;i++){
   const tile=ARENA_TILES[Math.floor(random()*ARENA_TILES.length)];
   seeds.set([(tile.x-25+random()-.5)*TILE_SIZE,(tile.z-25+random()-.5)*TILE_SIZE,random(),random()],i*4);
   layers[i]=i%5===0?1:0;
  }
  const geometry=()=>{const base=new THREE.PlaneGeometry(1,1),g=new THREE.InstancedBufferGeometry();g.index=base.index;g.attributes=base.attributes;g.setAttribute('rainSeed',new THREE.InstancedBufferAttribute(seeds,4));g.setAttribute('rainNear',new THREE.InstancedBufferAttribute(layers,1));g.instanceCount=RAIN_HIGH_COUNT;return g;};
  const make=(vertex:string,fragment:string)=>{
   const m=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    vertexShader:COMMON+vertex,fragmentShader:fragment});
   const mesh=new THREE.Mesh(geometry(),m);mesh.frustumCulled=false;mesh.renderOrder=8;this.group.add(mesh);return mesh;
  };
  this.streaks=make(`void main(){
   vec3 anchor=rainAnchor();float phase=rainPhase(),height=(1.-phase)*mix(32.,22.,rainNear);
   float gust=.105+.045*sin(rainClock*.31)+.018*sin(rainClock*.73+anchor.z*.07);
   vec3 fall=vec3(gust,-1.,.045);float length=.22+rainSeed.w*.52;
   vec3 p=anchor+vec3(-gust,1.,-.045)*height+rainRight*position.x*(.009+rainSeed.w*.010)+fall*position.y*length;
   rainUV=uv;rainWorldY=p.y;rainGround=anchor.y;
   rainAlpha=rainVisibility(anchor)*(.38+.62*rainSeed.w)*smoothstep(.55,2.,distance(p,rainCamera));
   gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
  }`,`varying vec2 rainUV;varying float rainAlpha,rainWorldY,rainGround;
  void main(){if(rainWorldY<rainGround)discard;
   float edge=pow(max(0.,1.-abs(rainUV.x*2.-1.)),1.5),tail=sin(rainUV.y*3.14159);
   float glimmer=.7+.3*sin(rainUV.y*2.4);gl_FragColor=vec4(.52,.63,.73,edge*tail*rainAlpha*.23*glimmer);
  }`);
  this.impacts=make(`void main(){
   vec3 anchor=rainAnchor();float age=rainPhase()/(.62+rainSeed.z*.25),life=age/.64;
   float radius=.018+age*.34;
   vec3 p=anchor+vec3(position.x*radius*2.,.004,position.y*radius*2.);
   rainUV=uv;rainWorldY=p.y;rainGround=anchor.y;rainAlpha=rainVisibility(anchor)*step(life,1.)*(1.-life);
   gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
  }`,`varying vec2 rainUV;varying float rainAlpha;
  void main(){float r=length(rainUV-.5)*2.;float ring=exp(-pow((r-.76)/.035,2.))+.35*exp(-pow((r-.53)/.045,2.));
   gl_FragColor=vec4(.24,.31,.37,ring*rainAlpha*.07);
  }`);
  this.crowns=make(`void main(){
   vec3 anchor=rainAnchor();float age=rainPhase()/(.62+rainSeed.z*.25),life=age/.30;
   vec3 p=anchor+rainRight*position.x*.30+vec3(0.,uv.y*.24+.006,0.);
   rainUV=uv;rainWorldY=p.y;rainGround=anchor.y;rainRandom=rainSeed.w;rainAge=life;
   rainAlpha=rainVisibility(anchor)*step(life,1.)*pow(1.-min(life,1.),1.4);
   gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
  }`,`varying vec2 rainUV;varying float rainAlpha,rainRandom,rainAge;
  void main(){vec2 p=rainUV*2.-1.;float drops=0.;
   for(int k=0;k<6;k++){
    float seed=fract(sin(float(k)*127.1+rainRandom*311.7)*43758.5);
    float angle=float(k)*2.39996+rainRandom*6.283;
    vec2 center=vec2(sin(angle)*rainAge*(.55+seed*.45),-.88+rainAge*(2.8+seed)-rainAge*rainAge*2.6);
    vec2 d=(p-center)*vec2(29.,38.);drops+=exp(-dot(d,d));
   }
   gl_FragColor=vec4(.58,.67,.74,min(drops,1.)*rainAlpha*.28);
  }`);
  scene.add(this.group);this.attachFloor(floor);this.updateHeights(0);this.group.visible=false;
 }
 private attachFloor(floor:THREE.MeshBasicMaterial){
  const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 wetPosition,wetNormal;')
    .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
    vec4 wetVertex=vec4(transformed,1.);vec3 wetN=normal;
    #ifdef USE_INSTANCING
    wetVertex=instanceMatrix*wetVertex;wetN=mat3(instanceMatrix)*wetN;
    #endif
    wetPosition=(modelMatrix*wetVertex).xyz;wetNormal=normalize(mat3(modelMatrix)*wetN);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 wetPosition,wetNormal;uniform float rainClock,rainAmount,rainWetness,rainSkyReady,rainSkyTravel,rainDetail;uniform sampler2D rainSky;
    ${HASH}`)
    .replace('#include <opaque_fragment>',`
    if(rainWetness>.001&&wetNormal.y>.65){
     vec2 p=wetPosition.xz;
     // Standing water breaks into connected low pockets, leaving rough stone islands.
     vec2 tileUV=fract(p/${TILE_SIZE.toFixed(8)}+.5);
     float mortar=1.-smoothstep(.015,.09,min(min(tileUV.x,1.-tileUV.x),min(tileUV.y,1.-tileUV.y)));
     float pools=rainNoise(p*.36)+rainNoise(p*1.12)*.24;
     float puddle=smoothstep(.57,.70,pools+rainWetness*.07)*rainWetness;
     puddle*=1.-mortar*.46;
     // A thin damp film leaves stone grain readable outside the standing water.
     outgoingLight*=1.-rainWetness*.16-puddle*.38;
     float ripple=0.;vec2 wave=vec2(0.);
     vec2 cell=floor(p*1.25-.5*rainDetail);
     for(int rx=0;rx<=1;rx++)for(int rz=0;rz<=1;rz++){
      if(rainDetail<.5&&(rx!=0||rz!=0))continue;
      vec2 id=cell+vec2(float(rx),float(rz));float rnd=rainHash(id);
      vec2 center=(id+vec2(.2+.6*rnd,.2+.6*rainHash(id+7.)))/1.25;
      vec2 delta=p-center;float r=length(delta),age=fract(rainClock*(.8+rnd*.5)+rnd);
      float front=r-age*.32;
      float envelope=exp(-abs(front)*32.)*pow(1.-age,2.)*smoothstep(0.,.06,age)*step(rnd,.72);
      float band=sin(front*105.)*envelope;
      ripple+=band;wave+=normalize(delta+vec2(.001))*cos(front*105.)*envelope*.034;
     }
     vec3 n=normalize(vec3(wave.x+sin(p.y*4.+rainClock*.6)*.004,1.,wave.y+sin(p.x*5.-rainClock*.4)*.003));
     vec3 eye=normalize(cameraPosition-wetPosition),ref=reflect(-eye,n);
     float fresnel=.025+.975*pow(1.-max(dot(n,eye),0.),5.);
     float cloud=rainNoise(ref.xz*3.5+p*.06+vec2(rainClock*.014,0.));
     float silver=smoothstep(.46,.80,cloud);
     vec3 skyReflection=mix(vec3(.022,.039,.061),vec3(.16,.21,.27),silver);
     if(rainSkyReady>.5){
      vec3 ray=normalize(vec3(ref.x,ref.y-rainSkyTravel*.12,ref.z));
      vec2 reflectionUV=vec2(fract(atan(ray.z,ray.x)*.159154943+.5),asin(clamp(ray.y,-1.,1.))*.318309886+.5);
      skyReflection=texture2D(rainSky,reflectionUV,1.4).rgb*.85;
     }
     float glint=pow(max(dot(ref,normalize(vec3(-.4,.75,-.3))),0.),80.);
     outgoingLight=mix(outgoingLight,outgoingLight*.38+skyReflection*(.16+fresnel*.84),puddle);
     outgoingLight+=puddle*vec3(.20,.26,.32)*glint*.18;
     // Fine waves change the reflected normal, rather than drawing luminous circles.
     outgoingLight+=vec3(.004,.006,.008)*ripple*puddle*rainAmount;
    }
    #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=>key+'-storm-wet-stone-v2';
 }
 configure(quality:string,reduced:boolean){this.uniforms.rainDetail.value=quality==='high'?1:0;this.quality=quality;this.reduced=reduced;for(const mesh of [this.streaks,this.impacts,this.crowns])(mesh.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?RAIN_HIGH_COUNT:RAIN_LOW_COUNT;}
 private updateHeights(time:number){
  this.heights.fill(-1000);for(const tile of ARENA_TILES)this.heights[tile.z*ARENA_DIMENSION+tile.x]=tileHeight(tile.x,tile.z,time);
  this.heightTexture.needsUpdate=true;this.floorTick=Math.floor(time*4);
 }
 setSky(texture:THREE.Texture,travel:number){this.uniforms.rainSky.value=texture;this.uniforms.rainSkyReady.value=texture.image?1:0;this.uniforms.rainSkyTravel.value=travel;}
 update(camera:THREE.Camera,time:number,enabled=true){
  const state=rainAt(time),rain=enabled?state.rain:0,wet=enabled?state.wetness:0;
  this.uniforms.rainAmount.value=rain;this.uniforms.rainWetness.value=wet;
  this.group.visible=rain>.001;
  this.uniforms.rainClock.value=(this.reduced?.35:1)*Math.max(0,environmentClock(time)-51);
  this.uniforms.rainCamera.value.copy(camera.position);this.uniforms.rainRight.value.setFromMatrixColumn(camera.matrixWorld,0);
  this.streaks.visible=!this.reduced;
  if(rain>.001&&Math.floor(time*4)!==this.floorTick)this.updateHeights(time);
 }
 get diagnostics(){return {rain:this.uniforms.rainAmount.value,wetness:this.uniforms.rainWetness.value,visible:this.group.visible,streaks:this.streaks.visible,instances:(this.streaks.geometry as THREE.InstancedBufferGeometry).instanceCount,quality:this.quality,reduced:this.reduced,coverage:'entire-arena',skyReflection:this.uniforms.rainSkyReady.value>0};}
 dispose(){for(const mesh of [this.streaks,this.impacts,this.crowns]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.heightTexture.dispose();this.group.removeFromParent();}
}
