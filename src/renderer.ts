import * as THREE from 'three';
import { OriginalWeapon } from './original-weapon';
import {createCrewAvatar,updateCrewArm,disposeCrewAvatar} from './crew-avatar';
import { OriginalEnemies } from './original-enemies';
import { AbyssSky } from './sky';
import {GemLighting} from './gem-lighting';
import {EnemyLighting} from './enemy-lighting';
import {EnemyGlowSources} from './enemy-glow-sources';
import {ProjectileLighting} from './projectile-lighting';
import { enemyYaw, TOWER_SPIN_SPEED } from './enemy-presentation';
import {ARENA_TILES,TILE_SIZE,tileHeight} from './arena';
import {isPede,isSkull,isEgg,ENEMY_KINDS} from './enemy-kinds';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, type Enemy, type EnemyKind, type Effect, type Vec, TIMELINE } from './simulation';
const TAU = Math.PI*2;
const bone = new THREE.MeshStandardMaterial({color:0xaaa58a,roughness:.74,metalness:.12});
const darkBone = new THREE.MeshStandardMaterial({color:0x383d30,roughness:.8,metalness:.22});
const socket = new THREE.MeshStandardMaterial({color:0x080a07,roughness:1});
const flesh = new THREE.MeshStandardMaterial({color:0x493224,roughness:.7,metalness:.15});
const crystal = new THREE.MeshStandardMaterial({color:0xff542b,emissive:0xff280a,emissiveIntensity:3.2,roughness:.24,metalness:.35});
const greenCrystal = new THREE.MeshStandardMaterial({color:0xd9f0b8,emissive:0xaacf76,emissiveIntensity:2,metalness:.4,roughness:.2});
const sphere = new THREE.SphereGeometry(1,16,12), cube = new THREE.BoxGeometry(1,1,1), cone = new THREE.ConeGeometry(1,1,8), gemGeo = new THREE.OctahedronGeometry(.19), segmentGeo = new THREE.IcosahedronGeometry(.78,1);
function shape(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,pos:number[],scale:number[],rotation?:number[]) {
  const m=new THREE.Mesh(geometry,material);m.position.set(pos[0],pos[1],pos[2]);m.scale.set(scale[0],scale[1],scale[2]);if(rotation)m.rotation.set(rotation[0],rotation[1],rotation[2]);parent.add(m);return m;
}
export type VisualSettings={quality:string;fov:number};
export class GameRenderer {
  private crewModels=new Map<string,THREE.Group>();
  private crewNames=new Map<string,string>();
  setCrewNames(members:{id:string;name:string}[]){this.crewNames=new Map(members.map(p=>[p.id,p.name]));}
  get crewPresentation(){return [...this.crewModels].map(([id,model])=>({id,name:model.userData.playerName,position:model.position.toArray(),label:model.children.some(c=>c.name==='crew-name')}));}
  private updateCrewName(model:THREE.Group,name:string){
    if(model.userData.playerName===name)return;
    const old=model.children.find(c=>c.name==='crew-name') as THREE.Sprite|undefined;
    if(old){model.remove(old);old.material.map?.dispose();old.material.dispose();}
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext('2d')!;ctx.font='500 36px "DM Sans", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=8;ctx.fillStyle='#d5d9ca';ctx.fillText(name,256,48,480);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.78,depthTest:true,depthWrite:false,toneMapped:false}));
    label.name='crew-name';label.position.set(0,.9,0);label.scale.set(2.6,.49,1);model.add(label);model.userData.playerName=name;
  }
  private disposeCrew(model:THREE.Group){this.scene.remove(model);disposeCrewAvatar(model);model.traverse(o=>{if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}});}

  topDown=false;renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(95,1,.05,180);composer:EffectComposer; bloom:UnrealBloomPass;
  private swarmBatches=new Map<EnemyKind,{meshes:THREE.InstancedMesh[];capacity:number}>();private originalFloor=false;private tileHeights:number[]=[];private beckons=new Map<number,THREE.Mesh>();private baseFov=90;private enemies=new Map<number,THREE.Group>();private tiles:THREE.InstancedMesh;private tilePositions:THREE.Vector3[]=[];
  originalWeapon:OriginalWeapon;originalEnemies:OriginalEnemies;private gemMesh:THREE.InstancedMesh;private dummy=new THREE.Object3D();
  private renderScale=1;private slowFrames=0;private fastFrames=0;private resizeCooldown=0;private quality='high';
  private preview=new THREE.Group();private altar:THREE.Group;private visualTime=0;
  private sky=new AbyssSky();private gemLighting:GemLighting;
  private altarLight=new THREE.PointLight(0xcde98b,12,9);
  private playerLight=new THREE.PointLight(0xffb56b,24,11,2);
  private enemyLighting:EnemyLighting;private enemyGlowSources:EnemyGlowSources;
  projectileLighting:ProjectileLighting;
  constructor(canvas:HTMLCanvasElement,settings:VisualSettings) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.info.autoReset=false;this.renderer.setClearColor(0x080d0b);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.scene.background=new THREE.Color(0x000000);this.scene.fog=new THREE.FogExp2(0x000000,.015);this.scene.add(new THREE.HemisphereLight(0xcad5bc,0x18100c,1.15));
    this.scene.add(this.sky.mesh);
    const moon=new THREE.DirectionalLight(0xe2e8cd,3.2);moon.intensity=2.1;moon.position.set(-12,30,8);this.scene.add(moon);
    const rim=new THREE.DirectionalLight(0x729786,1.8);rim.position.set(20,10,-20);this.scene.add(rim);
    const red=new THREE.PointLight(0xe44920,90,45,2);red.position.set(0,6,0);this.scene.add(red);
    this.scene.add(this.camera);this.camera.rotation.order='YXZ';
    this.playerLight.name='player-warm-light';this.playerLight.intensity=0;this.scene.add(this.playerLight);
    const loader=new THREE.TextureLoader();
    const diffuse=loader.load('/assets/original/devil-daggers/textures/tile.png');diffuse.colorSpace=THREE.SRGBColorSpace;diffuse.minFilter=diffuse.magFilter=THREE.NearestFilter;diffuse.generateMipmaps=false;
    const stone=new THREE.MeshBasicMaterial({map:diffuse,toneMapped:false});
    for(const tile of ARENA_TILES)this.tilePositions.push(new THREE.Vector3((tile.x-25)*TILE_SIZE,0,(tile.z-25)*TILE_SIZE));
    this.gemLighting=new GemLighting(this.scene,stone);
    this.enemyLighting=new EnemyLighting(this.scene,stone);
    this.projectileLighting=new ProjectileLighting(this.scene,stone);
    this.tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(TILE_SIZE,.1,TILE_SIZE),stone,this.tilePositions.length);this.scene.add(this.tiles);
    this.updateTiles(0);
    this.gemMesh=new THREE.InstancedMesh(gemGeo,crystal,1200);this.gemMesh.count=0;this.gemMesh.frustumCulled=false;this.scene.add(this.gemMesh);
    this.originalEnemies=new OriginalEnemies();this.enemyGlowSources=new EnemyGlowSources(this.originalEnemies);
    this.originalWeapon=new OriginalWeapon(this.scene);
    this.altar=new THREE.Group();shape(this.altar,new THREE.CylinderGeometry(1.1,1.6,1.2,8),darkBone,[0,.6,0],[1,1,1]);shape(this.altar,new THREE.OctahedronGeometry(.38),greenCrystal,[0,2.7,0],[.55,2.2,.55]);this.altarLight.position.y=2;this.scene.add(this.altarLight);this.preview.add(this.altar);
    this.scene.add(this.preview);
    void this.originalEnemies.loaded.then(()=>{if(!this.originalEnemies.ready)return;this.tiles.geometry.dispose();this.tiles.geometry=this.originalEnemies.tileGeometry;this.originalFloor=true;for(const kind of ENEMY_KINDS)if(isSkull(kind)||isEgg(kind)||kind==='spiderling'){const meshes=this.originalEnemies.createSwarmBatch(kind,128);for(const mesh of meshes)this.scene.add(mesh);this.swarmBatches.set(kind,{meshes,capacity:128});}this.scene.remove(this.gemMesh);this.gemMesh=new THREE.InstancedMesh(this.originalEnemies.gemGeometry,new THREE.MeshStandardMaterial({map:(this.originalEnemies.gemMaterial as THREE.MeshBasicMaterial).map,emissiveMap:(this.originalEnemies.gemMaterial as THREE.MeshBasicMaterial).map,emissive:0xff431a,emissiveIntensity:3,roughness:.4,toneMapped:false}),1200);this.gemMesh.frustumCulled=false;this.gemMesh.count=0;this.scene.add(this.gemMesh);for(const [kind,pos] of [['squid',[0,3.3,-11]],['skull',[5,2,-4]],['skull2',[9,2,0]],['spider',[27,2.7,25]]] as const){const model=this.originalEnemies.clone(kind);model.position.set(pos[0],pos[1],pos[2]);this.preview.add(model);}});
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.34,.6,1.1);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.configure(settings);window.addEventListener('resize',()=>this.resize());this.resize();
  }
  configure(settings:VisualSettings) {this.baseFov=settings.fov;this.camera.fov=settings.fov;this.camera.updateProjectionMatrix();this.quality=settings.quality;this.renderScale=1;this.slowFrames=this.fastFrames=0;if(this.bloom)this.bloom.enabled=settings.quality==='high';this.resize();}
  resize() {
    const w=innerWidth,h=innerHeight;
    // Bound fill cost on Retina/4K displays; UI and the canvas keep their CSS size.
    const density=Math.min(devicePixelRatio,this.quality==='high'?1.25:1,Math.sqrt(1600000/(w*h)))*this.renderScale;
    this.renderer.setPixelRatio(density);this.renderer.setSize(w,h);this.composer?.setPixelRatio(density);this.composer?.setSize(w,h);
    this.bloom?.setSize(Math.ceil(w*density*.5),Math.ceil(h*density*.5));
    this.originalWeapon?.resize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  trackFrame(seconds:number) {
    if(seconds<=0||seconds>.25)return;
    if(this.resizeCooldown>0){this.resizeCooldown-=seconds;return;}
    this.slowFrames=seconds>1/45?this.slowFrames+1:Math.max(0,this.slowFrames-1);
    this.fastFrames=seconds<1/58?this.fastFrames+1:0;
    if(this.slowFrames>=30&&this.renderScale>.5){this.renderScale=Math.max(.5,this.renderScale-.1);}
    else if(this.fastFrames>=300&&this.renderScale<1){this.renderScale=Math.min(1,this.renderScale+.05);}
    else return;
    this.slowFrames=this.fastFrames=0;this.resizeCooldown=3;this.resize();
  }
  async prepare() {
    await Promise.all([this.originalEnemies.loaded,this.originalWeapon.loaded]);
    if(!this.originalEnemies.ready||!this.originalWeapon.ready)return;
    // Compile the gameplay and hand materials while the menu is still visible.
    await this.renderer.compileAsync(this.scene,this.camera);
    await this.renderer.compileAsync(this.originalWeapon.handScene,this.originalWeapon.handCamera);
  }
  updateTiles(time:number) {let changed=false;this.tiles.instanceMatrix.clearUpdateRanges();for(let i=0;i<this.tilePositions.length;i++){const tile=ARENA_TILES[i],height=tileHeight(tile.x,tile.z,time)-(this.originalFloor?0:.05);if(this.tileHeights[i]===height)continue;this.tileHeights[i]=height;changed=true;this.dummy.position.copy(this.tilePositions[i]);this.dummy.position.y=height;this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.tiles.setMatrixAt(i,this.dummy.matrix);this.tiles.instanceMatrix.addUpdateRange(i*16,16);}if(changed)this.tiles.instanceMatrix.needsUpdate=true;}
  effect(effect:Effect,world:World,yaw:number,pitch:number) {
    const localId=world.crew.find(p=>p.player===world.player)?.id;
    const local=!world.crew.length||effect.shooterId===localId;
    this.originalWeapon.effect(effect,world,yaw,pitch,local);
  }
  render(world:World|null,yaw:number,pitch:number,dt:number,menu:boolean,projectileAlpha=1) {
    this.renderer.info.reset();this.visualTime+=dt;const t=this.visualTime;this.preview.visible=menu;this.altarLight.intensity=menu?12:0;
    if(menu) {
      this.camera.position.set(29+Math.sin(t*.04)*2,13,30);this.camera.lookAt(-10,2,0);this.altar.rotation.y=t*.2;
      this.preview.children.forEach((o,i)=>{if(i>0){o.rotation.y+=dt*(o.name.startsWith('squid')?-TOWER_SPIN_SPEED:.045);}});
      for(const batch of this.swarmBatches.values())for(const mesh of batch.meshes)mesh.count=0;for(const m of this.enemies.values())m.visible=false;this.gemMesh.count=0;this.updateTiles(0);
    } else if(world) {
      this.camera.position.set(world.player.pos.x,world.player.pos.y,world.player.pos.z);this.camera.rotation.set(pitch,yaw,0,'YXZ');if(this.topDown){this.camera.position.set(0,55,.001);this.camera.lookAt(0,0,0);}
      this.updateTiles(world.time);
      const fov=this.baseFov+world.player.hopPulse*3;if(this.camera.fov!==fov){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
      const ringIds=new Set<number>();for(const ring of world.rings){ringIds.add(ring.id);let mesh=this.beckons.get(ring.id);if(!mesh){mesh=new THREE.Mesh(new THREE.TorusGeometry(1,.035,4,64),new THREE.MeshBasicMaterial({color:0xff4422,transparent:true,opacity:.65}));mesh.rotation.x=Math.PI/2;this.beckons.set(ring.id,mesh);this.scene.add(mesh);}mesh.position.set(ring.pos.x,1,ring.pos.z);mesh.scale.setScalar(Math.max(.01,ring.radius));}for(const [id,mesh] of this.beckons)if(!ringIds.has(id)){this.scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();this.beckons.delete(id);}
      const swarmCounts=new Map<EnemyKind,number>();
      const present=new Set<number>();
      for(const e of world.enemies) {
        if(isSkull(e.kind)||isEgg(e.kind)||e.kind==='spiderling'){
          let batch=this.swarmBatches.get(e.kind);if(!batch)continue;const index=swarmCounts.get(e.kind)??0;
          if(index>=batch.capacity){for(const mesh of batch.meshes){this.scene.remove(mesh);mesh.geometry.dispose();mesh.dispose();}const capacity=batch.capacity*2,meshes=this.originalEnemies.createSwarmBatch(e.kind,capacity);for(let i=0;i<batch.capacity;i++)for(let j=0;j<meshes.length;j++){batch.meshes[j].getMatrixAt(i,this.dummy.matrix);meshes[j].setMatrixAt(i,this.dummy.matrix);}batch={meshes,capacity};for(const mesh of meshes)this.scene.add(mesh);this.swarmBatches.set(e.kind,batch);}
          this.dummy.position.set(e.pos.x,e.pos.y,e.pos.z);this.dummy.rotation.set(0,enemyYaw(e,world.player.pos),0);this.dummy.scale.setScalar(Math.min(1,e.age/1.1));this.dummy.updateMatrix();for(const mesh of batch.meshes)mesh.setMatrixAt(index,this.dummy.matrix);swarmCounts.set(e.kind,index+1);continue;
        }
        present.add(e.id);let model=this.enemies.get(e.id);
        if(model&&model.name!==e.kind){this.scene.remove(model);this.enemies.delete(e.id);model=undefined;}
        if(!model) {
          if(!this.originalEnemies.ready)continue;
          model=this.originalEnemies.clone(e.kind);
          if(isPede(e.kind))for(let i=0;i<e.segments.length;i++){const segment=this.originalEnemies.segment(e.segments[i].hp>0,e.kind);segment.name='segment';model.add(segment);}
          this.enemies.set(e.id,model);this.scene.add(model);
        }
        model.visible=true;model.position.set(e.pos.x,e.pos.y,e.pos.z);const emergence=isPede(e.kind)?1:Math.min(1,e.age/(e.kind==='spider2'?9:e.kind==='leviathan'?8.533333:1.1));model.scale.setScalar(emergence);
        model.rotation.y=enemyYaw(e,world.player.pos);
        this.originalEnemies.animate(model,e,world.time);
        if(isPede(e.kind)) {
          model.rotation.set(0,0,0);let i=0;model.children.filter(c=>c.name==='segment').forEach(seg=>{const s=e.segments[i++];seg.position.set(s.pos.x-e.pos.x,s.pos.y-e.pos.y,s.pos.z-e.pos.z);const lead=i===1?e.pos:e.segments[i-2].pos;seg.rotation.y=Math.atan2(lead.x-s.pos.x,lead.z-s.pos.z);seg.traverse(child=>{if(child.name==='segment-weak-point')child.visible=s.hp>0;});});
        }
      }
      for(const [kind,batch] of this.swarmBatches)for(const mesh of batch.meshes){mesh.count=swarmCounts.get(kind)??0;if(mesh.count){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);mesh.instanceMatrix.needsUpdate=true;}}
      for(const [id,model] of this.enemies)if(!present.has(id)) {this.scene.remove(model);this.enemies.delete(id);}
      this.gemMesh.count=Math.min(1200,world.gems.length);for(let i=0;i<this.gemMesh.count;i++){const gem=world.gems[i];this.dummy.position.set(gem.pos.x,gem.pos.y,gem.pos.z);this.dummy.rotation.set(t,t*2,0);this.dummy.scale.setScalar(1.4*(gem.age>8?Math.sin(t*18)*.2+.8:1));this.dummy.updateMatrix();this.gemMesh.setMatrixAt(i,this.dummy.matrix);}if(this.gemMesh.count){this.gemMesh.instanceMatrix.clearUpdateRanges();this.gemMesh.instanceMatrix.addUpdateRange(0,this.gemMesh.count*16);this.gemMesh.instanceMatrix.needsUpdate=true;}
    }
    const crewIds=new Set<string>();
    if(world&&!menu)for(let i=0;i<world.crew.length;i++){const p=world.crew[i];if(p.player===world.player||!p.alive)continue;crewIds.add(p.id);let model=this.crewModels.get(p.id);if(!model){model=createCrewAvatar(i);model.position.set(p.player.pos.x,p.player.pos.y,p.player.pos.z);this.crewModels.set(p.id,model);this.scene.add(model);}model.position.lerp(new THREE.Vector3(p.player.pos.x,p.player.pos.y,p.player.pos.z),1-Math.exp(-25*dt));model.rotation.y=p.input.yaw;updateCrewArm(model,this.originalWeapon,p.level);this.updateCrewName(model,this.crewNames.get(p.id)??'Wanderer');}
    for(const [id,model]of this.crewModels)if(!crewIds.has(id)){this.disposeCrew(model);this.crewModels.delete(id);}
    this.playerLight.intensity=!menu&&world?24:0;this.playerLight.position.copy(this.camera.position);this.playerLight.position.y-=.35;
    this.enemyLighting.update(world,this.camera,menu,e=>this.enemyGlowSources.sources(e,world!.player.pos,this.camera,this.enemies.get(e.id)));
    this.gemLighting.update(world,this.camera,menu);this.sky.update(this.camera,t);this.originalWeapon.update(world,dt,menu,this.camera,projectileAlpha);
    this.projectileLighting.update(world,menu,projectileAlpha,this.renderer.domElement.height);this.composer.render();this.originalWeapon.render(this.renderer,menu);
  }
  clear() {for(const model of this.crewModels.values()){this.disposeCrew(model);}this.crewModels.clear();for(const batch of this.swarmBatches.values())for(const mesh of batch.meshes)mesh.count=0;for(const mesh of this.beckons.values()){this.scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.beckons.clear();for(const model of this.enemies.values())this.scene.remove(model);this.enemies.clear();this.gemLighting.clear();this.enemyLighting.clear();this.projectileLighting.clear();this.playerLight.intensity=0;this.originalWeapon.clear();}
}
