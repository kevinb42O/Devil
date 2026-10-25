import {prepareTowerCollisions} from './projectile-collision';
import {AscentRumble,ASCENT_RUMBLE} from './ascent-rumble';
import {SkullMotion} from './skull-motion';
import {AscentRush} from './ascent-rush';
import {TransmutationWaves} from './transmutation-waves';
import {Heaven} from './heaven';
import {Cathedral} from './cathedral';
import {DescentPassage} from './descent-passage';
import {VeilEnvironment} from './veil-environment';
import {CosmicEnvironment} from './cosmic-environment';
import {Furnace} from './furnace';
import {StormRain} from './storm-rain';
import {inHideWing,constrainHideSolids} from './courtyard-hide-and-seek';
import {basketballPose} from './courtyard-basketball';
import {CourtyardScene} from './courtyard-scene';
import {isPlayerSkin,isPodiumRank,PODIUM_METALS,type PlayerSkin,type PodiumRank} from './player-skins';
import {playerColor} from './player-colors';
import {footballKickPose,COURTYARD_CAMERA_BLOCKERS,COURTYARD_CAMERA_BOUNDS} from './courtyard-state';
import {CourtyardNeck,courtyardNeckFraction} from './courtyard-neck';
import {ENTRANCE_COURTYARD} from './entrance-layout';
import {MovementMotion} from './movement-motion';
import {crystalImpactScale} from './impact-presentation';
import {CameraFeedback} from './camera-feedback';
import {MAX_CREW_PLAYERS} from './crew-config';
import {UPGRADE_PULSE} from './upgrade-pulse-tuning';
import {UpgradeGroundPulse} from './upgrade-ground-pulse';
import {UpgradeScreenFlash} from './upgrade-screen-flash';
import {EnemyDeaths,hasCreatureDeath} from './enemy-death';
import {EnemyEmergence} from './enemy-emergence';
import {MenuRelics} from './menu-relics';
import {BloodRenderer} from './blood-renderer';
import {PlayerDeathBurst} from './player-death-burst';
import {SinglePlayerEntrance} from './entrance';
import {gameViewport} from './game-viewport';
import * as THREE from 'three';
import { OriginalWeapon } from './original-weapon';
import {HAND_MUZZLES} from './weapon-origin';
import {createCrewAvatar,setCrewAvatarColor,setCrewAvatarSkin,loadCrewAvatar,crewWeaponMuzzle,updateCrewAvatar,disposeCrewAvatar} from './crew-avatar';
import { OriginalEnemies } from './original-enemies';
import { AbyssSky } from './sky';
import {EnvironmentLighting} from './environment-lighting';
import {SceneLighting} from './scene-lighting';
import {OpeningMist} from './opening-mist';
import {SegmentBatches} from './segment-batches';
import {EnemyHitFlash,enemyHitFlash} from './enemy-hit-flash';
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
export type VisualSettings={quality:string;fov:number;skyMotion?:'full'|'reduced';mist?:boolean;screenShake?:number;movementMotion?:number};
export class GameRenderer {
  onDeathContact?:(kind:Enemy['kind'],pos:Vec)=>void;
  readonly skullMotion=new SkullMotion();
  readonly cameraFeedback=new CameraFeedback();
  readonly ascentRumble=new AscentRumble();
  readonly movementMotion=new MovementMotion();
  private courtyardNeck=new CourtyardNeck();
  private feedbackWorldOffset=new THREE.Vector3();
  private feedbackLife='';
  private feedbackTime=-Infinity;
  private movementClock:number|null=null;
  readonly upgradeScreenFlash=new UpgradeScreenFlash();
  resetFeedback(){this.ascentRumble.clear();this.upgradeScreenFlash.clear();this.courtyardNeck.clear();this.movementClock=null;this.movementMotion.clear();this.cameraFeedback.clear();this.feedbackWorldOffset.set(0,0,0);this.feedbackLife='';this.feedbackTime=-Infinity;this.originalWeapon?.resetMotion();}
  crewAvatarLoaded=false;readonly crewAvatarReady=loadCrewAvatar().then(()=>{this.crewAvatarLoaded=true;});
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
    this.crewDeathTime=world.state==='dead'&&!this.crewReplayMode?Math.max(world.time,this.crewDeathTime+Math.min(.1,Math.max(0,dt))):world.time;
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
  private creatureDeaths:EnemyDeaths|null=null;
  private lastSpiderlings=new Map<number,Enemy>();
  private dyingTowers=new Map<number,{model:THREE.Group;started:number;y:number;yaw:number;direction:number;depth:number}>();
  private crewModels=new Map<string,THREE.Group>();
  private crewReplayExternal=false;
  private crewNames=new Map<string,string>();
  private crewColors=new Map<string,string>();
  private crewSkins=new Map<string,{skin:PlayerSkin;rank:PodiumRank}>();
  private crewMuzzlePosition=new THREE.Vector3();
  setCrewNames(members:{id:string;name:string;color?:string;skin?:string;skinRank?:number}[]){this.crewNames=new Map(members.map(p=>[p.id,p.name]));this.crewColors=new Map(members.map(p=>[p.id,playerColor(p.color).id]));this.crewSkins.clear();for(const p of members)if(isPlayerSkin(p.skin)&&isPodiumRank(p.skinRank))this.crewSkins.set(p.id,{skin:p.skin,rank:p.skinRank});}
  get crewPresentation(){return [...this.crewModels].map(([id,model])=>({id,color:model.userData.playerColor,skin:model.userData.playerSkin,skinRank:model.userData.skinRank,skinTime:model.userData.skinTime?.value,name:model.userData.playerName,position:model.position.toArray(),label:model.children.some(c=>c.name==='crew-name'&&c.visible)}));}
  private updateCrewName(model:THREE.Group,name:string){
    const color=isPodiumRank(model.userData.skinRank)?PODIUM_METALS[model.userData.skinRank-1]:playerColor(model.userData.playerColor).hex;
    if(model.userData.playerName===name&&model.userData.labelColor===color)return;
    const old=model.children.find(c=>c.name==='crew-name') as THREE.Sprite|undefined;
    if(old){model.remove(old);old.material.map?.dispose();old.material.dispose();}
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext('2d')!;ctx.font='500 36px "DM Sans", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=8;ctx.fillStyle=color;ctx.fillText(name,256,48,480);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.78,depthTest:true,depthWrite:false,toneMapped:false}));
    label.name='crew-name';label.position.set(0,.9,0);label.scale.set(2.6,.49,1);model.add(label);model.userData.playerName=name;model.userData.labelColor=color;
  }
  private updateCrewModels(world:World|null,dt:number,crewInterpolated:boolean,scene:THREE.Scene,menu=false){
    const crewIds=new Set<string>();
    if(world&&!menu)for(let i=0;i<world.crew.length;i++){const p=world.crew[i];if((p.player===world.player&&!(this.crewReplayMode&&(this.topDown||this.crewReplayExternal)))||!p.alive)continue;crewIds.add(p.id);let model=this.crewModels.get(p.id);if(!model){model=createCrewAvatar(i);model.position.set(p.player.pos.x,p.player.pos.y,p.player.pos.z);this.crewModels.set(p.id,model);scene.add(model);}if(model.parent!==scene)scene.add(model);if(crewInterpolated)model.position.set(p.player.pos.x,p.player.pos.y,p.player.pos.z);else model.position.lerp(new THREE.Vector3(p.player.pos.x,p.player.pos.y,p.player.pos.z),1-Math.exp(-25*dt));model.rotation.y=p.input.yaw;const skin=this.crewSkins.get(p.id);setCrewAvatarSkin(model,skin?.skin,skin?.rank);updateCrewAvatar(model,p.input,p.player.vel,p.player.grounded,(scene===this.entrance.scene||scene===this.courtyard.scene)?world.tick*STEP:world.time,p.lastShotTick>=0&&(world.tick-p.lastShotTick)<18,scene===this.entrance.scene||scene===this.courtyard.scene,p.level,footballKickPose(world.courtyard,p.id,world.tick),!!world.courtyard?.drawing?.pencils.some(pencil=>pencil.owner===p.id),basketballPose(world.courtyard?.basketball,p.id,world.tick,p),undefined,this.blood.handBlood.sample(world,p.player));setCrewAvatarColor(model,this.crewColors.get(p.id));this.updateCrewName(model,this.crewNames.get(p.id)??'Wanderer');const nameLabel=model.getObjectByName('crew-name');if(nameLabel)nameLabel.visible=!(world.courtyard&&inHideWing(p.player.pos.x,p.player.pos.z));}
    for(const [id,model]of this.crewModels)if(!crewIds.has(id)){this.disposeCrew(model);this.crewModels.delete(id);}
  }
  private disposeCrew(model:THREE.Group){model.removeFromParent();disposeCrewAvatar(model);model.traverse(o=>{if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}});}

  private emoteHands:THREE.Group|null=null;
  private readonly combatMuzzle=(level:number,socket:number,out:THREE.Vector3)=>!!this.emoteHands?.visible&&crewWeaponMuzzle(this.emoteHands,out,level,socket);
  localPlayerColor:string='crimson';
  get combatHandDiagnostics(){return {source:this.emoteHands?.userData.avatarSource,visible:!!this.emoteHands?.visible&&this.emoteHands.parent===this.scene,gestures:this.emoteHands?.userData.emotes,hands:this.emoteHands?.userData.combatHands};}
  private updateFirstPersonBody(world:World,input:Input,yaw:number,alpha:number,time:number,courtyard:boolean,scene:THREE.Scene){
    this.emoteHands??=createCrewAvatar(0,false,true);
    const hands=this.emoteHands;hands.visible=true;if(hands.parent!==scene)scene.add(hands);
    samplePlayerPosition(world,alpha,hands.position);hands.rotation.set(0,yaw,0);
    const local=world.crew.find(p=>p.player===world.player),skin=local?this.crewSkins.get(local.id):undefined;
    setCrewAvatarColor(hands,local?this.crewColors.get(local.id):this.localPlayerColor);setCrewAvatarSkin(hands,skin?.skin,skin?.rank);
    updateCrewAvatar(hands,input,world.player.vel,world.player.grounded,time,local?local.lastShotTick>=0&&(world.tick-local.lastShotTick)<18:false,courtyard,world.level,footballKickPose(world.courtyard,local?.id??'',world.tick),!!world.courtyard?.drawing?.pencils.some(pencil=>pencil.owner===local?.id),basketballPose(world.courtyard?.basketball,local?.id??'',world.tick,local),courtyard?undefined:{...this.originalWeapon.handFeedback,blood:this.blood.handBlood.sample(world)});
  }

  readonly entrance:SinglePlayerEntrance;
 readonly courtyard=new CourtyardScene();
 courtyardMembers:{id:string;ready:boolean;color?:string;loaded?:number}[]=[];
  crewReplayMode=false;
  topDown=false;renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(95,1,.05,180);composer:EffectComposer; bloom:UnrealBloomPass;
  private swarmBounds=new Map<EnemyKind,THREE.Sphere>();private swarmFrustum=new THREE.Frustum();private swarmProjection=new THREE.Matrix4();private swarmSphere=new THREE.Sphere();private swarmCopy=new THREE.Matrix4();
  private swarmBatches=new Map<EnemyKind,{meshes:THREE.InstancedMesh[];capacity:number}>();private originalFloor=false;private tileHeights:number[]=[];private transmutationWaves:TransmutationWaves;private baseFov=90;private enemies=new Map<number,THREE.Group>();private tiles:THREE.InstancedMesh;private tilePositions:THREE.Vector3[]=[];
  originalWeapon:OriginalWeapon;originalEnemies:OriginalEnemies;private gemMesh:THREE.InstancedMesh;private dummy=new THREE.Object3D();
  private renderScale=1;private slowFrames=0;private fastFrames=0;private resizeCooldown=0;private quality='high';
  readonly menuRelics=new MenuRelics();
  readonly upgradePulse:UpgradeGroundPulse;
  private preview=new THREE.Group();private altar:THREE.Group;private visualTime=0;
  readonly enemyEmergence=new EnemyEmergence(this.scene);
  private segmentBatches=new SegmentBatches(this.scene);
  private segmentNodes=new WeakMap<THREE.Group,{node:THREE.Object3D;weakPoints:THREE.Object3D[]}[]>();
  private sky=new AbyssSky();private gemLighting:GemLighting;
  private environment=new EnvironmentLighting();
  private chapterLighting=new SceneLighting();
  readonly openingMist=new OpeningMist();
  readonly stormRain:StormRain;
  readonly veilEnvironment:VeilEnvironment;
  readonly furnace:Furnace;
  readonly cathedral:Cathedral;
  readonly heaven:Heaven;
  readonly ascentRush:AscentRush;
  readonly descentPassage:DescentPassage;
  readonly cosmicEnvironment:CosmicEnvironment;
  private skyLight=new THREE.HemisphereLight(0xcad5bc,0x18100c,1.15);
  private moonLight=new THREE.DirectionalLight(0xe2e8cd,2.1);
  private rimLight=new THREE.DirectionalLight(0x729786,1.8);
  private infernalLight=new THREE.PointLight(0xe44920,90,45,2);
  private altarLight=new THREE.PointLight(0xcde98b,12,9);
  private environmentMotionReduced=false;
  private cosmicKeyLight=new THREE.Color(0xadc4ff);
  private playerLight=new THREE.PointLight(0xffb56b,24,11,2);
  private swarmFlashCopy=new THREE.Color();
  private enemyHitFlash=new EnemyHitFlash();
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
    const diffuse=loader.load('/assets/materials/rock_tile_floor/2k/textures/rock_tile_floor_diff_2k.jpg');diffuse.colorSpace=THREE.SRGBColorSpace;diffuse.magFilter=THREE.LinearFilter;diffuse.minFilter=THREE.LinearMipmapLinearFilter;diffuse.generateMipmaps=true;diffuse.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
    this.entrance=new SinglePlayerEntrance(diffuse);
    const stone=new THREE.MeshBasicMaterial({map:diffuse,color:0x59616e,toneMapped:false});
    for(const tile of ARENA_TILES)this.tilePositions.push(new THREE.Vector3((tile.x-25)*TILE_SIZE,0,(tile.z-25)*TILE_SIZE));
    this.gemLighting=new GemLighting(this.scene,stone);
    this.environment.attach(stone);
    this.enemyLighting=new EnemyLighting(this.scene,stone);
    this.transmutationWaves=new TransmutationWaves(this.scene,stone);
    this.projectileLighting=new ProjectileLighting(this.scene,stone);
    this.blood=new BloodRenderer(this.scene,stone);
    this.upgradePulse=new UpgradeGroundPulse(stone);
    this.stormRain=new StormRain(this.scene,stone);
    this.furnace=new Furnace(this.scene,stone);
    this.cathedral=new Cathedral(this.scene,stone);
    this.descentPassage=new DescentPassage(this.scene,stone);
    this.cosmicEnvironment=new CosmicEnvironment(this.scene,stone);
    this.veilEnvironment=new VeilEnvironment(this.scene,stone);
    this.heaven=new Heaven(this.scene,stone);
    this.ascentRush=new AscentRush(this.scene);
    this.environment.uniforms.veilClouds=this.veilEnvironment.uniforms.veilClouds;
    this.environment.uniforms.veilClock=this.veilEnvironment.uniforms.veilClock;
    this.deathBurst=new PlayerDeathBurst(this.scene,this.blood.field);
    for(let i=0;i<MAX_CREW_PLAYERS;i++)this.crewDeathBursts.push({burst:new PlayerDeathBurst(this.scene,this.blood.field,this.deathBurst),id:null,position:{x:0,y:0,z:0},started:0});
    this.tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(TILE_SIZE,.1,TILE_SIZE),stone,this.tilePositions.length);this.scene.add(this.tiles);
    this.updateTiles(0);
    this.gemMesh=new THREE.InstancedMesh(gemGeo,crystal,1200);this.gemMesh.count=0;this.gemMesh.frustumCulled=false;this.scene.add(this.gemMesh);
    this.originalEnemies=new OriginalEnemies(this.environment);this.enemyGlowSources=new EnemyGlowSources(this.originalEnemies);
    this.originalWeapon=new OriginalWeapon(this.scene,this.environment);
    this.altar=new THREE.Group();shape(this.altar,new THREE.CylinderGeometry(1.1,1.6,1.2,8),darkBone,[0,.6,0],[1,1,1]);shape(this.altar,new THREE.OctahedronGeometry(.38),greenCrystal,[0,2.7,0],[.55,2.2,.55]);this.altarLight.position.y=2;this.scene.add(this.altarLight);this.preview.add(this.altar);
    this.scene.add(this.preview);
    void this.originalEnemies.loaded.then(()=>{if(!this.originalEnemies.ready)return;this.courtyard.setSkull(this.originalEnemies.clone('skull'));this.courtyard.setFloor(this.originalEnemies.tileGeometry,diffuse);this.tiles.geometry.dispose();this.tiles.geometry=this.originalEnemies.tileGeometry;this.originalFloor=true;for(const kind of ENEMY_KINDS)if(isSkull(kind)||isEgg(kind)||kind==='spiderling'){const meshes=this.originalEnemies.createSwarmBatch(kind,128);for(const mesh of meshes)this.scene.add(mesh);this.swarmBatches.set(kind,{meshes,capacity:128});const bounds=new THREE.Box3();for(const mesh of meshes){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox!);}this.swarmBounds.set(kind,bounds.getBoundingSphere(new THREE.Sphere()));}this.scene.remove(this.gemMesh);this.gemMesh=new THREE.InstancedMesh(this.originalEnemies.gemGeometry,new THREE.MeshStandardMaterial({...((this.originalEnemies.gemMaterial as THREE.MeshBasicMaterial).map?{map:(this.originalEnemies.gemMaterial as THREE.MeshBasicMaterial).map,emissiveMap:(this.originalEnemies.gemMaterial as THREE.MeshBasicMaterial).map}:{}),emissive:0xff431a,emissiveIntensity:1.4,color:0xffa665,roughness:.4,toneMapped:false}),1200);this.gemMesh.frustumCulled=false;this.gemMesh.count=0;this.scene.add(this.gemMesh);for(const [kind,pos] of [['squid',[0,3.3,-11]],['skull',[5,2,-4]],['skull2',[9,2,0]],['spider',[27,2.7,25]]] as const){const model=this.originalEnemies.clone(kind);model.position.set(pos[0],pos[1],pos[2]);this.preview.add(model);}});
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
  configure(settings:VisualSettings) {this.ascentRumble.configure(settings.screenShake,settings.skyMotion==='reduced');this.ascentRush.configure(settings.quality,settings.skyMotion==='reduced');this.heaven.configure(settings.quality,settings.skyMotion==='reduced');this.entrance.configure(settings.quality,settings.skyMotion==='reduced');this.descentPassage.configure(settings.quality,settings.skyMotion==='reduced');this.cathedral.configure(settings.quality,settings.skyMotion==='reduced');this.veilEnvironment.configure(settings.quality,settings.skyMotion==='reduced');this.cosmicEnvironment.configure(settings.quality,settings.skyMotion==='reduced');this.furnace.configure(settings.quality,settings.skyMotion==='reduced');this.stormRain.configure(settings.quality,settings.skyMotion==='reduced');this.environmentMotionReduced=settings.skyMotion==='reduced';this.cameraFeedback.configure(settings.screenShake);this.movementMotion.configure(settings.movementMotion);this.originalWeapon.configureMotion(settings.movementMotion);this.openingMist.configure(settings.quality,settings.skyMotion==='reduced',settings.mist!==false);this.menuRelics.configure(settings.quality,settings.skyMotion==='reduced',settings.mist!==false);this.baseFov=settings.fov;this.camera.fov=settings.fov;this.camera.updateProjectionMatrix();this.quality=settings.quality;this.sky.configure(settings.quality,settings.skyMotion);this.renderScale=1;this.slowFrames=this.fastFrames=this.resizeCooldown=0;if(this.bloom)this.bloom.enabled=settings.quality==='high';this.resize();}
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
    await Promise.all([this.veilEnvironment.ready,this.furnace.ready,this.sky.ready,this.originalEnemies.loaded,this.originalWeapon.loaded,this.crewAvatarReady,this.entrance.ready,this.blood.ready,this.deathBurst!.ready,...this.crewDeathBursts.map(s=>s.burst.ready)]);
    prepareTowerCollisions();
    this.furnace.prepare(this.renderer);
    this.entrance.sanctuary.setSpace(this.sky.cosmicTexture);
    this.blood.setReflections(this.sky.cosmicTexture,this.sky.reflectionTexture);
    if(!this.originalEnemies.ready||!this.originalWeapon.ready)return;
    // Compile the gameplay and hand materials while the menu is still visible.
    const body=createCrewAvatar(0),ghost=createCrewAvatar(0,true);
    body.position.set(1000,0,0);ghost.position.set(1000,0,0);this.scene.add(body,ghost);
    const veilWasVisible=this.veilEnvironment.group.visible;this.veilEnvironment.group.visible=true;
    const spaceWasVisible=this.cosmicEnvironment.group.visible;this.cosmicEnvironment.group.visible=true;
    const rushWasVisible=this.ascentRush.group.visible;this.ascentRush.group.visible=true;
    const heavenWasVisible=this.heaven.group.visible;this.heaven.group.visible=true;
    const cathedralWasVisible=this.cathedral.group.visible;this.cathedral.group.visible=true;
    const passageWasVisible=this.descentPassage.group.visible;this.descentPassage.group.visible=true;
    const rainWasVisible=this.stormRain.group.visible,fireWasVisible=this.furnace.group.visible;this.stormRain.group.visible=true;this.furnace.group.visible=true;
    try{
      // Warm rain and both floor variants so falling doesn't compile a shader mid-frame.
      this.updateFloorSide(-Infinity);await this.renderer.compileAsync(this.scene,this.camera);
      this.updateFloorSide(Infinity);await this.renderer.compileAsync(this.scene,this.camera);
    }finally{this.ascentRush.group.visible=rushWasVisible;this.heaven.group.visible=heavenWasVisible;this.descentPassage.group.visible=passageWasVisible;this.cathedral.group.visible=cathedralWasVisible;this.veilEnvironment.group.visible=veilWasVisible;this.cosmicEnvironment.group.visible=spaceWasVisible;this.furnace.group.visible=fireWasVisible;this.stormRain.group.visible=rainWasVisible;this.scene.remove(body,ghost);disposeCrewAvatar(body);disposeCrewAvatar(ghost);}
    await this.renderer.compileAsync(this.entrance.scene,this.camera);
    await this.originalWeapon.prewarm(this.renderer);
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
    const localMember=world.crew.find(p=>p.player===world.player),localId=localMember?.id;
    const local=!world.crew.length||effect.shooterId===localId;
    const life=localMember?localMember.id+':'+localMember.life:'solo';
    // Reset before queuing the new life's first event, so it is not discarded
    // when that life is first rendered (including replay player changes).
    if(this.feedbackLife&&this.feedbackLife!==life)this.resetFeedback();
    this.feedbackLife=life;
    this.cameraFeedback.event(effect,local,world.player.pos,yaw,local?(localMember?.deathSource??world.deathSource)?.contactBody:undefined);
    let weaponEffect=effect;
    if(!local&&(effect.kind==='shot'||effect.kind==='burst')&&effect.shooterId){
      const model=this.crewModels.get(effect.shooterId),shooter=world.crew.find(p=>p.id===effect.shooterId);
      if(model&&shooter){
        updateCrewAvatar(model,shooter.input,shooter.player.vel,shooter.player.grounded,world.time,true,false,shooter.level,undefined,false,undefined,undefined,this.blood.handBlood.sample(world,shooter.player));
        model.updateWorldMatrix(true,true);
        const level=effect.level??shooter.level,single=level>=5&&effect.hand!==undefined,count=effect.projectileKind==='shotgun'?(level>=5&&!single?2:1):HAND_MUZZLES[level-1].length/(single?2:1);
        const muzzles:Vec[]=[];
        for(let socket=0;socket<count;socket++){
          if(!crewWeaponMuzzle(model,this.crewMuzzlePosition,level,single?(effect.projectileKind==='shotgun'?effect.hand!:socket*2+effect.hand!):socket+(level<5&&effect.hand===0?HAND_MUZZLES[level-1].length:0)))break;
          muzzles.push({x:this.crewMuzzlePosition.x,y:this.crewMuzzlePosition.y,z:this.crewMuzzlePosition.z});
        }
        if(muzzles.length===count)weaponEffect={...effect,muzzles};
      }
    }
    this.originalWeapon.effect(weaponEffect,world,yaw,pitch,local);
    if(effect.kind==='upgrade'&&local)this.upgradeScreenFlash.begin(effect.level??effect.amount??world.level);
    if(effect.kind==='upgrade'&&((effect.level??0)<5||!world.crew.length||effect.sharedWave))this.upgradePulse.begin(effect.pos,effect.level??effect.amount??world.level,world.time);
    this.blood.effect(effect,world);
  }
  private applyViewFeedback(world:World,yaw:number,pitch:number,dt:number,suppressed:boolean,impacts=true,alpha=1){
    const member=world.crew.find(p=>p.player===world.player),life=member?member.id+':'+member.life:'solo';
    if(document.hidden||suppressed||(this.feedbackLife&&this.feedbackLife!==life)||world.time<this.feedbackTime)this.resetFeedback();
    this.feedbackLife=life;this.feedbackTime=world.time;this.feedbackWorldOffset.set(0,0,0);
    if(document.hidden||suppressed){this.ascentRumble.clear();return;}
    if(impacts)this.cameraFeedback.advance(dt);else this.cameraFeedback.clear();
    const clock=(impacts?world.time:world.tick*STEP)+(Math.max(0,Math.min(1,alpha))-1)*STEP;
    const travelDt=this.movementClock===null?dt:Math.max(0,clock-this.movementClock);this.movementClock=clock;
    if(world.state==='playing'&&member?.alive!==false)this.movementMotion.update(world.player,yaw,pitch,dt,travelDt);else this.movementMotion.clear();
    const impact=this.cameraFeedback.sample(),motion=this.movementMotion.pose.camera;
    const rumble=this.ascentRumble.sample(world.time,impacts&&world.state==='playing'&&member?.alive!==false);
    const x=impact.x+motion.x,y=impact.y+motion.y,z=impact.z+motion.z;
    this.feedbackWorldOffset.set(x*Math.cos(yaw)+z*Math.sin(yaw),y,-x*Math.sin(yaw)+z*Math.cos(yaw)).clampLength(0,.04);
    // Preserve the existing event-feedback cap, then add the independently bounded
    // propulsion response. The weapon receives the same total world offset.
    this.feedbackWorldOffset.x+=rumble.x*Math.cos(yaw)+rumble.z*Math.sin(yaw);
    this.feedbackWorldOffset.y+=rumble.y;
    this.feedbackWorldOffset.z+=-rumble.x*Math.sin(yaw)+rumble.z*Math.cos(yaw);
    this.feedbackWorldOffset.clampLength(0,.04+ASCENT_RUMBLE.maxOffset);
    this.camera.position.add(this.feedbackWorldOffset);
  }
  render(world:World|null,yaw:number,pitch:number,dt:number,menu:boolean,projectileAlpha=1,spectatorPosition:Vec|null=null,crewInterpolated=false,entrance=false,bodyInput:Input|null=null) {
    if(!world||!bodyInput||spectatorPosition||this.topDown||this.deathGhost?.visible||this.deathBurstActive)this.courtyardNeck.clear();
    this.crewReplayExternal=!!spectatorPosition;this.renderer.info.reset();if(menu){
      this.descentPassage.group.visible=false;
      if(this.emoteHands)this.emoteHands.visible=false;
      this.resetFeedback();this.enemyEmergence.clear();this.upgradePulse.clear();this.upgradeScreenFlash.clear();
      // The menu has its own scene; retire gameplay glows before the early return.
      this.projectileLighting.update(null,true,projectileAlpha,this.renderer.domElement.height);
      this.menuRelics.render(this.renderer,dt);return;
    }this.originalEnemies.setTime(world?.time??this.visualTime);this.visualTime+=dt;const t=this.crewReplayMode&&world?world.time:this.visualTime;this.preview.visible=menu;this.altarLight.intensity=menu?12:0;
    if(entrance&&world){
      this.descentPassage.group.visible=false;
      if(this.camera.far!==180){this.camera.far=180;this.camera.updateProjectionMatrix();}
      const entranceScene=world.courtyard?this.courtyard.scene:this.entrance.scene;
      this.upgradePulse.clear();this.upgradeScreenFlash.clear();
      samplePlayerPosition(world,projectileAlpha,this.camera.position);
      this.applyViewFeedback(world,yaw,pitch,dt,false,false,projectileAlpha);this.camera.rotation.set(pitch,yaw,0,'YXZ');
      if(bodyInput&&!spectatorPosition&&!this.topDown){
       const neck=this.courtyardNeck.update(pitch,document.hidden?0:dt);
       if(neck.forward>0){
        // Lean the eyes over the chest; keep the body/shoulders at the actual
        // player origin and keep the camera inside the courtyard walls.
        const fraction=courtyardNeckFraction(this.camera.position,yaw,neck,world.courtyard?COURTYARD_CAMERA_BOUNDS:ENTRANCE_COURTYARD,world.courtyard?COURTYARD_CAMERA_BLOCKERS:[]);
        this.camera.position.x-=Math.sin(yaw)*neck.forward*fraction;
        this.camera.position.z-=Math.cos(yaw)*neck.forward*fraction;
        this.camera.position.y-=neck.drop*fraction;
       }
       if(world.courtyard){const limited=constrainHideSolids(world.player.pos,this.camera.position,.06);this.camera.position.x=limited.x;this.camera.position.z=limited.z;}
      }
      if(world.courtyard)this.courtyard.update(world,this.courtyardMembers,this.environmentMotionReduced);else this.entrance.update(t,this.camera.position);this.updateCrewModels(world,dt,crewInterpolated,entranceScene);
      if(bodyInput&&!spectatorPosition&&!this.topDown)this.updateFirstPersonBody(world,bodyInput,yaw,projectileAlpha,world.crew.length?world.tick*STEP:t,true,entranceScene);
      else if(this.emoteHands)this.emoteHands.visible=false;
      if(world.courtyard){
       const local=world.crew.find(p=>p.player===world.player);
       this.courtyard.updatePencilGrips(world,this.crewModels,bodyInput&&this.emoteHands?{id:local?.id??'',model:this.emoteHands}:undefined);
      }
      this.camera.updateWorldMatrix(true,false);
      if(!world.courtyard)this.entrance.updateFloorSide(this.camera.position.y);
      if(this.camera.fov!==this.baseFov){this.camera.fov=this.baseFov;this.camera.updateProjectionMatrix();}
      this.openingMist.update(this.camera,world.courtyard?world.time:t,true);
      this.openingMist.setSanctuary(!world.courtyard);
      if(!world.courtyard)this.openingMist.setHeat(0,t,31);
      const pass=this.composer.passes[0] as RenderPass;pass.scene=entranceScene;this.composer.render();pass.scene=this.scene;return;
    }
    const atmosphere=this.environment.update(world?.time??0,menu),day=this.environment.daylight;
    this.chapterLighting.update(atmosphere,menu,this.skyLight,this.moonLight,this.rimLight,this.infernalLight);
    const cosmic=atmosphere.cosmic;this.blood.cosmic=cosmic;
    // Keep the orbital landmarks intact when viewed from the far edge of the arena.
    const viewDistance=atmosphere.beyond>.001||atmosphere.phaseTime>=489?520:cosmic>.001?320:180;
    if(this.camera.far!==viewDistance){this.camera.far=viewDistance;this.camera.updateProjectionMatrix();}
    if(this.scene.fog instanceof THREE.FogExp2){this.scene.fog.color.setRGB(.08*day+atmosphere.furnace*.007,.12*day+atmosphere.furnace*.002,.17*day+atmosphere.cathedral*.007);const beyond=atmosphere.beyond;this.scene.fog.color.r+=(.68-this.scene.fog.color.r)*beyond;this.scene.fog.color.g+=(.61-this.scene.fog.color.g)*beyond;this.scene.fog.color.b+=(.47-this.scene.fog.color.b)*beyond;this.scene.fog.density=(.015-day*.006)*(1-beyond*.9);}
    this.gemLighting.daylight=day;this.gemLighting.cosmic=atmosphere.cosmic;this.gemLighting.nebulaTime=this.environmentMotionReduced?0:Math.min(atmosphere.phaseTime,30);
    if(menu) {
      this.transmutationWaves.update(null,true);
      this.camera.position.set(29+Math.sin(t*.04)*2,13,30);this.camera.lookAt(-10,2,0);this.altar.rotation.y=t*.2;
      this.preview.children.forEach((o,i)=>{if(i>0){o.rotation.y+=dt*(o.name.startsWith('squid')?-TOWER_SPIN_SPEED:.045);}});
      for(const batch of this.swarmBatches.values())for(const mesh of batch.meshes)mesh.count=0;for(const m of this.enemies.values())m.visible=false;for(const death of this.dyingTowers.values())death.model.visible=false;this.creatureDeaths?.hide();this.gemMesh.count=0;this.updateTiles(0);
    } else if(world) {
      if(spectatorPosition)this.camera.position.set(spectatorPosition.x,spectatorPosition.y,spectatorPosition.z);
      else samplePlayerPosition(world,projectileAlpha,this.camera.position);
      this.applyViewFeedback(world,yaw,pitch,dt,!!spectatorPosition||this.topDown||!!this.deathGhost?.visible||this.deathBurstActive,true,projectileAlpha);
      // Use the prelobby eye-to-body relationship when looking down. The
      // resting arm keeps its animation; viewing it from over the collar
      // instead makes its forearm appear to bend backward across the screen.
      if(bodyInput&&!spectatorPosition&&!this.topDown&&!this.deathGhost?.visible&&!this.deathBurstActive){
        const neck=this.courtyardNeck.update(pitch,document.hidden?0:dt);
        this.camera.position.x-=Math.sin(yaw)*neck.forward;
        this.camera.position.z-=Math.cos(yaw)*neck.forward;
        this.camera.position.y-=neck.drop;
      }
      this.camera.rotation.set(pitch,yaw,0,'YXZ');if(this.topDown){const centerZ=this.crewReplayMode?14:0;this.camera.position.set(0,55,centerZ+.001);this.camera.lookAt(0,0,centerZ);}
      this.updateTiles(world.time);
      this.enemyEmergence.update(world,this.camera);
      const fov=this.baseFov+(spectatorPosition?0:world.player.hopPulse*3);if(this.camera.fov!==fov){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
      this.transmutationWaves.update(world);
      this.camera.updateWorldMatrix(true,false);this.swarmProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.swarmFrustum.setFromProjectionMatrix(this.swarmProjection);
      const swarmCounts=new Map<EnemyKind,number>();
      this.skullMotion.begin(world,world.time);
      const present=new Set<number>();
      const spiderlings=new Map<number,Enemy>();
      this.creatureDeaths??=new EnemyDeaths(this.scene,(kind,pos)=>this.onDeathContact?.(kind,{x:pos.x,y:0,z:pos.z}));
      for(const e of world.enemies) {
        if(e.kind==='spiderling'&&e.age>=0)spiderlings.set(e.id,e);
        if(isSkull(e.kind)||isEgg(e.kind)||e.kind==='spiderling'){
          let batch=this.swarmBatches.get(e.kind);if(!batch)continue;
          if(e.age<0)continue;
          const skullPose=isSkull(e.kind)?this.skullMotion.sample(e,world.player.pos,this.environmentMotionReduced,(e.kind==='skull4'||e.kind==='transmuted4')&&world.groundSkullsEnabled):null;
          this.dummy.position.set(e.pos.x,e.pos.y,e.pos.z);this.dummy.rotation.set(skullPose?.pitch??0,skullPose?.yaw??enemyYaw(e,world.player.pos),skullPose?.roll??0,'YXZ');this.dummy.scale.setScalar(swarmEmergenceScale(e));this.dummy.updateMatrix();
          this.swarmSphere.copy(this.swarmBounds.get(e.kind)!).applyMatrix4(this.dummy.matrix);
          // The native vertex shader snaps positions down to a 1/16 world grid.
          // Pad for that displacement so culling cannot remove an edge pixel.
          this.swarmSphere.radius+=Math.sqrt(3)/16+(skullPose?.18:0);
          if(!this.swarmFrustum.intersectsSphere(this.swarmSphere))continue;
          const index=swarmCounts.get(e.kind)??0;
          if(index>=batch.capacity){
            const capacity=batch.capacity*2,meshes=this.originalEnemies.createSwarmBatch(e.kind,capacity);
            for(let j=0;j<meshes.length;j++){
              const previous=batch.meshes[j],motion=previous.geometry.getAttribute('skullMotion'),nextMotion=meshes[j].geometry.getAttribute('skullMotion');
              if(motion&&nextMotion)(nextMotion.array as Float32Array).set(motion.array);
              for(let i=0;i<batch.capacity;i++){previous.getMatrixAt(i,this.swarmCopy);meshes[j].setMatrixAt(i,this.swarmCopy);if(previous.instanceColor){previous.getColorAt(i,this.swarmFlashCopy);meshes[j].setColorAt(i,this.swarmFlashCopy);}}
              this.scene.remove(previous);previous.geometry.dispose();previous.dispose();
            }
            batch={meshes,capacity};for(const mesh of meshes)this.scene.add(mesh);this.swarmBatches.set(e.kind,batch);
          }
          for(const mesh of batch.meshes){mesh.material=this.enemyHitFlash.swarmMaterial(mesh.material as THREE.Material);mesh.setMatrixAt(index,this.dummy.matrix);mesh.setColorAt(index,enemyHitFlash(e,world.time)?this.enemyHitFlash.hit:this.enemyHitFlash.normal);if(skullPose){const motion=mesh.geometry.getAttribute('skullMotion') as THREE.InstancedBufferAttribute|undefined;motion?.setXYZW(index,skullPose.phase,skullPose.follow,skullPose.lift,skullPose.energy);}}swarmCounts.set(e.kind,index+1);continue;
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
        this.enemyHitFlash.restore(model);
        this.originalEnemies.animate(model,e,world.time,world.spawnFixesEnabled);
        if(enemyHitFlash(e,world.time))this.enemyHitFlash.apply(model);
        if(isPede(e.kind)) {
          model.rotation.set(0,0,0);model.children[0].rotation.set(-Math.atan2(e.vel.y,Math.hypot(e.vel.x,e.vel.z)),enemyYaw(e,world.player.pos),0,'YXZ');const segments=this.segmentNodes.get(model)!;
          for(let i=0;i<segments.length;i++){const {node,weakPoints}=segments[i],s=e.segments[i],lead=i===0?e.pos:e.segments[i-1].pos;node.position.set(s.pos.x-e.pos.x,s.pos.y-e.pos.y,s.pos.z-e.pos.z);node.rotation.set(-Math.atan2(lead.y-s.pos.y,Math.hypot(lead.x-s.pos.x,lead.z-s.pos.z)),Math.atan2(lead.x-s.pos.x,lead.z-s.pos.z),0,'YXZ');for(const point of weakPoints){
            const state=point.userData;
            if(state.feedbackHp!==undefined&&s.hp<state.feedbackHp)state.feedbackHitAt=world.time;
            if((state.feedbackHp!==undefined&&s.hp>state.feedbackHp)||world.time<(state.feedbackHitAt??-Infinity))state.feedbackHitAt=-Infinity;
            state.feedbackHp=s.hp;point.visible=s.hp>0;
            if(!state.feedbackScale)state.feedbackScale=point.scale.clone();
            point.scale.copy(state.feedbackScale).multiplyScalar(crystalImpactScale(world.time-(state.feedbackHitAt??-Infinity)));point.updateMatrix();
          }}
        }
      }
      for(const [kind,batch] of this.swarmBatches)for(const mesh of batch.meshes){mesh.count=swarmCounts.get(kind)??0;if(mesh.count){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);mesh.instanceMatrix.needsUpdate=true;const motion=mesh.geometry.getAttribute('skullMotion') as THREE.InstancedBufferAttribute|undefined;if(motion){motion.clearUpdateRanges();motion.addUpdateRange(0,mesh.count*4);motion.needsUpdate=true;}if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}}
      this.skullMotion.end();
      for(const [id,model] of this.enemies)if(!present.has(id)) {
        this.enemyHitFlash.restore(model);
        if(model.name.startsWith('squid')){
          model.traverse(node=>{if(node.name.startsWith('weak-point-'))node.visible=false;});
          model.updateWorldMatrix(true,true);
          const top=new THREE.Box3().setFromObject(model).max.y;
          const floor=floorHeight(model.position.x,model.position.z,world.time);
          this.dyingTowers.set(id,{model,started:world.time,y:model.position.y,yaw:model.rotation.y,direction:model.userData.towerSpinDirection??-1,depth:Math.max(1,top-Math.max(-5,floor)+.5)});
        }else if(hasCreatureDeath(model.name))this.creatureDeaths.begin(id,model,world.time);
        else this.scene.remove(model);
        this.enemies.delete(id);
      }
      for(const [id,e] of this.lastSpiderlings)if(!spiderlings.has(id)&&this.originalEnemies.ready){
        const model=this.originalEnemies.clone('spiderling');model.position.set(e.pos.x,e.pos.y,e.pos.z);model.rotation.y=enemyYaw(e,world.player.pos);model.scale.setScalar(swarmEmergenceScale(e));
        this.creatureDeaths.begin(id,model,world.time);
      }
      this.lastSpiderlings=spiderlings;
      for(const id of spiderlings.keys())present.add(id);
      this.creatureDeaths.update(world.time,present);
      for(const [id,death] of this.dyingTowers){
        const elapsed=world.time-death.started,pose=towerDeathPose(elapsed,death.depth);
        if(pose.done||elapsed<0||present.has(id)){if(pose.done&&!present.has(id))this.onDeathContact?.(death.model.name as Enemy['kind'],{x:death.model.position.x,y:floorHeight(death.model.position.x,death.model.position.z,world.time),z:death.model.position.z});this.scene.remove(death.model);this.dyingTowers.delete(id);continue;}
        death.model.visible=true;death.model.position.y=death.y-pose.sink;death.model.rotation.y=death.yaw+death.direction*pose.spin;
      }
      this.gemMesh.count=Math.min(1200,world.gems.length);for(let i=0;i<this.gemMesh.count;i++){const gem=world.gems[i];this.dummy.position.set(gem.pos.x,gem.pos.y,gem.pos.z);this.dummy.rotation.set(t,t*2,0);this.dummy.scale.setScalar(1.4*(gem.age>8?Math.sin(t*18)*.2+.8:1));this.dummy.updateMatrix();this.gemMesh.setMatrixAt(i,this.dummy.matrix);}if(this.gemMesh.count){this.gemMesh.instanceMatrix.clearUpdateRanges();this.gemMesh.instanceMatrix.addUpdateRange(0,this.gemMesh.count*16);this.gemMesh.instanceMatrix.needsUpdate=true;}
    }
    if(this.deathGhost?.visible&&world&&!menu)updateCrewAvatar(this.deathGhost,bodyInput??{forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false},world.player.vel,Math.abs(world.player.vel.y)<.2,world.time,false,false,world.level);
    if(world&&!menu&&this.topDown&&bodyInput&&!spectatorPosition&&!world.crew.length){
      if(!this.replayBody){this.replayBody=createCrewAvatar(0);this.replayBody.name='replay-player';this.scene.add(this.replayBody);}
      this.replayBody.visible=true;this.replayBody.position.set(world.player.pos.x,world.player.pos.y,world.player.pos.z);this.replayBody.rotation.y=bodyInput.yaw;
      updateCrewAvatar(this.replayBody,bodyInput,world.player.vel,world.player.grounded,world.time,false,false,world.level,undefined,false,undefined,undefined,this.blood.handBlood.sample(world));
    }else if(this.replayBody)this.replayBody.visible=false;
    this.originalWeapon.update(world,dt,menu,this.topDown||spectatorPosition?undefined:this.camera,projectileAlpha,this.feedbackWorldOffset,this.movementMotion.pose,()=>{
      const local=world?.crew.find(p=>p.player===world.player);
      if(world&&!menu&&world.state==='playing'&&local?.alive!==false&&!spectatorPosition&&!this.topDown&&!this.deathGhost?.visible&&!this.deathBurstActive){
        this.updateFirstPersonBody(world,bodyInput??local?.input??{forward:0,strafe:0,yaw,pitch,jump:false,fire:false,homing:false},yaw,projectileAlpha,world.time,false,this.scene);
        this.emoteHands!.updateWorldMatrix(true,true);
      }else if(this.emoteHands)this.emoteHands.visible=false;
    },this.combatMuzzle);
    this.updateFloorSide(this.camera.position.y);
    this.updateCrewDeaths(world,menu,dt);
    this.updateCrewModels(world,dt,crewInterpolated,this.scene,menu);
    this.playerLight.intensity=!menu&&world&&!spectatorPosition?24*(1-day*.85)*(1-atmosphere.cosmic*.88):0;this.playerLight.color.setHex(0xffb56b).lerp(this.cosmicKeyLight,atmosphere.cosmic);this.playerLight.position.copy(this.camera.position);this.playerLight.position.y-=.35;
    this.enemyLighting.update(world,this.camera,menu,e=>this.enemyGlowSources.sources(e,world!.player.pos,this.camera,this.enemies.get(e.id)));
    this.segmentBatches.begin(this.camera);
    if(world&&!menu)for(const e of world.enemies)if(isPede(e.kind)){const model=this.enemies.get(e.id);if(model)this.segmentBatches.add(model);}
    if(world&&!menu)this.creatureDeaths?.addSegments(model=>this.segmentBatches.add(model));
    this.segmentBatches.end();
    this.gemLighting.update(world,this.camera,menu);this.sky.update(this.camera,menu?t:world?.time??0,menu);
    this.cosmicEnvironment.setSky(this.sky.cosmicTexture);
    this.cosmicEnvironment.update(this.camera,world?.time??0,!!world&&!menu&&!entrance);
    this.furnace.update(this.camera,world?.time??0,!!world&&!menu&&!entrance);
    this.cathedral.update(this.camera,world?.time??0,!!world&&!menu&&!entrance);
    this.heaven.update(world?.time??0,!!world&&!menu&&!entrance);
    this.ascentRush.update(this.camera,world?.time??0,!!world&&!menu&&!entrance);
    this.descentPassage.update(this.camera,world?.time??0,!!world&&!menu&&!entrance);
    this.veilEnvironment.setSky(this.sky.veilTexture);
    this.veilEnvironment.update(this.camera,world?.time??0,!!world&&!menu&&!entrance);
    this.stormRain.setSky(this.sky.reflectionTexture,this.sky.reflectionTravel);
    this.stormRain.update(this.camera,world?.time??0,!!world&&!menu&&!entrance);
    this.stormRain.uniforms.rainWetness.value*=1-this.veilEnvironment.uniforms.veilAmount.value;
    this.blood.update(world,menu,this.deathBurstActive?this.deathBloodTime:world?.crew.length?this.crewDeathTime:undefined,this.camera);this.projectileLighting.update(world,menu,projectileAlpha,this.renderer.domElement.height,this.originalWeapon.projectileView);this.openingMist.update(this.camera,world?.time??0);
    this.openingMist.setHeat(this.furnace.uniforms.furnaceHeat.value,world?.time??0,this.furnace.uniforms.furnaceRadius.value);
    this.openingMist.updateLights(this.camera,this.enemyLighting.aura,this.projectileLighting.glow);
    this.upgradePulse.update(dt,world?.time??0);
    this.composer.render();this.originalWeapon.render(this.renderer,menu||!!spectatorPosition||this.topDown);
    this.upgradeScreenFlash.render(this.renderer,dt,!!spectatorPosition||this.topDown||world?.state!=='playing');
  }
  restoreReplayUpgrade(effect:Effect,world:World,age:number){
    const localId=world.crew.find(p=>p.player===world.player)?.id,local=effect.shooterId===localId;
    this.originalWeapon.effect(effect,world,0,0,local);if(local)this.originalWeapon.restoreReplayUpgradeAge(age);
    if(local)this.upgradeScreenFlash.begin(effect.level??world.level,age);
    if(age<UPGRADE_PULSE.duration&&((effect.level??0)<5||!world.crew.length||effect.sharedWave)){this.upgradePulse.begin(effect.pos,effect.level??world.level,world.time-age);this.upgradePulse.update(0,world.time);this.upgradePulse.update(0,world.time);}
  }
  /** Restore large corpses directly when a seek skipped their removal frame. */
  restoreReplayTowerDeaths(world:World,deaths:{tick:number;enemy:Enemy}[]){
    if(!this.originalEnemies.ready)return;
    for(const {tick,enemy:e}of deaths){const started=tick/120;if(started>world.time||world.time-started>10||world.enemies.some(x=>x.id===e.id))continue;
      const model=this.originalEnemies.clone(e.kind);model.position.set(e.pos.x,e.pos.y,e.pos.z);model.scale.setScalar(enemyEmergenceScale(e));model.rotation.y=enemyYaw(e,world.player.pos);this.originalEnemies.animate(model,e,started,world.spawnFixesEnabled);model.traverse(node=>{if(node.name.startsWith('weak-point-'))node.visible=false;});model.updateWorldMatrix(true,true);
      const top=new THREE.Box3().setFromObject(model).max.y,floor=floorHeight(model.position.x,model.position.z,started),depth=Math.max(1,top-Math.max(-5,floor)+.5);if(towerDeathPose(world.time-started,depth).done)continue;this.scene.add(model);this.dyingTowers.set(e.id,{model,started,y:e.pos.y,yaw:model.rotation.y,direction:e.towerSpinDirection??-1,depth});
    }
  }
  clear() {
    this.skullMotion.clear();
    this.creatureDeaths?.clear();this.lastSpiderlings.clear();
    // A crowded run must not leave the next run at its degraded resolution.
    this.slowFrames=this.fastFrames=this.resizeCooldown=0;
    if(this.renderScale!==1){this.renderScale=1;this.resize();}
    if(this.emoteHands){disposeCrewAvatar(this.emoteHands);this.emoteHands.removeFromParent();this.emoteHands=null;}this.resetFeedback();this.enemyEmergence.clear();this.upgradePulse.clear();this.upgradeScreenFlash.clear();this.setDeathGhost(null);if(this.replayBody){this.disposeCrew(this.replayBody);this.replayBody=null;}for(const slot of this.crewDeathBursts){slot.burst.clear();slot.id=null;}this.crewAlive.clear();this.crewExploded.clear();this.crewDeathTime=0;for(const death of this.dyingTowers.values())this.scene.remove(death.model);this.dyingTowers.clear();this.blood.clear();this.segmentBatches.clear();for(const model of this.crewModels.values()){this.disposeCrew(model);}this.crewModels.clear();for(const batch of this.swarmBatches.values())for(const mesh of batch.meshes)mesh.count=0;this.transmutationWaves.clear();for(const model of this.enemies.values())this.scene.remove(model);this.enemies.clear();this.gemLighting.clear();this.enemyLighting.clear();this.projectileLighting.clear();this.playerLight.intensity=0;this.originalWeapon.clear();}
}
