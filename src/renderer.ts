import {UpgradeGroundPulse} from './upgrade-ground-pulse';
import {MenuRelics} from './menu-relics';
import {BloodRenderer} from './blood-renderer';
import {PlayerDeathBurst} from './player-death-burst';
import {SinglePlayerEntrance} from './entrance';
import {gameViewport} from './game-viewport';
import * as THREE from 'three';
import { OriginalWeapon } from './original-weapon';
import {createCrewAvatar,loadCrewAvatar,crewMuzzle,updateCrewAvatar,disposeCrewAvatar} from './crew-avatar';
import { OriginalEnemies } from './original-enemies';
import { AbyssSky } from './sky';
import {EnvironmentLighting} from './environment-lighting';
import {OpeningMist} from './opening-mist';
import {SegmentBatches} from './segment-batches';
import {GemLighting} from './gem-lighting';
import {EnemyLighting} from './enemy-lighting';
import {EnemyGlowSources} from './enemy-glow-sources';
import {ProjectileLighting} from './projectile-lighting';
import {samplePlayerPosition} from './player-presentation';
import { enemyYaw, TOWER_SPIN_SPEED, towerDeathPose, swarmEmergenceScale, enemyEmergenceScale } from './enemy-presentation';
import {ARENA_TILES,TILE_SIZE,tileHeight,floorHeight} from './arena';
import {isPede,isSkull,isEgg,ENEMY_KINDS} from './enemy-kinds';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, STEP, type Enemy, type EnemyKind, type Effect, type Vec, type Input, TIMELINE } from './simulation';
const TAU = Math.PI*2;
const HIGHEST_ARENA_SURFACE=Math.max(...ARENA_TILES.map(tile=>tileHeight(tile.x,tile.z,0)));
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
export type VisualSettings={quality:string;fov:number;skyMotion?:'full'|'reduced';mist?:boolean};
export class GameRenderer {
  readonly crewAvatarReady=loadCrewAvatar();
  private deathGhost:THREE.Group|null=null;
  private replayBody:THREE.Group|null=null;
  private deathBurst:PlayerDeathBurst|null=null;
  private deathBurstActive=false;
  private deathBloodTime=0;
  private crewDeathBursts:{burst:PlayerDeathBurst;id:string|null;position:Vec;started:number}[]=[];
  private crewAlive=new Map<string,boolean>();
  private crewExploded=new Set<string>();
  private crewDeathTime=0;
  get crewDeathPresentation(){return this.crewDeathBursts.filter(s=>s.id!==null).map(s=>({id:s.id,position:{...s.position},age:Math.max(0,this.crewDeathTime-s.started),visible:s.burst.mesh.visible,...s.burst.diagnostics}));}
  private startCrewDeath(id:string,position:Vec,time:number){
    if(this.crewExploded.has(id))return;
    const slot=this.crewDeathBursts.find(s=>s.id===null);if(!slot)return;
    this.crewExploded.add(id);slot.id=id;slot.position={...position};slot.started=time;slot.burst.begin(slot.position,time);
  }
  private updateCrewDeaths(world:World|null,menu:boolean,dt:number){
    if(!world||menu||!world.crew.length)return;
    // Keep the last crew explosions moving after a team wipe freezes simulation.
    this.crewDeathTime=world.state==='dead'?Math.max(world.time,this.crewDeathTime+Math.min(.1,Math.max(0,dt))):world.time;
    for(const p of world.crew){
      const alive=this.crewAlive.get(p.id);
      if(p.alive&&alive===false)this.crewExploded.delete(p.id);
      if(!p.alive&&alive===true&&p.cause!=='DISCONNECTED')this.startCrewDeath(p.id,p.player.pos,world.time);
      this.crewAlive.set(p.id,p.alive);
    }
    for(const slot of this.crewDeathBursts){
      if(slot.id===null)continue;
      const age=Math.max(0,this.crewDeathTime-slot.started);
      if(age>2.5){slot.burst.clear();slot.id=null;continue;}
      slot.burst.update(slot.position,age,this.camera);
    }
  }
  private deathProjection=new THREE.Vector3();
  readonly deathMarker={x:0,y:0,visible:false};
  setDeathGhost(position:Vec|null,yaw=0,impact=false,impactAge=0,impactTime=0){
    if(!position){if(this.deathGhost)this.deathGhost.visible=false;this.deathBurst?.clear();this.deathBurstActive=false;return;}
    if(impact){
      if(!this.deathBurst)this.deathBurst=new PlayerDeathBurst(this.scene,this.blood.field);
      if(!this.deathBurstActive)this.deathBurst.begin(position,impactTime);
      this.deathBloodTime=impactTime+impactAge;
      this.deathBurstActive=true;this.deathBurst.update(position,impactAge,this.camera);
      if(this.deathGhost)this.deathGhost.visible=false;
      return;
    }
    this.deathBurst?.clear();this.deathBurstActive=false;
    if(!this.deathGhost){this.deathGhost=createCrewAvatar(0,true);this.deathGhost.name='death-analysis-victim';this.scene.add(this.deathGhost);}
    this.deathGhost.visible=true;this.deathGhost.position.set(position.x,position.y,position.z);this.deathGhost.rotation.y=yaw;
    for(const material of this.deathGhost.userData.avatarMaterials as THREE.Material[])material.opacity=.48;
  }
  projectDeathMarker(position:Vec,visible:boolean){
    this.deathProjection.set(position.x,position.y+.8,position.z).project(this.camera);
    this.deathMarker.x=(this.deathProjection.x+1)*50;this.deathMarker.y=(1-this.deathProjection.y)*50;
    this.deathMarker.visible=visible&&this.deathProjection.z>=-1&&this.deathProjection.z<=1&&Math.abs(this.deathProjection.x)<.94&&Math.abs(this.deathProjection.y)<.85;
    return this.deathMarker;
  }
  private dyingTowers=new Map<number,{model:THREE.Group;started:number;y:number;yaw:number;direction:number;depth:number}>();
  private crewModels=new Map<string,THREE.Group>();
  private crewNames=new Map<string,string>();
  private crewMuzzlePosition=new THREE.Vector3();
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
  private updateCrewModels(world:World|null,dt:number,crewInterpolated:boolean,scene:THREE.Scene,menu=false){
    const crewIds=new Set<string>();
    if(world&&!menu)for(let i=0;i<world.crew.length;i++){const p=world.crew[i];if(p.player===world.player||!p.alive)continue;crewIds.add(p.id);let model=this.crewModels.get(p.id);if(!model){model=createCrewAvatar(i);model.position.set(p.player.pos.x,p.player.pos.y,p.player.pos.z);this.crewModels.set(p.id,model);scene.add(model);}if(model.parent!==scene)scene.add(model);if(crewInterpolated)model.position.set(p.player.pos.x,p.player.pos.y,p.player.pos.z);else model.position.lerp(new THREE.Vector3(p.player.pos.x,p.player.pos.y,p.player.pos.z),1-Math.exp(-25*dt));model.rotation.y=p.input.yaw;updateCrewAvatar(model,p.input,p.player.vel,p.player.grounded,scene===this.entrance.scene?world.tick*STEP:world.time,p.lastShotTick>=0&&(world.tick-p.lastShotTick)<18);this.updateCrewName(model,this.crewNames.get(p.id)??'Wanderer');}
    for(const [id,model]of this.crewModels)if(!crewIds.has(id)){this.disposeCrew(model);this.crewModels.delete(id);}
  }
  private disposeCrew(model:THREE.Group){model.removeFromParent();disposeCrewAvatar(model);model.traverse(o=>{if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}});}

  readonly entrance:SinglePlayerEntrance;
  topDown=false;renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(95,1,.05,180);composer:EffectComposer; bloom:UnrealBloomPass;
  private swarmBounds=new Map<EnemyKind,THREE.Sphere>();private swarmFrustum=new THREE.Frustum();private swarmProjection=new THREE.Matrix4();private swarmSphere=new THREE.Sphere();private swarmCopy=new THREE.Matrix4();
  private swarmBatches=new Map<EnemyKind,{meshes:THREE.InstancedMesh[];capacity:number}>();private originalFloor=false;private tileHeights:number[]=[];private beckons=new Map<number,THREE.Mesh>();private baseFov=90;private enemies=new Map<number,THREE.Group>();private tiles:THREE.InstancedMesh;private tilePositions:THREE.Vector3[]=[];
  originalWeapon:OriginalWeapon;originalEnemies:OriginalEnemies;private gemMesh:THREE.InstancedMesh;private dummy=new THREE.Object3D();
  private renderScale=1;private slowFrames=0;private fastFrames=0;private resizeCooldown=0;private quality='high';
  readonly menuRelics=new MenuRelics();
  readonly upgradePulse:UpgradeGroundPulse;
  private preview=new THREE.Group();private altar:THREE.Group;private visualTime=0;
  private segmentBatches=new SegmentBatches(this.scene);
  private segmentNodes=new WeakMap<THREE.Group,{node:THREE.Object3D;weakPoints:THREE.Object3D[]}[]>();
  private sky=new AbyssSky();private gemLighting:GemLighting;
  private environment=new EnvironmentLighting();
  readonly openingMist=new OpeningMist();
  private skyLight=new THREE.HemisphereLight(0xcad5bc,0x18100c,1.15);
  private moonLight=new THREE.DirectionalLight(0xe2e8cd,2.1);
  private rimLight=new THREE.DirectionalLight(0x729786,1.8);
  private infernalLight=new THREE.PointLight(0xe44920,90,45,2);
  private nightSkyLight=new THREE.Color(0xcad5bc);private daySkyLight=new THREE.Color(0xdceeff);
  private nightGroundLight=new THREE.Color(0x18100c);private dayGroundLight=new THREE.Color(0x858b91);
  private altarLight=new THREE.PointLight(0xcde98b,12,9);
  private playerLight=new THREE.PointLight(0xffb56b,24,11,2);
  private enemyLighting:EnemyLighting;private enemyGlowSources:EnemyGlowSources;
  projectileLighting:ProjectileLighting;
  readonly blood:BloodRenderer;
  constructor(canvas:HTMLCanvasElement,settings:VisualSettings) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.info.autoReset=false;this.renderer.setClearColor(0x080d0b);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.scene.background=new THREE.Color(0x000000);this.scene.fog=new THREE.FogExp2(0x000000,.015);this.scene.add(this.skyLight);
    this.scene.add(this.sky.mesh);
    this.moonLight.position.set(-12,30,8);this.scene.add(this.moonLight);
    this.rimLight.position.set(20,10,-20);this.scene.add(this.rimLight);
    this.infernalLight.position.set(0,6,0);this.scene.add(this.infernalLight);
    this.scene.add(this.camera);this.camera.rotation.order='YXZ';
    this.playerLight.name='player-warm-light';this.playerLight.intensity=0;this.scene.add(this.playerLight);
    const loader=new THREE.TextureLoader();
    const diffuse=loader.load('/assets/original/devil-daggers/textures/tile.png');diffuse.colorSpace=THREE.SRGBColorSpace;diffuse.minFilter=diffuse.magFilter=THREE.NearestFilter;diffuse.generateMipmaps=false;
    this.entrance=new SinglePlayerEntrance(diffuse);
    const stone=new THREE.MeshBasicMaterial({map:diffuse,toneMapped:false});
    for(const tile of ARENA_TILES)this.tilePositions.push(new THREE.Vector3((tile.x-25)*TILE_SIZE,0,(tile.z-25)*TILE_SIZE));
    this.gemLighting=new GemLighting(this.scene,stone);
    this.environment.attach(stone);
    this.enemyLighting=new EnemyLighting(this.scene,stone);
    this.projectileLighting=new ProjectileLighting(this.scene,stone);
    this.blood=new BloodRenderer(this.scene,stone);
    this.upgradePulse=new UpgradeGroundPulse(stone);
    this.deathBurst=new PlayerDeathBurst(this.scene,this.blood.field);
    for(let i=0;i<4;i++)this.crewDeathBursts.push({burst:new PlayerDeathBurst(this.scene,this.blood.field,this.deathBurst),id:null,position:{x:0,y:0,z:0},started:0});
    this.tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(TILE_SIZE,.1,TILE_SIZE),stone,this.tilePositions.length);this.scene.add(this.tiles);
    this.updateTiles(0);
    this.gemMesh=new THREE.InstancedMesh(gemGeo,crystal,1200);this.gemMesh.count=0;this.gemMesh.frustumCulled=false;this.scene.add(this.gemMesh);
    this.originalEnemies=new OriginalEnemies(this.environment);this.enemyGlowSources=new EnemyGlowSources(this.originalEnemies);
    this.originalWeapon=new OriginalWeapon(this.scene,this.environment);
    this.altar=new THREE.Group();shape(this.altar,new THREE.CylinderGeometry(1.1,1.6,1.2,8),darkBone,[0,.6,0],[1,1,1]);shape(this.altar,new THREE.OctahedronGeometry(.38),greenCrystal,[0,2.7,0],[.55,2.2,.55]);this.altarLight.position.y=2;this.scene.add(this.altarLight);this.preview.add(this.altar);
    this.scene.add(this.preview);
    void this.originalEnemies.loaded.then(()=>{if(!this.originalEnemies.ready)return;this.tiles.geometry.dispose();this.tiles.geometry=this.originalEnemies.tileGeometry;this.entrance.setTileGeometry(this.originalEnemies.tileGeometry);this.originalFloor=true;for(const kind of ENEMY_KINDS)if(isSkull(kind)||isEgg(kind)||kind==='spiderling'){const meshes=this.originalEnemies.createSwarmBatch(kind,128);for(const mesh of meshes)this.scene.add(mesh);this.swarmBatches.set(kind,{meshes,capacity:128});const bounds=new THREE.Box3();for(const mesh of meshes){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox!);}this.swarmBounds.set(kind,bounds.getBoundingSphere(new THREE.Sphere()));}this.scene.remove(this.gemMesh);this.gemMesh=new THREE.InstancedMesh(this.originalEnemies.gemGeometry,new THREE.MeshStandardMaterial({map:(this.originalEnemies.gemMaterial as THREE.MeshBasicMaterial).map,emissiveMap:(this.originalEnemies.gemMaterial as THREE.MeshBasicMaterial).map,emissive:0xff431a,emissiveIntensity:3,roughness:.4,toneMapped:false}),1200);this.gemMesh.frustumCulled=false;this.gemMesh.count=0;this.scene.add(this.gemMesh);for(const [kind,pos] of [['squid',[0,3.3,-11]],['skull',[5,2,-4]],['skull2',[9,2,0]],['spider',[27,2.7,25]]] as const){const model=this.originalEnemies.clone(kind);model.position.set(pos[0],pos[1],pos[2]);this.preview.add(model);}});
    this.composer=new EffectComposer(this.renderer);
    // Both ping-pong targets need scene depth because pass swaps vary with quality/fade.
    for(const target of [this.composer.renderTarget1,this.composer.renderTarget2])target.depthTexture=new THREE.DepthTexture(1,1);
    this.composer.addPass(new RenderPass(this.scene,this.camera));this.composer.addPass(this.openingMist);this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.34,.6,1.1);
    // Bloom processes full-screen color textures. Its eleven intermediate
    // targets never consume depth, so avoid allocating and clearing depth buffers.
    for(const target of [this.bloom.renderTargetBright,...this.bloom.renderTargetsHorizontal,...this.bloom.renderTargetsVertical])target.depthBuffer=false;
    this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.configure(settings);window.addEventListener('resize',()=>this.resize());this.resize();
  }
  get skyDiagnostics(){return this.sky.diagnostics;}
  configure(settings:VisualSettings) {this.openingMist.configure(settings.quality,settings.skyMotion==='reduced',settings.mist!==false);this.menuRelics.configure(settings.quality,settings.skyMotion==='reduced',settings.mist!==false);this.baseFov=settings.fov;this.camera.fov=settings.fov;this.camera.updateProjectionMatrix();this.quality=settings.quality;this.sky.configure(settings.quality,settings.skyMotion);this.renderScale=1;this.slowFrames=this.fastFrames=0;if(this.bloom)this.bloom.enabled=settings.quality==='high';this.resize();}
  resize() {
    const {width:w,height:h}=gameViewport();
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
    await Promise.all([this.originalEnemies.loaded,this.originalWeapon.loaded,this.crewAvatarReady,this.entrance.ready,this.blood.ready,this.deathBurst!.ready,...this.crewDeathBursts.map(s=>s.burst.ready)]);
    if(!this.originalEnemies.ready||!this.originalWeapon.ready)return;
    // Compile the gameplay and hand materials while the menu is still visible.
    const body=createCrewAvatar(0),ghost=createCrewAvatar(0,true);
    body.position.set(1000,0,0);ghost.position.set(1000,0,0);this.scene.add(body,ghost);
    try{
      // Warm both floor variants so falling doesn't compile a shader mid-frame.
      this.updateFloorSide(-Infinity);await this.renderer.compileAsync(this.scene,this.camera);
      this.updateFloorSide(Infinity);await this.renderer.compileAsync(this.scene,this.camera);
    }finally{this.scene.remove(body,ghost);disposeCrewAvatar(body);disposeCrewAvatar(ghost);}
    await this.renderer.compileAsync(this.originalWeapon.handScene,this.originalWeapon.handCamera);
  }
  updateTiles(time:number) {let changed=false;this.tiles.instanceMatrix.clearUpdateRanges();for(let i=0;i<this.tilePositions.length;i++){const tile=ARENA_TILES[i],height=tileHeight(tile.x,tile.z,time)-(this.originalFloor?0:.05);if(this.tileHeights[i]===height)continue;this.tileHeights[i]=height;changed=true;this.dummy.position.copy(this.tilePositions[i]);this.dummy.position.y=height;this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.tiles.setMatrixAt(i,this.dummy.matrix);this.tiles.instanceMatrix.addUpdateRange(i*16,16);}if(changed)this.tiles.instanceMatrix.needsUpdate=true;}
  private updateFloorSide(cameraY:number){
    // Cull back faces during ordinary play; open tiles need them only from below.
    const material=this.tiles.material as THREE.MeshBasicMaterial;
    const side=cameraY<=HIGHEST_ARENA_SURFACE?THREE.DoubleSide:THREE.FrontSide;
    if(material.side!==side){material.side=side;material.needsUpdate=true;}
  }
  effect(effect:Effect,world:World,yaw:number,pitch:number) {
    if(effect.kind==='death'&&effect.shooterId&&world.crew.some(p=>p.id===effect.shooterId))this.startCrewDeath(effect.shooterId,effect.pos,world.time);
    const localId=world.crew.find(p=>p.player===world.player)?.id;
    const local=!world.crew.length||effect.shooterId===localId;
    let weaponEffect=effect;
    if(!local&&(effect.kind==='shot'||effect.kind==='burst')&&effect.shooterId){
      const model=this.crewModels.get(effect.shooterId),shooter=world.crew.find(p=>p.id===effect.shooterId);
      if(model&&shooter){
        updateCrewAvatar(model,shooter.input,shooter.player.vel,shooter.player.grounded,world.time,true);
        if(crewMuzzle(model,this.crewMuzzlePosition))weaponEffect={...effect,muzzles:[{x:this.crewMuzzlePosition.x,y:this.crewMuzzlePosition.y,z:this.crewMuzzlePosition.z}]};
      }
    }
    this.originalWeapon.effect(weaponEffect,world,yaw,pitch,local);
    if(effect.kind==='upgrade')this.upgradePulse.begin(effect.pos,effect.level??effect.amount??world.level,world.time);
    this.blood.effect(effect,world);
  }
  render(world:World|null,yaw:number,pitch:number,dt:number,menu:boolean,projectileAlpha=1,spectatorPosition:Vec|null=null,crewInterpolated=false,entrance=false,bodyInput:Input|null=null) {
    this.renderer.info.reset();if(menu){
      this.upgradePulse.clear();
      // The menu has its own scene; retire gameplay glows before the early return.
      this.projectileLighting.update(null,true,projectileAlpha,this.renderer.domElement.height);
      this.menuRelics.render(this.renderer,dt);return;
    }this.visualTime+=dt;const t=this.visualTime;this.preview.visible=menu;this.altarLight.intensity=menu?12:0;
    if(entrance&&world){
      this.upgradePulse.clear();
      samplePlayerPosition(world,projectileAlpha,this.camera.position);this.camera.rotation.set(pitch,yaw,0,'YXZ');
      this.entrance.update(t,this.camera.position);this.updateCrewModels(world,dt,crewInterpolated,this.entrance.scene);
      this.camera.updateWorldMatrix(true,false);
      this.entrance.updateFloorSide(this.camera.position.y);
      if(this.camera.fov!==this.baseFov){this.camera.fov=this.baseFov;this.camera.updateProjectionMatrix();}
      this.openingMist.update(this.camera,world.time,true);
      const pass=this.composer.passes[0] as RenderPass;pass.scene=this.entrance.scene;this.composer.render();pass.scene=this.scene;return;
    }
    const atmosphere=this.environment.update(world?.time??0,menu),day=this.environment.daylight;
    this.skyLight.intensity=1.15+day*2;this.skyLight.color.lerpColors(this.nightSkyLight,this.daySkyLight,day);this.skyLight.groundColor.lerpColors(this.nightGroundLight,this.dayGroundLight,day);
    this.moonLight.intensity=2.1+day*.8;this.rimLight.intensity=1.8+day*.3;this.infernalLight.intensity=90*(1-day*.9);
    this.moonLight.position.set(-12-day*.6,30-day*5.4,8-day*19.4);
    if(this.scene.fog instanceof THREE.FogExp2){this.scene.fog.color.setRGB(.08*day+atmosphere.furnace*.007,.12*day+atmosphere.furnace*.002,.17*day+atmosphere.cathedral*.007);this.scene.fog.density=.015-day*.006;}
    this.gemLighting.daylight=day;
    if(menu) {
      this.camera.position.set(29+Math.sin(t*.04)*2,13,30);this.camera.lookAt(-10,2,0);this.altar.rotation.y=t*.2;
      this.preview.children.forEach((o,i)=>{if(i>0){o.rotation.y+=dt*(o.name.startsWith('squid')?-TOWER_SPIN_SPEED:.045);}});
      for(const batch of this.swarmBatches.values())for(const mesh of batch.meshes)mesh.count=0;for(const m of this.enemies.values())m.visible=false;for(const death of this.dyingTowers.values())death.model.visible=false;this.gemMesh.count=0;this.updateTiles(0);
    } else if(world) {
      if(spectatorPosition)this.camera.position.set(spectatorPosition.x,spectatorPosition.y,spectatorPosition.z);
      else samplePlayerPosition(world,projectileAlpha,this.camera.position);
      this.camera.rotation.set(pitch,yaw,0,'YXZ');if(this.topDown){this.camera.position.set(0,55,.001);this.camera.lookAt(0,0,0);}
      this.updateTiles(world.time);
      const fov=this.baseFov+(spectatorPosition?0:world.player.hopPulse*3);if(this.camera.fov!==fov){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
      const ringIds=new Set<number>();for(const ring of world.rings){ringIds.add(ring.id);let mesh=this.beckons.get(ring.id);if(!mesh){mesh=new THREE.Mesh(new THREE.TorusGeometry(1,.035,4,64),new THREE.MeshBasicMaterial({color:0xff4422,transparent:true,opacity:.65}));mesh.rotation.x=Math.PI/2;this.beckons.set(ring.id,mesh);this.scene.add(mesh);}mesh.position.set(ring.pos.x,1,ring.pos.z);mesh.scale.setScalar(Math.max(.01,ring.radius));}for(const [id,mesh] of this.beckons)if(!ringIds.has(id)){this.scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();this.beckons.delete(id);}
      this.camera.updateWorldMatrix(true,false);this.swarmProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.swarmFrustum.setFromProjectionMatrix(this.swarmProjection);
      const swarmCounts=new Map<EnemyKind,number>();
      const present=new Set<number>();
      for(const e of world.enemies) {
        if(isSkull(e.kind)||isEgg(e.kind)||e.kind==='spiderling'){
          let batch=this.swarmBatches.get(e.kind);if(!batch)continue;
          if(e.age<0)continue;
          this.dummy.position.set(e.pos.x,e.pos.y,e.pos.z);this.dummy.rotation.set(0,enemyYaw(e,world.player.pos),0);this.dummy.scale.setScalar(swarmEmergenceScale(e));this.dummy.updateMatrix();
          this.swarmSphere.copy(this.swarmBounds.get(e.kind)!).applyMatrix4(this.dummy.matrix);
          // The native vertex shader snaps positions down to a 1/16 world grid.
          // Pad for that displacement so culling cannot remove an edge pixel.
          this.swarmSphere.radius+=Math.sqrt(3)/16;
          if(!this.swarmFrustum.intersectsSphere(this.swarmSphere))continue;
          const index=swarmCounts.get(e.kind)??0;
          if(index>=batch.capacity){for(const mesh of batch.meshes){this.scene.remove(mesh);mesh.geometry.dispose();mesh.dispose();}const capacity=batch.capacity*2,meshes=this.originalEnemies.createSwarmBatch(e.kind,capacity);for(let i=0;i<batch.capacity;i++)for(let j=0;j<meshes.length;j++){batch.meshes[j].getMatrixAt(i,this.swarmCopy);meshes[j].setMatrixAt(i,this.swarmCopy);}batch={meshes,capacity};for(const mesh of meshes)this.scene.add(mesh);this.swarmBatches.set(e.kind,batch);}
          for(const mesh of batch.meshes)mesh.setMatrixAt(index,this.dummy.matrix);swarmCounts.set(e.kind,index+1);continue;
        }
        present.add(e.id);let model=this.enemies.get(e.id);
        if(model&&model.name!==e.kind){this.scene.remove(model);this.enemies.delete(e.id);model=undefined;}
        if(!model) {
          if(!this.originalEnemies.ready)continue;
          model=this.originalEnemies.clone(e.kind);
          if(isPede(e.kind)){
            const segments:{node:THREE.Object3D;weakPoints:THREE.Object3D[]}[]=[];
            for(let i=0;i<e.segments.length;i++){const node=this.originalEnemies.segment(e.segments[i].hp>0,e.kind);node.name='segment';model.add(node);const weakPoints:THREE.Object3D[]=[];node.traverse(child=>{if(child.name==='segment-weak-point')weakPoints.push(child);});segments.push({node,weakPoints});}
            this.segmentNodes.set(model,segments);
          }
          this.enemies.set(e.id,model);this.scene.add(model);
        }
        model.visible=true;model.position.set(e.pos.x,e.pos.y,e.pos.z);const emergence=enemyEmergenceScale(e);model.scale.setScalar(emergence);
        model.rotation.y=enemyYaw(e,world.player.pos);
        if(e.kind.startsWith('squid'))model.userData.towerSpinDirection=e.towerSpinDirection??-1;
        this.originalEnemies.animate(model,e,world.time,world.spawnFixesEnabled);
        if(isPede(e.kind)) {
          model.rotation.set(0,0,0);model.children[0].rotation.set(-Math.atan2(e.vel.y,Math.hypot(e.vel.x,e.vel.z)),enemyYaw(e,world.player.pos),0,'YXZ');const segments=this.segmentNodes.get(model)!;
          for(let i=0;i<segments.length;i++){const {node,weakPoints}=segments[i],s=e.segments[i],lead=i===0?e.pos:e.segments[i-1].pos;node.position.set(s.pos.x-e.pos.x,s.pos.y-e.pos.y,s.pos.z-e.pos.z);node.rotation.set(-Math.atan2(lead.y-s.pos.y,Math.hypot(lead.x-s.pos.x,lead.z-s.pos.z)),Math.atan2(lead.x-s.pos.x,lead.z-s.pos.z),0,'YXZ');for(const point of weakPoints)point.visible=s.hp>0;}
        }
      }
      for(const [kind,batch] of this.swarmBatches)for(const mesh of batch.meshes){mesh.count=swarmCounts.get(kind)??0;if(mesh.count){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);mesh.instanceMatrix.needsUpdate=true;}}
      for(const [id,model] of this.enemies)if(!present.has(id)) {
        if(model.name.startsWith('squid')){
          model.traverse(node=>{if(node.name.startsWith('weak-point-'))node.visible=false;});
          model.updateWorldMatrix(true,true);
          const top=new THREE.Box3().setFromObject(model).max.y;
          const floor=floorHeight(model.position.x,model.position.z,world.time);
          this.dyingTowers.set(id,{model,started:world.time,y:model.position.y,yaw:model.rotation.y,direction:model.userData.towerSpinDirection??-1,depth:Math.max(1,top-Math.max(-5,floor)+.5)});
        }else this.scene.remove(model);
        this.enemies.delete(id);
      }
      for(const [id,death] of this.dyingTowers){
        const elapsed=world.time-death.started,pose=towerDeathPose(elapsed,death.depth);
        if(pose.done||elapsed<0||present.has(id)){this.scene.remove(death.model);this.dyingTowers.delete(id);continue;}
        death.model.visible=true;death.model.position.y=death.y-pose.sink;death.model.rotation.y=death.yaw+death.direction*pose.spin;
      }
      this.gemMesh.count=Math.min(1200,world.gems.length);for(let i=0;i<this.gemMesh.count;i++){const gem=world.gems[i];this.dummy.position.set(gem.pos.x,gem.pos.y,gem.pos.z);this.dummy.rotation.set(t,t*2,0);this.dummy.scale.setScalar(1.4*(gem.age>8?Math.sin(t*18)*.2+.8:1));this.dummy.updateMatrix();this.gemMesh.setMatrixAt(i,this.dummy.matrix);}if(this.gemMesh.count){this.gemMesh.instanceMatrix.clearUpdateRanges();this.gemMesh.instanceMatrix.addUpdateRange(0,this.gemMesh.count*16);this.gemMesh.instanceMatrix.needsUpdate=true;}
    }
    if(this.deathGhost?.visible&&world&&!menu)updateCrewAvatar(this.deathGhost,bodyInput??{forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false},world.player.vel,Math.abs(world.player.vel.y)<.2,world.time);
    if(world&&!menu&&this.topDown&&bodyInput&&!spectatorPosition&&!world.crew.length){
      if(!this.replayBody){this.replayBody=createCrewAvatar(0);this.replayBody.name='replay-player';this.scene.add(this.replayBody);}
      this.replayBody.visible=true;this.replayBody.position.set(world.player.pos.x,world.player.pos.y,world.player.pos.z);this.replayBody.rotation.y=bodyInput.yaw;
      updateCrewAvatar(this.replayBody,bodyInput,world.player.vel,world.player.grounded,world.time);
    }else if(this.replayBody)this.replayBody.visible=false;
    this.updateFloorSide(this.camera.position.y);
    this.updateCrewDeaths(world,menu,dt);
    this.updateCrewModels(world,dt,crewInterpolated,this.scene,menu);
    this.playerLight.intensity=!menu&&world&&!spectatorPosition?24*(1-day*.85):0;this.playerLight.position.copy(this.camera.position);this.playerLight.position.y-=.35;
    this.enemyLighting.update(world,this.camera,menu,e=>this.enemyGlowSources.sources(e,world!.player.pos,this.camera,this.enemies.get(e.id)));
    this.segmentBatches.begin(this.camera);
    if(world&&!menu)for(const e of world.enemies)if(isPede(e.kind)){const model=this.enemies.get(e.id);if(model)this.segmentBatches.add(model);}
    this.segmentBatches.end();
    this.gemLighting.update(world,this.camera,menu);this.sky.update(this.camera,menu?t:world?.time??0,menu);this.originalWeapon.update(world,dt,menu,this.topDown||spectatorPosition?undefined:this.camera,projectileAlpha);
    this.blood.update(world,menu,this.deathBurstActive?this.deathBloodTime:world?.crew.length?this.crewDeathTime:undefined,this.camera);this.projectileLighting.update(world,menu,projectileAlpha,this.renderer.domElement.height,this.originalWeapon.projectileView);this.openingMist.update(this.camera,world?.time??0);
    this.openingMist.updateLights(this.camera,this.enemyLighting.aura,this.projectileLighting.glow);
    this.upgradePulse.update(dt,world?.time??0);
    this.composer.render();this.originalWeapon.render(this.renderer,menu||!!spectatorPosition||this.topDown);
  }
  clear() {this.upgradePulse.clear();this.setDeathGhost(null);if(this.replayBody){this.disposeCrew(this.replayBody);this.replayBody=null;}for(const slot of this.crewDeathBursts){slot.burst.clear();slot.id=null;}this.crewAlive.clear();this.crewExploded.clear();this.crewDeathTime=0;for(const death of this.dyingTowers.values())this.scene.remove(death.model);this.dyingTowers.clear();this.blood.clear();this.segmentBatches.clear();for(const model of this.crewModels.values()){this.disposeCrew(model);}this.crewModels.clear();for(const batch of this.swarmBatches.values())for(const mesh of batch.meshes)mesh.count=0;for(const mesh of this.beckons.values()){this.scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.beckons.clear();for(const model of this.enemies.values())this.scene.remove(model);this.enemies.clear();this.gemLighting.clear();this.enemyLighting.clear();this.projectileLighting.clear();this.playerLight.intensity=0;this.originalWeapon.clear();}
}
