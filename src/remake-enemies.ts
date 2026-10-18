import {buildTowerStructure} from './tower-geometry';
import * as THREE from 'three';
import {createSpiderAnatomy} from './spider-anatomy';
import {createEnemySurfaceMaterial,prepareEnemySurfaceGeometry,type EnemySurfaceRole} from './enemy-surface-material';
import {createTowerMaterial,createTowerCrystalMaterial,type TowerFinish} from './tower-material';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {MeshoptSimplifier} from 'meshoptimizer';
import {EnvironmentLighting} from './environment-lighting';
import {attachEnemySurfaceLight} from './enemy-surface-lighting';
import {RemakeModelLibrary,type RemakeModel} from './remake-model-library';
import {ENEMY_KINDS,isSkull,isSpider,isPede,skullTier,type EnemyKind} from './enemy-kinds';
import {SQUID_I_GEM,SQUID_II_GEMS,SQUID_III_GEMS,LEVIATHAN_GEMS,SPIDER_GEM,SPIDER_SIZE,SPIDER_CRYSTAL_RADIUS,CREATURE_SCALE_RATIO,towerPartOffset,towerFoundationPose,towerCrystalRadius,enemyEmergenceScale} from './enemy-presentation';
import {crystalImpactScale} from './impact-presentation';
import {TILE_SIZE} from './arena';
import {buildSerpentHead,buildSerpentArmor} from './serpent-geometry';
import {towerFloorHeight} from './enemy-floor';
import type {Enemy} from './simulation';

export const REMAKE_NAMES:Record<EnemyKind,string>={skull:'Cinder Wasp',skull2:'Iron Wasp',skull3:'Veilwing',skull4:'Drake',transmuted1:'Hollow Wasp',transmuted2:'Hollow Stinger',transmuted3:'Hollow Veilwing',transmuted4:'Hollow Drake',squid:'Rift Obelisk',squid2:'Twin Foundry',squid3:'Crown Citadel',spider:'Brood Weaver',spider2:'Armored Matriarch',egg:'Brood Capsule',egg2:'Armored Capsule',spiderling:'Skitter',centipede:'Iron Convoy',gigapede:'Gilded Convoy',ghostpede:'Hollow Convoy',leviathan:'Astral Sovereign',orb:'Rift Heart',thorn:'Fracture Spire'};

/** Licensed community creatures and project-authored parts, behind the existing
 * renderer interface. No enemy geometry or textures load from the original game. */
