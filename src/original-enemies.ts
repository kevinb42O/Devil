import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {type Enemy, type EnemyKind} from './simulation';
import {CREATURE_SCALE} from './enemy-presentation';
import {ENEMY_KINDS,isPede} from './enemy-kinds';
const ROOT='/assets/original/devil-daggers/';
const parts={
 squid:['minisquidcrest','minisquidcrestskull','minisquidhorns','minisquidjaw','minisquidjawskull','minisquidgem','squidarm'],
 squid2:['squidcrest','squidcrestskull','squidhorns','squidjaws','squidjawskull','squidgem','squidarm','squidteeth'],
 spider:['spiderbody','spiderhead','spiderjaw','spiderfangs','spiderpalm','spiderleg1','spiderleg2','spiderleg3'],
 skull:['boid'],skull2:['boid2','boid2horns'],egg:['spideregg1'],
 spiderling:['spiderling','spiderlingpalms','spiderlingleg1','spiderlingleg2','spiderlingleg3'],
 squid3:['ultrasquidcrest','ultrasquidcrestskull','ultrasquidhorns','ultrasquidjaw','ultrasquidjawskull','ultrasquidgem','ultrasquidtent','ultrasquidteeth'],
 skull3:['boid3','boid3horns','boid3jaw'],skull4:['boid4','boid4jaw'],
 leviathan:['levicrown','levicrownjaw','levicrown2','levicrown2jaw','levigem','levitent','levitent2','leviskull','leviskulljaw','levidividerskull','leviorb'],
 orb:['immortalorb'],thorn:['thorn'],spider2:['gigaspiderbody','gigaspiderhead','gigaspiderjaw','gigaspiderfangs','gigaspiderpalm','gigaspidercrest','gigaspiderhorns'],egg2:['spideregg2'],
 ghostpede:['ultrapedecrown'],
 centipede:['pedehead','pedejaw','pedetail','pedetaillegs','pedebody','pedeweak','pedeleg1','pedeleg2','pedeleg3']
};
export class OriginalEnemies {
 ready=false;error='';loaded:Promise<void>;templates=new Map<EnemyKind,THREE.Group>();segmentTemplate=new THREE.Group();gemGeometry!:THREE.BufferGeometry;gemMaterial!:THREE.Material;tileGeometry!:THREE.BufferGeometry;
 private geometry=new Map<string,THREE.BufferGeometry>();private materials=new Map<string,THREE.MeshBasicMaterial>();
 private segmentTemplates=new Map<EnemyKind,THREE.Group>();
 private orbMaterial!:THREE.ShaderMaterial;
 private armMaterial!:THREE.ShaderMaterial;private materialClock={value:0};
 constructor(){this.loaded=this.load().catch(error=>{this.error=String(error);console.error('Original enemy assets could not load:',error);});}
 private async load(){
  const names=[...new Set(Object.values(parts).flat().concat(['gib','tile2']))];const loader=new OBJLoader(),textureLoader=new THREE.TextureLoader();
  const textureNames=[...new Set(names.filter(n=>!['minisquidgem','squidgem','ultrasquidgem','levigem','pedeweak','spiderlingpalms','tile2','leviorb','immortalorb','ultrasquidtent','ultrasquidteeth'].includes(n)).concat(['crystal','minisquidarm','squidarm','spiderlingpalm','boidlev','boid2lev','boid2hornslev','boid3lev','boid3hornslev','boid3jawlev','boid4lev','boid4jawlev','leviwarp','pedeblackhead','pedeblackjaw','pedeblackbody','pedeblackleg1','pedeblackleg2','pedeblackleg3','pedeblackbodyfragged','pedeblackleg1fragged','pedeblackleg2fragged','pedeblackleg3fragged','ultrapedehead','ultrapedejaw','ultrapedebody','ultrapedeleg1','ultrapedeleg2','ultrapedeleg3','gigaspiderleg1','gigaspiderleg2','gigaspiderleg3']))];
  await Promise.all(textureNames.map(async name=>{
   const map=await textureLoader.loadAsync(ROOT+`textures/${name}.png`);map.magFilter=map.minFilter=THREE.NearestFilter;map.generateMipmaps=false;map.colorSpace=THREE.SRGBColorSpace;
   const material=new THREE.MeshBasicMaterial({map,toneMapped:false});
   // Original boid shader snaps world vertices to a 1/16 grid.
   material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 localPosition=vec4(transformed,1.);
#ifdef USE_INSTANCING
localPosition=instanceMatrix*localPosition;
#endif
vec4 originalWorld=modelMatrix*localPosition;originalWorld.xyz=floor(originalWorld.xyz*16.)/16.;vec4 mvPosition=viewMatrix*originalWorld;gl_Position=projectionMatrix*mvPosition;`);};
   this.materials.set(name,material);
  }));
  await Promise.all(names.map(async name=>{const response=await fetch(ROOT+`meshes/${name}.obj`);if(!response.ok)throw Error(`Original ${name} mesh missing`);const object=loader.parse(await response.text());object.traverse(o=>{if(o instanceof THREE.Mesh)this.geometry.set(name,o.geometry);});if(!this.geometry.has(name))throw Error(`No geometry in ${name}`);}));
  const armMap=this.materials.get('minisquidarm')!.map!;
  this.armMaterial=new THREE.ShaderMaterial({uniforms:{map:{value:armMap},time:this.materialClock},vertexShader:`varying vec2 u;uniform float time;void main(){u=uv;vec3 p=position;float wave=clamp((-p.y-1.5)*.5,0.,1.)*.5;float curve=pow(max(0.,-p.y),2.1)*.07;vec3 off=wave*vec3(0.,0.,sin(curve-time*.7)*.6);p+=off;float angle=atan(p.z,p.x)-wave*curve*.35;float len=length(p.xz);p.x=sin(angle)*len;p.z=-cos(angle)*len;vec4 w=modelMatrix*vec4(p,1.);w.xyz=floor(w.xyz*16.)/16.;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`uniform sampler2D map;varying vec2 u;void main(){vec4 c=texture2D(map,u);gl_FragColor=c;}`,side:THREE.DoubleSide,toneMapped:false});
  const warpMap=this.materials.get('leviwarp')!.map!;warpMap.wrapS=warpMap.wrapT=THREE.RepeatWrapping;
  // Adapted from the original warpeye shader; animation parameter speed remains unmeasured.
  this.orbMaterial=new THREE.ShaderMaterial({uniforms:{map:{value:warpMap},time:this.materialClock},transparent:true,side:THREE.DoubleSide,toneMapped:false,vertexShader:`varying vec2 u;varying vec3 viewDir;uniform float time;void main(){u=position.yy*.03+vec2(time*.08,0.);vec4 w=modelMatrix*vec4(position,1.);w.xyz=floor(w.xyz*16.)/16.;viewDir=w.xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`uniform sampler2D map;uniform float time;varying vec2 u;varying vec3 viewDir;void main(){vec3 d=normalize(viewDir);vec2 hackuv=vec2(d.y/max(.001,length(d.xz))*.5+time,atan(d.z,d.x)/3.14159*3.);vec3 c=texture2D(map,hackuv).rgb;gl_FragColor=vec4(c,.65);}`});
  // Keep attached weak-point crystals luminous even with the native unlit materials.
  this.materials.get('crystal')!.color.setRGB(2.5,1.2,.8);
  for(const kind of ENEMY_KINDS)this.templates.set(kind,this.build(kind));
  for(const kind of ['centipede','gigapede','ghostpede'] as const)this.segmentTemplates.set(kind,this.buildSegment(kind));
  this.segmentTemplate=this.buildSegment();this.gemGeometry=this.geometry.get('gib')!.clone().scale(.55,.55,.55);this.gemMaterial=this.materials.get('crystal')!;this.tileGeometry=this.geometry.get('tile2')!.clone().translate(0,-2.1,0).scale(CREATURE_SCALE,CREATURE_SCALE,CREATURE_SCALE);this.ready=true;
 }
 private part(name:string,texture=name):THREE.Mesh<THREE.BufferGeometry,THREE.Material>{const mapName=['minisquidgem','squidgem','ultrasquidgem','levigem','pedeweak'].includes(name)?'crystal':name==='spiderlingpalms'?'spiderlingpalm':['leviorb','immortalorb'].includes(name)?'leviwarp':name==='ultrasquidtent'?'squidarm':name==='ultrasquidteeth'?'squidteeth':texture;
  const material=this.materials.get(mapName);if(!material)throw Error(`Material ${mapName} missing`);const mesh=new THREE.Mesh(this.geometry.get(name)!,material);mesh.name=name;return mesh;}
 private build(kind:EnemyKind):THREE.Group{
  if(kind.startsWith('transmuted')){const tier=Number(kind.slice(-1));const root=this.build(tier===1?'skull':`skull${tier}` as EnemyKind);root.name=kind;root.traverse(o=>{if(o instanceof THREE.Mesh){const material=this.materials.get(o.name+'lev');if(material)o.material=material;}});return root;}
  if(kind==='spider2'){const root=this.build('spider');root.name=kind;(root.children[0] as THREE.Group).scale.setScalar(CREATURE_SCALE*2);root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.startsWith('spider')){const name=o.name.replace('spider','gigaspider');if(this.geometry.has(name))o.geometry=this.geometry.get(name)!;if(this.materials.has(name))o.material=this.materials.get(name)!;}});root.children[0].add(this.part('gigaspidercrest'),this.part('gigaspiderhorns'));return root;}
  if(kind==='gigapede'||kind==='ghostpede'){const root=this.build('centipede');root.name=kind;const size=kind==='gigapede'?1.5:2;root.children[0].scale.setScalar(CREATURE_SCALE*size);root.traverse(o=>{if(o instanceof THREE.Mesh){const material=this.materials.get(o.name.replace('pede',kind==='gigapede'?'pedeblack':'ultrapede'));if(material)o.material=material;}});if(kind==='ghostpede')root.children[0].add(this.part('ultrapedecrown'));return root;}
  const root=new THREE.Group(),rig=new THREE.Group();root.name=kind;root.userData.original=true;root.add(rig);
  const scale=kind==='skull'||kind==='skull2'?1:kind==='spiderling'?.065:kind==='egg'?1:CREATURE_SCALE;rig.scale.setScalar(scale);
  if(kind==='skull')rig.add(this.part('boid'));
  if(kind==='skull2')rig.add(this.part('boid2'),this.part('boid2horns'));
  if(kind==='skull3'){rig.scale.setScalar(1);rig.add(this.part('boid3'),this.part('boid3horns'),this.part('boid3jaw'));}
  if(kind==='skull4'){rig.scale.setScalar(1);rig.add(this.part('boid4'),this.part('boid4jaw'));}
  if(kind==='squid') {
   for(const n of ['minisquidcrest','minisquidcrestskull','minisquidhorns','minisquidjaw','minisquidjawskull'])rig.add(this.part(n));
   const gem=this.part('minisquidgem');gem.name='weak-point-0';rig.add(gem);
   for(let i=0;i<3;i++){const arm=new THREE.Mesh(this.geometry.get('squidarm')!,this.armMaterial);arm.name='squid-arm';arm.rotation.y=i*Math.PI*2/3;arm.scale.set(.6,.65,.6);rig.add(arm);}
  }
  if(kind==='squid2') {
   for(const n of ['squidcrest','squidcrestskull','squidhorns'])rig.add(this.part(n));
   const jaw=this.part('squidjaws');jaw.rotation.x=Math.PI;rig.add(jaw);
   for(let i=0;i<2;i++){const jawSkull=this.part('squidjawskull');jawSkull.rotation.y=i*Math.PI;rig.add(jawSkull);const gem=this.part('squidgem');gem.rotation.y=i*Math.PI;gem.name=`weak-point-${i}`;rig.add(gem);}
   for(let i=0;i<6;i++){const arm=new THREE.Mesh(this.geometry.get('squidarm')!,this.armMaterial);arm.rotation.y=i*Math.PI/3;arm.name='squid-arm';rig.add(arm);const teeth=this.part('squidteeth');teeth.rotation.y=i*Math.PI/3;rig.add(teeth);}
  }
  if(kind==='squid3'){
   rig.add(this.part('ultrasquidcrest'),this.part('ultrasquidcrestskull'),this.part('ultrasquidhorns'));
   for(let i=0;i<3;i++){const group=new THREE.Group();group.rotation.y=i*Math.PI*2/3;group.add(this.part('ultrasquidjaw'),this.part('ultrasquidjawskull'),this.part('ultrasquidteeth'),this.part('ultrasquidtent'));const gem=this.part('ultrasquidgem');gem.name=`weak-point-${i}`;group.add(gem);rig.add(group);}
  }
  if(kind==='leviathan'){
   const orb=this.part('leviorb');orb.material=this.orbMaterial;rig.add(orb,this.part('leviskull'),this.part('leviskulljaw'));
   for(let i=0;i<3;i++){const group=new THREE.Group();group.rotation.y=i*Math.PI*2/3;group.add(this.part('levicrown'),this.part('levicrownjaw'),this.part('levicrown2'),this.part('levicrown2jaw'),this.part('levitent'),this.part('levitent2'),this.part('levidividerskull'));rig.add(group);}
   for(let i=0;i<6;i++){const gem=this.part('levigem');gem.rotation.y=i*Math.PI/3;gem.name=`weak-point-${i}`;rig.add(gem);}
  }
  if(kind==='orb'){const orb=this.part('immortalorb');orb.material=this.orbMaterial;rig.add(orb);}
  if(kind==='thorn')rig.add(this.part('thorn'));
  if(kind==='egg2')rig.add(this.part('spideregg2'));
  if(kind==='spider') {
   rig.add(this.part('spiderbody'),this.part('spiderpalm'));
   const head=new THREE.Group();head.name='spider-head-pivot';head.position.set(0,.2,1);
   for(const n of ['spiderhead','spiderjaw','spiderfangs']){const part=this.part(n);part.position.set(0,-.2,-1);head.add(part);}
   const gem=this.part('gib','crystal');gem.name='spider-held-gem';gem.scale.setScalar(.6);gem.position.set(0,.05,1.45);head.add(gem);
   rig.add(head);
   for(const side of [-1,1])for(let i=0;i<4;i++){
    const z=(i-1.5)*.95;const hip=new THREE.Vector3(side*1.25,-.15,z);
    const knee=new THREE.Vector3(side*3.2,.35,z*1.8),ankle=new THREE.Vector3(side*4.7,-1.45,z*2.5),foot=new THREE.Vector3(side*6,-2.5,z*3);
    const leg=new THREE.Group();leg.name='spider-leg';leg.userData.side=side;leg.userData.phase=i+side;
    this.bone(leg,'spiderleg1',hip,knee,1.65);this.bone(leg,'spiderleg2',knee,ankle,1.53);this.bone(leg,'spiderleg3',ankle,foot,1.4);rig.add(leg);
   }
  }
  if(kind==='egg')rig.add(this.part('spideregg1'));
  if(kind==='spiderling') {
   rig.add(this.part('spiderling'),this.part('spiderlingpalms'));
   for(const side of [-1,1])for(let i=0;i<4;i++){
    const start=new THREE.Vector3(side*2,2,(i-1.5)*1.3),end=new THREE.Vector3(side*6,-1,(i-1.5)*3);
    const leg=this.part(`spiderlingleg${1+i%3}`);leg.position.copy(start);leg.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),end.clone().sub(start).normalize());rig.add(leg);
   }
  }
  if(kind==='centipede')rig.add(this.part('pedehead'),this.part('pedejaw'));
  return root;
 }
 private bone(parent:THREE.Group,name:string,a:THREE.Vector3,b:THREE.Vector3,length:number,axis=new THREE.Vector3(0,0,1)) {
  const bone=this.part(name);bone.position.copy(a);const d=b.clone().sub(a);bone.quaternion.setFromUnitVectors(axis,d.clone().normalize());if(axis.x)bone.scale.x=d.length()/length;else bone.scale.z=d.length()/length;parent.add(bone);
 }
 private buildSegment(kind:EnemyKind='centipede'){
  const root=new THREE.Group(),rig=new THREE.Group();root.add(rig);rig.scale.setScalar(CREATURE_SCALE);rig.add(this.part('pedebody'));
  const gem=this.part('pedeweak');gem.name='segment-weak-point';rig.add(gem);
  if(kind!=='centipede'){rig.scale.setScalar(CREATURE_SCALE*(kind==='gigapede'?1.5:2));const body=rig.children[0] as THREE.Mesh;body.material=this.materials.get(kind==='gigapede'?'pedeblackbody':'ultrapedebody')!;}
  const legs=new THREE.Group();
  for(const side of [-1,1])for(const z of [-.35,.35]){
   const a=new THREE.Vector3(side*.85,.2,z),b=new THREE.Vector3(side*1.55,-.1,z*1.3),c=new THREE.Vector3(side*2,-.55,z*1.6),d=new THREE.Vector3(side*2.6,-.75,z*2);
   const axis=new THREE.Vector3(1,0,0);this.bone(legs,'pedeleg1',a,b,.95,axis);this.bone(legs,'pedeleg2',b,c,.63,axis);this.bone(legs,'pedeleg3',c,d,.88,axis);
  }
  // Merge reused leg geometry by material without losing the weak-point node.
  const grouped=new Map<THREE.Material,THREE.BufferGeometry[]>();for(const o of legs.children){const mesh=o as THREE.Mesh;mesh.updateMatrix();const geo=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geo.applyMatrix4(mesh.matrix);const arr=grouped.get(mesh.material as THREE.Material)||[];arr.push(geo);grouped.set(mesh.material as THREE.Material,arr);}
  for(const [mat,geos] of grouped){const merged=mergeGeometries(geos);geos.forEach(g=>g.dispose());if(merged)rig.add(new THREE.Mesh(merged,mat));}
  if(kind!=='centipede')rig.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.startsWith('pedeleg'))o.material=this.materials.get(o.name.replace('pede',kind==='gigapede'?'pedeblack':'ultrapede'))!;});
  return root;
 }
 createSwarmBatch(kind:EnemyKind,capacity:number):THREE.InstancedMesh[]{
  const template=this.templates.get(kind)!;template.updateMatrixWorld(true);const grouped=new Map<THREE.Material,THREE.BufferGeometry[]>();
  template.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);const material=o.material as THREE.Material;const group=grouped.get(material)??[];group.push(geometry);grouped.set(material,group);});
  return [...grouped].map(([material,geometries])=>{const geometry=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;return mesh;});
 }
 clone(kind:EnemyKind){const template=this.templates.get(kind);if(!template)throw Error(`Original ${kind} rig not loaded`);return template.clone();}
 animate(model:THREE.Group,enemy:Enemy,time:number){this.materialClock.value=time;model.traverse(o=>{if(o.name==='spider-head-pivot')o.rotation.x=(1-enemy.headExposure)*.9;if(o.name==='spider-leg')o.rotation.y=Math.sin(time*7+o.userData.phase)*.055; if(o.name.startsWith('weak-point-')){const i=Number(o.name.slice(11));o.visible=(enemy.weakpoints?.[i]?.hp??1)>0;}});}
 segment(alive:boolean,kind:EnemyKind='centipede'){const node=(this.segmentTemplates.get(kind)??this.segmentTemplate).clone();node.traverse(o=>{if(o.name==='segment-weak-point')o.visible=alive;});return node;}
}
