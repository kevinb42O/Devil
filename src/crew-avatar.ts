import {firstPersonWingVertices} from './first-person-geometry';
import {configureFirstPersonMaterial} from './first-person-material';
import {configureCombatHandMaterial,type CombatHandFeedback} from './combat-hand-feedback';
import {loadCrewCrown} from './crew-crown';
import {configureAscendantMaterial} from './ascendant-material';
import {isPlayerSkin,isPodiumRank,type PlayerSkin,type PodiumRank} from './player-skins';
import {playerColor} from './player-colors';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import type {Input,Vec} from './simulation';
import {basketballHoldOffset,type BasketballPose} from './courtyard-basketball';

const fallbackGeometry=new THREE.CapsuleGeometry(.38,1.05,4,8);
const colors=[0xcde98b,0x62cfff,0xffbd66,0xd994ff,0xee9eae,0xedda80];
const pending=new Set<THREE.Group>();
let template:THREE.Group|null=null,clips:THREE.AnimationClip[]=[],loading:Promise<void>|null=null,failed=false;
let modelScale=1,floorOffset=0;
type KickPose={charge:number;age:number;power:number;right?:boolean};
type KickLeg={foot?:THREE.Bone;end?:THREE.Bone;thigh?:THREE.Bone;shin?:THREE.Bone;position?:THREE.Vector3;rotation?:THREE.Quaternion;bases?:[THREE.Quaternion,THREE.Quaternion]};
type AvatarState={combatTips?:(THREE.Object3D|undefined)[][];legs:KickLeg[];anchor?:{bone:THREE.Bone;reference:THREE.Vector3;rootPosition:THREE.Vector3};head:THREE.Bone;dark?:THREE.SkinnedMesh;gold:boolean;crown?:THREE.Mesh;root:THREE.Group;mixer:THREE.AnimationMixer;actions:THREE.AnimationAction[];upper:THREE.Bone;lower:THREE.Bone;lastTime:number;aim:number;baseUpper:THREE.Quaternion;baseLower:THREE.Quaternion;leftUpper:THREE.Bone;leftLower:THREE.Bone;baseLeftUpper:THREE.Quaternion;baseLeftLower:THREE.Quaternion;leftRaise:number;rightRaise:number;fingers:{bone:THREE.Bone;base:THREE.Quaternion;open:THREE.Quaternion;left:boolean}[];muzzle:THREE.Object3D};
const states=new WeakMap<THREE.Group,AvatarState>();
let originalDark:THREE.BufferGeometry|undefined,crownedDark:THREE.BufferGeometry|undefined,crownMount:THREE.Matrix4|undefined;
const emoteFrame=new THREE.Matrix4(),emoteWorld=new THREE.Quaternion(),emoteRight=new THREE.Vector3(),emoteBack=new THREE.Vector3(),handDirection=new THREE.Vector3(),handLocal=new THREE.Quaternion(),fingerTarget=new THREE.Quaternion();
const neckPosition=new THREE.Vector3(),kickEndBefore=new THREE.Vector3(),kickFootPosition=new THREE.Vector3();
const aim=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(),parentRotation=new THREE.Quaternion(),aimRotation=new THREE.Quaternion();

