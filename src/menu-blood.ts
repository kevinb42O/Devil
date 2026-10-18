import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const noise=/* glsl */`
float goreHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float goreNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(goreHash(i),goreHash(i+vec3(1,0,0)),f.x),mix(goreHash(i+vec3(0,1,0)),goreHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(goreHash(i+vec3(0,0,1)),goreHash(i+vec3(1,0,1)),f.x),mix(goreHash(i+vec3(0,1,1)),goreHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;

// Fixed impact groups in bind space: a connected stain surrounded by directional spray.
const impactSplatter=/* glsl */`
float impactMask(vec2 p,float seed){
 float turn=goreHash(vec3(seed))*6.283185;mat2 rot=mat2(cos(turn),-sin(turn),sin(turn),cos(turn));
 vec2 q=rot*p;
 float grain=goreNoise(vec3(q*24.,seed));
 float edgeNoise=goreNoise(vec3(q*11.,seed+3.));
 float coreDistance=length(q*vec2(1.,1.35))+(edgeNoise-.5)*.12+(grain-.5)*.025;
 float aa=max(fwidth(coreDistance),.002);
 float mask=1.-smoothstep(.155-aa,.155+aa,coreDistance);
 // Droplets overlap near impact and become smaller along the outgoing spray.
 for(int i=0;i<28;i++){
  float fi=float(i),a=goreHash(vec3(fi,seed,3.))*6.283185;
  float spread=goreHash(vec3(fi,seed,7.));
  float r=.09+pow(spread,1.6)*.55;
  vec2 direction=vec2(cos(a),sin(a));
  vec2 at=direction*r*vec2(1.,.7)+vec2(r*.36,0.);
  vec2 d=q-at;vec2 aligned=vec2(dot(d,direction),dot(d,vec2(-direction.y,direction.x)));
  float size=mix(.065,.009,spread)*(.55+goreHash(vec3(fi,seed,11.))*.65);
  float dist=length(aligned/vec2(1.+r*2.2,1.));float feather=max(fwidth(dist),.001);
  mask=max(mask,1.-smoothstep(size-feather,size+feather,dist));
 }
 // A narrow gravity run starts within the dense deposit, tapers and ends in a bead.
 float fall=clamp(-p.y,0.,.48),bend=sin(fall*15.+seed)*.008;
 float runWidth=mix(.018,.005,fall/.48);
 float run=(1.-smoothstep(runWidth,runWidth+max(fwidth(p.x),.001),abs(p.x-bend)))*step(-.48,p.y)*step(p.y,-.035);
 return max(mask,run);
}
`;

/** Menu cosmetics own their materials and never alter the shared avatar geometry. */
export class MenuBlood {
 readonly group=new THREE.Group();
 private time={value:0};
 private drops:THREE.InstancedMesh;
 private pedestalDrops:THREE.InstancedMesh;
 private hangingDrops:THREE.InstancedMesh;
 private splashRings:THREE.InstancedMesh;
 private spills:{x:number;z:number;tip:number}[]=[];
 private dummy=new THREE.Object3D();
 private origin=new THREE.Vector3();
 private emitters:{bone:THREE.Object3D;offset:THREE.Vector3;strand:THREE.Mesh}[]=[];
 private wet=new THREE.MeshPhysicalMaterial({color:0x410106,roughness:.24,metalness:0,clearcoat:.45,clearcoatRoughness:.16,envMapIntensity:.65});
 get diagnostics(){return {emitters:this.emitters.length,drops:this.drops.count,pedestalStreams:this.spills.length,pedestalDrops:this.pedestalDrops.count,puddledLedges:this.spills.length*2,time:this.time.value};}
 constructor(scene:THREE.Scene){
  this.group.name='menu-blood';scene.add(this.group);
  const pool=new THREE.Mesh(new THREE.CircleGeometry(.96,128),this.wet.clone());
  // Uneven edges and a shallow meniscus keep the pool from reading as a red disc.
  const positions=pool.geometry.attributes.position;
  for(let i=1;i<positions.count;i++){const a=Math.atan2(positions.getY(i),positions.getX(i)),r=.97+.018*Math.sin(a*5)+.012*Math.sin(a*11+2);positions.setXY(i,positions.getX(i)*r,positions.getY(i)*r);}
  pool.geometry.computeVertexNormals();pool.rotation.x=-Math.PI/2;pool.position.y=-1.532;pool.name='altar-blood-puddle';this.group.add(pool);
  const material=pool.material;
  material.onBeforeCompile=shader=>{
   shader.uniforms.menuBloodTime=this.time;
   shader.vertexShader='varying vec2 vPool;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPool=position.xy;');
   shader.fragmentShader='varying vec2 vPool;uniform float menuBloodTime;\n'+noise+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
float marbling=goreNoise(vec3(vPool*9.,1.));
diffuseColor.rgb*=mix(.48,1.25,marbling);
`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
float wave=0.;
for(int i=0;i<4;i++){float fi=float(i);vec2 source=vec2(sin(fi*4.7)*.49,cos(fi*2.9)*.3);float dist=length(vPool-source);float age=mod(menuBloodTime+fi*.47,1.9);wave+=sin(dist*85.-age*13.)*exp(-pow((dist-age*.37)/.085,2.))*exp(-age*1.5)*.002;}
vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);vec3 rx=cross(dy,normal),ry=cross(normal,dx);float det=dot(dx,rx);
normal=normalize(abs(det)*normal-sign(det)*(dFdx(wave)*rx+dFdy(wave)*ry));
`);
  };
  // Small satellite spatters have rounded volume and catch the same chamber light.
  const bead=new THREE.SphereGeometry(1,10,7);
  for(let i=0;i<25;i++){const a=i*2.39996,r=.65+(i%7)*.033,s=.009+(i%4)*.006;const drop=new THREE.Mesh(bead,this.wet);drop.position.set(Math.cos(a)*r,-1.527,Math.sin(a)*r);drop.scale.set(s,.003,s*(.7+i%3*.35));this.group.add(drop);}
  const spillGeometry:THREE.BufferGeometry[]=[];
  for(let i=0;i<11;i++){
   const angle=i*2.39996+.4,width=.075+(i%4)*.028,tip=-1.94-(i%3)*.04;
   // Follow each stone ledge, from the upper pool to a rounded hanging lip.
   const path=new THREE.CatmullRomCurve3([
    new THREE.Vector3(.73,-1.528,0),new THREE.Vector3(.89,-1.529,0),
    new THREE.Vector3(.945,-1.59,0),new THREE.Vector3(1.012,-1.638,0),
    new THREE.Vector3(1.045,-1.78,0),new THREE.Vector3(1.068,-1.914,0),
    new THREE.Vector3(1.19,-1.926,0),new THREE.Vector3(1.225,tip-.06,0)
   ].map((v,j)=>new THREE.Vector3(Math.cos(angle+(j>2?Math.sin(j*3+i)*.013:0))*v.x,v.y,Math.sin(angle+(j>2?Math.sin(j*3+i)*.013:0))*v.x)));
   const vertices:number[]=[],indices:number[]=[],segments=48,sides=8;
   for(let j=0;j<=segments;j++){
    const u=j/segments,at=path.getPoint(u),tangent=path.getTangent(u),across=new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle)),out=new THREE.Vector3().crossVectors(across,tangent).normalize();
    const breadth=width*(.85+.22*Math.sin(u*19+i)+.13*Math.sin(u*47+i))*(1.-.24*u);
    for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2;vertices.push(at.x+across.x*Math.cos(a)*breadth+out.x*Math.sin(a)*.016,at.y+out.y*Math.sin(a)*.016,at.z+across.z*Math.cos(a)*breadth+out.z*Math.sin(a)*.016);}
   }
   for(let j=0;j<segments;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides;indices.push(a,a+sides,b,b,a+sides,b+sides);}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();spillGeometry.push(geo);
   const end=path.getPoint(1);this.spills.push({x:end.x,z:end.z,tip:end.y});
   const lip=bead.clone();lip.deleteAttribute('uv');lip.scale(width*.45,.034,width*.24);lip.translate(end.x,end.y,end.z);spillGeometry.push(lip);
   // Shallow, convex puddles gather on the stone ledges before overflowing again.
   for(const [r,y]of [[.976,-1.624],[1.125,-1.915]]){
    const ledge=bead.clone();ledge.deleteAttribute('uv');ledge.scale(width*1.75,.013,.085);
    ledge.rotateY(Math.PI/2-angle);ledge.translate(Math.cos(angle)*r,y,Math.sin(angle)*r);spillGeometry.push(ledge);
   }
   // Each stream leaves a separate, irregular pool on the ground below.
   const ground=new THREE.CircleGeometry(.23+(i%4)*.045,64);const rim=ground.attributes.position;for(let j=1;j<rim.count;j++){const a=Math.atan2(rim.getY(j),rim.getX(j)),r=1.+.14*Math.sin(a*5+i)+.1*Math.sin(a*9+i*3);rim.setXY(j,rim.getX(j)*r,rim.getY(j)*r);}ground.rotateX(-Math.PI/2);ground.scale(1.35,1,.9);ground.translate(end.x,-2.143,end.z+.03);ground.computeVertexNormals();ground.deleteAttribute('uv');spillGeometry.push(ground);
  }
  const flowing=this.wet.clone();flowing.roughness=.18;flowing.clearcoat=.65;
  flowing.onBeforeCompile=shader=>{
   shader.uniforms.menuBloodTime=this.time;
   shader.vertexShader='varying vec3 vOverflow;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvOverflow=position;');
   shader.fragmentShader='varying vec3 vOverflow;uniform float menuBloodTime;\n'+noise+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
float flow=goreNoise(vec3(vOverflow.xz*19.,vOverflow.y*3.+menuBloodTime*.7));
diffuseColor.rgb*=mix(.65,1.22,flow);
`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
float film=sin(vOverflow.y*42.+menuBloodTime*3.8+goreNoise(vec3(vOverflow.xz*8.,1.))*5.)*.0007;
vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),rx=cross(dy,normal),ry=cross(normal,dx);float det=dot(dx,rx);
normal=normalize(abs(det)*normal-sign(det)*(dFdx(film)*rx+dFdy(film)*ry));
`);
  };
  const spills=new THREE.Mesh(mergeGeometries(spillGeometry),flowing);spills.name='pedestal-blood-overflow';this.group.add(spills);for(const geometry of spillGeometry)geometry.dispose();
  this.pedestalDrops=new THREE.InstancedMesh(bead,this.wet,this.spills.length*2);this.pedestalDrops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.pedestalDrops.frustumCulled=false;this.group.add(this.pedestalDrops);
  this.hangingDrops=new THREE.InstancedMesh(bead,this.wet,this.spills.length);this.hangingDrops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.hangingDrops.frustumCulled=false;this.group.add(this.hangingDrops);
  this.splashRings=new THREE.InstancedMesh(new THREE.TorusGeometry(1,.035,5,32),this.wet,this.spills.length);this.splashRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.splashRings.frustumCulled=false;this.group.add(this.splashRings);
  this.drops=new THREE.InstancedMesh(bead,this.wet,24);this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.drops.frustumCulled=false;this.drops.visible=false;this.group.add(this.drops);
 }
 coat(player:THREE.Group){
  const materials=new Set<THREE.MeshStandardMaterial>();
  player.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof THREE.MeshStandardMaterial)materials.add(material);});
  for(const material of materials){
   // Preserve the eyes and teeth so the original character remains recognizable.
   if(!['Demon_Main','Black'].includes(material.name))continue;
   const physical=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(physical,material);physical.clearcoat=.3;physical.clearcoatRoughness=.24;physical.emissiveIntensity=0;physical.envMapIntensity=.42;
   physical.onBeforeCompile=shader=>{
    shader.uniforms.menuBloodTime=this.time;
    shader.vertexShader='attribute float combatBloodMask;varying float vHandSoak;varying vec3 vGore;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGore=position*3200.;vHandSoak=combatBloodMask;');
    shader.fragmentShader='varying float vHandSoak;varying vec3 vGore;uniform float menuBloodTime;\n'+noise+impactSplatter+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
// Broad stains, fine clots, and narrow gravity-fed channels have distinct scales.
float cloud=goreNoise(vGore*.065+7.)*.65+goreNoise(vGore*.19+23.)*.35;
float channel=goreNoise(vGore*vec3(.27,.27,.012)+vec3(0.,0.,menuBloodTime*.018));
float rivulet=smoothstep(.48,.68,channel);
float clot=smoothstep(.54,.75,goreNoise(vGore*.55+11.))*smoothstep(.35,.65,cloud);
float wet=clamp(.35+rivulet*.65-clot*.5,0.,1.);
float handSoak=smoothstep(.38,.85,vHandSoak);
// The source mesh is Z-up. Uneven soak lines follow the thighs into saturated feet.
float legEdge=30.+(goreNoise(vGore*vec3(.24,.24,.035)+19.)-.5)*10.;
float legSoak=1.-smoothstep(legEdge-3.,legEdge+6.,vGore.z);
float footSoak=1.-smoothstep(6.,14.,vGore.z);
float limbSoak=max(handSoak,legSoak);
wet=max(wet,legSoak*(.57+rivulet*.3));
// Authored impact locations replace the evenly distributed cell pattern.
vec2 bodyP=vGore.xz*.05;
float front=1.-smoothstep(-.03,.15,vGore.y*.05);
float splash=impactMask((bodyP-vec2(-.29,2.38))/1.55,13.);
splash=max(splash,impactMask((bodyP-vec2(.38,1.85))/1.12,37.));
splash=max(splash,impactMask((bodyP-vec2(.08,3.94))/.64,71.));
float coverage=max(limbSoak*.98,splash*front*.96);
vec3 blood=mix(vec3(.021,.0008,.0016),vec3(.115,.0025,.005),wet);
blood*=mix(.65,1.1,cloud)*mix(1.,.62,footSoak);
float skinGrain=goreNoise(vGore*3.7);
diffuseColor.rgb=mix(diffuseColor.rgb*(.78+skinGrain*.38),blood,coverage);

`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.87,mix(.57,.24,wet)+clot*.13+(1.-limbSoak)*.12,coverage);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\nmaterial.clearcoat*=coverage*mix(.25,1.,limbSoak);\nmaterial.specularColor*=mix(.38,1.,limbSoak);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
float film=(rivulet*.00006+clot*.000035)*coverage+skinGrain*.000035*(1.-coverage);
vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),rx=cross(dy,normal),ry=cross(normal,dx);float det=dot(dx,rx);
normal=normalize(abs(det)*normal-sign(det)*(dFdx(film)*rx+dFdy(film)*ry));
`);
   };
   physical.customProgramCacheKey=()=>'menu-blood-coat-v5-soaked-legs';
   player.traverse(object=>{if(object instanceof THREE.Mesh){if(Array.isArray(object.material))object.material=object.material.map(m=>m===material?physical:m);else if(object.material===material)object.material=physical;}});
   const owned=player.userData.avatarMaterials as THREE.Material[];const index=owned.indexOf(material);if(index>=0)owned[index]=physical;material.dispose();
  }
  for(const [name,x,y]of [['Index3L_end',0,0],['Index3R_end',0,0],['Middle3L_end',0,0],['Middle3R_end',0,0]] as const){
   const bone=player.getObjectByName(name);if(!bone)continue;
   const strand=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),this.wet);this.group.add(strand);this.emitters.push({bone,offset:new THREE.Vector3(x,y,0),strand});
  }
  this.drops.count=this.emitters.length*4;this.drops.visible=this.emitters.length>0;
 }
 update(t:number){
  this.time.value=t;
  for(let i=0;i<this.emitters.length;i++){
   const e=this.emitters[i];e.bone.getWorldPosition(this.origin).add(e.offset);
   const length=.035+.11*((t*.63+i*.37)%1);e.strand.position.copy(this.origin);e.strand.position.y-=length*.45;e.strand.scale.set(.011,length,.011);
   for(let j=0;j<4;j++){const index=i*4+j,age=(t*.72+j*.25+i*.17)%1,fall=age*age*2.4;this.dummy.position.copy(this.origin);this.dummy.position.y=Math.max(-1.522,this.origin.y-fall);this.dummy.scale.set(.012*(1-age*.35),.022+age*.026,.012*(1-age*.35));if(this.origin.y-fall< -1.52)this.dummy.scale.setScalar(0);this.dummy.updateMatrix();this.drops.setMatrixAt(index,this.dummy.matrix);}
  }
  this.drops.instanceMatrix.needsUpdate=true;
  for(let i=0;i<this.spills.length;i++)for(let j=0;j<2;j++){
   const spill=this.spills[i],age=(t*.83+i*.173+j*.5)%1,fall=age*age*.4;
   this.dummy.position.set(spill.x,spill.tip-fall,spill.z);this.dummy.scale.set(.025,.032+age*.045,.025);
   if(this.dummy.position.y< -2.14)this.dummy.scale.setScalar(0);
   this.dummy.updateMatrix();this.pedestalDrops.setMatrixAt(i*2+j,this.dummy.matrix);
  }
  this.pedestalDrops.instanceMatrix.needsUpdate=true;
  for(let i=0;i<this.spills.length;i++){
   const spill=this.spills[i],age=(t*.83+i*.173)%1;
   // The meniscus swells, stretches and sheds a heavy drop from each overflow lip.
   this.dummy.position.set(spill.x,spill.tip-.018-age*.02,spill.z);this.dummy.scale.set(.022+age*.018,.028+age*.043,.02+age*.012);this.dummy.updateMatrix();this.hangingDrops.setMatrixAt(i,this.dummy.matrix);
   const impact=(age+.37)%1,radius=.035+impact*.18;
   this.dummy.position.set(spill.x,-2.138,spill.z);this.dummy.rotation.x=-Math.PI/2;this.dummy.scale.set(radius,radius,.14*(1-impact));this.dummy.updateMatrix();this.splashRings.setMatrixAt(i,this.dummy.matrix);this.dummy.rotation.x=0;
  }
  this.hangingDrops.instanceMatrix.needsUpdate=true;this.splashRings.instanceMatrix.needsUpdate=true;
 }
}
