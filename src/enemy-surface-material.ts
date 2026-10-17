import * as THREE from 'three';
import {ENVIRONMENT_FRAGMENT,EnvironmentLighting} from './environment-lighting';
import {enemySurfaceProfile,type EnemySurfaceProfile} from './enemy-material-profiles';
import type {EnemyKind} from './enemy-kinds';

export type EnemySurfaceRole='body'|'shell'|'metal'|'bone'|'rift'|'jewel'|'halo';
const FAMILIES=['chitin','hide','dragon','spectral','capsule','armor','rift','mineral'];
const ROLES=['body','shell','metal','bone','rift','jewel','halo'];
const FUNCTIONS=/* glsl */`
uniform vec3 eShell,eSecondary,eEdge,eMembrane,eBone,eMetal,eEye,eEnergy;
uniform float eRough,eMetalness,eScale,eRelief,eHollow,eMarking,eTime,eSurfaceStrength,eHit;
varying vec3 vEnemyP,vEnemyObjectNormal;
varying float vEnemyRegion;
float eHash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float eNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(eHash(i),eHash(i+vec3(1,0,0)),f.x),mix(eHash(i+vec3(0,1,0)),eHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(eHash(i+vec3(0,0,1)),eHash(i+vec3(1,0,1)),f.x),mix(eHash(i+vec3(0,1,1)),eHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// Ordered overlapping scutes. Half-course staggering follows the creature's
// longitudinal axis; the asymmetrical relief gives each scale a leading lip.
vec3 eScutes(vec2 p){
 vec2 q=p*vec2(eScale,eScale*1.3);q.x+=mod(floor(q.y),2.)*.5;
 vec2 cell=floor(q),f=fract(q)-.5;
 float d=max(abs(f.x)*.86+abs(f.y)*.43,abs(f.y)*.93);
 float aa=max(length(fwidth(q))*.4,.012);
 float plate=1.-smoothstep(.38-aa,.47+aa,d);
 float lip=(1.-smoothstep(.32-aa,.44+aa,d))*smoothstep(-.48,.35,f.y);
 return vec3(plate,lip,eHash(vec3(cell,7.)));
}
float eLine(float distance,float width,float aa){return 1.-smoothstep(width,width+aa,abs(distance));}
`;
const COLOR=/* glsl */`
vec3 ep=vEnemyP,mirrorP=vec3(abs(ep.x),ep.y,ep.z);
float region=floor(vEnemyRegion+.5);
float cloud=eNoise(ep*13.);
float grain=eNoise(ep*173.);
float pores=eNoise(ep*389.);
float detailFade=1.-smoothstep(.002,.024,length(fwidth(ep)));
vec3 axisWeight=pow(abs(normalize(vEnemyObjectNormal)),vec3(6.));axisWeight/=max(dot(axisWeight,vec3(1.)),.001);
vec3 scales=eScutes(ep.zy)*axisWeight.x+eScutes(ep.xz)*axisWeight.y+eScutes(ep.xy)*axisWeight.z;
float height=((grain-.5)*.035+(pores-.5)*.012)*detailFade;
float rough=eRough,metal=eMetalness;
vec3 albedo=eShell*(.86+cloud*.23+(grain-.5)*.045);
vec3 emission=vec3(0.);
float ridge=scales.y;
#if ENEMY_FAMILY == 0
 // Cuticle has overlapping scutes, waxy edges and sparse pores, never masonry.
 albedo*=.88+scales.x*.12;
 albedo=mix(albedo,eEdge,scales.y*.07);
 height+=scales.y*.24;
 rough+= (1.-scales.x)*.12+(grain-.5)*.045;
 if(eMarking>.5){
  // Authored bilateral abdomen markings; legs receive transverse joint rings.
  float dorsal=smoothstep(-.02,.19,ep.y);
  float midline=1.-smoothstep(.025,.07,abs(ep.x));
  float chevron=eLine(abs(ep.x)*.72+ep.z*.52-.035,.013,.009)+eLine(abs(ep.x)*.72+ep.z*.52+.070,.011,.009);
  float marking=max(midline*.7,clamp(chevron,0.,1.)*.75)*dorsal;
  if(eMarking>1.5&&eMarking<2.5)marking=max(marking,(1.-smoothstep(.065,.12,abs(ep.x)))*dorsal*.88);
  if(eMarking>2.5)marking=midline*dorsal*.65;
  albedo=mix(albedo,eBone*.65,marking);
  float legBand=eLine(fract((abs(ep.x)+abs(ep.z)*.6)*18.)-.5,.065,.035)*smoothstep(.15,.28,abs(ep.x));
  albedo=mix(albedo,eSecondary,legBand*.35);
 }
#elif ENEMY_FAMILY == 1
 // Dry leather: stretched tension folds and mottled pigmentation, no scale grid.
 float folds=eNoise(ep*vec3(62.,25.,78.))*2.-1.;
 float crease=1.-smoothstep(.01,.10,abs(folds+.16));
 albedo=mix(eShell*.75,eSecondary*.65,cloud*.65);
 albedo*=1.-crease*.18;
 albedo*=.88+grain*.20;
 height+=folds*.16-crease*.08+(grain-.5)*.06;rough=.62+(grain-.5)*.10;
#elif ENEMY_FAMILY == 2
 // Dorsal reptile scales and broad overlapping ventral shields.
 albedo*=.64+scales.x*.36;
 albedo=mix(albedo,eEdge,scales.y*.10);
 float ventral=(1.-smoothstep(.11,.22,abs(ep.x)))*smoothstep(.03,.15,ep.z)*(1.-smoothstep(.16,.34,ep.y));
 float shield=eLine(fract(ep.y*30.)-.5,.035,.025);
 albedo=mix(albedo,eSecondary*(.76+cloud*.27)*(1.-shield*.4),ventral);
 height+=scales.y*.42+ventral*(1.-shield)*.3;
 rough+=(1.-scales.x)*.14;
#elif ENEMY_FAMILY == 3 || ENEMY_FAMILY == 6
 // Folded wraith tissue with longitudinal capillaries and a pearlescent finish.
 float folds=sin(ep.y*74.+sin(ep.x*18.)*1.4+ep.z*31.);
 float vein=pow(.5+.5*sin(ep.y*61.+cloud*13.+ep.x*27.),22.);
 albedo=mix(eShell*.6,eSecondary*.75,cloud)*(.88+folds*.08);
 height+=folds*.14;rough=.29+(grain-.5)*.10;metal=.28;
 emission=eEnergy*vein*(.08+smoothstep(-.3,.3,ep.y)*.10);
#elif ENEMY_FAMILY == 4
 // Growth is organized pole-to-pole: ribs enclose finer branching blood vessels.
 float longitude=atan(ep.x,ep.z);
 float ribs=pow(.5+.5*cos(longitude*12.+ep.y*3.),7.);
 float vein=pow(.5+.5*sin(longitude*23.+ep.y*58.+cloud*7.),19.);
 albedo=mix(eShell*.72,eSecondary,cloud*.35+ribs*.23);
 albedo*=1.-vein*.14;
 float shellGrain=eNoise(ep*85.);albedo*=.82+shellGrain*.30;
 height+=ribs*.48-vein*.08+(shellGrain-.5)*.12;
 if(eMarking>1.5){albedo*=.73+scales.x*.27;height+=scales.y*.35;}
 rough+=ribs*.12+(shellGrain-.5)*.10;
#elif ENEMY_FAMILY == 5
 // Interlocking machined panels, polished bevels and directional abrasion.
 float brush=eNoise(ep*vec3(490.,18.,32.));
 float seam=1.-scales.x;
 albedo=mix(eShell*.8,eMetal,cloud*.36);
 #if ENEMY_ROLE == 1
  // Engraving runs along the sculpted armor; narrow scored courses follow
  // its length while the actual geometry supplies the rolled plate edges.
  float course=eLine(fract(ep.z*9.+abs(ep.x)*1.6)-.5,.018,.022);
  float edgeBand=pow(1.-abs(dot(normalize(vEnemyObjectNormal),normalize(ep+vec3(.001)))),3.);
  float etch=eLine(abs(fract(ep.x*19.+ep.z*8.)-.5)+abs(fract(ep.y*17.)-.5)-.43,.018,.025);
  albedo=mix(albedo,eEdge,edgeBand*.22);
  albedo*=1.-course*.20-etch*.055;
  height+=scales.y*.07-course*.05;
  seam=course*.35;
 #else
  albedo=mix(albedo,eEdge,scales.y*.12);height+=scales.y*.22;
 #endif
 albedo*=1.-seam*.36;
 rough+=(brush-.5)*.06;metal=max(metal,.5);
#elif ENEMY_FAMILY == 7
 // Obsidian cleavage follows the spire's vertical growth axis.
 float strata=sin(ep.x*143.+sin(ep.z*53.)*2.+ep.y*9.);
 float cleft=pow(.5+.5*strata,20.);
 albedo=mix(eShell*.55,eSecondary,cloud*.6)*(1.-cleft*.48);
 albedo*=.90+grain*.17;
 height+=strata*.13;rough=.27+cloud*.19;
 emission=eEnergy*cleft*smoothstep(.52,.76,cloud)*.18;
#endif
// Actual imported material regions override the family shell finish.
if(region>.5&&region<1.5){
 albedo=eSecondary*(.73+cloud*.4)*(1.-(1.-scales.x)*.16);
 float ventralFold=pow(.5+.5*sin(ep.y*83.+cloud*2.),10.);
 height=(grain-.5)*.025-ventralFold*.035;rough=min(.65,eRough+.14);metal*=.30;
 albedo*=1.-ventralFold*.08;
}else if(region>1.5&&region<2.5){
 // Radial spars run out from the wing root. Fine cross veins lie between them.
 vec2 wing=vec2(abs(ep.x)+.045,ep.z+.08);
 float angle=atan(wing.y,wing.x);
 float spar=pow(.5+.5*cos(angle*18.),32.);
 float crossVein=pow(.5+.5*sin(length(wing)*235.+angle*9.),28.);
 float veins=max(spar,crossVein*.22);
 albedo=eMembrane*(.70+cloud*.32)*(1.-veins*.35);
 albedo+=eEdge*(1.-veins)*.08;
 height=veins*.12+(grain-.5)*.012;rough=.46+veins*.16;metal=.16;
}else if(region>2.5&&region<3.5){
 // Worn keratin: fine lengthwise grain and accumulated growth rings.
 float fibers=eNoise(ep*vec3(280.,17.,280.));
 float rings=pow(.5+.5*sin(ep.y*290.+cloud*4.),12.);
 albedo=eBone*(.64+cloud*.24+fibers*.10)*(.74+smoothstep(-.12,.36,ep.y)*.26)*(1.-rings*.13);
 height=fibers*.05-rings*.035;rough=.43+fibers*.14;metal=.02;
}else if(region>3.5&&region<4.5){
 albedo=eShell*.075;rough=.24;metal=.10;height=0.;emission=vec3(0.);
}else if(region>4.5&&region<5.5){
 albedo=eEye*.32;rough=.14;metal=.20;height=0.;emission=eEye*(.75+cloud*.16);
}else if(region>5.5&&region<6.5){
 albedo=vec3(.15,.028,.035)*(.75+cloud*.5);rough=.27;metal=.02;height=(grain-.5)*.04;
}else if(region>6.5&&region<7.5){
 float brush=eNoise(ep*vec3(430.,11.,27.));
 float tarnish=smoothstep(.52,.77,cloud);
 vec2 engraving=fract(vec2(ep.x*24.,ep.y*26.))-.5;
 float line=eLine(abs(engraving.x)+abs(engraving.y)-.34,.018,.025);
 albedo=mix(eMetal*(.8+brush*.24),eSecondary*.3,tarnish*.6);
 albedo*=1.-line*.46;
 height=(brush-.5)*.05-line*.14;rough=.30+tarnish*.38;metal=.78-tarnish*.35;
}
#if ENEMY_ROLE == 4 || ENEMY_ROLE == 5
 // Mineral hearts: darker inclusions sit below polished facets, with a luminous
 // interior rather than a flat solid-color surface. Geometry still writes depth.
 float inclusions=smoothstep(.60,.79,eNoise(ep*52.));
 float rifts=eLine(sin(dot(ep,vec3(27.,39.,13.))),.035,.035)*smoothstep(.35,.62,cloud);
 albedo=mix(eShell*.32,eEdge*.75,cloud)*(1.-inclusions*.4);
 rough=.20;metal=.26;height=(grain-.5)*.02;
 #ifdef SERPENT_ANATOMY
 height*=.1;
 #endif
 emission=eEnergy*(.25+cloud*.26+rifts*.14);
 emission+=eEnergy*pow(max(0.,1.-length(ep)*1.6),2.)*.50;
 albedo=mix(albedo,vec3(1.,.84,.57),eHit*.8);
 emission+=vec3(1.,.79,.45)*eHit;
 #ifdef SPIDER_CRYSTAL
  // A dark jade facet with a restrained inner light. Damage remains readable
  // without turning the whole crystal into a white bloom source.
  emission=eEnergy*(.10+cloud*.13+rifts*.05)+vec3(.12,.25,.08)*eHit;
  albedo=mix(mix(eShell*.45,eEdge*.55,cloud),eEdge,eHit*.35);
 #endif
#endif
#if ENEMY_ROLE == 6
 albedo=eMetal*(.70+grain*.14);rough=.28;metal=.65;
 emission=eEnergy*.16;
#endif
// Hollow variants keep the anatomy's material boundaries and grow a cold inner
// sheen. No alpha blending or moving texture projection is needed in swarms.
if(eHollow>.5&&region<3.5){
 albedo=mix(albedo,eEdge*(.52+cloud*.23),.24);
 emission+=eEnergy*pow(.5+.5*sin(ep.y*87.+ep.x*29.+cloud*8.),24.)*.12;
}
#ifdef SERPENT_RECESS
 albedo=eShell*(.7+cloud*.3);rough=.48;metal=.15;height=(grain-.5)*.008;
#endif
albedo*=.98+pores*.025*detailFade;
diffuseColor.rgb=albedo;
`;
const NORMAL=/* glsl */`
float eWorldScale=length(dFdx(-vViewPosition))/max(length(dFdx(vEnemyP)),.00001);
float eHeight=height*detailFade;
vec3 eDx=dFdx(-vViewPosition),eDy=dFdy(-vViewPosition);
vec3 eRx=cross(eDy,normal),eRy=cross(normal,eDx);
float eDet=dot(eDx,eRx);
vec3 eGradient=sign(eDet)*(dFdx(eHeight)*eRx+dFdy(eHeight)*eRy);
normal=normalize(abs(eDet)*normal-eGradient*eRelief*eWorldScale*.6);
`;

