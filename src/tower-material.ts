import * as THREE from 'three';
import {EnvironmentLighting} from './environment-lighting';
import {CATHEDRAL_LIGHT_GLSL} from './cathedral-state';
import {VEIL_RADIANCE} from './veil-shading';

export type TowerFinish='stone'|'metal'|'interior';
const SURFACE=/* glsl */`
uniform float towerTime,towerLife,towerTier,towerFinish,towerCathedralLight,towerCathedralClosure,towerVeilAmount;
varying vec3 vTowerWorld,vTowerOrgan;
varying vec3 vTowerP,vTowerNormal;
varying vec2 vTowerUV;
float towerHash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float towerNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(towerHash(i),towerHash(i+vec3(1,0,0)),f.x),mix(towerHash(i+vec3(0,1,0)),towerHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(towerHash(i+vec3(0,0,1)),towerHash(i+vec3(1,0,1)),f.x),mix(towerHash(i+vec3(0,1,1)),towerHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
`;
const COLOR=/* glsl */`
vec3 towerP=vTowerP;
float towerCloud=towerNoise(towerP*1.7);
float towerGrain=towerNoise(towerP*39.);
float towerPore=towerNoise(towerP*113.);
// Thick striated dermis, dark venous channels and moist folds. These are
// tissue coordinates shared across merged geometry, never architectural tiles.
float fibers=sin(towerP.y*35.+towerNoise(towerP*vec3(9.,1.8,9.))*9.);
float folds=towerNoise(towerP*vec3(4.5,.7,4.5));
float veins=(1.-smoothstep(.012,.048,abs(towerNoise(towerP*2.8)-.49)))*smoothstep(.45,.7,folds);
vec3 skin=vec3(.20,.073,.064);
if(towerTier>1.5)skin=vec3(.105,.125,.10);
if(towerTier>2.5)skin=vec3(.17,.051,.059);
vec3 towerAlbedo=skin*(.65+towerCloud*.65)*(1.-veins*.36);
towerAlbedo*=.88+folds*.25+fibers*.035;
float towerRough=.57+folds*.20,towerMetal=0.;
float towerHeight=folds*.20+fibers*.022+(towerGrain-.5)*.035-veins*.10;
if(towerFinish>.5&&towerFinish<1.5){
 vec3 ivory=vec3(.40,.31,.22);
 if(towerTier>1.5)ivory=vec3(.31,.29,.20);
 if(towerTier>2.5)ivory=vec3(.36,.25,.20);
 float growth=towerNoise(towerP*vec3(17.,2.,17.));
 float stain=towerNoise(towerP*3.8);
 towerAlbedo=ivory*(.66+towerCloud*.46+growth*.13);
 towerAlbedo=mix(towerAlbedo,ivory*vec3(.33,.29,.27),smoothstep(.52,.8,stain)*.60);
 towerRough=.61+stain*.18;
 towerHeight=growth*.11+(towerPore-.5)*.03;
}else if(towerFinish>1.5){
 towerAlbedo=vec3(.025,.006,.009)*(.7+towerCloud*.4);
 towerHeight=(towerGrain-.5)*.035;towerRough=.43;towerMetal=0.;
}
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

/** Shared PBR materials: striated dermis, stained keratin and wet mouth interiors
 * in one surface pass. No image downloads, texture allocations or new lights. */
export function createTowerMaterial(tier:number,finish:TowerFinish,environment:EnvironmentLighting,clock={value:0}){
 const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8,metalness:0,toneMapped:false});
 material.name=`remake-tower-${tier}-${finish}`;
 material.userData.towerSurface={tier,finish};
 const life={value:1};material.userData.livingLight=life;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,environment.uniforms,{towerTime:clock,towerLife:life,towerTier:{value:tier},towerFinish:{value:finish==='stone'?0:finish==='metal'?1:2}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 towerOrgan;varying vec3 vTowerOrgan;varying vec3 vTowerP,vTowerNormal,vTowerWorld;varying vec2 vTowerUV;')
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vTowerOrgan=towerOrgan;
    vTowerP=position*vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
    vTowerNormal=normal;vTowerUV=uv;
    vTowerWorld=(modelMatrix*vec4(transformed,1.)).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+SURFACE+CATHEDRAL_LIGHT_GLSL+VEIL_RADIANCE)
   .replace('#include <color_fragment>','#include <color_fragment>\n'+COLOR)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    vec3 organColor=towerTier>2.5?vec3(.68,.055,.13):towerTier>1.5?vec3(.36,.48,.055):vec3(.85,.16,.035);
    float organPulse=.86+.14*sin(towerTime*1.65-vTowerOrgan.z*.75);
    float organVein=1.-smoothstep(.018,.072,abs(towerNoise(towerP*vec3(5.,2.,5.))-.49));
    float organMembrane=vTowerOrgan.x*(.62+.38*towerCloud)*(1.-organVein*.72);
    // Opaque pigmentation interrupts the light: it is contained beneath the skin.
    float organTransmission=organMembrane*organPulse;
    totalEmissiveRadiance+=organColor*organTransmission*.70*towerLife;
    // Broad, dim light absorbed by adjacent tissue and bone models the internal
    // bounce; it is tied to authored receiving anatomy rather than a global lift.
    totalEmissiveRadiance+=diffuseColor.rgb*organColor*vTowerOrgan.y*.65*organPulse*towerLife;
   `)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(towerRough,.25,1.);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=towerMetal;')
   .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+NORMAL)
   .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    // The same world-space apertures illuminate the floor and the tower body.
    // Add incident diffuse light to tissue and bone in the current environment.
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
 material.customProgramCacheKey=()=>`tower-translucent-organs-v5`;
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
