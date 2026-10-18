import * as THREE from 'three';
import {cathedralAt,CATHEDRAL_LIGHT_GLSL} from './cathedral-state';
export {cathedralAt} from './cathedral-state';
export class Cathedral {
 readonly group=new THREE.Group();readonly architecture:THREE.InstancedMesh;readonly dust:THREE.Mesh;
 private reduced=false;private highCount=0;private lowCount=0;private quality='high';
 readonly uniforms={cathedralPresence:{value:0},cathedralLight:{value:0},cathedralClosure:{value:0},cathedralClock:{value:0},cathedralRise:{value:0},cathedralCrown:{value:0},cathedralRight:{value:new THREE.Vector3()},cathedralUp:{value:new THREE.Vector3()}};
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.group.name='cathedral-below';scene.add(this.group);
  const matrices:THREE.Matrix4[]=[],colors:THREE.Color[]=[],dummy=new THREE.Object3D();
  const block=(x:number,y:number,z:number,w:number,h:number,d:number,rotation:number,tint:number)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,rotation,0);dummy.scale.set(w,h,d);dummy.updateMatrix();matrices.push(dummy.matrix.clone());colors.push(new THREE.Color().setRGB(tint*.78,tint*.76,tint*.89));};
  for(let ring=0;ring<2;ring++){
   const radius=ring?67:46;
   for(let i=0;i<7;i++){
    const angle=i*Math.PI*2/7+.22,c=Math.cos(angle),s=Math.sin(angle),tx=-s,tz=c,half=radius*Math.sin(Math.PI/7)*.83;
    for(const side of [-1,1]){
     for(let level=0;level<11;level++){const y=-31+level*5.7;block(c*radius+tx*half*side,y,s*radius+tz*half*side,3.4,5.5,4.7,-angle,.17+level*.005);}
     block(c*radius+tx*half*side,27,s*radius+tz*half*side,5.1,1.3,6.,-angle,.25);
     block(c*(radius+2)+tx*half*side,-1,s*(radius+2)+tz*half*side,2,53,8,-angle,.13);
    }
    // Two pointed ribs converge above each true opening; layered voussoirs give depth.
    for(let j=0;j<32;j++){
     const u=j/31,x=-half+2*half*u,y=28+18*Math.pow(Math.sin(Math.PI*u),.7);
     const dy=18*.7*Math.pow(Math.max(.01,Math.sin(Math.PI*u)),-.3)*Math.cos(Math.PI*u)*Math.PI/(2*half);
     dummy.position.set(c*radius+tx*x,y,s*radius+tz*x);dummy.rotation.set(0,-angle-Math.PI/2,Math.atan(dy));dummy.scale.set(half*2/31*1.10,2.1,4.2);dummy.updateMatrix();matrices.push(dummy.matrix.clone());colors.push(new THREE.Color(.26,.25,.30));
    }
    block(c*radius,46,s*radius,1.7,3.8,4.8,-angle,.25);
   }
   if(ring===0)this.lowCount=matrices.length;
  }
  this.highCount=matrices.length;
  const material=new THREE.MeshBasicMaterial({color:0xffffff,map:floor.map,transparent:true,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,this.uniforms);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 cathedralStone,cathedralNormal;uniform float cathedralRise;').replace('#include <begin_vertex>',`#include <begin_vertex>
   transformed.y+=cathedralRise/max(.001,length(instanceMatrix[1].xyz));
   cathedralStone=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;cathedralNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 cathedralStone,cathedralNormal;uniform float cathedralPresence,cathedralCrown;`).replace('#include <opaque_fragment>',`
    float mineral=.85+.12*sin(cathedralStone.y*.7+sin(cathedralStone.x*.3));
    float facing=.45+.55*max(dot(normalize(cathedralNormal),normalize(vec3(-.4,.8,-.2))),0.);
    float haze=1.-exp(-length(cathedralStone-cameraPosition)*.006);
    outgoingLight=mix(outgoingLight*mineral*facing,vec3(.035,.026,.054),haze*.7);
    float overhead=smoothstep(8.,35.,cathedralStone.y);
    outgoingLight*=mix(1.,.16+.20*overhead,cathedralCrown);
    outgoingLight+=vec3(.012,.010,.023)*cathedralCrown*overhead;
    diffuseColor.a*=cathedralPresence;
    #include <opaque_fragment>`);
  };
  this.architecture=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,matrices.length);matrices.forEach((m,i)=>{this.architecture.setMatrixAt(i,m);this.architecture.setColorAt(i,colors[i]);});this.architecture.frustumCulled=false;this.architecture.renderOrder=2;this.group.add(this.architecture);
  const base=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();geometry.index=base.index;geometry.attributes=base.attributes;
  const seeds=new Float32Array(1600*4);let seed=6553;for(let i=0;i<seeds.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;seeds[i]=seed/4294967296;}geometry.setAttribute('cathedralSeed',new THREE.InstancedBufferAttribute(seeds,4));geometry.instanceCount=1600;
  this.dust=new THREE.Mesh(geometry,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,toneMapped:false,
   vertexShader:`attribute vec4 cathedralSeed;uniform float cathedralClock,cathedralLight,cathedralClosure;uniform vec3 cathedralRight,cathedralUp;varying vec2 dustUV;varying float dustAlpha;${CATHEDRAL_LIGHT_GLSL}
    void main(){float phase=fract(cathedralSeed.w+cathedralClock*.008);vec3 p=vec3((cathedralSeed.x-.5)*66.,phase*19.,(cathedralSeed.y-.5)*66.);p.x+=sin(cathedralClock*.13+cathedralSeed.z*20.)*.6;p.z+=cos(cathedralClock*.1+cathedralSeed.w*20.)*.6;
     float beam=cathedralShaft(p,cathedralClosure);dustAlpha=cathedralLight*(.08+beam*.72)*smoothstep(0.,.08,phase)*(1.-smoothstep(.85,1.,phase));
     float size=.012+cathedralSeed.z*.025;p+=(cathedralRight*position.x+cathedralUp*position.y)*size;dustUV=uv;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
   fragmentShader:`varying vec2 dustUV;varying float dustAlpha;void main(){float r=length(dustUV-.5)*2.;gl_FragColor=vec4(.62,.60,.68,pow(max(0.,1.-r),2.)*dustAlpha);}`}));this.dust.frustumCulled=false;this.dust.renderOrder=9;this.group.add(this.dust);
  this.attachFloor(floor);this.group.visible=false;
 }
 private attachFloor(material:THREE.MeshBasicMaterial){const previous=material.onBeforeCompile,key=material.customProgramCacheKey();material.onBeforeCompile=(shader,renderer)=>{previous.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 cathedralFloor,cathedralFloorNormal;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
   vec4 cp=vec4(transformed,1.);vec3 cn=normal;
   #ifdef USE_INSTANCING
   cp=instanceMatrix*cp;cn=mat3(instanceMatrix)*cn;
   #endif
   cathedralFloor=(modelMatrix*cp).xyz;cathedralFloorNormal=normalize(mat3(modelMatrix)*cn);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 cathedralFloor,cathedralFloorNormal;uniform float cathedralLight,cathedralClosure,cathedralClock,cathedralCrown;${CATHEDRAL_LIGHT_GLSL}`)
  .replace('#include <opaque_fragment>',`
   if(cathedralLight>.001){
    float top=smoothstep(.45,.85,cathedralFloorNormal.y),light=cathedralShaft(cathedralFloor,cathedralClosure);
    float grain=dot(diffuseColor.rgb,vec3(.333));float mineral=.86+.14*smoothstep(.08,.34,grain);
    vec3 limestone=outgoingLight*vec3(.70,.77,.98);
    float chalk=smoothstep(.08,.34,grain);
    limestone*=.48+.52*chalk;
    float slowVeil=.92+.08*sin(cathedralClock*.14+cathedralFloor.x*.09);
    limestone+=vec3(.30,.285,.40)*light*(.3+chalk*.7)*slowVeil*top;
    float grazing=pow(1.-max(dot(normalize(cameraPosition-cathedralFloor),normalize(cathedralFloorNormal)),0.),4.);
    limestone+=vec3(.07,.08,.12)*light*grazing*mineral*top;
    outgoingLight=mix(outgoingLight,limestone,cathedralLight);
   }
   outgoingLight=mix(outgoingLight,outgoingLight*vec3(.68,.76,.94),cathedralCrown*.5);
   #include <opaque_fragment>`);
 };material.customProgramCacheKey=()=>key+'-cathedral-limestone-v1';}
 configure(quality:string,reduced:boolean){this.quality=quality;this.reduced=reduced;this.architecture.count=quality==='high'?this.highCount:this.lowCount;(this.dust.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='high'?1600:500;}
 update(camera:THREE.Camera,time:number,enabled=true){const s=cathedralAt(time);this.uniforms.cathedralPresence.value=enabled?Math.max(s.presence,s.crown*.22):0;this.uniforms.cathedralLight.value=enabled?s.light:0;this.uniforms.cathedralClosure.value=s.closure;this.uniforms.cathedralCrown.value=s.crown;this.uniforms.cathedralRise.value=this.reduced?0:s.rise;this.uniforms.cathedralClock.value=this.reduced?0:Math.max(0,time-356);this.uniforms.cathedralRight.value.setFromMatrixColumn(camera.matrixWorld,0);this.uniforms.cathedralUp.value.setFromMatrixColumn(camera.matrixWorld,1);this.group.visible=enabled&&this.uniforms.cathedralPresence.value>.001;this.dust.visible=s.light>.001;}
 dispose(){this.architecture.geometry.dispose();(this.architecture.material as THREE.Material).dispose();this.architecture.dispose();this.dust.geometry.dispose();(this.dust.material as THREE.Material).dispose();this.group.removeFromParent();}
 get diagnostics(){return {presence:this.uniforms.cathedralPresence.value,light:this.uniforms.cathedralLight.value,closure:this.uniforms.cathedralClosure.value,visible:this.group.visible,quality:this.quality,reduced:this.reduced,blocks:this.architecture.count,dust:(this.dust.geometry as THREE.InstancedBufferGeometry).instanceCount,interactive:false};}
}