export function createEnemySurfaceMaterial(kind:EnemyKind,role:EnemySurfaceRole,environment:EnvironmentLighting,time:{value:number},strength:{value:number},options:{green?:boolean;hit?:boolean}={}){
 const spider=kind==='spider'||kind==='spider2'||kind==='spiderling';
 const base=enemySurfaceProfile(kind),serpent=kind==='centipede'||kind==='gigapede'||kind==='ghostpede';
 const profile=serpent&&role==='body'?{...base,shell:0x101c21,secondary:0x192b2c,metalness:.12,roughness:.57}:base,p:EnemySurfaceProfile=options.green?{...profile,shell:spider?0x173a28:0x365129,edge:spider?0x60915a:0xceef94,energy:spider?0x4c843c:0x9bea52}:role==='jewel'?{...profile,shell:serpent?0x661e0b:0x8d481a,edge:serpent?0xffb85c:0xffd88a,energy:serpent?0xff772c:0xff9d43}:profile;
 const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:p.roughness,metalness:p.metalness,toneMapped:false});
 material.name=`enemy-surface-${kind}-${role}${options.green?'-green':''}${options.hit?'-hit':''}`;
 material.userData.enemySurface={kind,role,description:p.description};

 const color=(hex:number)=>({value:new THREE.Color(hex)});
 const uniforms={eShell:color(p.shell),eSecondary:color(p.secondary),eEdge:color(p.edge),eMembrane:color(p.membrane),eBone:color(p.bone),eMetal:color(p.metal),eEye:color(p.eye),eEnergy:color(p.energy),eRough:{value:p.roughness},eMetalness:{value:p.metalness},eScale:{value:p.scale},eRelief:{value:p.relief},eHollow:{value:p.hollow?1:0},eMarking:{value:p.marking??0},eTime:time,eSurfaceStrength:strength,eHit:{value:options.hit?1:0}};
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=`${spider&&role==='jewel'?'#define SPIDER_CRYSTAL\n':''}${serpent?'#define SERPENT_ANATOMY\n':''}${serpent&&role==='body'?'#define SERPENT_RECESS\n':''}#define ENEMY_FAMILY ${FAMILIES.indexOf(p.family)}\n#define ENEMY_ROLE ${ROLES.indexOf(role)}\n`+shader.fragmentShader;
  Object.assign(shader.uniforms,environment.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute vec3 creatureCoord;attribute float creatureRegion;
   varying vec3 vEnemyP,vEnemyObjectNormal;varying float vEnemyRegion;
   ${role==='body'?`attribute float motionWeight;uniform float eTime;${spider?'attribute vec4 spiderGait;':''}`:''}`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vEnemyP=creatureCoord;vEnemyObjectNormal=normal;vEnemyRegion=creatureRegion;
    ${role==='body'?`float motionPhase=0.;
    #ifdef USE_INSTANCING
    motionPhase=instanceMatrix[3].x*.7+instanceMatrix[3].z*.4;
    #endif
    ${spider?`
    float stride=eTime*${kind==='spiderling'?'19.':'3.6'}+motionPhase+spiderGait.w;
    float swing=sin(stride)*.075*spiderGait.z;
    vec2 radial=transformed.xz-spiderGait.xy;
    transformed.xz=spiderGait.xy+mat2(cos(swing),sin(swing),-sin(swing),cos(swing))*radial;
    transformed.y+=max(0.,cos(stride))*.32*spiderGait.z*${kind==='spiderling'?'.16':kind==='spider2'?'3.3':'1.65'};
    `:'transformed.y+=sin(eTime*16.+motionPhase)*motionWeight*abs(position.x)*.32;'}`:''}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+FUNCTIONS+ENVIRONMENT_FRAGMENT)
   .replace('#include <color_fragment>','#include <color_fragment>\n'+COLOR)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(rough,.16,.95);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=clamp(metal,0.,.9);')
   .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+NORMAL)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    vec3 worldSurfaceNormal=inverseTransformDirection(normal,viewMatrix);
    float surfaceRim=pow(1.-abs(dot(normal,normalize(vViewPosition))),3.);
    totalEmissiveRadiance+=environmentLight(albedo,worldSurfaceNormal)*.26+emission;
    totalEmissiveRadiance+=eEnergy*surfaceRim*(.025+eHollow*.15)*eSurfaceStrength;
    vec3 pearl=.5+.5*cos(vec3(0.,2.1,4.2)+dot(normal,normalize(vViewPosition))*6.);
    totalEmissiveRadiance+=pearl*surfaceRim*.025*eHollow;`);
  if(spider){
   const start=shader.fragmentShader.indexOf(' // Cuticle has overlapping scutes');
   const end=shader.fragmentShader.indexOf('#elif ENEMY_FAMILY == 1',start);
   shader.fragmentShader=shader.fragmentShader.slice(0,start)+`

    float striation=eNoise(ep*vec3(230.,28.,70.));
    float dorsal=smoothstep(.012,.085,ep.y);
    float stripe=eLine(abs(ep.x)*.7+ep.z*.18+.018,.008,.005)*dorsal;
    float keel=(1.-smoothstep(.008,.025,abs(ep.x)))*dorsal;
    albedo=mix(eShell*.65,eShell*1.17,cloud)*(.94+striation*.10);
    albedo=mix(albedo,eSecondary,stripe*.56+keel*.3);
    rough=.38+cloud*.17+(1.-dorsal)*.10;
    metal=.18;
    height=(striation-.5)*.10+(grain-.5)*.04;
   `+shader.fragmentShader.slice(end);
  }
 };
 material.customProgramCacheKey=()=>`enemy-authored-surfaces-v2-${p.family}-${role}-${spider?kind:serpent?'serpent':'standard'}`;
 return material;
}

/** Auxiliary primitives carry the same stable coordinates as imported anatomy.
 * Mesh transforms and instancing never move the material across the surface. */
export function prepareEnemySurfaceGeometry(geometry:THREE.BufferGeometry,role:EnemySurfaceRole){
 if(geometry.hasAttribute('creatureCoord'))return;
 geometry.computeBoundingBox();const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 const span=Math.max(size.x,size.y,size.z,.001),position=geometry.getAttribute('position'),coord=new Float32Array(position.count*3),region=new Float32Array(position.count);
 const semantic=role==='metal'||role==='halo'?7:role==='bone'?3:0;
 for(let i=0;i<position.count;i++){coord[i*3]=(position.getX(i)-center.x)/span;coord[i*3+1]=(position.getY(i)-center.y)/span;coord[i*3+2]=(position.getZ(i)-center.z)/span;region[i]=semantic;}
 geometry.setAttribute('creatureCoord',new THREE.BufferAttribute(coord,3));geometry.setAttribute('creatureRegion',new THREE.BufferAttribute(region,1));
}
