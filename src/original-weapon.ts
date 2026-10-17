import {goreGeometry,fragmentTexture} from './remake-geometry';
import {HandRecoil} from './hand-recoil';
import {HandFireAnimation} from './hand-fire-animation';
import {TWIN_POSE,handIndex} from './weapon-levels';
import {MovementMotion,type MovementPose} from './movement-motion';
import {sampleProjectile,PROJECTILE_COLORS,projectileStyleIndex,projectileRoll,projectileVisualIndex,ALL_PROJECTILE_COLORS,shotgunStyleIndex} from './projectile-presentation';
import * as THREE from 'three';
import {EnvironmentLighting} from './environment-lighting';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { type World, type Effect, type Projectile, type Vec } from './simulation';
import {WEAPON_PRESENTATION,STREAM_PRESENTATION,DAGGER_PRESENTATION,PROJECTILE_HAND_CLEARANCE,WEAPON_FEEDBACK,shotgunFeedback} from './weapon-tuning';
import {HAND_POSE,HAND_SOCKETS,HAND_MUZZLES,projectileSocket} from './weapon-origin';
const HAND_UPGRADE_DURATION=1.65;
const ROOT='/assets/original/devil-daggers/';
// Keep the first-person arm anchored to the screen as the world FOV changes.
const HAND_VIEW_FOV=90;
const HAND_VIEW_FORWARD=.08;
type Emitter={start:number[];end:number[];rim:number[];alpha:number;rimStrength:number;clip:number;lifetimeCandidate:number[];speedCandidate:number[];sizeCandidate:number};
type Fragment={pos:THREE.Vector3;vel:THREE.Vector3;rotation:THREE.Quaternion;spin:THREE.Vector3;age:number;life:number;size:number;opacity:number;family:string;emitter:Emitter;handLevel?:number;handSocket?:number};
type Batch={mesh:THREE.InstancedMesh;tint:THREE.InstancedBufferAttribute;rim:THREE.InstancedBufferAttribute;params:THREE.InstancedBufferAttribute};
const vert=`attribute vec3 effectColor;attribute vec3 effectRim;attribute vec4 effectParams;
 varying vec2 vUV;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vColor;varying vec3 vRim;varying vec4 vParams;
 void main(){vUV=uv;vColor=effectColor;vRim=effectRim;vParams=effectParams;
 vec3 warped=position;float a=atan(warped.z,warped.y);float len=length(warped.zy);a+=pow(position.z*2.,2.)*effectParams.w*10.;warped.y=cos(a)*len;warped.z=sin(a)*len;
 vec4 p=modelMatrix*instanceMatrix*vec4(warped,1.);p.xyz=floor(p.xyz*64.)/64.;vWorld=p.xyz;vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*p;}`;
// Port of the extracted particle2 fragment math. No round point sprites or additive glow.
const frag=`uniform sampler2D originalTexture;varying vec2 vUV;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vColor;varying vec3 vRim;varying vec4 vParams;
 void main(){float fresnel=.5+.5*dot(normalize(vWorld-cameraPosition),normalize(vNormal));float clip=fresnel+vParams.z;if(clip>1.)discard;
 fresnel*=min(1.,vParams.y);fresnel+=max(0.,vParams.y-1.);
 vec3 c=mix(vColor*vColor*.5,vRim*vRim*.5,fresnel);c=clamp(c*(texture2D(originalTexture,vUV).rgb+.5),0.,1.);
 gl_FragColor=vec4(c,vParams.x);}`;
