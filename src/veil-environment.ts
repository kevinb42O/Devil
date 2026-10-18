import * as THREE from 'three';
import {arenaRadius,TILE_SIZE} from './arena';
import {createDescentState} from './descent';
import {VEIL_RADIANCE,veilAt} from './veil-shading';

/** Wet carved stone and suspended geology; the traversal mesh stays authoritative. */
export class VeilEnvironment {
 readonly group=new THREE.Group();readonly ready:Promise<void>;
 readonly uniforms={veilDetail:{value:1},veilAmount:{value:0},veilClock:{value:0},veilRadius:{value:31},veilClouds:{value:new THREE.Texture()},veilNormalMap:{value:new THREE.Texture()},veilRoughMap:{value:new THREE.Texture()},veilHeightMap:{value:new THREE.Texture()},veilRockMap:{value:new THREE.Texture()}};
 private state=createDescentState();private reduced=false;private quality='high';
 private monoliths:THREE.InstancedMesh;private fragments:THREE.InstancedMesh;private dust:THREE.Points;
 private dummy=new THREE.Object3D();
 private rocks:{angle:number;radius:number;y:number;scale:number;phase:number}[]=[];
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.group.name='bruised-veil';scene.add(this.group);this.group.visible=false;
  const loader=new THREE.TextureLoader();
  this.ready=Promise.all([loader.loadAsync('/assets/materials/rock_tile_floor/2k/textures/rock_tile_floor_nor_gl_2k.jpg'),loader.loadAsync('/assets/materials/rock_tile_floor/2k/textures/rock_tile_floor_rough_2k.png'),loader.loadAsync('/assets/environment/veil-stone-height-v1.jpg'),loader.loadAsync('/models/entrance/rock/textures/rock_face_01_diff_1k.jpg')]).then(([normal,rough,height,rock])=>{
   rock.colorSpace=THREE.SRGBColorSpace;
   for(const texture of [normal,rough,height,rock]){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;}
   height.anisotropy=1;
   this.uniforms.veilNormalMap.value=normal;this.uniforms.veilRoughMap.value=rough;this.uniforms.veilHeightMap.value=height;this.uniforms.veilRockMap.value=rock;
  });
  this.attachFloor(floor);
  let seed=7193;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const rockMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,toneMapped:false,
   vertexShader:`varying vec3 veilRockPosition,veilRockNormal;void main(){vec4 p=instanceMatrix*vec4(position,1.);veilRockPosition=p.xyz;mat3 m=mat3(instanceMatrix);vec3 n=normal/vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2]));veilRockNormal=normalize(m*n);gl_Position=projectionMatrix*modelViewMatrix*p;}`,
   fragmentShader:`uniform sampler2D veilRockMap;uniform float veilAmount,veilClock;varying vec3 veilRockPosition,veilRockNormal;${VEIL_RADIANCE.replace('uniform float veilClock;','')}
   void main(){vec3 p=veilRockPosition,n=normalize(veilRockNormal);float grain=veilNoise(p.xz*1.8+p.y*.14),strata=pow(.5+.5*sin(p.y*2.1+grain*7.),9.);
    float key=pow(max(0.,dot(n,normalize(vec3(-.3,.8,-.5)))),2.);float rim=pow(1.-abs(dot(n,normalize(cameraPosition-p))),4.);
    vec3 rock=texture2D(veilRockMap,vec2(p.x+p.z,p.y)*.13).rgb;
    vec3 color=rock*vec3(.10,.085,.15)*(.18+key*.7);
    color+=vec3(.055,.037,.10)*strata*.12+vec3(.03,.027,.055)*rim;
    float haze=1.-exp(-length(p.xz-cameraPosition.xz)*.002);color=mix(color,vec3(.015,.010,.027),haze);
    gl_FragColor=vec4(color,veilAmount);}`});
  const obelisk=new THREE.CylinderGeometry(.56,1,1,5,5);const pos=obelisk.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);const s=1+.25*Math.sin(y*19+x*7+z*13);pos.setXYZ(i,x*s+y*.17,y+(Math.sin(x*17+z*31)*.07),z*s);}obelisk.computeVertexNormals();
  this.monoliths=new THREE.InstancedMesh(obelisk,rockMaterial,30);this.monoliths.name='veil-shattered-monoliths';this.monoliths.frustumCulled=false;
  for(let i=0;i<10;i++){
   const angle=i*2.39996+.24,radius=70+random()*38,width=3+random()*5,height=30+random()*37,lean=(random()-.5)*.35;
   for(let j=0;j<3;j++){
    this.dummy.position.set(Math.cos(angle)*radius+j*lean*8,-25+j*(height/3+1.7),Math.sin(angle)*radius);
    this.dummy.rotation.set(lean,.7+i*1.31,lean*.7);this.dummy.scale.set(width*(1-j*.18),height/3,width*.72*(1-j*.18));this.dummy.updateMatrix();this.monoliths.setMatrixAt(i*3+j,this.dummy.matrix);
   }
  }
  this.group.add(this.monoliths);
  const fragmentGeometry=new THREE.IcosahedronGeometry(1,0);
  this.fragments=new THREE.InstancedMesh(fragmentGeometry,rockMaterial,160);this.fragments.name='veil-suspended-stone';this.fragments.frustumCulled=false;this.group.add(this.fragments);
  for(let i=0;i<160;i++)this.rocks.push({angle:random()*Math.PI*2,radius:random()*27,y:i<24?-.5+random()*6:-2-random()*20,scale:.35+random()**3*3.5,phase:random()*6.28});
  const points=new Float32Array(320*3),phases=new Float32Array(320);
  for(let i=0;i<320;i++){const a=random()*6.28,r=34+random()*45;points.set([Math.cos(a)*r,-12+random()*32,Math.sin(a)*r],i*3);phases[i]=random();}
  const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(points,3));dustGeometry.setAttribute('phase',new THREE.BufferAttribute(phases,1));
  this.dust=new THREE.Points(dustGeometry,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
   vertexShader:`uniform float veilClock;attribute float phase;varying float alpha;void main(){vec3 p=position;p.y=mod(p.y+12.+veilClock*(.12+phase*.15),44.)-12.;vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;gl_PointSize=clamp(40./max(1.,-view.z),1.,2.5);alpha=.2+phase*.5;}`,
   fragmentShader:`uniform float veilAmount;varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.44,.38,.65,pow(max(0.,1.-r),3.)*alpha*veilAmount);}`}));this.dust.name='veil-rising-motes';this.dust.frustumCulled=false;this.group.add(this.dust);
 }
 private attachFloor(floor:THREE.MeshBasicMaterial){
  const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
  floor.onBeforeCompile=(shader,renderer)=>{
   previous.call(floor,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 veilPosition,veilSurfaceNormal;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
    vec4 veilVertex=vec4(transformed,1.);vec3 veilN=normal;
    #ifdef USE_INSTANCING
    veilVertex=instanceMatrix*veilVertex;veilN=mat3(instanceMatrix)*veilN;
    #endif
    veilPosition=(modelMatrix*veilVertex).xyz;veilSurfaceNormal=normalize(mat3(modelMatrix)*veilN);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 veilPosition,veilSurfaceNormal;uniform float veilAmount,veilRadius,veilDetail;uniform sampler2D veilNormalMap,veilRoughMap,veilHeightMap;
    vec2 veilReliefUV;
    ${VEIL_RADIANCE}`)
    .replace('#include <map_fragment>',`#include <map_fragment>
     #ifdef USE_MAP
     veilReliefUV=vMapUv;
     if(veilAmount>.001&&veilSurfaceNormal.y>.65){
      vec3 reliefEye=normalize(cameraPosition-veilPosition);
      vec2 ray=vec2(reliefEye.x,-reliefEye.z)/max(.28,abs(reliefEye.y))*.035;
      vec2 dx=dFdx(vMapUv),dy=dFdy(vMapUv);
      float layers=mix(5.,12.,veilDetail),layer=0.,height=1.-texture2DGradEXT(veilHeightMap,veilReliefUV,dx,dy).r;
      vec2 delta=ray/layers;
      for(int step=0;step<12;step++){
       if(layer>=height)break;
       veilReliefUV-=delta;layer+=1./layers;height=1.-texture2DGradEXT(veilHeightMap,veilReliefUV,dx,dy).r;
      }
      float after=height-layer,before=1.-texture2DGradEXT(veilHeightMap,veilReliefUV+delta,dx,dy).r-layer+1./layers;
      veilReliefUV+=delta*clamp(after/(after-before+.00001),0.,1.);
      vec4 relief=texture2DGradEXT(map,veilReliefUV,dx,dy);
      float tileShade=.86+.22*veilHash(floor(veilPosition.xz/2.48+.5));
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuse*relief.rgb*vec3(.38,.40,.51)*tileShade,veilAmount);
     }
     #endif`)
    .replace('#include <opaque_fragment>',`
    if(veilAmount>.001){
     vec2 p=veilPosition.xz;vec3 geometric=normalize(veilSurfaceNormal),eye=normalize(cameraPosition-veilPosition);
     float top=smoothstep(.55,.95,geometric.y),rim=smoothstep(veilRadius-12.,veilRadius+2.,length(p));
     vec2 uv=p/${TILE_SIZE.toFixed(8)};
     vec2 surfaceUV=veilReliefUV;
     vec3 texNormal=texture2D(veilNormalMap,surfaceUV).xyz*2.-1.;
     float rough=texture2D(veilRoughMap,surfaceUV).r;
     float broad=veilNoise(p*.22),mineral=veilNoise(p*1.7);
     vec2 tileUV=fract(uv+.5);vec2 edge=min(tileUV,1.-tileUV)*${TILE_SIZE.toFixed(8)};
     float seam=min(edge.x,edge.y);
     // Chipped edges, a recessed dark channel, then a thin light source below it.
     float chipped=seam+(mineral-.5)*.022;
     float groove=1.-smoothstep(.009,.052,chipped);
     float bevel=smoothstep(.012,.03,chipped)*(1.-smoothstep(.035,.10,chipped));
     float vein=0.;float veinPixel=max(length(fwidth(p))*.008,.004);
     if(rim>.05){
     vec2 cellUV=p*.46,cell=floor(cellUV),local=fract(cellUV);float first=8.,second=8.;
     for(int ix=-1;ix<=1;ix++)for(int iz=-1;iz<=1;iz++){
      vec2 offset=vec2(float(ix),float(iz)),id=cell+offset;
      vec2 site=offset+vec2(veilHash(id),veilHash(id+17.))*.8+.1-local;
      float distance=dot(site,site);if(distance<first){second=first;first=distance;}else second=min(second,distance);
     }
     float fracture=second-first;
     vein=(1.-smoothstep(.001,veinPixel,fracture))*smoothstep(.64,.79,broad);
     }
     float pool=smoothstep(.44,.60,broad*.68+mineral*.19+(1.-rough)*.23)*(1.-groove*.8);
     vec3 n=normalize(vec3(texNormal.x*.65*(1.-pool*.94),1.,-texNormal.y*.65*(1.-pool*.94)));
     float fresnel=.035+.965*pow(1.-max(dot(n,eye),0.),5.);
     vec3 reflection=veilRadiance(reflect(-eye,n),pool>.3?1.2:3.);
     float key=max(0.,dot(n,normalize(vec3(-.24,.76,-.58))));
     vec3 stone=outgoingLight*vec3(.65,.67,.79)*(.48+key*.62)*(1.-groove*.48);
     stone+=vec3(.004,.005,.009)*bevel*(.5+key);
     // Rough mineral catches broad light; still pools carry the detailed sky tear.
     stone+=reflection*(.025+.11*fresnel)*(1.-rough*.6)*top;
     stone=mix(stone,stone*.53+reflection*(.18+.82*fresnel),pool*top*.88);
     vec3 halfVector=normalize(eye+normalize(vec3(-.24,.63,-.78)));
     float spec=pow(max(0.,dot(n,halfVector)),mix(22.,160.,pool))*(1.-rough*.75);
     stone+=vec3(.15,.16,.22)*spec*top;
     float pulse=.78+.22*sin(p.x*.12+p.y*.09-veilClock*.22);
     float selection=smoothstep(.63,.85,veilNoise(floor(uv+.5)*.67));
     float core=(1.-smoothstep(.001,max(.006,fwidth(seam)),seam))*(1.-smoothstep(20.,45.,distance(cameraPosition,veilPosition)));
     vec3 energy=vec3(.20,.14,.34)*(core*selection*(.07+rim*.65)+vein*.18)*pulse;
     stone+=energy*top;
     stone+=vec3(.028,.016,.055)*exp(-seam*19.)*selection*(.2+rim*.8)*top;
     stone+=vec3(.065,.045,.12)*rim*(1.-top)*smoothstep(.35,.72,broad)*(.3+.7*mineral);
     stone*=.98+.04*rough;
     outgoingLight=mix(outgoingLight,stone,veilAmount);
    }
    #include <opaque_fragment>`);
  };floor.customProgramCacheKey=()=>key+'-veil-wet-carved-stone-v1';
 }
 setSky(texture:THREE.Texture){this.uniforms.veilClouds.value=texture;}
 configure(quality:string,reduced=false){this.quality=quality;this.reduced=reduced;this.uniforms.veilDetail.value=quality==='low'?0:1;this.fragments.count=quality==='low'?64:160;this.dust.geometry.setDrawRange(0,quality==='low'?100:320);}
 update(camera:THREE.Camera,time:number,enabled=true){
  const amount=enabled?veilAt(time,this.state):0,clock=this.reduced?0:Math.max(0,Math.min(133,time-126));
  this.uniforms.veilAmount.value=amount;this.uniforms.veilClock.value=clock;this.uniforms.veilRadius.value=arenaRadius(time);this.group.visible=amount>.001;
  if(!this.group.visible)return;
  for(let i=0;i<this.fragments.count;i++){
   const s=this.rocks[i],r=arenaRadius(time)+4+s.radius+s.scale;
   this.dummy.position.set(Math.cos(s.angle)*r,s.y+clock*.018+Math.sin(s.phase+clock*.045)*.7,Math.sin(s.angle)*r);
   this.dummy.rotation.set(s.phase+clock*.002,s.angle,s.phase*.4);this.dummy.scale.set(s.scale,s.scale*.6,s.scale*.85);this.dummy.updateMatrix();this.fragments.setMatrixAt(i,this.dummy.matrix);
  }this.fragments.instanceMatrix.needsUpdate=true;
 }
 dispose(){
  const materials=new Set<THREE.Material>();
  for(const mesh of [this.monoliths,this.fragments,this.dust]){mesh.geometry.dispose();materials.add(mesh.material as THREE.Material);}
  for(const material of materials)material.dispose();this.monoliths.dispose();this.fragments.dispose();
  for(const name of ['veilNormalMap','veilRoughMap','veilHeightMap','veilRockMap'] as const)this.uniforms[name].value.dispose();
  this.group.removeFromParent();
 }
 get diagnostics(){return {amount:this.uniforms.veilAmount.value,clock:this.uniforms.veilClock.value,visible:this.group.visible,quality:this.quality,reduced:this.reduced,fragments:this.fragments.count,monolithPieces:this.monoliths.count,platformRadius:this.uniforms.veilRadius.value};}
}
