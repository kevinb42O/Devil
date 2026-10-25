import * as THREE from 'three';
import {createDescentState} from './descent';
import {createHeavenState,heavenAt} from './heaven-state';

/** A world-space sanctuary. All masonry stays beyond the playable footprint. */
export class Heaven {
 readonly group=new THREE.Group();
 readonly throne=new THREE.Group();
 readonly halos=new THREE.Group();
 readonly uniforms={heavenPresence:{value:0},heavenThrone:{value:0},heavenGate:{value:0},heavenFloor:{value:0},heavenClock:{value:0},heavenArrival:{value:0}};
 private state=createHeavenState();private sky=createDescentState();private reduced=false;
 private batches:THREE.InstancedMesh[]=[];
 private ornaments:THREE.InstancedMesh;
 private haloRings:THREE.Mesh[]=[];
 private dust:THREE.Points;
 constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
  this.group.name='throne-above-creation';this.group.visible=false;scene.add(this.group);
  this.throne.name='divine-throne';this.halos.name='celestial-halos';this.group.add(this.throne,this.halos);
  const box=new THREE.BoxGeometry(1,1,1),column=new THREE.CylinderGeometry(.86,1,1,12),arch=new THREE.TorusGeometry(1,.045,8,48,Math.PI);
  const dummy=new THREE.Object3D();
  type Piece={p:number[];s:number[];r?:number[]};
  const material=(gold:boolean,weight='heavenPresence')=>{
   const m=new THREE.MeshBasicMaterial({color:gold?0xe6ad48:0xfff0d0,transparent:true,depthWrite:true,toneMapped:false,fog:false});
   m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,this.uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 holyNormal,holyPosition;').replace('#include <begin_vertex>',`#include <begin_vertex>
     holyNormal=normal;vec4 hp=vec4(transformed,1.);
     #ifdef USE_INSTANCING
     holyNormal=mat3(instanceMatrix)*normal;hp=instanceMatrix*hp;
     #endif
     holyNormal=normalize(mat3(modelMatrix)*holyNormal);holyPosition=(modelMatrix*hp).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 holyNormal,holyPosition;uniform float heavenPresence,heavenThrone,heavenGate;`).replace('#include <opaque_fragment>',`
     vec3 n=normalize(holyNormal);float light=.25+.75*max(0.,dot(n,normalize(vec3(-.4,.85,.35))));
     float grain=.91+.055*sin(holyPosition.y*.5+sin(holyPosition.x*.25))+.035*sin(holyPosition.y*3.);
     outgoingLight*=light*grain;
     outgoingLight+=vec3(${gold?'.24,.12,.025':'.075,.062,.039'})*pow(1.-abs(dot(n,normalize(cameraPosition-holyPosition))),3.);
     float haze=1.-exp(-length(cameraPosition-holyPosition)*.0017);
     outgoingLight=mix(outgoingLight,vec3(.68,.57,.36),haze*.38);
     diffuseColor.a*=${weight};if(diffuseColor.a<.012)discard;
     #include <opaque_fragment>`);
   };m.customProgramCacheKey=()=>`holy-${gold}-${weight}`;return m;
  };
  const ivory=material(false),gold=material(true),throneIvory=material(false,'heavenThrone'),throneGold=material(true,'heavenThrone'),gateGold=material(true,'heavenGate');
  const batch=(geometry:THREE.BufferGeometry,mat:THREE.Material,pieces:Piece[],parent=this.group)=>{
   const mesh=new THREE.InstancedMesh(geometry,mat,pieces.length);mesh.frustumCulled=false;
   pieces.forEach((piece,i)=>{dummy.position.fromArray(piece.p);dummy.scale.fromArray(piece.s);dummy.rotation.set(...(piece.r??[0,0,0]) as [number,number,number]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
   parent.add(mesh);this.batches.push(mesh);return mesh;
  };
  const stones:Piece[]=[],trim:Piece[]=[],shafts:Piece[]=[],arches:Piece[]=[];
  // Concentric terraces, hanging foundations and ceremonial stairs surround the deck.
  for(let ring=0;ring<3;ring++)for(let i=0;i<32;i++){
   const a=i*Math.PI/16,r=46+ring*19,y=-9-ring*12,x=Math.sin(a)*r,z=Math.cos(a)*r;
   stones.push({p:[x,y,z],s:[r*.205,3,15],r:[0,a,0]});
   trim.push({p:[Math.sin(a)*(r-7.3),y+1.6,Math.cos(a)*(r-7.3)],s:[r*.20,.35,.4],r:[0,a,0]});
   if(i%4===0){shafts.push({p:[x,y-16,z],s:[2.2,30,2.2]});stones.push({p:[x,y-32,z],s:[4,2,4]});}
  }
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4,r=72,c=Math.cos(a),s=Math.sin(a);
   const add=(x:number,y:number,z:number,w:number,h:number,d:number,g=false)=>(g?trim:stones).push({p:[c*x+s*z,y,-s*x+c*z],s:[w,h,d],r:[0,a,0]});
   for(const side of [-1,1]){
    const x=side*14;
    shafts.push({p:[c*x+s*r,20,-s*x+c*r],s:[2.4,58,2.4]});
    for(const y of [-8,-5,46,49])add(x,y,r,7,2,7,y===-5||y===46);
    add(x,14,r,3,45,3);add(x,53,r,6,3,6);add(x,57,r,2,6,2,true);
   }
   arches.push({p:[s*r,45,c*r],s:[14,14,14],r:[0,a,0]});
   for(let stair=0;stair<9;stair++)add(0,-8+stair*.55,49+stair*1.9,14,.65,1.9);
   // Suspended sanctuaries behind each gateway, clearly separated in depth.
   for(const side of [-1,1]){
    const x=side*24,z=148;
    add(x,15,z,17,4,18);add(x,54,z,20,3,20);add(x,57,z,21,.65,21,true);
    for(const dx of [-6,6])for(const dz of [-6,6])shafts.push({p:[c*(x+dx)+s*(z+dz),35,-s*(x+dx)+c*(z+dz)],s:[1.4,36,1.4]});
   }
  }
  batch(box,ivory,stones);batch(box,gold,trim);batch(column,ivory,shafts);batch(new THREE.TorusGeometry(1,.11,8,48,Math.PI),ivory,arches);batch(arch,gold,arches.map(a=>({...a,s:a.s.map(v=>v*1.10)})));
  // The enormous stepped seat and crowned back are one readable silhouette.
  const seat:Piece[]=[],crown:Piece[]=[];
  for(let i=0;i<7;i++){
   seat.push({p:[0,12+i*3,-116-i*2],s:[64-i*5,3,42-i*3]});
   crown.push({p:[0,13.6+i*3,-96.5-i*3.5],s:[64-i*5,.45,.5]});
  }
  seat.push({p:[0,38,-132],s:[34,7,24]},{p:[0,67,-144],s:[28,55,6]},{p:[0,96,-144],s:[35,5,8]});
  for(const side of [-1,1]){
   seat.push({p:[side*21,44,-130],s:[8,26,25]},{p:[side*21,58,-130],s:[11,4,29]});
   crown.push({p:[side*14.5,68,-140.5],s:[1,58,1]},{p:[side*21,60.3,-130],s:[11,.6,29]});
   for(let feather=0;feather<7;feather++){
    const angle=side*(.35+feather*.12),length=27+feather*3;
    seat.push({p:[side*(23+feather*4),72-feather*1.2,-146],s:[2.8,length,2],r:[0,0,-angle]});
    crown.push({p:[side*(23+feather*4),72-feather*1.2,-144.8],s:[.4,length,1],r:[0,0,-angle]});
   }
  }
  for(let i=-3;i<=3;i++){seat.push({p:[i*4.2,101+(3-Math.abs(i))*2.7,-144],s:[2,10+(3-Math.abs(i))*5,3]});}
  batch(box,throneIvory,seat,this.throne);batch(box,throneGold,crown,this.throne);
  // Three astronomical orbits frame the throne. Their markers give slow motion scale.
  const marks:Piece[]=[];
  for(let ring=0;ring<3;ring++){
   const radius=42+ring*11,mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,.38+ring*.10,8,160),throneGold);
   mesh.position.set(0,68,-157-ring*3);mesh.rotation.set(ring===1?.35:0,ring===2?-.3:0,0);this.halos.add(mesh);this.haloRings.push(mesh);
   for(let i=0;i<64;i++){
    const a=i*Math.PI/32;marks.push({p:[Math.sin(a)*radius,68+Math.cos(a)*radius,-157-ring*3],s:[i%8===0?.8:.3,i%8===0?4:1.6,.4],r:[0,0,-a]});
   }
  }
  this.ornaments=batch(box,throneGold,marks,this.halos);
  // The first thing seen beyond space is a single immense, luminous threshold.
  const aperture=new THREE.Mesh(new THREE.TorusGeometry(29,.6,8,128),gateGold);aperture.position.set(0,37,-80);this.group.add(aperture);
  const core=new THREE.Mesh(new THREE.SphereGeometry(5,24,16),new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,toneMapped:false,vertexShader:'varying vec3 vNormal,vEye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vEye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform float heavenThrone;varying vec3 vNormal,vEye;void main(){float rim=pow(max(0.,dot(normalize(vNormal),normalize(vEye))),.7);gl_FragColor=vec4(vec3(2.,1.7,1.12),rim*heavenThrone);}'}));
  core.name='veiled-divine-presence';core.position.set(0,67,-126);core.scale.set(1.1,3.1,1.1);this.throne.add(core);
  const aura=new THREE.Mesh(new THREE.PlaneGeometry(28,65),new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:'varying vec2 holyUV;void main(){holyUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'uniform float heavenThrone;varying vec2 holyUV;void main(){vec2 p=(holyUV-.5)*2.;float core=exp(-p.x*p.x*25.-p.y*p.y*4.);float glow=exp(-dot(p,p)*3.);gl_FragColor=vec4(1.8,1.3,.48,(core*.32+glow*.12)*heavenThrone);}'}));
  aura.position.set(0,67,-119);this.throne.add(aura);
  const rays:Piece[]=[];for(let i=0;i<12;i++){const a=i*Math.PI/6; rays.push({p:[Math.sin(a)*58,85,Math.cos(a)*58],s:[1.8,180,1.8]});}
  batch(new THREE.CylinderGeometry(.25,1,1,8,1,true),new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide,
   vertexShader:'varying vec2 beamUV;void main(){beamUV=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
   fragmentShader:'uniform float heavenPresence;varying vec2 beamUV;void main(){float fade=sin(beamUV.y*3.141593);gl_FragColor=vec4(1.,.84,.49,fade*fade*heavenPresence*.055);}'}),rays);
  const seeds=new Float32Array(600*3);for(let i=0;i<600;i++){const a=i*2.39996323,r=36+((i*73)%120);seeds.set([Math.cos(a)*r,-18+(i*29)%138,Math.sin(a)*r],i*3);}
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(seeds,3));
  this.dust=new THREE.Points(dustGeo,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:'uniform float heavenClock;varying float fade;void main(){vec3 p=position;p.y+=sin(heavenClock*.09+position.x)*1.8;vec4 v=modelViewMatrix*vec4(p,1.);fade=clamp(100./max(1.,-v.z),.2,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(160./max(1.,-v.z),1.,3.);}',
   fragmentShader:'uniform float heavenPresence;varying float fade;void main(){float a=pow(max(0.,1.-length(gl_PointCoord-.5)*2.),3.);gl_FragColor=vec4(1.,.78,.35,a*fade*heavenPresence*.7);}'}));
  this.dust.frustumCulled=false;this.group.add(this.dust);this.attachFloor(floor);
 }
 private attachFloor(material:THREE.MeshBasicMaterial){
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
   previous.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 heavenWorld,heavenNormal;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
    vec4 hp=vec4(transformed,1.);vec3 hn=normal;
    #ifdef USE_INSTANCING
    hp=instanceMatrix*hp;hn=mat3(instanceMatrix)*hn;
    #endif
    heavenWorld=(modelMatrix*hp).xyz;heavenNormal=normalize(mat3(modelMatrix)*hn);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 heavenWorld,heavenNormal;uniform float heavenFloor,heavenArrival;').replace('#include <opaque_fragment>',`
    if(heavenFloor>.001){
     vec2 p=heavenWorld.xz;float radius=length(p),az=atan(p.y,p.x);
     float vein=sin(p.x*.55+sin(p.y*.26)*2.1+sin(p.x*.11+p.y*.19));
     float marble=.9+.07*vein+.03*sin(p.y*3.+p.x*.4);
     vec2 cell=abs(fract(p/3.)-.5);float joint=smoothstep(.475,.49,max(cell.x,cell.y));
     float rings=min(min(abs(radius-8.),abs(radius-17.)),min(abs(radius-25.),abs(radius-30.)));
     float inlay=1.-smoothstep(.055,.12,rings);
     float spokes=(1.-smoothstep(.006,.015,abs(sin(az*8.))))*smoothstep(17.,18.,radius)*(1.-smoothstep(29.,30.,radius));
     inlay=max(inlay,spokes);
     float star=abs(radius-(5.4+1.8*cos(az*8.)));
     inlay=max(inlay,(1.-smoothstep(.055,.12,star))*(1.-smoothstep(8.,9.,radius)));
     inlay=max(inlay,1.-smoothstep(.04,.10,abs(radius-1.5)));
     vec3 ivory=vec3(.73,.67,.53)*marble*(1.-joint*.19);
     float top=.50+.50*max(0.,heavenNormal.y);
     vec3 holy=mix(ivory,vec3(.86,.51,.12),inlay)*top;
     float wave=exp(-abs(radius-heavenArrival*38.)*1.5)*(1.-smoothstep(.92,1.,heavenArrival));
     holy+=vec3(.65,.35,.08)*wave*(.2+inlay*.8);
     outgoingLight=mix(outgoingLight,holy,heavenFloor);
    }
    #include <opaque_fragment>`);
  };material.customProgramCacheKey=()=>key+'-heaven-marble-v1';
 }
 configure(quality:string,reduced=false){this.reduced=reduced;this.dust.geometry.setDrawRange(0,quality==='low'?180:600);this.ornaments.count=quality==='low'?128:192;}
 update(time:number,enabled=true){
  const s=heavenAt(time,this.state,this.sky),u=this.uniforms;
  u.heavenPresence.value=enabled?s.presence:0;u.heavenThrone.value=enabled?s.throne:0;u.heavenGate.value=enabled?s.gate:0;u.heavenFloor.value=enabled?s.floor:0;u.heavenArrival.value=s.arrival;u.heavenClock.value=this.reduced?0:s.clock;
  this.group.visible=enabled&&Math.max(s.presence,s.gate)>.001;this.group.position.y=this.reduced?0:s.lift;
  this.haloRings.forEach((ring,i)=>{ring.rotation.z=this.reduced?0:Math.sin(s.clock*.035+i)*.08;});
 }
 get diagnostics(){return {visible:this.group.visible,presence:this.state.presence,throne:this.state.throne,floor:this.state.floor,lift:this.group.position.y,instances:this.batches.reduce((n,m)=>n+m.count,0),batches:this.batches.length,reduced:this.reduced};}
}