export class OriginalWeapon {
  private movement=new MovementMotion();
  private restRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(HAND_POSE.rotationX,HAND_POSE.rotationY,0));
  // Keep each twin palm on its own camera ray as it recoils toward the lens.
  // This preserves the visible two-hand punch at high tiers instead of letting
  // both palms disappear through the lower corners. Neither palm rotates.
  private twinRecoilAnchors=[0,1].map(side=>{
    const center=new THREE.Vector3();let count=0;
    HAND_SOCKETS[4].forEach((p,i)=>{if(i%2===side){center.add(new THREE.Vector3(p.x,p.y,p.z));count++;}});
    return center.divideScalar(count).applyQuaternion(this.restRotation).multiplyScalar(TWIN_POSE.scale)
      .add(new THREE.Vector3((side===0?1:-1)*TWIN_POSE.spacing,TWIN_POSE.y,TWIN_POSE.z));
  });
  private movementEuler=new THREE.Euler(0,0,0,'YXZ');private movementRotation=new THREE.Quaternion();
  private motion={x:0,y:0,z:0};private motionRotation={x:0,y:0,z:0};private counterSwing=0;
  private counterEuler=new THREE.Euler();private counterRotation=new THREE.Quaternion();
  // Native mesh has no joints: rotate the complete arm around its lower,
  // off-screen end rather than spinning it around the palm/model origin.
  private armBase=new THREE.Vector3(-.055,.19,.006).applyQuaternion(this.restRotation);
  private pairBase=new THREE.Vector3(0,HAND_POSE.y+this.armBase.y,HAND_POSE.z+this.armBase.z);
  private pivotOffset=new THREE.Vector3();
  configureMotion(value:unknown){this.movement.configure(value);if(this.movement.diagnostics.intensity===0)this.resetMotion();}
  resetMotion(){this.movement.clear();this.counterSwing=0;this.motion.x=this.motion.y=this.motion.z=0;this.motionRotation.x=this.motionRotation.y=this.motionRotation.z=0;}
  get effectDiagnostics(){return {flashTime:this.flashTime,recoil:this.recoil,particles:this.fragments.length,upgradeTime:this.upgradeTime,upgradeDuration:HAND_UPGRADE_DURATION,motion:{...this.motion},motionRotation:{...this.motionRotation},visibleLevel:this.handModels.findIndex(hand=>hand.visible)+1,visibleHands:this.handModels.findIndex(hand=>hand.visible)>=4?2:1};}
  get handFeedback(){
    const level=this.handModels.findIndex(hand=>hand.visible)+1||this.lastLevel,upgradeAge=HAND_UPGRADE_DURATION-this.upgradeTime;
    return {level,firePower:this.fireAnimation.level===level?this.fireAnimation.power:0,recoil:this.recoil,upgradeAge,upgradeTime:this.upgradeTime,
      upgradePower:this.upgradeTime>0?Math.exp(-upgradeAge*2.2)*Math.min(1,this.upgradeTime/.35):0,motion:this.motion,motionRotation:this.motionRotation,counterSwing:this.counterSwing};
  }
  ready=false;error='';loaded:Promise<void>;handScene=new THREE.Scene();handCamera=new THREE.PerspectiveCamera(HAND_VIEW_FOV,1,.01,3);
  private viewOffsets=HAND_MUZZLES.map(sockets=>sockets.map(()=>new THREE.Vector3()));
  private launchSockets=new Map<number,{socket:number;expires:number}>();
  private viewLocalId:string|undefined;private viewEnabled=false;
  /** The local launch is drawn at the overlay fingertips, then joins its physical path. */
  private offsetLaunch(position:Vec,level:number,socket:number,age:number){
    if(!this.viewEnabled||age>=.1)return position;
    const offsets=this.viewOffsets[handIndex(level)],offset=offsets[socket%offsets.length];
    const t=Math.max(0,Math.min(1,age/.1)),weight=1-t*t*(3-2*t);
    position.x+=offset.x*weight;position.y+=offset.y*weight;position.z+=offset.z*weight;return position;
  }
  readonly projectileView=(p:Projectile,position:Vec)=>{
    if(p.floorBounces||this.viewLocalId&&!p.shotKey?.startsWith(this.viewLocalId+':'))return position;
    const level=p.level??1,sockets=HAND_MUZZLES[handIndex(level)];
    const index=p.shotKey?Number(p.shotKey.slice(p.shotKey.lastIndexOf(':')+1)):0;
    return this.offsetLaunch(position,level,p.socket??(level>=5?projectileSocket(level,Number.isFinite(index)?index:0,p.kind==='shotgun'):p.kind==='shotgun'?0:this.launchSockets.get(p.id)?.socket??(Number.isFinite(index)?index%sockets.length:0)),p.age);
  };
  private twinPoses:THREE.Group[][]=[];private handModels:THREE.Group[]=[];private projection=new THREE.Group();private pose=new THREE.Group();private fireAnimation=new HandFireAnimation();private get flashTime(){return this.fireAnimation.remaining;}private upgradeTime=0;private freshUpgrade=false;private handRecoil=new HandRecoil();private get recoil(){return this.handRecoil.value;}
  private daggers:THREE.InstancedMesh[]=[];private batches=new Map<string,Batch>();private fragments:Fragment[]=[];private definitions:Record<string,Emitter>={};private dummy=new THREE.Object3D();private projectileVelocity=new THREE.Vector3();private lastLevel=1;private daggerCounts=new Uint32Array(ALL_PROJECTILE_COLORS.length);private daggerCursors=new Uint32Array(ALL_PROJECTILE_COLORS.length);
  constructor(private scene:THREE.Scene,private environment=new EnvironmentLighting()){this.handScene.add(this.projection);this.projection.add(this.pose);this.projection.scale.set(HAND_POSE.screenScale,HAND_POSE.screenScale,1);
    // Extend the visible arm forward without lowering the hand in the frame.
    this.projection.position.set(0,0,-HAND_VIEW_FORWARD);
    this.loaded=this.load().catch(e=>{this.error=String(e);console.error('Original weapon assets could not load:',e);});}
  private async load() {
    const response=await fetch(ROOT+'manifest.json');if(!response.ok)throw Error('Original asset manifest missing');const manifest=await response.json();if(!manifest.ready)throw Error('Original assets are not ready');
    this.definitions=await (await fetch(ROOT+'emitters.json')).json();
    // Recolor launch flames and sparks once, keeping their original timing and shape.
    for(const [name,emitter] of Object.entries(this.definitions)){
      const match=/^rapid([1-4])(alt)?(ember)?$/.exec(name);if(!match)continue;
      const color=PROJECTILE_COLORS[projectileStyleIndex(Number(match[1]),!!match[2])];
      this.definitions[name]={...emitter,start:[...color],end:color.map(c=>c*.5),rim:color.map(c=>c*.7+.3)};
    }
    const loader=new OBJLoader(),textures=new THREE.TextureLoader();
    const texture=async(name:string)=>{const t=await textures.loadAsync(ROOT+`textures/${name}.png`);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.colorSpace=THREE.NoColorSpace;return t;};
    const mesh=async(name:string)=>{const r=await fetch(ROOT+`meshes/${name}.obj`);if(!r.ok)throw Error(`Original mesh ${name} missing`);return loader.parse(await r.text());};
    const effectNames=[...Array.from({length:8},(_,i)=>`flame${i+1}`),...Array.from({length:3},(_,i)=>`ember${i+1}`),...Array.from({length:4},(_,i)=>`blood${i+1}`),...Array.from({length:4},(_,i)=>`smokeblob${i+1}`)];
    // Fetch independent assets together instead of paying a round trip per effect.
    const [daggerModel,daggerMaps,emberTexture,effectModels]=await Promise.all([
      mesh('dagger'),Promise.all(['dagger','dagger2','dagger3','dagger4','dagger5','dagger6'].map(texture)),
      texture('emberflame'),Promise.all(effectNames.map(async name=>{
        if(name.startsWith('blood'))return new THREE.Mesh(goreGeometry(Number(name.slice(5))),new THREE.MeshBasicMaterial());
        if(name.startsWith('smokeblob'))return new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial());
        return mesh(name);
      })),
    ]);
    // Keep the measured launch transforms, without loading or drawing the old
    // hand models. Bullet framing and launch offsets remain exactly as before.
    for(let level=1;level<=4;level++){
      const group=new THREE.Group();this.pose.add(group);this.handModels.push(group);
    }
    for(let level=5;level<=7;level++){
      const group=new THREE.Group(),poses:THREE.Group[]=[];
      for(let side=0;side<2;side++){
        const pose=new THREE.Group();
        pose.position.set((side===0?1:-1)*TWIN_POSE.spacing,TWIN_POSE.y,TWIN_POSE.z);
        pose.rotation.set(HAND_POSE.rotationX,HAND_POSE.rotationY,0);pose.scale.setScalar(TWIN_POSE.scale);
        group.add(pose);poses.push(pose);
      }
      this.projection.add(group);this.twinPoses.push(poses);this.handModels.push(group);
      for(const suffix of ['', 'alt', 'ember', 'altember']){
        const source=this.definitions['rapid4'+suffix]??this.definitions.rapid4;
        const color=PROJECTILE_COLORS[projectileStyleIndex(level,suffix.startsWith('alt'))];
        this.definitions['rapid'+level+suffix]={...source,start:[...color],end:color.map(c=>c*.4),rim:color.map(c=>c*.65+.25)};
      }
    }
    // Original pose is centered, viewed from the back of the hand; no fabricated knuckle crystals.
    this.pose.rotation.set(HAND_POSE.rotationX,HAND_POSE.rotationY,0);
    this.pose.position.set(HAND_POSE.x,HAND_POSE.y,HAND_POSE.z);
    let daggerGeometry:THREE.BufferGeometry|undefined;daggerModel.traverse(o=>{if(o instanceof THREE.Mesh)daggerGeometry=o.geometry;});if(!daggerGeometry)throw Error('No dagger geometry');
    // Local +Z is the flight direction; preserve the native blade silhouette.
    daggerGeometry.scale(DAGGER_PRESENTATION.width,DAGGER_PRESENTATION.width,DAGGER_PRESENTATION.length);
    for(const name of ['dagger','dagger2','dagger3','dagger4','dagger5','dagger6',...Array.from({length:6},(_,i)=>`twin-dagger-${i}`),...Array.from({length:14},(_,i)=>`shotgun-${Math.floor(i/2)+1}-${i%2?'seeking':'primary'}`)]) {
      const pellet=name.startsWith('shotgun'),style=this.daggers.length;
      const shotgunLevel=pellet?Math.floor((style-12)/2)+1:0;
      const nativeStyle=pellet&&shotgunLevel<=4?projectileStyleIndex(shotgunLevel,(style-12)%2===1):style;
      const map=daggerMaps[nativeStyle];if(map)map.colorSpace=THREE.SRGBColorSpace;
      const material=new THREE.MeshBasicMaterial({...map?{map}:{},toneMapped:false});
      const color=ALL_PROJECTILE_COLORS[this.daggers.length];
      // HDR emission keeps the physical dagger readable inside its glow and
      // feeds the existing bloom pass without introducing a lighting pass.
      material.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 daggerWorld;')
          // Clip the complete blade at launch; clipping individual fragments
          // exposed the enlarged tip as an overlapping solid near the hand.
          .replace('#include <project_vertex>','#include <project_vertex>\ndaggerWorld=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 daggerWorld;')
          .replace('#include <opaque_fragment>',
        `if(length(daggerWorld-cameraPosition)<${PROJECTILE_HAND_CLEARANCE.toFixed(2)})discard;
         float detail=dot(outgoingLight,vec3(.2126,.7152,.0722));
         ${map?'outgoingLight*=1.5;':`outgoingLight=vec3(${color.join(',')})*(detail*1.5+.25);`}\n#include <opaque_fragment>`);};
      material.customProgramCacheKey=()=>`dagger-emission-v3-clearance-${name}`;
      const batch=new THREE.InstancedMesh(pellet?daggerGeometry.clone().scale(DAGGER_PRESENTATION.shotgunScale,DAGGER_PRESENTATION.shotgunScale,DAGGER_PRESENTATION.shotgunScale):daggerGeometry,material,256);batch.count=0;batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.frustumCulled=false;this.scene.add(batch);this.daggers.push(batch);
    }
    for(const [index,name] of effectNames.entries()) {
      const model=effectModels[index];let geometry:THREE.BufferGeometry|undefined;model.traverse(o=>{if(o instanceof THREE.Mesh)geometry=o.geometry.clone();});if(!geometry)continue;
      const capacity=1600,tint=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3),rim=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3),params=new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4);
      geometry.setAttribute('effectColor',tint);geometry.setAttribute('effectRim',rim);geometry.setAttribute('effectParams',params);
      const material=new THREE.ShaderMaterial({uniforms:{originalTexture:{value:/^(blood|smokeblob)/.test(name)?fragmentTexture():emberTexture}},vertexShader:vert,fragmentShader:frag,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,forceSinglePass:true});
      const batch=new THREE.InstancedMesh(geometry,material,capacity);batch.count=0;batch.frustumCulled=false;this.scene.add(batch);this.batches.set(name,{mesh:batch,tint,rim,params});
    }
    this.ready=true;
  }
  async prewarm(renderer:THREE.WebGLRenderer){
    if(!this.ready)return;const states=this.handModels.map(m=>m.visible),poseVisible=this.pose.visible;this.pose.visible=true;
    try{for(const model of this.handModels)model.visible=true;await renderer.compileAsync(this.handScene,this.handCamera);}finally{this.handModels.forEach((m,i)=>m.visible=states[i]);this.pose.visible=poseVisible;}
  }
  resize(w:number,h:number){this.handCamera.aspect=w/h;this.handCamera.updateProjectionMatrix();}
  effect(e:Effect,world:World,yaw:number,pitch:number,local=true) {
    if(!this.ready)return;const level=e.level??world.level;if(local)this.lastLevel=level;
    const forward=e.direction?new THREE.Vector3(e.direction.x,e.direction.y,e.direction.z):new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
    if(e.enemy==='centipede'&&(e.kind==='emerge'||e.kind==='burrow'||e.kind==='spawn'&&e.amount===-1)){
      const name=e.kind==='burrow'?'centipedeburrow':'centipedeemerge',count=e.kind==='spawn'?4:18;
      for(let i=0;i<count;i++)this.add(name,new THREE.Vector3(e.pos.x+(Math.random()-.5)*2,e.pos.y+.08,e.pos.z+(Math.random()-.5)*2),new THREE.Vector3((Math.random()-.5)*2,.6+Math.random()*1.3,(Math.random()-.5)*2),`smokeblob${1+i%4}`,.7+Math.random()*.7,1.2+Math.random(),.6);
    } else if(e.kind==='shot'||e.kind==='burst') {
      if(local){const burst=e.kind==='burst',response=shotgunFeedback(level);this.fireAnimation.trigger(level,burst);this.handRecoil.trigger(burst?response.kick:WEAPON_FEEDBACK.streamKick,burst?response.recovery:WEAPON_FEEDBACK.recovery,burst?response.hold:.014);
        const sockets=e.muzzles??[e.pos];
        for(const p of world.projectiles){
          if(p.socket!==undefined||p.age>0||e.shotKey&&!p.shotKey?.startsWith(e.shotKey+':'))continue;
          let closest=0,distance=Infinity;
          for(let i=0;i<sockets.length;i++){const m=sockets[i],d=(p.pos.x-m.x)**2+(p.pos.y-m.y)**2+(p.pos.z-m.z)**2;if(d<distance){closest=i;distance=d;}}
          if(distance<.01)this.launchSockets.set(p.id,{socket:closest,expires:world.time+.15});
        }
      }
      const base=`rapid${level}${e.amount===1?'alt':''}`,shotgun=e.projectileKind==='shotgun';
      const name=shotgun?`shotgun-${level}-${e.amount===1?'seeking':'primary'}`:base;const ember=shotgun?name:`${name}ember`;
      if(shotgun&&!this.definitions[name]){const color=ALL_PROJECTILE_COLORS[shotgunStyleIndex(level,e.amount===1)];this.definitions[name]={...this.definitions[base],start:[...color],end:color.map(c=>c*.35),rim:color.map(c=>c*.6+.4)};}
      const muzzles=e.muzzles??[e.pos];
      const tuning=WEAPON_PRESENTATION[level-1];
      const stream=STREAM_PRESENTATION[level-1],burst=e.kind==='burst';
      const count=burst?tuning.burstParticles:stream.particles;
      const spread=Math.tan(e.kind==='burst'?tuning.burstSpread:tuning.streamSpread)*WEAPON_FEEDBACK.muzzleSpread;
      const right=local?new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)):new THREE.Vector3(-forward.z,0,forward.x).normalize();if(right.lengthSq()<.001)right.set(1,0,0);
      const up=new THREE.Vector3().crossVectors(right,forward).normalize();
      for(let i=0;i<count;i++) {
        const socket=muzzles[i%muzzles.length],muzzle=new THREE.Vector3(socket.x,socket.y,socket.z);
        const dir=forward.clone().addScaledVector(right,(Math.random()-.5)*spread*2).addScaledVector(up,(Math.random()-.5)*spread*2).normalize();
        if(local){
          if(i<muzzles.length){
            const velocity=dir.clone().multiplyScalar(28).addScaledVector(right,(Math.random()-.5)*3);
            const before=this.fragments.length;this.add(ember,muzzle,velocity,`ember${1+i%3}`,.025,.045,.45);
            if(this.fragments.length>before){const fragment=this.fragments[before];fragment.handLevel=level;fragment.handSocket=i;}
          }
          continue;
        }
        // Keep stream flames within roughly one metre of the fingertips instead
        // of projecting overlapping, opaque flames into the target's silhouette.
        const flameVelocity=dir.clone().multiplyScalar(burst?25+Math.random()*25:9+Math.random()*6);
        this.add(name,muzzle,flameVelocity,`flame${1+Math.floor(Math.random()*8)}`,burst?tuning.flameSize*1.2:stream.flameSize,burst?.1+Math.random()*.1:.045+Math.random()*.02,burst?1:.6);
        // A few sparks peel sideways off the muzzle, leaving the aiming line open.
        if(burst||i%2===0){
          const emberVelocity=dir.clone().multiplyScalar(burst?6+Math.random()*9:2+Math.random()*3);
          if(!burst)emberVelocity.addScaledVector(right,(i%4===0?-1:1)*(2+Math.random()*2)).addScaledVector(up,Math.random()*1.5);
          this.add(ember,muzzle,emberVelocity,`ember${1+Math.floor(Math.random()*3)}`,burst?tuning.emberSize:stream.emberSize,burst?.15+Math.random()*.15:.09+Math.random()*.06,burst?1:.5);
        }
      }
    } else if(e.kind==='ricochet') {
      const n=e.direction??{x:0,y:1,z:0},color=e.projectileKind==='shotgun'?ALL_PROJECTILE_COLORS[shotgunStyleIndex(level,(e.amount??1)>1)]:PROJECTILE_COLORS[projectileStyleIndex(level,(e.amount??1)>1)];
      for(let i=0,count=Math.min(3,1600-this.fragments.length);i<count;i++){
        const before=this.fragments.length;
        this.add('hit1',new THREE.Vector3(e.pos.x,e.pos.y,e.pos.z),new THREE.Vector3(n.x*4+(Math.random()-.5)*2,n.y*4+Math.random(),n.z*4+(Math.random()-.5)*2),'ember1',.1,.09+Math.random()*.05,.8);
        if(this.fragments.length>before){const f=this.fragments[before];f.emitter={...f.emitter,start:[...color],end:color.map(c=>c*.35),rim:[...color]};}
      }
    } else if(e.kind==='impact') {
      // Three short, pooled sparks; dense streams remain within the existing
      // fragment cap and emitter batches instead of adding lights or meshes.
      const n=e.direction??{x:0,y:1,z:0};
      for(let i=0,count=Math.min(3,1600-this.fragments.length);i<count;i++){
        const before=this.fragments.length;
        this.add('hit1',new THREE.Vector3(e.pos.x,e.pos.y,e.pos.z),new THREE.Vector3(n.x*3+(Math.random()-.5)*2,n.y*3+(Math.random()-.5)*2,n.z*3+(Math.random()-.5)*2),'ember1',.13,.1+Math.random()*.06,.8);
        if(e.projectileKind==='shotgun'&&this.fragments.length>before){const f=this.fragments[before],color=ALL_PROJECTILE_COLORS[shotgunStyleIndex(e.amount??level)];f.emitter={...f.emitter,start:[...color],end:color.map(c=>c*.35),rim:[...color]};}
      }
    } else if(e.kind==='hit') {
      // Flesh spray and deposition are handled by the independent blood pool.
      for(let i=0;i<3;i++)this.add('hit1',new THREE.Vector3(e.pos.x,e.pos.y,e.pos.z),new THREE.Vector3((Math.random()-.5)*4,Math.random()*3,(Math.random()-.5)*4),'ember1',.12);
    } else if(e.kind==='pickup'||e.kind==='upgrade') {
      if(local&&e.kind==='upgrade'){this.upgradeTime=HAND_UPGRADE_DURATION;this.freshUpgrade=true;}
      // Upgrades use an independent ground pulse; ordinary pickups keep their small native cue.
      for(let i=0;i<(e.kind==='pickup'?3:0);i++)this.add('magic',new THREE.Vector3(e.pos.x,e.pos.y,e.pos.z),new THREE.Vector3((Math.random()-.5)*3,Math.random()*3,(Math.random()-.5)*3),`ember${1+Math.floor(Math.random()*3)}`,.12);
    }
  }
  private add(name:string,pos:THREE.Vector3,vel:THREE.Vector3,family:string,size:number,lifeOverride?:number,opacity=1) {
    if(this.fragments.length>=1600)return;const emitter=this.definitions[name]||this.definitions.rapid1;if(!emitter)return;
    const bounds=emitter.lifetimeCandidate;const life=lifeOverride??THREE.MathUtils.clamp(bounds[0]+Math.random()*(bounds[1]-bounds[0]),.08,3);
    const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),vel.clone().normalize());
    this.fragments.push({pos:pos.clone(),vel,rotation,spin:new THREE.Vector3(Math.random(),Math.random(),Math.random()),age:0,life,size,opacity,family,emitter});
  }
  private ensureDaggerCapacity(index:number,count:number){
    const previous=this.daggers[index];if(count<=previous.instanceMatrix.count)return;
    let capacity=previous.instanceMatrix.count;while(capacity<count)capacity*=2;
    const replacement=new THREE.InstancedMesh(previous.geometry,previous.material,capacity);replacement.count=0;replacement.frustumCulled=false;replacement.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.remove(previous);previous.dispose();this.scene.add(replacement);this.daggers[index]=replacement;
  }
  get projectileDiagnostics(){return {count:this.daggers.reduce((n,b)=>n+b.count,0),batches:this.daggers.filter(b=>b.count>0).length,capacities:this.daggers.map(b=>b.instanceMatrix.count)};}
  /** Project a measured fingertip through the exact overlay pose for browser alignment checks. */
  socketScreen(level:number,socket=0){this.handScene.updateMatrixWorld(true);const p=HAND_SOCKETS[level-1][socket],pose=level>=5?this.twinPoses[level-5][socket%2]:this.pose;return new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(pose.matrixWorld).project(this.handCamera);}
  restoreReplayUpgradeAge(age:number){this.upgradeTime=Math.max(0,HAND_UPGRADE_DURATION-Math.max(0,age));this.freshUpgrade=false;}
  update(world:World|null,dt:number,menu:boolean,camera?:THREE.PerspectiveCamera,projectileAlpha=1,cameraOffset?:Vec,movementPose?:MovementPose) {
    if(!this.ready)return;this.pose.visible=!menu;const level=world?.level||this.lastLevel;
    if(camera&&this.handCamera.aspect!==camera.aspect){this.handCamera.aspect=camera.aspect;this.handCamera.updateProjectionMatrix();}
    // An event arrived during this frame: show it once before advancing its
    // render clock, even if the frame took longer than the entire flash.
    if(menu)this.fireAnimation.clear();else this.fireAnimation.update(dt);this.handRecoil.update(dt);
    if(menu)this.upgradeTime=0;
    if(!this.freshUpgrade)this.upgradeTime=Math.max(0,this.upgradeTime-dt);this.freshUpgrade=false;
    // Pose precedes socket measurement, including rotation: launch and glow
    // remain attached to the moving fingers at every FOV and aspect ratio.
    if(!camera||menu||!world)this.resetMotion();
    else {
      const movement=movementPose??this.movement.update(world.player,camera.rotation.y,camera.rotation.x,dt);
      Object.assign(this.motion,movement.arm);Object.assign(this.motionRotation,movement.rotation);
      this.counterSwing=movement.counterSwing??0;
    }
    this.pose.position.set(HAND_POSE.x+this.motion.x,HAND_POSE.y+this.motion.y,HAND_POSE.z+this.recoil+this.motion.z);
    // Apply inertia in view space, before the imported hand's rest orientation.
    // Adding Euler angles to its 180-degree base yaw reverses apparent roll.
    this.movementEuler.set(this.motionRotation.x,this.motionRotation.y,this.motionRotation.z);
    this.pose.quaternion.copy(this.restRotation).premultiply(this.movementRotation.setFromEuler(this.movementEuler));
    this.pivotOffset.copy(this.armBase).applyQuaternion(this.movementRotation);
    this.pose.position.add(this.armBase).sub(this.pivotOffset);
    // Portrait keeps two recognizable palms; resize affects overlay only.
    const shrink=Math.sqrt(Math.min(1,this.handCamera.aspect/HAND_POSE.screenScale));
    for(let i=0;i<this.twinPoses.length;i++){
      const group=this.handModels[i+4];group.scale.set(shrink,shrink,1);
      group.position.set(this.motion.x,this.motion.y-.22*(1-shrink),this.recoil+this.motion.z);
      group.quaternion.copy(this.movementRotation);
      this.pivotOffset.copy(this.pairBase).applyQuaternion(this.movementRotation);
      group.position.add(this.pairBase).sub(this.pivotOffset);
      // Brief inward-to-outward ignition; firing and physical origins never wait.
      const age=HAND_UPGRADE_DURATION-this.upgradeTime;
      const reveal=this.upgradeTime>0&&level===i+5?Math.pow(Math.max(0,1-age/.48),3):0;
      this.twinPoses[i].forEach((pose,side)=>{
        const anchor=this.twinRecoilAnchors[side],pull=this.recoil/(HAND_VIEW_FORWARD-anchor.z);
        const counter=this.counterSwing*(side===0?1:-1);
        pose.position.set((side===0?1:-1)*(TWIN_POSE.spacing-reveal*.018)-anchor.x*pull,TWIN_POSE.y-reveal*(side===1?.075:.025)-anchor.y*pull+counter*.006,TWIN_POSE.z+counter*.008);
        pose.quaternion.copy(this.restRotation).premultiply(this.counterRotation.setFromEuler(this.counterEuler.set(counter*.012,0,counter*.018)));
        this.pivotOffset.copy(this.armBase).multiplyScalar(TWIN_POSE.scale).applyQuaternion(this.counterRotation);
        pose.position.addScaledVector(this.armBase,TWIN_POSE.scale).sub(this.pivotOffset);
      });
    }
    this.viewEnabled=!!camera&&!menu&&!!world;
    this.viewLocalId=world?.crew.find(p=>p.player===world.player)?.id;
    if(camera&&this.viewEnabled){
      camera.updateMatrixWorld(true);this.handScene.updateMatrixWorld(true);
      const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      for(let l=0;l<HAND_MUZZLES.length;l++)for(let i=0;i<HAND_MUZZLES[l].length;i++){
        const muzzle=HAND_MUZZLES[l][i],tip=this.socketScreen(l+1,i),offset=this.viewOffsets[l][i],depth=-muzzle.z;
        offset.set(tip.x*depth*tangent*camera.aspect-muzzle.x,tip.y*depth*tangent-muzzle.y,0);
        offset.applyQuaternion(camera.quaternion);
        // The camera may translate independently of the physical player. Keep
        // the visual launch at the moved fingertip, then join the physical path.
        if(cameraOffset)offset.add(cameraOffset);
      }
    }
    for(const [id,launch] of this.launchSockets)if(!world||launch.expires<world.time)this.launchSockets.delete(id);
    this.handModels.forEach((hand,i)=>{hand.visible=!menu&&i===level-1;});
    const counts=this.daggerCounts,cursors=this.daggerCursors;counts.fill(0);cursors.fill(0);
    if(world&&!menu){
      for(const p of world.projectiles)counts[projectileVisualIndex(p,level)]++;
      for(let i=0;i<counts.length;i++)this.ensureDaggerCapacity(i,counts[i]);
      const alpha=Math.max(0,Math.min(1,projectileAlpha));
      for(const p of world.projectiles){
        const index=projectileVisualIndex(p,level),position=this.projectileView(p,sampleProjectile(p,alpha,this.dummy.position,this.projectileVelocity)),velocity=this.projectileVelocity;
        // Write the rigid transform directly into the instance buffer. The
        // original dagger's +Z tip faces the normalized velocity; no temporary
        // vectors, Object3D matrix updates, or Matrix4 copies per projectile.
        const speed=Math.sqrt(velocity.x*velocity.x+velocity.y*velocity.y+velocity.z*velocity.z),inverse=speed>0?1/speed:0;
        const nx=velocity.x*inverse,ny=velocity.y*inverse,nz=velocity.z*inverse;
        let qx=-ny,qy=nx,qw=1+nz;
        if(qw<Number.EPSILON){qx=0;qy=-1;qw=0;}
        else{const inv=1/Math.sqrt(qx*qx+qy*qy+qw*qw);qx*=inv;qy*=inv;qw*=inv;}
        const scale=p.homing?1.15:1,x2=2*qx*qx,y2=2*qy*qy,xy=2*qx*qy,xw=2*qx*qw,yw=2*qy*qw;
        const array=this.daggers[index].instanceMatrix.array,offset=cursors[index]++*16;
        array[offset]=(1-y2)*scale;array[offset+1]=xy*scale;array[offset+2]=-yw*scale;array[offset+3]=0;
        array[offset+4]=xy*scale;array[offset+5]=(1-x2)*scale;array[offset+6]=xw*scale;array[offset+7]=0;
        array[offset+8]=yw*scale;array[offset+9]=-xw*scale;array[offset+10]=(1-x2-y2)*scale;array[offset+11]=0;
        // Postmultiply by a local Z roll: the forward column stays untouched.
        const roll=projectileRoll(p),cos=Math.cos(roll),sin=Math.sin(roll);
        for(let axis=0;axis<3;axis++){
          const right=array[offset+axis],up=array[offset+4+axis];
          array[offset+axis]=right*cos+up*sin;array[offset+4+axis]=up*cos-right*sin;
        }
        array[offset+12]=position.x;array[offset+13]=position.y;array[offset+14]=position.z;array[offset+15]=1;
      }
    }
    this.daggers.forEach((d,i)=>{d.count=counts[i];if(d.count){d.instanceMatrix.clearUpdateRanges();d.instanceMatrix.addUpdateRange(0,d.count*16);d.instanceMatrix.needsUpdate=true;}});
    if(menu)this.fragments.length=0;let alive=0;for(let i=0;i<this.fragments.length;i++){const f=this.fragments[i];if(f.age<f.life)this.fragments[alive++]=f;}this.fragments.length=alive;
    const batchCounts=new Map<string,number>();
    for(const f of this.fragments) {
      f.age+=dt;const blood=f.family.startsWith('blood');f.vel.y-=dt*(blood?16:1.5);f.vel.multiplyScalar(Math.exp(-dt*(blood?.25:1.8)));f.pos.addScaledVector(f.vel,dt);
      if(f.pos.y<.025){f.pos.y=.025;f.vel.y=Math.abs(f.vel.y)*.18;f.vel.x*=.88;f.vel.z*=.88;}
      const batch=this.batches.get(f.family)!;const index=batchCounts.get(f.family)||0;batchCounts.set(f.family,index+1);
      const age=Math.min(1,f.age/f.life),scale=f.size*(1-age*.5);this.dummy.position.copy(f.pos);if(f.handLevel)this.offsetLaunch(this.dummy.position,f.handLevel,f.handSocket??0,f.age);this.dummy.quaternion.copy(f.rotation);this.dummy.rotateX(f.spin.x*f.age*3);this.dummy.rotateY(f.spin.y*f.age*3);this.dummy.scale.setScalar(scale);this.dummy.updateMatrix();batch.mesh.setMatrixAt(index,this.dummy.matrix);
      const e=f.emitter;batch.tint.setXYZ(index,e.start[0]+(e.end[0]-e.start[0])*age,e.start[1]+(e.end[1]-e.start[1])*age,e.start[2]+(e.end[2]-e.start[2])*age);batch.rim.setXYZ(index,e.rim[0],e.rim[1],e.rim[2]);batch.params.setXYZW(index,(f.family.startsWith('smokeblob')?1:e.alpha)*f.opacity*Math.max(0,1-age*age),e.rimStrength,e.clip,age*.04);
    }
    for(const [name,batch] of this.batches){batch.mesh.count=batchCounts.get(name)||0;if(!batch.mesh.count)continue;for(const attribute of [batch.mesh.instanceMatrix,batch.tint,batch.rim,batch.params]){attribute.clearUpdateRanges();attribute.addUpdateRange(0,batch.mesh.count*attribute.itemSize);attribute.needsUpdate=true;}}
  }
  // Launch transforms are retained for unchanged bullets; the crew rig renders the hands.
  render(_renderer:THREE.WebGLRenderer,_menu:boolean){}
  clear(){this.resetMotion();this.launchSockets.clear();this.viewEnabled=false;this.fragments.length=0;for(const batch of this.daggers)batch.count=0;this.fireAnimation.clear();this.upgradeTime=0;this.freshUpgrade=false;this.handRecoil.clear();this.lastLevel=1;}
  preview(level:number){this.lastLevel=level;}
}