/** One small, texture-free GLB shared by every third-person player body. */
export function loadCrewAvatar():Promise<void>{
 if(loading)return loading;
 loading=new GLTFLoader().loadAsync('/assets/models/crew-demon.glb').then(gltf=>{
  const candidate=gltf.scene;clips=['Idle','Run','Jump_Idle'].map(name=>gltf.animations.find(clip=>clip.name.endsWith('|'+name))!);
  if(clips.some(clip=>!clip)||!candidate.getObjectByName('UpperArmR')||!candidate.getObjectByName('LowerArmR')||!candidate.getObjectByName('UpperArmL')||!candidate.getObjectByName('LowerArmL'))throw Error('Demon rig or locomotion clips missing');
  const mixer=new THREE.AnimationMixer(candidate);mixer.clipAction(clips[0]).play();mixer.setTime(0);candidate.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(candidate);modelScale=2.05/(bounds.max.y-bounds.min.y);floorOffset=-1.7-bounds.min.y*modelScale;
  mixer.stopAllAction();mixer.uncacheRoot(candidate);template=candidate;
  candidate.traverse(node=>{if(node instanceof THREE.SkinnedMesh&&(node.material as THREE.Material).name==='Black')originalDark=node.geometry;});
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
 const materials=new Map<THREE.Material,THREE.MeshStandardMaterial>();let dark:THREE.SkinnedMesh|undefined;
 root.traverse(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const source=node.material as THREE.MeshStandardMaterial;
  let material=materials.get(source);if(!material){material=source.clone();if(source.name==='Demon_Main'&&model.userData.playerColor)material.color.set(playerColor(model.userData.playerColor).hex).multiplyScalar(.64);styleMaterial(material,model.userData.ghost===true);materials.set(source,material);}
  node.material=material;if(node instanceof THREE.SkinnedMesh&&source.name==='Black')dark=node;node.castShadow=false;node.receiveShadow=false;
  // Fixed conservative bounds cover locomotion and arm aiming without per-frame
  // CPU skinning of every vertex to recompute animated bounds.
  if(node instanceof THREE.SkinnedMesh)node.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0),.06);
 });
 model.userData.avatarMaterials=[...materials.values()];
 if(model.userData.playerSkin)setCrewAvatarSkin(model,model.userData.playerSkin,model.userData.skinRank);
 root.name='quaternius-demon';root.rotation.y=Math.PI;
 // Normalize from the cached idle bounds; cloning never skins every vertex.
 const mixer=new THREE.AnimationMixer(root),actions=clips.map(clip=>mixer.clipAction(clip).play());
 actions.forEach((action,i)=>action.setEffectiveWeight(i===0?1:0));mixer.setTime(0);root.updateMatrixWorld(true);
 root.scale.setScalar(modelScale);root.position.y=floorOffset;
 model.add(root);
 const upper=root.getObjectByName('UpperArmR') as THREE.Bone,lower=root.getObjectByName('LowerArmR') as THREE.Bone,leftUpper=root.getObjectByName('UpperArmL') as THREE.Bone,leftLower=root.getObjectByName('LowerArmL') as THREE.Bone;
 // First person uses the complete connected body at the real player origin.
 // Remove head faces and detached wings that surround the first-person eye;
 // retain torso, shoulders and every arm seam at all fields of view.
 if(model.userData.firstPerson)root.traverse(node=>{
  if(!(node instanceof THREE.SkinnedMesh))return;
  const skin=node.geometry.getAttribute('skinIndex'),weights=node.geometry.getAttribute('skinWeight'),index=node.geometry.getIndex(),indices:number[]=[];
  const wings=firstPersonWingVertices(node);
  model.userData.firstPersonWingVertices=(model.userData.firstPersonWingVertices??0)+wings.size;
  const headBones=new Set<number>();node.skeleton.bones.forEach((bone,i)=>{for(let parent:THREE.Object3D|null=bone;parent;parent=parent.parent)if(parent.name==='Head'){headBones.add(i);break;}});
  const isHead=(i:number)=>{let weight=0;for(let j=0;j<4;j++)if(headBones.has(skin.getComponent(i,j)))weight+=weights.getComponent(i,j);return weight>.05;};
  const keptEdges=new Map<string,{a:number;b:number;count:number}>(),cutEdges=new Set<string>();
  const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(let i=0;i<(index?.count??skin.count);i+=3){
   const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2,keep=!wings.has(a)&&!wings.has(b)&&!wings.has(c)&&!isHead(a)&&!isHead(b)&&!isHead(c);
   if(keep)indices.push(a,b,c);
   for(const [from,to]of [[a,b],[b,c],[c,a]]){const key=edgeKey(from,to);if(!keep)cutEdges.add(key);else{const edge=keptEdges.get(key);if(edge)edge.count++;else keptEdges.set(key,{a:from,b:to,count:1});}}
  }
  // Seal the cut neck with its own skinned boundary vertices. Extreme FOV and
  // looking down must show a closed body, never the hollow inside of the mesh.
  const boundary=new Map<number,number>();for(const [key,edge]of keptEdges)if(edge.count===1&&cutEdges.has(key))boundary.set(edge.a,edge.b);
  while(boundary.size){const first=boundary.keys().next().value!,loop=[first];let at=first;
   while(boundary.has(at)){const next=boundary.get(at)!;boundary.delete(at);if(next===first)break;loop.push(next);at=next;}
   for(let i=1;i+1<loop.length;i++)indices.push(loop[0],loop[i+1],loop[i]);
  }
  node.geometry=node.geometry.clone();node.geometry.setIndex(indices);node.frustumCulled=false;

 });
 // Arm weights only gate shot flashes. The tier surface covers Demon_Main in
 // first person, crew views and replays, using the same undeformed coordinates.
 root.traverse(node=>{
  if(!(node instanceof THREE.SkinnedMesh)||node.geometry.hasAttribute('combatArmMask'))return;
  const skin=node.geometry.getAttribute('skinIndex'),weights=node.geometry.getAttribute('skinWeight');
  const masks=new Float32Array(skin.count*2);
  const armSide=node.skeleton.bones.map(bone=>{for(let parent:THREE.Object3D|null=bone;parent;parent=parent.parent){if(parent.name==='UpperArmL')return 0;if(parent.name==='UpperArmR')return 1;}return -1;});
  for(let i=0;i<skin.count;i++)for(let j=0;j<4;j++){const side=armSide[skin.getComponent(i,j)];if(side>=0)masks[i*2+side]+=weights.getComponent(i,j);}
  node.geometry.setAttribute('combatArmMask',new THREE.BufferAttribute(masks,2));
 });
 const fingers:{bone:THREE.Bone;base:THREE.Quaternion;open:THREE.Quaternion;left:boolean}[]=[];
 root.traverse(node=>{if(!(node instanceof THREE.Bone)||! /^(Thumb|Index|Middle|Pinky)[123][LR]$/.test(node.name))return;
  const left=node.name.endsWith('L'),right=root.getObjectByName(node.name.slice(0,-1)+'R')!;
  const open=right.quaternion.clone();if(left)open.set(open.x,-open.y,-open.z,open.w);
  fingers.push({bone:node,base:node.quaternion.clone(),open,left});
 });
 const anchor=model.userData.firstPerson?{bone:root.getObjectByName('Neck') as THREE.Bone,reference:new THREE.Vector3(),rootPosition:root.position.clone()}:undefined;
 if(anchor){model.updateWorldMatrix(true,true);anchor.bone.getWorldPosition(anchor.reference);model.worldToLocal(anchor.reference);}
 const legs:KickLeg[]=['L','R'].map(side=>{const foot=root.getObjectByName('Foot'+side) as THREE.Bone|undefined,thigh=root.getObjectByName('UpperLeg'+side) as THREE.Bone|undefined,shin=root.getObjectByName('LowerLeg'+side) as THREE.Bone|undefined;return {foot,end:root.getObjectByName('LowerLeg'+side+'_end') as THREE.Bone|undefined,thigh,shin,position:foot?.position.clone(),rotation:foot?.quaternion.clone(),bases:thigh&&shin?[thigh.quaternion.clone(),shin.quaternion.clone()]:undefined};});
 states.set(model,{legs,anchor,fingers,head:root.getObjectByName('Head') as THREE.Bone,dark,gold:false,root,mixer,actions,upper,lower,lastTime:NaN,aim:0,leftUpper,leftLower,baseLeftUpper:leftUpper.quaternion.clone(),baseLeftLower:leftLower.quaternion.clone(),leftRaise:0,rightRaise:0,baseUpper:upper.quaternion.clone(),baseLower:lower.quaternion.clone(),muzzle:root.getObjectByName('Middle3R_end')!});
 model.userData.avatarSource='quaternius-demon';updateHeadwear(model);
}
function withoutHalo(source:THREE.BufferGeometry){
 if(crownedDark)return crownedDark;
 const positions=source.getAttribute('position'),index=source.getIndex()!,indices:number[]=[];
 // Measured disjoint halo component in the source GLB (Z is its up axis).
 // Horns end below Y=-.003385; this removes only the 112 halo vertices' faces.
 const halo=(i:number)=>positions.getZ(i)>.027&&positions.getY(i)>-.0031;
 for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);if(!(halo(a)&&halo(b)&&halo(c)))indices.push(a,b,c);}
 crownedDark=source.clone();crownedDark.setIndex(indices);return crownedDark;
}
/** Computed once at idle, then inherited directly from the animated head bone. */
function measureCrownMount(model:THREE.Group,state:AvatarState){
 // SkinnedMesh.updateMatrixWorld also refreshes bindMatrixInverse after normalization.
 model.updateMatrixWorld(true);
 const skin=state.root.getObjectByProperty('type','SkinnedMesh') as THREE.SkinnedMesh;
 const positions=skin.geometry.getAttribute('position'),point=new THREE.Vector3(),points=new Float32Array(positions.count*3),cap=new THREE.Box3();
 const toLocal=model.matrixWorld.clone().invert().multiply(skin.matrixWorld);let top=-Infinity;
 for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i);skin.applyBoneTransform(i,point);point.applyMatrix4(toLocal);top=Math.max(top,point.y);point.toArray(points,i*3);}
 for(let i=0;i<points.length;i+=3)if(points[i+1]>top-.14)cap.expandByPoint(point.fromArray(points,i));
 const size=cap.getSize(new THREE.Vector3()),center=cap.getCenter(new THREE.Vector3()),width=size.x*1.1;
 // Sink the bottom band 7 cm into the cranium so the crown is worn, never floating.
 const desired=new THREE.Matrix4().compose(new THREE.Vector3(center.x,top-.07,center.z),new THREE.Quaternion(),new THREE.Vector3(width,width,width));
 return state.head.matrixWorld.clone().invert().multiply(model.matrixWorld).multiply(desired);
}
function updateHeadwear(model:THREE.Group){
 const state=states.get(model);if(!state)return;
 const gold=!model.userData.firstPerson&&!model.userData.ghost&&model.userData.playerSkin==='ascendant'&&model.userData.skinRank===1;
 if(state.gold===gold)return;state.gold=gold;
 if(state.dark&&originalDark)state.dark.geometry=gold?withoutHalo(originalDark):originalDark;
 if(state.crown){state.crown.visible=gold;return;}
 if(!gold)return;
 crownMount??=measureCrownMount(model,state);
 void loadCrewCrown().then(asset=>{
  if(!asset||states.get(model)!==state||!state.gold||state.crown)return;
  const crown=new THREE.Mesh(asset.geometry,asset.material);crown.name='crew-gold-crown';crown.matrixAutoUpdate=false;crown.matrix.copy(crownMount!);state.head.add(crown);state.crown=crown;
 });
}
export function createCrewAvatar(index:number,ghost=false,firstPerson=false){
 const model=new THREE.Group();model.name='crew-devil';model.userData.ghost=ghost;model.userData.firstPerson=firstPerson;
 const material=new THREE.MeshStandardMaterial({color:colors[index%colors.length],roughness:.85});styleMaterial(material,ghost);
 model.userData.avatarMaterials=[material];
 const body=new THREE.Mesh(fallbackGeometry,material);body.name='crew-fallback';body.position.y=-.7;model.add(body);if(firstPerson)body.visible=false;
 if(template)attachDemon(model);else if(!failed){pending.add(model);void loadCrewAvatar();}
 return model;
}
/** Tint cloned skin only; dark horns, claws and eyes keep their original materials. */
export function setCrewAvatarColor(model:THREE.Group,value:unknown){
 const color=playerColor(value);if(model.userData.ghost||model.userData.playerColor===color.id)return;
 model.userData.playerColor=color.id;
 for(const material of model.userData.avatarMaterials as THREE.MeshStandardMaterial[]){
  if(material.name==='Demon_Main'||model.getObjectByName('crew-fallback')){
   material.color.set(color.hex).multiplyScalar(.64);material.emissive.copy(material.color);
  }
 }
}
export function setCrewAvatarSkin(model:THREE.Group,skin?:PlayerSkin,rank?:PodiumRank){
 if(model.userData.ghost)return;
 const active=isPlayerSkin(skin)&&isPodiumRank(rank);
 model.userData.playerSkin=active?skin:undefined;model.userData.skinRank=active?rank:undefined;
 const time=model.userData.skinTime??={value:0};
 for(const material of model.userData.avatarMaterials as THREE.MeshStandardMaterial[])
  if(material.name==='Demon_Main'||model.getObjectByName('crew-fallback'))configureAscendantMaterial(material,active?rank:null,time);
 updateHeadwear(model);
}
function pointBone(bone:THREE.Bone,aim:THREE.Vector3,weight:number){
 bone.parent!.getWorldQuaternion(parentRotation);direction.copy(aim).applyQuaternion(parentRotation.invert());
 aimRotation.setFromUnitVectors(up,direction.normalize());bone.quaternion.slerp(aimRotation,weight);bone.updateWorldMatrix(false,true);
}
function pointEmoteArm(model:THREE.Group,upper:THREE.Bone,lower:THREE.Bone,target:THREE.Vector3,weight:number){
 // Both segments use one world frame, preserving the rig's hand roll across
 // the elbow. Local -Z is the palm, and local +X points toward the left thumb.
 emoteBack.set(0,0,1).applyQuaternion(model.quaternion);
 emoteRight.crossVectors(target,emoteBack).normalize();
 emoteBack.crossVectors(emoteRight,target).normalize();
 emoteWorld.setFromRotationMatrix(emoteFrame.makeBasis(emoteRight,target,emoteBack));
 for(const bone of [upper,lower]){
  bone.parent!.getWorldQuaternion(parentRotation);
  aimRotation.copy(parentRotation).invert().multiply(emoteWorld);
  bone.quaternion.slerp(aimRotation,weight);bone.updateWorldMatrix(false,true);
 }
}
/** Stable dorsal-up combat frame: shortest-arc aiming can roll the wrists
 * upside down when the animated parent turns. +Y follows the fingers and +Z
 * stays toward the back of the hand, projected from the character's up axis. */