export class RemakeEnemies{
 readonly surfaceLightStrength={value:1};ready=false;error='';loaded:Promise<void>;
 templates=new Map<EnemyKind,THREE.Group>();segmentTemplate=new THREE.Group();
 gemGeometry=new THREE.OctahedronGeometry(.2,0).scale(1,1.5,1);
 gemMaterial:THREE.Material=new THREE.MeshBasicMaterial({color:0xff9560,toneMapped:false});
 tileGeometry:THREE.BufferGeometry=new THREE.BoxGeometry(TILE_SIZE-.025,1.5,TILE_SIZE-.025).translate(0,-.75,0);
 private library=new RemakeModelLibrary();private clock={value:0};private segments=new Map<EnemyKind,THREE.Group>();
 private animationNodes=new WeakMap<THREE.Group,THREE.Object3D[]>();private materials=new Map<string,THREE.MeshBasicMaterial>();
 private surfaceMaterials=new Map<string,THREE.MeshStandardMaterial>();
 private surface(kind:EnemyKind,role:EnemySurfaceRole,green=false,hit=false){
  const key=`${kind}-${role}-${green}-${hit}`;let material=this.surfaceMaterials.get(key);
  if(!material){material=createEnemySurfaceMaterial(kind,role,this.environment,this.clock,{green,hit});this.surfaceMaterials.set(key,material);}
  return material;
 }
 private towerCrystals=new Map<boolean,THREE.MeshStandardMaterial>();
 private towerCore(hit=false){
  let material=this.towerCrystals.get(hit);if(!material){material=createTowerCrystalMaterial(hit);this.towerCrystals.set(hit,material);}return material;
 }
 private towerMaterials=new Map<string,THREE.MeshStandardMaterial>();
 private towerMaterial(tier:number,finish:TowerFinish){
  const key=`${tier}-${finish}`;let material=this.towerMaterials.get(key);
  if(!material){material=createTowerMaterial(tier,finish,this.environment);this.towerMaterials.set(key,material);}
  return material;
 }
 private crystal=new THREE.OctahedronGeometry(1,0);
 private serpentCrystal=new THREE.IcosahedronGeometry(1,0);
 constructor(private environment=new EnvironmentLighting()){this.loaded=this.load().catch(error=>{this.error=error instanceof Error?(error.stack??String(error)):String(error);console.error('Free creature models could not load:',error);});}
 private material(key:string,color:number,map=false){
  let material=this.materials.get(key);if(material)return material;
  material=new THREE.MeshBasicMaterial({color,...map?{map:this.library.palette}:{},toneMapped:false});material.name='remake-'+key;
  this.environment.attach(material);attachEnemySurfaceLight(material,this.surfaceLightStrength);
  if(map){const compile=material.onBeforeCompile,cache=material.customProgramCacheKey();
   material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material!,shader,renderer);shader.uniforms.remakeTime=this.clock;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float remakeTime;attribute float motionWeight;')
     .replace('#include <begin_vertex>',`#include <begin_vertex>
      float phase=0.;
      #ifdef USE_INSTANCING
      phase=instanceMatrix[3].x*.7+instanceMatrix[3].z*.4;
      #endif
      transformed.y+=sin(remakeTime*16.+phase)*motionWeight*abs(position.x)*.32;`);
   };material.customProgramCacheKey=()=>cache+'-community-motion-v1';
  }
  this.materials.set(key,material);return material;
 }
 private core(hit=false,green=false,kind:EnemyKind='centipede'){return this.surface(kind,'jewel',green,hit);}
 private metal(){return this.surface('centipede','metal');}
 private async load(){await this.library.load();for(const kind of ENEMY_KINDS)this.templates.set(kind,this.build(kind));for(const kind of ['centipede','gigapede','ghostpede'] as const)this.segments.set(kind,this.buildSegment(kind));this.segmentTemplate=this.buildSegment('centipede');this.ready=true;}
 private creature(name:RemakeModel,span:number,kind:EnemyKind,swarm=false){return this.library.mesh(name,span,this.surface(kind,'body'),swarm);}
 private mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,name:string,x=0,y=0,z=0){
  if(material.userData.enemySurface)prepareEnemySurfaceGeometry(geometry,material.userData.enemySurface.role);
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 }
 private crystalAt(parent:THREE.Object3D,name:string,point:{x:number;y:number;z:number},radius:number,green=false,kind:EnemyKind='centipede'){
  const mesh=this.mesh(parent,isPede(kind)?this.serpentCrystal:this.crystal,this.core(false,green,kind),name,point.x,point.y,point.z);mesh.scale.setScalar(radius);mesh.userData.crystalKind=kind;mesh.userData.crystalGreen=green;return mesh;
 }
 private hoop(parent:THREE.Object3D,radius:number,tube:number,y:number,material:THREE.Material=this.metal(),name='foundry-ring'){const mesh=this.mesh(parent,new THREE.TorusGeometry(radius,tube,5,16),material,name,0,y,0);mesh.rotation.x=Math.PI/2;return mesh;}
 private build(kind:EnemyKind){
  const root=new THREE.Group(),rig=new THREE.Group();root.name=kind;root.userData={source:'licensed-community-remake',label:REMAKE_NAMES[kind],original:false};root.add(rig);
  if(isSkull(kind)){
   // Gem-carrying Iron Wasps need a distinct silhouette within the normal swarm.
   const tier=skullTier(kind),source=(['armabee','armabee-evolved','hywirl','dragon'] as const)[tier-1],span=[1.65,1.65*2.5,2.2,3.8][tier-1],hollow=kind.startsWith('transmuted');
   rig.add(this.creature(hollow&&tier===3?'ghost':source,span,kind,true));
   if(hollow){const halo=this.hoop(rig,span*.35,.05,-span*.1,this.surface(kind,'halo'),'hollow-halo');halo.rotation.x=.35;}
  }else if(kind.startsWith('squid')){
   this.buildTower(rig,kind);
  }else if(isSpider(kind)){
   const size=SPIDER_SIZE*(kind==='spider2'?2:1),anatomy=createSpiderAnatomy(kind,this.surface(kind,'body'),size);rig.add(anatomy.root);
   this.crystalAt(anatomy.head,'spider-held-gem',{x:0,y:SPIDER_GEM.y*size-anatomy.head.position.y,z:SPIDER_GEM.z*size-anatomy.head.position.z},SPIDER_CRYSTAL_RADIUS*size,true,kind);
  }else if(kind==='egg'||kind==='egg2'){
   const radius=kind==='egg2'?.75:.6,shell=this.mesh(rig,new THREE.IcosahedronGeometry(radius,1),this.surface(kind,'shell'),'capsule');shell.scale.y=1.3;
   this.hoop(rig,radius*.98,.075,0,this.core(false,true,kind),'capsule-seam');this.crystalAt(rig,'capsule-tip',{x:0,y:radius,z:0},.18,true,kind);
  }else if(kind==='spiderling')rig.add(createSpiderAnatomy(kind,this.surface(kind,'body'),.16).root);
  else if(isPede(kind)){
   buildSerpentHead(rig,kind,role=>this.surface(kind,role));
  }else if(kind==='leviathan'){
   const body=this.creature('dragon-evolved',21,kind);body.position.y=1.3;rig.add(body);this.hoop(rig,8.35,.22,-2.9,this.surface(kind,'metal'),'sovereign-ring');LEVIATHAN_GEMS.forEach((point,i)=>this.crystalAt(rig,`weak-point-${i}`,point,.85,false,kind));
  }else if(kind==='orb'){
   rig.add(this.creature('ghost',4.3,kind));const heart=this.mesh(rig,new THREE.IcosahedronGeometry(1.1,1),this.surface(kind,'rift'),'rift-heart');heart.userData.spin=true;
   for(let i=0;i<3;i++){const ring=this.hoop(rig,2+i*.24,.075,0,this.surface(kind,'metal'),'rift-band');ring.rotation.set(i*.85,.4+i*.7,.5);ring.userData.spin=true;}
  }else if(kind==='thorn'){
   this.mesh(rig,new THREE.CylinderGeometry(.85,1.5,.7,6),this.surface(kind,'metal'),'spire-base',0,-.5,0);
   for(let i=0;i<7;i++){const a=i*Math.PI*2/7,spire=this.mesh(rig,new THREE.ConeGeometry(i===0?.55:.3,i===0?7:4.5,5),this.surface(kind,'shell'),'fracture-spire',i?Math.sin(a)*.8:0,i===0?1.8:1,i?Math.cos(a)*.8:0);spire.rotation.z=i?Math.sin(a)*.22:0;spire.rotation.x=i?Math.cos(a)*.22:0;}
  }
  root.updateMatrixWorld(true);return root;
 }
 /** Original architecture: hollow exhaust shafts, buttresses and opening crowns.
  * The crystals and crown outlets stay at the existing combat coordinates. */
 private buildTower(rig:THREE.Group,kind:EnemyKind){
  const tier=Number(kind.slice(5))||1,points=tier===1?[SQUID_I_GEM]:tier===2?SQUID_II_GEMS:SQUID_III_GEMS;
  buildTowerStructure(rig,kind,finish=>finish==='glow'?this.towerCore():this.towerMaterial(tier,finish));
  points.forEach((point,i)=>{this.crystalAt(rig,`weak-point-${i}`,point,towerCrystalRadius(kind)).material=this.towerCore();});
 }
 private buildSegment(kind:EnemyKind){
  const root=new THREE.Group(),rig=new THREE.Group();root.add(rig);rig.scale.setScalar(kind==='gigapede'?1.5:kind==='ghostpede'?2:1);
  buildSerpentArmor(rig,kind,role=>this.surface(kind,role));
  this.crystalAt(rig,'segment-weak-point',{x:0,y:0,z:0},.53*CREATURE_SCALE_RATIO,kind==='ghostpede',kind);
  return root;
 }
 createSwarmBatch(kind:EnemyKind,capacity:number){
  const template=this.templates.get(kind)!;template.updateMatrixWorld(true);const groups=new Map<THREE.Material,THREE.BufferGeometry[]>();
  template.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);const material=node.material as THREE.Material;const list=groups.get(material)??[];list.push(geometry);groups.set(material,list);});
  return [...groups].map(([material,list])=>{let geometry=mergeGeometries(list);list.forEach(g=>g.dispose());if(!geometry)throw Error(`Cannot instance ${kind}`);
   if(kind==='spiderling'){
    // Keep the close inspection mesh detailed; swarms retain anatomy and gait
    // attributes through the same bounded-error reduction used by flying enemies.
    geometry.deleteAttribute('normal');const reduced=mergeVertices(geometry,1e-5);geometry.dispose();
    const [indices]=MeshoptSimplifier.simplify(new Uint32Array(reduced.index!.array),reduced.getAttribute('position').array as Float32Array,3,1100*3,.035);
    reduced.setIndex(new THREE.BufferAttribute(indices,1));reduced.computeVertexNormals();geometry=reduced;
   }
   geometry.computeBoundingSphere();const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;return mesh;});
 }
 clone(kind:EnemyKind){const root=this.templates.get(kind);if(!root)throw Error(`Free ${kind} model not ready`);return root.clone();}
 setTime(time:number){this.clock.value=time;}
 animate(model:THREE.Group,enemy:Enemy,time:number,originalCadence=false){
  this.setTime(time);
  if(enemy.kind.startsWith('squid')){
   const scale=enemyEmergenceScale(enemy),bottom=(towerFloorHeight(enemy,time)-enemy.pos.y)/Math.max(.0001,scale);
   const foundation=model.getObjectByName('tower-foundation'),plinth=model.getObjectByName('tower-plinth');
   const pose=towerFoundationPose(bottom);
   if(foundation){foundation.position.y=pose.footY;foundation.scale.y=pose.footScale;}
   if(plinth)plinth.position.y=pose.plinthY;
  }
  let nodes=this.animationNodes.get(model);
  if(!nodes){nodes=[];model.traverse(node=>{if(node.name.startsWith('weak-point-')||node.name==='spider-held-gem'||node.name==='spider-head-pivot'||node.name==='warden-crest'||node.userData.spin||node.userData.serpentMotion)nodes!.push(node);if(node.name.startsWith('weak-point-')){node.userData.crystalIndex=Number(node.name.slice(11));node.userData.crystalHp=enemy.weakpoints[node.userData.crystalIndex]?.hp??1;node.userData.crystalHitAt=-Infinity;node.userData.crystalBaseScale=node.scale.clone();}node.userData.restY=node.position.y;if(node.userData.serpentMotion==='vertebra')node.userData.serpentPhase=nodes!.length*.63;});this.animationNodes.set(model,nodes);}
  for(const node of nodes){
   if(node.name.startsWith('weak-point-')){const state=node.userData,hp=enemy.weakpoints[state.crystalIndex]?.hp??1;if(hp<state.crystalHp)state.crystalHitAt=time;else if(hp>state.crystalHp||time<state.crystalHitAt)state.crystalHitAt=-Infinity;state.crystalHp=hp;if(enemy.kind.startsWith('squid')&&enemy.weakpoints[state.crystalIndex]){const point=enemy.weakpoints[state.crystalIndex].local;node.position.set(point.x,point.y,point.z);}node.visible=hp>0;node.scale.copy(state.crystalBaseScale).multiplyScalar(crystalImpactScale(time-state.crystalHitAt));const hit=node.visible&&enemy.hp>0&&time-state.crystalHitAt<.16;(node as THREE.Mesh).material=enemy.kind.startsWith('squid')?this.towerCore(hit):this.core(hit,state.crystalGreen===true,state.crystalKind??enemy.kind);}
   else if(node.name==='spider-held-gem')(node as THREE.Mesh).material=this.core(time-enemy.lastHit>=0&&time-enemy.lastHit<.18,true,enemy.kind);
   else if(node.name==='spider-head-pivot')node.rotation.x=(1-enemy.headExposure)*.9;
   else if(node.name==='warden-crest')node.position.y=node.userData.restY+towerPartOffset(enemy,'crest',originalCadence);
   else if(node.userData.serpentMotion==='jaw')node.rotation.x=.07+Math.sin(time*1.8+enemy.id)*.045;
   else if(node.userData.serpentMotion==='vertebra'){
    // The armor breathes around stationary damage targets, with a wave down the spine.
    const phase=node.userData.serpentPhase;node.rotation.z=Math.sin(time*2.4-phase)*.035;
    const count=enemy.segments.length;let index=node.userData.serpentIndex;if(index===undefined)node.userData.serpentIndex=index=model.children.filter(child=>child.name==='segment').indexOf(node.parent!.parent as THREE.Group);
    const tail=index<0?1:1-.16*Math.pow(THREE.MathUtils.clamp((index/Math.max(1,count-1)-.65)/.35,0,1),1.5);
    node.scale.setScalar(tail);
   }
   else if(node.userData.spin){node.rotation.y=time*.4;node.rotation.z=time*.2;}
  }
 }
 segment(alive:boolean,kind:EnemyKind='centipede'){const root=(this.segments.get(kind)??this.segmentTemplate).clone();root.traverse(node=>{if(node.name==='segment-weak-point')node.visible=alive;});return root;}
}
