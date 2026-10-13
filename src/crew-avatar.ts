import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import type {Input,Vec} from './simulation';

const fallbackGeometry=new THREE.CapsuleGeometry(.38,1.05,4,8);
const colors=[0xcde98b,0x62cfff,0xffbd66,0xd994ff];
const pending=new Set<THREE.Group>();
let template:THREE.Group|null=null,clips:THREE.AnimationClip[]=[],loading:Promise<void>|null=null,failed=false;
let modelScale=1,floorOffset=0;
type AvatarState={root:THREE.Group;mixer:THREE.AnimationMixer;actions:THREE.AnimationAction[];upper:THREE.Bone;lower:THREE.Bone;lastTime:number;aim:number;baseUpper:THREE.Quaternion;baseLower:THREE.Quaternion;muzzle:THREE.Object3D};
const states=new WeakMap<THREE.Group,AvatarState>();
const aim=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(),parentRotation=new THREE.Quaternion(),aimRotation=new THREE.Quaternion();

/** One small, texture-free GLB shared by every third-person player body. */
export function loadCrewAvatar():Promise<void>{
 if(loading)return loading;
 loading=new GLTFLoader().loadAsync('/assets/models/crew-demon.glb').then(gltf=>{
  const candidate=gltf.scene;clips=['Idle','Run','Jump_Idle'].map(name=>gltf.animations.find(clip=>clip.name.endsWith('|'+name))!);
  if(clips.some(clip=>!clip)||!candidate.getObjectByName('UpperArmR')||!candidate.getObjectByName('LowerArmR'))throw Error('Demon rig or locomotion clips missing');
  const mixer=new THREE.AnimationMixer(candidate);mixer.clipAction(clips[0]).play();mixer.setTime(0);candidate.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(candidate);modelScale=2.05/(bounds.max.y-bounds.min.y);floorOffset=-1.7-bounds.min.y*modelScale;
  mixer.stopAllAction();mixer.uncacheRoot(candidate);template=candidate;
  for(const model of pending)attachDemon(model);pending.clear();
 }).catch(error=>{failed=true;console.warn('Teammate demon could not load; using simple body.',error);pending.clear();});
 return loading;
}
function styleMaterial(material:THREE.MeshStandardMaterial,ghost:boolean){
 material.metalness=0;material.roughness=.85;
 if(ghost){material.transparent=true;material.opacity=.48;material.depthWrite=false;material.color.setHex(0xe9c99a);material.emissive.setHex(0xc47f3c);material.emissiveIntensity=.65;}
 else{material.emissive.copy(material.color);material.emissiveIntensity=.12;}
}
function attachDemon(model:THREE.Group){
 const fallback=model.getObjectByName('crew-fallback');if(fallback)model.remove(fallback);
 for(const material of model.userData.avatarMaterials as THREE.Material[])material.dispose();
 const root=cloneSkeleton(template!) as THREE.Group;
 const materials=new Map<THREE.Material,THREE.MeshStandardMaterial>();
 root.traverse(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const source=node.material as THREE.MeshStandardMaterial;
  let material=materials.get(source);if(!material){material=source.clone();styleMaterial(material,model.userData.ghost===true);materials.set(source,material);}
  node.material=material;node.castShadow=false;node.receiveShadow=false;
  // Fixed conservative bounds cover locomotion and arm aiming without per-frame
  // CPU skinning of every vertex to recompute animated bounds.
  if(node instanceof THREE.SkinnedMesh)node.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0),.06);
 });
 model.userData.avatarMaterials=[...materials.values()];
 root.name='quaternius-demon';root.rotation.y=Math.PI;
 // Normalize from the cached idle bounds; cloning never skins every vertex.
 const mixer=new THREE.AnimationMixer(root),actions=clips.map(clip=>mixer.clipAction(clip).play());
 actions.forEach((action,i)=>action.setEffectiveWeight(i===0?1:0));mixer.setTime(0);root.updateMatrixWorld(true);
 root.scale.setScalar(modelScale);root.position.y=floorOffset;
 model.add(root);
 const upper=root.getObjectByName('UpperArmR') as THREE.Bone,lower=root.getObjectByName('LowerArmR') as THREE.Bone;
 states.set(model,{root,mixer,actions,upper,lower,lastTime:NaN,aim:0,baseUpper:upper.quaternion.clone(),baseLower:lower.quaternion.clone(),muzzle:root.getObjectByName('Middle3R_end')!});
 model.userData.avatarSource='quaternius-demon';
}
export function createCrewAvatar(index:number,ghost=false){
 const model=new THREE.Group();model.name='crew-devil';model.userData.ghost=ghost;
 const material=new THREE.MeshStandardMaterial({color:colors[index%colors.length],roughness:.85});styleMaterial(material,ghost);
 model.userData.avatarMaterials=[material];
 const body=new THREE.Mesh(fallbackGeometry,material);body.name='crew-fallback';body.position.y=-.7;model.add(body);
 if(template)attachDemon(model);else if(!failed){pending.add(model);void loadCrewAvatar();}
 return model;
}
function pointBone(bone:THREE.Bone,aim:THREE.Vector3,weight:number){
 bone.parent!.getWorldQuaternion(parentRotation);direction.copy(aim).applyQuaternion(parentRotation.invert());
 aimRotation.setFromUnitVectors(up,direction.normalize());bone.quaternion.slerp(aimRotation,weight);bone.updateWorldMatrix(false,true);
}
/** Presentation only: sample simulation time so pause/seek never advance animation. */
export function updateCrewAvatar(model:THREE.Group,input:Input,velocity:Vec,grounded:boolean,time:number,recentShot=false){
 const state=states.get(model);if(!state)return;
 const speed=Math.hypot(velocity.x,velocity.z),run=grounded?Math.min(1,speed/5):0;
 state.actions[0].setEffectiveWeight(grounded?1-run:0);state.actions[1].setEffectiveWeight(run);state.actions[2].setEffectiveWeight(grounded?0:1);
 state.upper.quaternion.copy(state.baseUpper);state.lower.quaternion.copy(state.baseLower);
 state.mixer.setTime(time);
 state.baseUpper.copy(state.upper.quaternion);state.baseLower.copy(state.lower.quaternion);
 const firing=input.fire||input.homing||recentShot,delta=time-state.lastTime;
 state.aim=firing?1:!Number.isFinite(delta)||delta<0||delta>.2?0:state.aim*Math.exp(-delta*14);state.lastTime=time;
 if(state.aim>.001&&state.upper&&state.lower){
  model.updateWorldMatrix(true,true);
  const pitch=THREE.MathUtils.clamp(input.pitch,-1.35,1.35);
  aim.set(0,Math.sin(pitch),-Math.cos(pitch)).applyQuaternion(model.quaternion);
  pointBone(state.upper,aim,state.aim);pointBone(state.lower,aim,state.aim);
 }
}
export function disposeCrewAvatar(model:THREE.Group){
 pending.delete(model);
 const state=states.get(model);if(state){state.mixer.stopAllAction();state.mixer.uncacheRoot(state.root);state.root.traverse(node=>{if(node instanceof THREE.SkinnedMesh)node.skeleton.dispose();});states.delete(model);}
 for(const material of model.userData.avatarMaterials as THREE.Material[])material.dispose();
}

/** Cosmetic emission point only; projectile origins and ballistics stay in World. */
export function crewMuzzle(model:THREE.Group,out:THREE.Vector3):boolean{
 const state=states.get(model);if(!state)return false;
 state.muzzle.getWorldPosition(out);return true;
}
