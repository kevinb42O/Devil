import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createDescentState,descentAt} from './descent';

const FIELD=`
float spaceHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float spaceNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(spaceHash(i),spaceHash(i+vec2(1,0)),f.x),mix(spaceHash(i+vec2(0,1)),spaceHash(i+vec2(1)),f.x),f.y);}
float spaceField(vec2 p){return spaceNoise(p)*.57+spaceNoise(p*2.07+7.)*.28+spaceNoise(p*4.13-3.)*.15;}
`;
const PLANET_POSITION=new THREE.Vector3(-82,64,-124);
const PLANET_RADIUS=21;
const RING_NORMAL=new THREE.Vector3(.12,.82,.56).normalize();
const SUN_DIRECTION=new THREE.Vector3(-.78,.38,.49).normalize();
const ORBIT_LIGHT=`
uniform vec3 orbitalSun,orbitalPlanet,orbitalRingNormal;
uniform float orbitalRadius;
float orbitalShadow(vec3 p){
 vec3 toPlanet=orbitalPlanet-p;float along=dot(toPlanet,orbitalSun);
 float separation=length(toPlanet-orbitalSun*along);
 return mix(1.,smoothstep(orbitalRadius*.96,orbitalRadius*1.04,separation),step(0.,along));
}
`;

/** Orbital set dressing and a world-anchored mineral surface. All motion is replay-clock driven. */
export class CosmicEnvironment {
 readonly group=new THREE.Group();
 private state=createDescentState();
 private reduced=false;private quality='high';
 readonly uniforms={spaceAmount:{value:0},spaceClock:{value:0},spaceTravel:{value:0},spaceCamera:{value:new THREE.Vector3()},spaceSky:{value:new THREE.Texture()},orbitalSun:{value:SUN_DIRECTION},orbitalPlanet:{value:PLANET_POSITION},orbitalRadius:{value:PLANET_RADIUS},orbitalRingNormal:{value:RING_NORMAL}};
 private debris:THREE.InstancedMesh;
 private dust:THREE.Points;
 private meteors:THREE.Mesh;
 private dummy=new THREE.Object3D();
 private seeds:{radius:number;angle:number;y:number;scale:number;spin:number}[]=[];
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.group.name='cosmic-environment';scene.add(this.group);this.group.visible=false;
  this.attachFloor(floor);
  let seed=32917;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const rock=new THREE.IcosahedronGeometry(1,2),positions=rock.attributes.position;
  for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);const scale=.83+.15*Math.sin(x*7+y*9+z*5)+.07*Math.sin(x*23-y*17+z*11);positions.setXYZ(i,x*scale,y*scale,z*scale);}
  rock.deleteAttribute('normal');rock.deleteAttribute('uv');const smoothRock=mergeVertices(rock);smoothRock.computeVertexNormals();rock.dispose();
  const debrisMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:`varying vec3 rockNormal,rockPosition,rockLocal;void main(){mat3 m=mat3(instanceMatrix);rockNormal=normalize(m*(normal/vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2]))));vec4 p=instanceMatrix*vec4(position,1.);rockPosition=p.xyz;rockLocal=position;gl_Position=projectionMatrix*modelViewMatrix*p;}`,
   fragmentShader:`uniform float spaceAmount;uniform vec3 spaceCamera;varying vec3 rockNormal,rockPosition,rockLocal;${FIELD}${ORBIT_LIGHT}
   void main(){vec3 n=normalize(rockNormal),v=normalize(spaceCamera-rockPosition);float light=max(0.,dot(n,orbitalSun));float grain=spaceField(rockLocal.xy*3.+rockLocal.z*2.);float pits=smoothstep(.32,.58,grain);float vein=pow(max(0.,1.-abs(grain-.5)*35.),3.);float rim=pow(1.-max(0.,dot(n,v)),3.);vec3 c=vec3(.003,.005,.009)+mix(vec3(.065,.071,.09),vec3(.14,.13,.12),grain)*light*(.4+pits*.6);c+=vec3(.02,.045,.07)*rim*(.3+.7*light);c+=vec3(.015,.07,.10)*vein*(.25+light);gl_FragColor=vec4(c,spaceAmount);}`,transparent:true,toneMapped:false});
  this.debris=new THREE.InstancedMesh(smoothRock,debrisMaterial,180);this.debris.name='orbital-fragments';this.debris.frustumCulled=false;this.group.add(this.debris);
  for(let i=0;i<180;i++)this.seeds.push({radius:62+random()*47,angle:random()*Math.PI*2,y:-18+random()*53,scale:.18+Math.pow(random(),2.6)*3.8,spin:random()*6.28});
  const points=new Float32Array(700*3),phases=new Float32Array(700);
  for(let i=0;i<700;i++){points.set([(random()-.5)*124,-5+random()*42,(random()-.5)*124],i*3);phases[i]=random();}
  const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(points,3));dustGeometry.setAttribute('phase',new THREE.BufferAttribute(phases,1));
  this.dust=new THREE.Points(dustGeometry,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`uniform float spaceClock;attribute float phase;varying float alpha;void main(){vec3 p=position;p.y=mod(p.y+spaceClock*(.13+phase*.18)+5.,47.)-5.;p.x+=sin(spaceClock*.04+phase*30.)*.6;vec4 v=modelViewMatrix*vec4(p,1.);alpha=(.25+phase*.65)*smoothstep(1.,5.,-v.z);gl_Position=projectionMatrix*v;gl_PointSize=clamp((25.+phase*35.)/max(1.,-v.z),1.,3.);}`,
   fragmentShader:`uniform float spaceAmount;varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.38,.65,1.,pow(max(0.,1.-r),3.)*alpha*spaceAmount*.48);}`}));
  this.dust.name='orbital-dust';this.dust.frustumCulled=false;this.group.add(this.dust);
  const planetVertex=`varying vec3 planetNormal,planetPosition,planetLocal;
   void main(){vec4 world=modelMatrix*vec4(position,1.);planetPosition=world.xyz;planetNormal=normalize(mat3(modelMatrix)*normal);planetLocal=normal;gl_Position=projectionMatrix*viewMatrix*world;}`;
  const planetGeometry=new THREE.SphereGeometry(PLANET_RADIUS,96,64);
  const planet=new THREE.Mesh(planetGeometry,new THREE.ShaderMaterial({uniforms:this.uniforms,toneMapped:false,transparent:true,
   vertexShader:planetVertex,
   fragmentShader:`uniform float spaceAmount,spaceClock;uniform vec3 spaceCamera;varying vec3 planetNormal,planetPosition,planetLocal;${FIELD}${ORBIT_LIGHT}
   void main(){
    vec3 n=normalize(planetNormal),v=normalize(spaceCamera-planetPosition),local=normalize(planetLocal);
    float sun=dot(n,orbitalSun),light=smoothstep(-.09,.75,sun);
    // Latitude bands shear the cloud field; a local vortex curls the lower belt.
    vec2 p=vec2(local.x*9.+local.z*3.+spaceClock*.003,local.y*24.);
    vec2 storm=(vec2(local.x,local.y)-vec2(-.18,-.22))*vec2(1.,2.8);
    float stormRadius=length(storm),curl=exp(-stormRadius*stormRadius*26.);
    p.x+=sin(local.y*38.)*.65+spaceNoise(local.xz*12.)*.9;
    p+=vec2(-storm.y,storm.x)*curl*10.;
    float clouds=spaceField(p),fine=spaceNoise(p*4.1);
    float belt=.5+.5*sin(local.y*49.+clouds*4.+curl*2.);
    vec3 gas=mix(vec3(.075,.13,.19),vec3(.29,.36,.40),smoothstep(.2,.8,clouds));
    gas=mix(gas,vec3(.23,.19,.15),smoothstep(.68,.95,belt)*.42);
    gas*=.65+.35*belt;gas+=vec3(.028,.033,.035)*(fine-.5);
    // The rings cast a soft shadow onto the sunlit hemisphere.
    float plane=dot(orbitalSun,orbitalRingNormal);
    float t=-dot(planetPosition-orbitalPlanet,orbitalRingNormal)/plane;
    float ringRadius=length(planetPosition+orbitalSun*max(0.,t)-orbitalPlanet);
    float ringShadow=smoothstep(26.,28.,ringRadius)*(1.-smoothstep(37.,39.,ringRadius))*step(0.,t);
    float facing=max(0.,dot(n,v)),rim=pow(1.-facing,3.5);
    vec3 c=gas*(.012+light*(1.-ringShadow*.56));
    c+=vec3(.055,.22,.38)*rim*smoothstep(-.22,.45,sun)*.7;
    c+=vec3(.18,.12,.065)*exp(-abs(sun)*20.)*light;
    gl_FragColor=vec4(c,spaceAmount);
   }`}));
  planet.name='ringed-planet';planet.position.copy(PLANET_POSITION);planet.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),RING_NORMAL);this.group.add(planet);
  const atmosphere=new THREE.Mesh(planetGeometry,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:planetVertex,
   fragmentShader:`uniform float spaceAmount;uniform vec3 spaceCamera;varying vec3 planetNormal,planetPosition;${ORBIT_LIGHT}
    void main(){vec3 n=normalize(planetNormal),v=normalize(spaceCamera-planetPosition);float edge=pow(max(0.,1.-abs(dot(n,v))),7.);float sunlight=smoothstep(-.25,.5,dot(n,orbitalSun));gl_FragColor=vec4(mix(vec3(.025,.11,.25),vec3(.16,.42,.62),sunlight),edge*sunlight*spaceAmount*.48);}`}));
  atmosphere.name='planet-atmosphere';atmosphere.position.copy(PLANET_POSITION);atmosphere.scale.setScalar(1.025);this.group.add(atmosphere);
  const ring=new THREE.Mesh(new THREE.RingGeometry(26.5,39,192),new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,
   vertexShader:`varying vec3 ringPosition,ringWorld;void main(){ringPosition=position;vec4 world=modelMatrix*vec4(position,1.);ringWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
   fragmentShader:`uniform float spaceAmount;varying vec3 ringPosition,ringWorld;${FIELD}${ORBIT_LIGHT}
    void main(){float r=length(ringPosition.xy);float edge=smoothstep(26.5,27.4,r)*(1.-smoothstep(37.8,39.,r));
     float grain=spaceNoise(vec2(r*16.,0.)),bands=.36+.18*sin(r*2.4)+.08*sin(r*9.4)+.08*grain;
     bands*=smoothstep(.14,.40,abs(r-32.8));bands*=.68+.32*smoothstep(.08,.20,abs(r-35.4));
     float shadow=orbitalShadow(ringWorld);vec3 tint=mix(vec3(.075,.12,.17),vec3(.28,.25,.20),smoothstep(28.,38.,r));
     gl_FragColor=vec4(tint*(.12+.88*shadow),edge*bands*spaceAmount*.84);
    }`}));
  ring.name='planet-rings';ring.position.copy(PLANET_POSITION);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),RING_NORMAL);this.group.add(ring);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(5.2,48,32),new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,toneMapped:false,
   vertexShader:planetVertex,
   fragmentShader:`uniform float spaceAmount;uniform vec3 spaceCamera;varying vec3 planetNormal,planetPosition,planetLocal;${FIELD}${ORBIT_LIGHT}
    void main(){vec3 n=normalize(planetNormal),v=normalize(spaceCamera-planetPosition);float terrain=spaceField(planetLocal.xy*17.+planetLocal.z*7.);float craters=spaceNoise(planetLocal.xz*48.);float light=smoothstep(-.015,.85,dot(n,orbitalSun));vec3 c=mix(vec3(.075,.067,.061),vec3(.25,.22,.18),terrain)*(.6+.4*craters)*light;c+=vec3(.018,.028,.042)*pow(1.-max(0.,dot(n,v)),4.)*light;gl_FragColor=vec4(c,spaceAmount);}`}));
  moon.name='distant-moon';moon.position.set(70,29,-121);this.group.add(moon);

  const meteorGeometry=new THREE.InstancedBufferGeometry(),quad=new THREE.PlaneGeometry(1,1);
  meteorGeometry.index=quad.index;meteorGeometry.attributes=quad.attributes;
  const meteorSeeds=new Float32Array(6*4);for(let i=0;i<6;i++)meteorSeeds.set([-80+random()*160,27+random()*39,-85-random()*38,random()],i*4);
  meteorGeometry.setAttribute('meteorSeed',new THREE.InstancedBufferAttribute(meteorSeeds,4));meteorGeometry.instanceCount=6;
  this.meteors=new THREE.Mesh(meteorGeometry,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`attribute vec4 meteorSeed;uniform float spaceClock;uniform vec3 spaceCamera;varying vec2 meteorUV;varying float meteorAlpha;
    void main(){float age=spaceClock-(2.+meteorSeed.w*23.);float life=clamp(age/2.2,0.,1.);vec3 direction=normalize(vec3(-1.,-.26,.12));vec3 head=meteorSeed.xyz+direction*max(0.,age)*15.;vec3 right=normalize(cross(direction,normalize(spaceCamera-head)));vec3 p=head-direction*(1.-uv.x)*9.+right*position.y*max(.10,distance(spaceCamera,head)*.002)*(.25+.75*uv.x);meteorUV=uv;meteorAlpha=smoothstep(0.,.15,life)*(1.-smoothstep(.45,1.,life));gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
   fragmentShader:`uniform float spaceAmount;varying vec2 meteorUV;varying float meteorAlpha;void main(){float across=pow(max(0.,1.-abs(meteorUV.y*2.-1.)),2.);float tail=pow(meteorUV.x,2.);gl_FragColor=vec4(.42,.66,.9,across*tail*meteorAlpha*spaceAmount*.6);}`}));
  this.meteors.name='orbital-shooting-stars';this.meteors.frustumCulled=false;this.group.add(this.meteors);
 }
 private attachFloor(floor:THREE.MeshBasicMaterial){
  const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 spacePosition,spaceNormal;').replace('#include <project_vertex>',`#include <project_vertex>
    vec4 spaceVertex=vec4(transformed,1.);vec3 spaceN=normal;
    #ifdef USE_INSTANCING
    spaceVertex=instanceMatrix*spaceVertex;spaceN=mat3(instanceMatrix)*spaceN;
    #endif
    spacePosition=(modelMatrix*spaceVertex).xyz;spaceNormal=normalize(mat3(modelMatrix)*spaceN);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    uniform float spaceAmount,spaceClock,spaceTravel;uniform vec3 spaceCamera;uniform sampler2D spaceSky;varying vec3 spacePosition,spaceNormal;${FIELD}${ORBIT_LIGHT}`)
    .replace('#include <map_fragment>',`#include <map_fragment>
    // Darken the mineral albedo before gem, projectile, and upgrade lights are added.
    float orbitalMineral=0.;
    if(spaceAmount>.001){
     orbitalMineral=spaceField(spacePosition.xz*.31);
     vec3 mineralAlbedo=mix(diffuseColor.rgb,vec3(.12+orbitalMineral*.07),.82)*mix(vec3(.10,.15,.24),vec3(.21,.26,.34),orbitalMineral);
     diffuseColor.rgb=mix(diffuseColor.rgb,mineralAlbedo,spaceAmount);
    }`)
    .replace('#include <opaque_fragment>',`
    if(spaceAmount>.001){
     vec2 p=spacePosition.xz;vec3 n=normalize(spaceNormal),v=normalize(spaceCamera-spacePosition);
     float mineral=orbitalMineral,grain=spaceNoise(p*8.);
     // Distances between irregular crystal cells make angular, connected faults.
     vec2 crystal=p*.48,crystalCell=floor(crystal),crystalUV=fract(crystal),facet=vec2(0.);float nearest=8.,second=8.;
     for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
      vec2 offset=vec2(float(x),float(y)),id=crystalCell+offset;
      vec2 site=offset+vec2(.15)+vec2(spaceHash(id),spaceHash(id+19.))*.7-crystalUV;
      float d=dot(site,site);if(d<nearest){second=nearest;nearest=d;facet=id;}else second=min(second,d);
     }
     float fault=second-nearest;
     float width=max(fwidth(fault)*.8,.002);
     float core=1.-smoothstep(.003,.003+width,fault);
     float halo=exp(-fault*38.);
     float pulse=.68+.32*sin(p.x*.12+p.y*.085-spaceClock*.32+mineral*4.);
     vec3 energy=mix(vec3(.035,.32,.54),vec3(.28,.10,.46),smoothstep(.3,.76,spaceField(p*.065)));
     float fresnel=pow(1.-max(0.,dot(n,v)),3.);
     vec3 mineralSurface=outgoingLight;
     mineralSurface+=vec3(.005,.009,.018)*mineral;
     vec2 facetTilt=(vec2(spaceHash(facet+3.),spaceHash(facet+23.))-.5)*.024;
     vec3 reflected=reflect(-v,normalize(n+vec3((mineral-.5)*.035+facetTilt.x,0.,(grain-.5)*.012+facetTilt.y)));
     vec3 skyRay=normalize(vec3(reflected.x,reflected.y-spaceTravel*.12,reflected.z));
     vec2 skyUV=vec2(fract(atan(skyRay.z,skyRay.x)*.159154943+1.),asin(clamp(skyRay.y,-1.,1.))*.318309886+.5);
     vec3 reflection=texture2D(spaceSky,skyUV).rgb;
     // Reflect the actual planet and rings as well as the panorama.
     vec3 origin=spacePosition-orbitalPlanet;float b=dot(origin,reflected),c=dot(origin,origin)-orbitalRadius*orbitalRadius;
     float discriminant=b*b-c,planetDistance=10000.;
     if(discriminant>0.&&b<0.){
      planetDistance=-b-sqrt(discriminant);vec3 pn=normalize(origin+reflected*planetDistance);
      float gas=spaceField(pn.xy*12.+pn.y*5.);float sunlight=smoothstep(-.09,.75,dot(pn,orbitalSun));
      reflection=mix(vec3(.06,.11,.17),vec3(.25,.32,.37),gas)*sunlight;
      reflection+=vec3(.035,.14,.24)*pow(1.-max(0.,dot(pn,-reflected)),3.)*sunlight;
     }
     float planeDirection=dot(reflected,orbitalRingNormal);
     if(abs(planeDirection)>.001){
      float rt=-dot(origin,orbitalRingNormal)/planeDirection;vec3 ringPoint=spacePosition+reflected*rt;
      float rr=length(ringPoint-orbitalPlanet);
      if(rt>0.&&rt<planetDistance&&rr>26.5&&rr<39.){
       float ringAlpha=smoothstep(26.5,27.4,rr)*(1.-smoothstep(37.8,39.,rr))*(.36+.18*sin(rr*2.4)+.08*sin(rr*9.4));
       ringAlpha*=smoothstep(.14,.40,abs(rr-32.8));
       reflection=mix(reflection,mix(vec3(.075,.12,.17),vec3(.28,.25,.20),smoothstep(28.,38.,rr))*orbitalShadow(ringPoint),ringAlpha);
      }
     }
     mineralSurface+=reflection*(.09+fresnel*.44)*mix(.65,1.,mineral);
     mineralSurface+=vec3(.014,.025,.04)*fresnel;
     mineralSurface+=energy*(core*.32+halo*.09)*pulse*(.35+.65*max(0.,n.y));
     // Two inclusion depths and an opalescent cloud suspended inside the mineral.
     vec2 parallax=v.xz/max(.35,abs(v.y));
     vec2 deep=p*5.+parallax*.20,cell=floor(deep),starUV=fract(deep)-.5;
     vec2 deeper=p*2.8+parallax*.70+19.,deepCell=floor(deeper),deepUV=fract(deeper)-.5;
     float star=exp(-dot(starUV,starUV)*360.)*step(.986,spaceHash(cell));
     float deepStar=exp(-dot(deepUV,deepUV)*240.)*step(.975,spaceHash(deepCell));
     float submerged=spaceField(p*.19+parallax*.15+vec2(spaceClock*.006,0.));
     float opal=smoothstep(.50,.78,submerged)*(1.-smoothstep(.0,.35,nearest));
     mineralSurface+=mix(vec3(.004,.022,.032),vec3(.026,.008,.034),mineral)*opal;
     mineralSurface+=vec3(.24,.50,.75)*star*(.55+.45*grain)+vec3(.065,.16,.28)*deepStar;
     outgoingLight=mix(outgoingLight,mineralSurface,spaceAmount);
    }
    #include <opaque_fragment>`);
  };
  floor.customProgramCacheKey=()=>key+'-cosmic-mineral-v2';
 }
 setSky(texture:THREE.Texture){this.uniforms.spaceSky.value=texture;}
 configure(quality:string,reduced=false){this.quality=quality;this.reduced=reduced;this.debris.count=quality==='low'?72:180;this.dust.geometry.setDrawRange(0,quality==='low'?220:700);this.meteors.visible=quality!=='low'&&!reduced;}
 update(camera:THREE.Camera,time:number,active=true){
  const amount=active?descentAt(time,this.state).cosmic:0,clock=this.reduced?0:Math.min(30,Math.max(0,time));
  this.uniforms.spaceAmount.value=amount;this.uniforms.spaceClock.value=clock;this.uniforms.spaceTravel.value=this.reduced?0:this.state.cosmicTravel;this.uniforms.spaceCamera.value.copy(camera.position);this.group.visible=amount>.001;
  if(!this.group.visible)return;
  for(let i=0;i<this.debris.count;i++){const s=this.seeds[i],angle=s.angle+clock*.0008;this.dummy.position.set(Math.cos(angle)*s.radius,s.y+clock*.085+Math.sin(s.spin+clock*.13)*.25,Math.sin(angle)*s.radius);this.dummy.rotation.set(s.spin+clock*.007,s.angle+clock*.012,s.spin*.7);this.dummy.scale.set(s.scale,s.scale*(.5+.4*Math.sin(s.spin)**2),s.scale*.78);this.dummy.updateMatrix();this.debris.setMatrixAt(i,this.dummy.matrix);}this.debris.instanceMatrix.needsUpdate=true;
 }
 get diagnostics(){return {amount:this.uniforms.spaceAmount.value,clock:this.uniforms.spaceClock.value,visible:this.group.visible,fragments:this.debris.count,dust:this.quality==='low'?220:700,meteors:this.meteors.visible,reduced:this.reduced};}
}