function pointCombatArm(model:THREE.Group,upper:THREE.Bone,lower:THREE.Bone,target:THREE.Vector3,weight:number){
 for(const bone of [upper,lower]){
  // Spread from the shoulder, keeping the wrists aimed straight ahead. This
  // opens a visible gap between the thumbs without disconnecting the arms.
  handDirection.copy(target);
  if(bone===upper){direction.set(upper.name.endsWith('L')?-.65:.65,0,0).applyQuaternion(model.quaternion);handDirection.add(direction).normalize();}
  emoteBack.set(0,1,0).applyQuaternion(model.quaternion);
  emoteRight.crossVectors(handDirection,emoteBack).normalize();
  emoteBack.crossVectors(emoteRight,handDirection).normalize();
  emoteWorld.setFromRotationMatrix(emoteFrame.makeBasis(emoteRight,handDirection,emoteBack));
  bone.parent!.getWorldQuaternion(parentRotation);
  aimRotation.copy(parentRotation).invert().multiply(emoteWorld);
  bone.quaternion.slerp(aimRotation,weight);bone.updateWorldMatrix(false,true);
 }
}
const shotShoulder=new THREE.Vector3(),shotElbow=new THREE.Vector3(),shotWrist=new THREE.Vector3(),shotTarget=new THREE.Vector3(),shotAxis=new THREE.Vector3(),shotPole=new THREE.Vector3(),shotBend=new THREE.Vector3();
const shotEase=(n:number)=>{n=THREE.MathUtils.clamp(n,0,1);return n*n*(3-2*n);};
/** Solve the two segments independently so the elbows bend around the held ball. */
function basketballArm(model:THREE.Group,upper:THREE.Bone,lower:THREE.Bone,wrist:THREE.Object3D,target:THREE.Vector3,pole:THREE.Vector3,weight:number){
 upper.getWorldPosition(shotShoulder);lower.getWorldPosition(shotElbow);wrist.getWorldPosition(shotWrist);
 const a=shotShoulder.distanceTo(shotElbow),b=shotElbow.distanceTo(shotWrist);
 shotTarget.copy(target);model.localToWorld(shotTarget);shotAxis.subVectors(shotTarget,shotShoulder);
 const distance=THREE.MathUtils.clamp(shotAxis.length(),Math.abs(a-b)+.001,a+b-.003);shotAxis.normalize();
 shotPole.copy(pole);model.localToWorld(shotPole);shotPole.sub(shotShoulder);shotPole.addScaledVector(shotAxis,-shotPole.dot(shotAxis)).normalize();
 const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 shotBend.copy(shotShoulder).addScaledVector(shotAxis,along).addScaledVector(shotPole,height);
 aim.subVectors(shotBend,shotShoulder).normalize();pointBone(upper,aim,weight);
 lower.getWorldPosition(shotElbow);shotTarget.copy(shotShoulder).addScaledVector(shotAxis,distance);aim.subVectors(shotTarget,shotElbow).normalize();pointBone(lower,aim,weight);
}
/** Presentation only: sample simulation time so pause/seek never advance animation. */
export function updateCrewAvatar(model:THREE.Group,input:Input,velocity:Vec,grounded:boolean,time:number,recentShot=false,courtyard=false,weaponLevel=1,kick?:KickPose,holdingPencil=false,basketball?:BasketballPose|boolean,feedback?:CombatHandFeedback){
 const shot=typeof basketball==='boolean'?basketball?{holding:true,charge:0,gather:0,age:-1}:undefined:basketball,holdingBasketball=shot?.holding===true;
 // Basketball hands remain readable without hiding the ball's release guide.
 if(model.userData.firstPerson){
  const faded=!!(courtyard&&shot);
  for(const material of model.userData.avatarMaterials as THREE.MeshStandardMaterial[]){
   const saved=material.userData.basketballOpacity as {opacity:number;transparent:boolean;depthWrite:boolean}|undefined;
   if(faded&&!saved){material.userData.basketballOpacity={opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite};material.opacity=.28;material.transparent=true;material.depthWrite=false;material.needsUpdate=true;}
   else if(!faded&&saved){Object.assign(material,saved);delete material.userData.basketballOpacity;material.needsUpdate=true;}
  }
 }
 if(courtyard)for(const material of model.userData.avatarMaterials as THREE.MeshStandardMaterial[]){const u=material.userData.combatFeedback?.uniforms;if(u){u.combatActive.value=0;u.combatFire.value=u.combatUpgrade.value=0;u.combatTier.value=1;}}
 if(model.userData.skinTime)model.userData.skinTime.value=time;
 const state=states.get(model);if(!state)return;
 const speed=Math.hypot(velocity.x,velocity.z),run=grounded?Math.min(1,speed/5):0;
 state.actions[0].setEffectiveWeight(grounded?1-run:0);state.actions[1].setEffectiveWeight(run);state.actions[2].setEffectiveWeight(grounded?0:1);
 state.upper.quaternion.copy(state.baseUpper);state.lower.quaternion.copy(state.baseLower);
 state.leftUpper.quaternion.copy(state.baseLeftUpper);state.leftLower.quaternion.copy(state.baseLeftLower);
 for(const finger of state.fingers)finger.bone.quaternion.copy(finger.base);
 if(state.anchor)state.root.position.copy(state.anchor.rootPosition);
 for(const leg of state.legs){if(leg.bases&&leg.thigh&&leg.shin){leg.thigh.quaternion.copy(leg.bases[0]);leg.shin.quaternion.copy(leg.bases[1]);}if(leg.foot&&leg.position&&leg.rotation){leg.foot.position.copy(leg.position);leg.foot.quaternion.copy(leg.rotation);}}
 state.mixer.setTime(time);
 for(const leg of state.legs){if(leg.foot&&leg.position&&leg.rotation){leg.position.copy(leg.foot.position);leg.rotation.copy(leg.foot.quaternion);}if(leg.bases&&leg.thigh&&leg.shin){leg.bases[0].copy(leg.thigh.quaternion);leg.bases[1].copy(leg.shin.quaternion);}}
 if(state.anchor){
  // Jump/run clips contain their own root lift. Physics already moves the local
  // eye and body together, so cancel that extra lift at the collar. Preserve
  // the animated legs, torso rotation and the third-person jump silhouette.
  model.updateWorldMatrix(true,true);state.anchor.bone.getWorldPosition(neckPosition);model.worldToLocal(neckPosition);
  state.root.position.add(state.anchor.reference).sub(neckPosition);model.updateWorldMatrix(true,true);
 }
 state.baseUpper.copy(state.upper.quaternion);state.baseLower.copy(state.lower.quaternion);
 state.baseLeftUpper.copy(state.leftUpper.quaternion);state.baseLeftLower.copy(state.leftLower.quaternion);
 for(const finger of state.fingers)finger.base.copy(finger.bone.quaternion);
 const firing=!courtyard&&(model.userData.firstPerson||input.fire||input.homing||recentShot),delta=time-state.lastTime;
 state.aim=firing?1:!Number.isFinite(delta)||delta<0||delta>.2?0:state.aim*Math.exp(-delta*14);state.lastTime=time;
 if(state.aim>.001&&state.upper&&state.lower){
  model.updateWorldMatrix(true,true);
  const pitch=THREE.MathUtils.clamp(input.pitch,-1.35,1.35);
  aim.set(0,Math.sin(pitch),-Math.cos(pitch)).applyQuaternion(model.quaternion);
  pointCombatArm(model,state.upper,state.lower,aim,state.aim);
  if(weaponLevel>=5&&!courtyard){
   pointCombatArm(model,state.leftUpper,state.leftLower,aim,state.aim);
   // The imported idle clip curls the left thumb differently. Combat uses the
   // right hand as its reference; reflect every finger joint across local X.
   // Apply this before gestures so either hand can still salute independently.
   for(const finger of state.fingers)if(finger.left){
    const right=state.root.getObjectByName(finger.bone.name.slice(0,-1)+'R')!;
    fingerTarget.set(right.quaternion.x,-right.quaternion.y,-right.quaternion.z,right.quaternion.w);
    finger.bone.quaternion.slerp(fingerTarget,state.aim);
   }
  }
 }
 // Apply presentation offsets through the arm joints so shoulders remain attached.
 // Preserve the dorsal-up wrist orientation after bending the elbow for recoil.
 if(model.userData.firstPerson&&!courtyard&&feedback){
  for(const left of [false,true]){
   if(left&&weaponLevel<5)continue;
   const upper=left?state.leftUpper:state.upper,lower=left?state.leftLower:state.lower;
   const wrist=state.root.getObjectByName('Middle1'+(left?'L':'R'))!;
   model.updateWorldMatrix(true,true);lower.getWorldQuaternion(handLocal);
   const orientation=handLocal.clone();wrist.getWorldPosition(shotTarget);model.worldToLocal(shotTarget);
   const pitch=THREE.MathUtils.clamp(input.pitch,-1.35,1.35),m=feedback.motion;
   const counter=weaponLevel>=5?feedback.counterSwing*(left?-1:1):0;
   const reveal=weaponLevel>=5&&feedback.upgradeTime>0?Math.pow(Math.max(0,1-feedback.upgradeAge/.48),3):0;
   shotTarget.x+=m.x+(left?1:-1)*reveal*.018;
   shotTarget.y+=m.y-Math.sin(pitch)*feedback.recoil-reveal*(left?.075:.025)+counter*.006;
   shotTarget.z+=Math.cos(pitch)*feedback.recoil+m.z+counter*.008;
   // Rotate the offset around the shoulder, keeping movement inertia local to the arm.
   upper.getWorldPosition(shotShoulder);model.worldToLocal(shotShoulder);
   shotTarget.sub(shotShoulder).applyEuler(new THREE.Euler(feedback.motionRotation.x,feedback.motionRotation.y,feedback.motionRotation.z)).add(shotShoulder);
   basketballArm(model,upper,lower,wrist,shotTarget,new THREE.Vector3(left?-.8:.8,-.65,.1),1);
   lower.parent!.getWorldQuaternion(parentRotation);lower.quaternion.copy(parentRotation.invert().multiply(orientation));lower.updateWorldMatrix(false,true);
  }
 }
 const blend=!Number.isFinite(delta)||delta<0||delta>.2?1:1-Math.exp(-delta*16);
 state.leftRaise+=((input.leftArm?1:0)-state.leftRaise)*blend;
 state.rightRaise+=((input.rightArm&&!holdingPencil?1:0)-state.rightRaise)*blend;
 if(state.leftRaise>.001||state.rightRaise>.001){
  model.updateWorldMatrix(true,true);
  // Open the salute outward and forward from the shoulders. Keeping
  // the direction relative to body yaw clears the head/horns even while looking
  // around, and gives both arms the same silhouette in either camera view.
  if(state.leftRaise>.001){aim.set(-.45,1,-1.1).normalize().applyQuaternion(model.quaternion);pointEmoteArm(model,state.leftUpper,state.leftLower,aim,state.leftRaise);}
  if(state.rightRaise>.001){aim.set(.45,1,-1.1).normalize().applyQuaternion(model.quaternion);pointEmoteArm(model,state.upper,state.lower,aim,state.rightRaise);}
 }
 // Keep the greeting hand upright at the wrist while the arm reaches forward.
 // This exposes the backs of the fingers to the owner and the open palm to a
 // friend, instead of foreshortening the whole hand into the forearm.
 for(const left of [true,false]){
  const weight=left?state.leftRaise:state.rightRaise;if(weight<=.001)continue;
  const lower=left?state.leftLower:state.lower;
  handDirection.set(left?-.15:.15,1,-.05).normalize().applyQuaternion(model.quaternion);
  emoteBack.set(0,0,1).applyQuaternion(model.quaternion);emoteRight.crossVectors(handDirection,emoteBack).normalize();emoteBack.crossVectors(emoteRight,handDirection).normalize();
  emoteWorld.setFromRotationMatrix(emoteFrame.makeBasis(emoteRight,handDirection,emoteBack));
  lower.getWorldQuaternion(handLocal);handLocal.invert().multiply(emoteWorld);
  for(const finger of state.fingers)if(finger.left===left){
   fingerTarget.copy(finger.open);if(/1[LR]$/.test(finger.bone.name))fingerTarget.premultiply(handLocal);
   finger.bone.quaternion.slerp(fingerTarget,weight);
  }
 }
 if(courtyard&&holdingPencil){
  // A relaxed forward reach, not the open-palm high-five pose.
  model.updateWorldMatrix(true,true);
  aim.set(.25,-.28,-1).normalize().applyQuaternion(model.quaternion);
  pointEmoteArm(model,state.upper,state.lower,aim,1);
  for(const finger of state.fingers)if(!finger.left){
   finger.bone.quaternion.copy(finger.open);
   if(/^(Index|Middle|Pinky)[23]R$/.test(finger.bone.name))
    finger.bone.rotateX(1.15);
   if(/^Thumb[23]R$/.test(finger.bone.name))finger.bone.rotateX(.55);
  }
 }
 if(courtyard&&shot){
  model.updateWorldMatrix(true,true);
  const ball=basketballHoldOffset(shot.gather),release=shot.holding?0:shotEase(shot.age/.12),guide=shot.holding?0:shotEase(shot.age/.2),weight=shot.dunkAge!==undefined?1-shotEase((shot.dunkAge-.55)/.35):shot.holding?1:1-shotEase((shot.age-.3)/.35);
  const right=new THREE.Vector3(ball.x-.015,ball.y-.125,ball.z+.045).lerp(new THREE.Vector3(.14,.37,-.56),release);
  const left=new THREE.Vector3(ball.x-.13,ball.y-.08,ball.z+.05).lerp(new THREE.Vector3(-.36,-.48,-.25),guide);
  if(shot.dunkAge!==undefined&&shot.dunkTarget){
   const target=shot.dunkTarget,slam=shotEase((shot.dunkAge-.26)/.14);right.set(target.x,target.y-.12-slam*.23,target.z+.025);left.set(target.x-.16,target.y-.08-slam*.35,target.z+.06);
   if(shot.dunkAge>.4){const recover=shotEase((shot.dunkAge-.4)/.45);right.lerp(new THREE.Vector3(.36,-.55,-.3),recover);left.lerp(new THREE.Vector3(-.36,-.55,-.3),recover);}
  }
  basketballArm(model,state.upper,state.lower,state.root.getObjectByName('Middle1R')!,right,new THREE.Vector3(.28,-.6,-.08),weight);
  basketballArm(model,state.leftUpper,state.leftLower,state.root.getObjectByName('Middle1L')!,left,new THREE.Vector3(-.48,-.4,-.03),weight);
  // The shooting wrist folds after extension; the guide hand opens and drops away.
  for(const isLeft of [false,true]){
   const lower=isLeft?state.leftLower:state.lower,wrist=shot.dunkAge!==undefined?shotEase((shot.dunkAge-.24)/.14):shot.holding?0:shotEase((shot.age-.035)/.13);
   handDirection.set(isLeft?.18:0,isLeft?.65:.65-.85*wrist,isLeft?-.75:-.75-.25*wrist).normalize().applyQuaternion(model.quaternion);
   emoteBack.set(isLeft?-1:0,isLeft?0:-1,.2).normalize().applyQuaternion(model.quaternion);emoteRight.crossVectors(handDirection,emoteBack).normalize();emoteBack.crossVectors(emoteRight,handDirection).normalize();
   emoteWorld.setFromRotationMatrix(emoteFrame.makeBasis(emoteRight,handDirection,emoteBack));lower.getWorldQuaternion(handLocal);handLocal.invert().multiply(emoteWorld);
   for(const finger of state.fingers)if(finger.left===isLeft){fingerTarget.copy(finger.open);if(/1[LR]$/.test(finger.bone.name))fingerTarget.premultiply(handLocal);finger.bone.quaternion.slerp(fingerTarget,weight);if(/^(Index|Middle|Pinky)[23]/.test(finger.bone.name))finger.bone.rotateX(-(shot.holding?.48:isLeft?.12:.2)*weight);}
  }
  model.userData.basketballPose={...shot,right:right.toArray(),left:left.toArray(),weight};
 }
 model.userData.holdingBasketball=courtyard&&holdingBasketball;
 model.userData.holdingPencil=courtyard&&holdingPencil;
 const leg=state.legs[kick?.right?1:0];
 if(courtyard&&kick&&leg.thigh&&leg.shin){
  const windup=.25+.75*kick.charge;let thigh=-.3*windup,shin=-1.1*windup;
  if(kick.charge===0&&kick.age>=0&&kick.age<.5){const strike=Math.min(1,kick.age/.13),settle=Math.max(0,1-(kick.age-.13)/.37),ease=strike*strike*(3-2*strike);thigh=(-.3+(1.1+.25*kick.power+.3)*ease)*settle;shin=(-1.1+1.02*ease)*settle;}
  model.updateWorldMatrix(true,true);if(leg.end)leg.end.getWorldPosition(kickEndBefore);
  for(const [bone,angle]of [[leg.thigh,thigh],[leg.shin,shin]] as const){
   bone.parent!.getWorldQuaternion(parentRotation);model.getWorldQuaternion(emoteWorld);handDirection.set(1,0,0).applyQuaternion(emoteWorld).applyQuaternion(parentRotation.invert()).normalize();aimRotation.setFromAxisAngle(handDirection,angle);bone.quaternion.premultiply(aimRotation);bone.updateWorldMatrix(false,true);
  }
  // Each foot is an independent deform bone, so move it with its shin endpoint.
  if(leg.foot&&leg.end){const foot=leg.foot;leg.end.getWorldPosition(neckPosition);neckPosition.sub(kickEndBefore);foot.getWorldPosition(kickFootPosition).add(neckPosition);foot.parent!.worldToLocal(kickFootPosition);foot.position.copy(kickFootPosition);foot.parent!.getWorldQuaternion(parentRotation);model.getWorldQuaternion(emoteWorld);handDirection.set(1,0,0).applyQuaternion(emoteWorld).applyQuaternion(parentRotation.invert()).normalize();aimRotation.setFromAxisAngle(handDirection,thigh+shin);foot.quaternion.premultiply(aimRotation);foot.updateWorldMatrix(false,true);}

 }
 model.userData.footballKick=courtyard&&kick?{...kick}:null;
 for(const material of model.userData.avatarMaterials as THREE.MeshStandardMaterial[]){
  if(model.userData.firstPerson)configureFirstPersonMaterial(material);
  if(!courtyard&&!model.userData.ghost&&material.name==='Demon_Main')configureCombatHandMaterial(material,feedback,weaponLevel);
 }
 model.userData.emotes={left:state.leftRaise,right:state.rightRaise};
}
export function disposeCrewAvatar(model:THREE.Group){
 pending.delete(model);
 const state=states.get(model);if(state){state.mixer.stopAllAction();state.mixer.uncacheRoot(state.root);state.root.traverse(node=>{if(node instanceof THREE.SkinnedMesh)node.skeleton.dispose();if(model.userData.firstPerson&&node instanceof THREE.SkinnedMesh)node.geometry.dispose();});states.delete(model);}
 for(const material of model.userData.avatarMaterials as THREE.Material[])material.dispose();
}

