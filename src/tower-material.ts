import * as THREE from 'three';
import {EnvironmentLighting} from './environment-lighting';
import {CATHEDRAL_LIGHT_GLSL} from './cathedral-state';
import {VEIL_RADIANCE} from './veil-shading';

export type TowerFinish='stone'|'metal'|'interior';
const SURFACE=/* glsl */`
uniform float towerTier,towerFinish,towerCathedralLight,towerCathedralClosure,towerVeilAmount;
varying vec3 vTowerWorld;
varying vec3 vTowerP,vTowerNormal;
varying vec2 vTowerUV;
float towerHash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float towerNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(towerHash(i),towerHash(i+vec3(1,0,0)),f.x),mix(towerHash(i+vec3(0,1,0)),towerHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(towerHash(i+vec3(0,0,1)),towerHash(i+vec3(1,0,1)),f.x),mix(towerHash(i+vec3(0,1,1)),towerHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// Packed courses with individually varied blocks and bevels. World-sized units
// retain their density on the foundation as it telescopes to uneven terrain.
vec3 towerCourses(vec2 p){
 vec2 q=p/vec2(.82,.46);q.x+=mod(floor(q.y),2.)*.5;
 vec2 cell=floor(q),f=fract(q),edge=min(f,1.-f)*vec2(.82,.46);
 float joint=min(edge.x,edge.y);
 float aa=max(length(fwidth(p))*.6,.001);
 float block=smoothstep(.009-aa,.025+aa,joint);
 float bevel=smoothstep(.015,.068,joint);
 return vec3(block,bevel,towerHash(vec3(cell,2.)));
}
`;
const COLOR=/* glsl */`
vec3 towerP=vTowerP;
vec3 towerWeights=pow(abs(normalize(vTowerNormal)),vec3(8.));towerWeights/=max(dot(towerWeights,vec3(1.)),.001);
float towerCloud=towerNoise(towerP*1.7);
float towerGrain=towerNoise(towerP*39.);
float towerPore=towerNoise(towerP*113.);
vec3 towerWarp=towerP+vec3(towerNoise(towerP*5.),towerNoise(towerP*5.+13.),towerNoise(towerP*5.+37.))*.025;
vec3 towerBlocks=towerCourses(towerWarp.zy)*towerWeights.x+towerCourses(towerWarp.xz)*towerWeights.y+towerCourses(towerWarp.xy)*towerWeights.z;
vec3 towerBase=mix(vec3(.095,.12,.13),vec3(.14,.155,.16),step(1.5,towerTier));
towerBase=mix(towerBase,vec3(.18,.165,.14),step(2.5,towerTier));
vec3 towerAlbedo=towerBase*(.65+towerBlocks.z*.65+ towerCloud*.55);
float towerRough=.83,towerMetal=.035;
float towerHeight=towerBlocks.y*.7+(towerGrain-.5)*.08+(towerPore-.5)*.035;
float towerCrack=1.-smoothstep(.008,.034,abs(towerNoise(towerP*5.5+towerCloud*2.)-.48));
towerCrack*=smoothstep(.38,.72,towerNoise(towerP*2.+9.));
towerAlbedo*=.80+towerGrain*.28+towerPore*.12;
towerAlbedo=mix(towerBase*.13,towerAlbedo,towerBlocks.x);
towerAlbedo*=1.-towerCrack*.53;
// Light catches broken arrises above dark mortar, with occasional mineral flecks.
float towerArris=(1.-towerBlocks.y)*towerBlocks.x;
towerAlbedo+=vec3(.17,.145,.10)*towerArris*(.4+towerGrain*.6);
towerAlbedo+=vec3(.11,.10,.08)*smoothstep(.78,.9,towerPore)*towerBlocks.x;
float towerEngraving=0.;
if(towerFinish>.5&&towerFinish<1.5){
 vec3 copper=vec3(.39,.20,.082),patina=vec3(.035,.13,.105);
 if(towerTier>1.5)copper=vec3(.40,.31,.16);
 if(towerTier>2.5)copper=vec3(.58,.41,.17);
 float oxide=smoothstep(.43,.69,towerNoise(towerP*3.4)+towerNoise(towerP*12.)*.2);
 float scratches=towerNoise(towerP*vec3(125.,7.,8.));
 towerAlbedo=mix(copper*(.65+towerCloud*.7),patina,oxide*.82);
 towerAlbedo*=.8+scratches*.28+towerPore*.10;
 // Repeating lozenges, border rails and inset studs are engraved into the trim.
 vec2 ornament=vec2(vTowerUV.x*32.,vTowerUV.y*4.);
 vec2 tile=fract(ornament)-.5;
 float diamond=abs(abs(tile.x)+abs(tile.y)-.30);
 float aa=max(length(fwidth(ornament))*.45,.008);
 towerEngraving=1.-smoothstep(.018,.018+aa,diamond);
 float rails=1.-smoothstep(.018,.018+aa,abs(abs(fract(vTowerUV.y*2.)-.5)-.39));
 towerEngraving=max(towerEngraving,rails*.8);
 float stud=(1.-smoothstep(.065,.065+aa,length(tile)))*(1.-oxide*.4);
 towerAlbedo=mix(towerAlbedo,copper*.16,towerEngraving*.78);
 towerAlbedo+=copper*stud*.6;
 towerHeight=.35-towerEngraving*.19+(towerGrain-.5)*.07+stud*.14;
 towerRough=mix(.32,.76,oxide)+(scratches-.5)*.12;
 towerMetal=mix(.82,.24,oxide);
}else if(towerFinish>1.5){
 towerAlbedo=vec3(.016,.013,.012)*(.6+towerCloud+towerGrain*.3);
 towerHeight=(towerGrain-.5)*.08;towerRough=.97;towerMetal=0.;
}
float towerSoot=smoothstep(.57,.85,towerNoise(towerP*vec3(3.,.45,3.)+21.));
towerAlbedo*=1.-towerSoot*.30;
diffuseColor.rgb=towerAlbedo;
`;
const NORMAL=/* glsl */`
float towerDetail=1.-smoothstep(.10,.48,length(fwidth(towerP)));
float towerRelief=towerHeight*towerDetail;
vec3 towerDx=dFdx(-vViewPosition),towerDy=dFdy(-vViewPosition);
vec3 towerRx=cross(towerDy,normal),towerRy=cross(normal,towerDx);
float towerDet=dot(towerDx,towerRx);
vec3 towerGradient=sign(towerDet)*(dFdx(towerRelief)*towerRx+dFdy(towerRelief)*towerRy);
normal=normalize(abs(towerDet)*normal-towerGradient*.022);
`;