/** Cosmetic emission point only; projectile origins and ballistics stay in World. */
export function crewMuzzle(model:THREE.Group,out:THREE.Vector3,left=false):boolean{
 const state=states.get(model);if(!state)return false;
 const muzzle=left?state.root.getObjectByName('Middle3L_end'):state.muzzle;if(!muzzle)return false;muzzle.getWorldPosition(out);return true;
}

/** Animated combat fingertips. The demon has four fingers; its fifth lane
 * sits between middle and pinky instead of referring to a missing ring bone.
 * Twin sockets keep the simulation's interleaved right/left ordering. */
const combatTip=new THREE.Vector3();
export function crewWeaponMuzzle(model:THREE.Group,out:THREE.Vector3,level:number,socket=0):boolean{
 const state=states.get(model);if(!state)return false;
 state.combatTips??=['R','L'].map(side=>['Middle3','Index3','Middle3','Pinky3','Thumb2'].map(name=>state.root.getObjectByName(name+side+'_end')));
 const side=level>=5?socket%2:0,finger=(level>=5?Math.floor(socket/2):socket)%5;
 const tip=state.combatTips[side][finger];
 if(!tip)return false;
 tip.getWorldPosition(out);
 if(finger===2){
  const pinky=state.combatTips[side][3];if(!pinky)return false;
  pinky.getWorldPosition(combatTip);out.lerp(combatTip,.5);
 }
 return true;
}

/** Palm socket sampled after animation, shared by first- and third-person bodies. */
export function crewPencilGrip(model:THREE.Group,out:THREE.Vector3):boolean{
 const state=states.get(model);if(!state)return false;
 const index=state.root.getObjectByName('Index2R'),middle=state.root.getObjectByName('Middle2R');
 if(!index||!middle)return false;
 model.updateWorldMatrix(true,true);
 index.getWorldPosition(out);middle.getWorldPosition(handDirection);
 out.add(handDirection).multiplyScalar(.5);return true;
}