/** Shared PBR materials: relief, roughness, oxidized metal and carved ornament
 * in one surface pass. No image downloads, texture allocations or new lights. */
export function createTowerMaterial(tier:number,finish:TowerFinish,environment:EnvironmentLighting){
 const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8,metalness:0,toneMapped:false});
 material.name=`remake-tower-${tier}-${finish}`;
 material.userData.towerSurface={tier,finish};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,environment.uniforms,{towerTier:{value:tier},towerFinish:{value:finish==='stone'?0:finish==='metal'?1:2}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTowerP,vTowerNormal,vTowerWorld;varying vec2 vTowerUV;')
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vTowerP=position*vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
    vTowerNormal=normal;vTowerUV=uv;
    vTowerWorld=(modelMatrix*vec4(transformed,1.)).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+SURFACE+CATHEDRAL_LIGHT_GLSL+VEIL_RADIANCE)
   .replace('#include <color_fragment>','#include <color_fragment>\n'+COLOR)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(towerRough,.25,1.);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=towerMetal;')
   .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+NORMAL)
   .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    // The same world-space apertures illuminate the floor and the tower body.
    // Add incident diffuse light, so stone stays non-emissive and metal retains
    // its reduced diffuse response. No camera-facing readability rim.
    vec3 towerWorldNormal=inverseTransformDirection(normal,viewMatrix);
    if(towerVeilAmount>.001){
     // Sample the very same sky texture and drift as the wet arena. Rough
     // stone receives broad sky colour; metal reflects the torn cloud opening.
     vec3 towerSky=veilRadiance(normalize(towerWorldNormal+vec3(0.,.6,0.)),6.);
     reflectedLight.indirectDiffuse+=BRDF_Lambert(diffuseColor.rgb)*(1.-metalnessFactor)*towerSky*2.5*towerVeilAmount;
     vec3 towerEye=normalize(cameraPosition-vTowerWorld);
     vec3 towerReflection=reflect(-towerEye,towerWorldNormal);
     vec3 towerFresnel=mix(vec3(.04),diffuseColor.rgb,metalnessFactor);
     reflectedLight.indirectSpecular+=veilRadiance(towerReflection,2.+roughnessFactor*5.)*towerFresnel*(1.-roughnessFactor*.65)*towerVeilAmount;
    }
    if(towerCathedralLight>.001){
    float towerShaft=cathedralShaft(vTowerWorld,towerCathedralClosure)*towerCathedralLight;
    float towerFacing=max(0.,dot(towerWorldNormal,normalize(vec3(vTowerWorld.x,24.,vTowerWorld.z))));
    reflectedLight.indirectDiffuse+=BRDF_Lambert(diffuseColor.rgb)*(1.-metalnessFactor)*vec3(.30,.285,.40)*towerShaft*towerFacing;
    }`);
 };
 material.customProgramCacheKey=()=>`tower-carved-pbr-v2`;
 return material;
}

/** Opaque gemstone shading retains the exact weak-point silhouette and depth
 * behavior while adding amber inclusions, polished facets and a luminous heart. */
export function createTowerCrystalMaterial(hit=false){
 const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.19,metalness:.22,emissive:0xff891d,emissiveIntensity:hit?1.6:.65,toneMapped:false});
 material.name=hit?'remake-tower-crystal-hit':'remake-tower-crystal';
 material.onBeforeCompile=shader=>{
  shader.uniforms.towerCrystalHit={value:hit?1:0};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vAmberP;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvAmberP=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec3 vAmberP;uniform float towerCrystalHit;
   float amberHash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
   float amberNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(amberHash(i),amberHash(i+vec3(1,0,0)),f.x),mix(amberHash(i+vec3(0,1,0)),amberHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(amberHash(i+vec3(0,0,1)),amberHash(i+vec3(1,0,1)),f.x),mix(amberHash(i+vec3(0,1,1)),amberHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
   .replace('#include <color_fragment>',`#include <color_fragment>
    float amberCloud=amberNoise(vAmberP*5.);
    float amberInclusion=smoothstep(.54,.76,amberNoise(vAmberP*18.+amberCloud*2.));
    float amberVeil=pow(.5+.5*sin(vAmberP.y*29.+vAmberP.x*14.+amberCloud*8.),12.);
    vec3 amberColor=mix(vec3(.27,.054,.008),vec3(.92,.40,.065),amberCloud);
    amberColor=mix(amberColor,vec3(.12,.024,.004),amberInclusion*.55);
    amberColor+=vec3(.23,.12,.035)*amberVeil;
    diffuseColor.rgb=mix(amberColor,vec3(1.,.84,.49),towerCrystalHit*.8);`)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    totalEmissiveRadiance*=mix(vec3(.32,.13,.035),vec3(1.,.65,.23),amberCloud);
    totalEmissiveRadiance+=vec3(.42,.13,.015)*pow(max(0.,1.-length(vAmberP)*.7),2.);
    totalEmissiveRadiance+=vec3(.24,.10,.025)*amberVeil+vec3(1.,.75,.38)*towerCrystalHit;`);
 };
 material.customProgramCacheKey=()=>`tower-amber-v1`;
 return material;
}
