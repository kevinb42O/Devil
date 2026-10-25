import {hasMeshArmor} from './enemy-kinds';
import {buildCollisionBvh} from './collision-bvh';
import * as THREE from 'three';
import {buildTowerStructure} from './tower-geometry';
import {towerOrganicPose,type TowerOrganicMotion} from './tower-anatomy-motion';
import baked from './projectile-colliders.json';
import remakeBaked from './remake-projectile-colliders.json';
import {enemyYaw,enemyEmergenceScale,towerPartOffset,CREATURE_SCALE,CREATURE_SCALE_RATIO,towerRadius,towerFoundationPose,legacyTowerGeometry} from './enemy-presentation';
import {towerFloorHeight} from './enemy-floor';
import type {Enemy,Vec} from './simulation';
// BVH topology stays shared; resize bounds and vertices together from the .62 bake.
type ArmorGeometry={nodes:number[][];vertices:Float32Array;indices:Uint32Array;motion?:Float32Array};
const meshes=new Map<string,ArmorGeometry>(Object.entries(baked.meshes).map(([kind,m])=>[kind,{nodes:m.nodes.map(n=>n.map((v,i)=>i<6?v*CREATURE_SCALE_RATIO:v)),vertices:Float32Array.from(m.vertices,v=>v*CREATURE_SCALE_RATIO),indices:new Uint32Array(m.indices)}]));
const colliders=new Map(Object.entries(baked.instances).map(([kind,instances])=>{
 const parts=instances.map(p=>({...p,mesh:meshes.get(p.name)!,c:Math.cos(p.yaw),s:Math.sin(p.yaw)}));
 let radius=0;
 for(const p of parts){
  const b=p.mesh.nodes[0],x=Math.max(Math.abs(b[0]),Math.abs(b[3]))*p.sx,z=Math.max(Math.abs(b[2]),Math.abs(b[5]))*p.sx;
  radius=Math.max(radius,Math.hypot(x,z)+(p.wave ? .4*CREATURE_SCALE_RATIO : 0));
 }
 return [kind,{parts,radius}] as const;
}));
const remakeColliders=new Map(Object.entries(remakeBaked).map(([kind,m])=>{const mesh:ArmorGeometry={nodes:m.nodes,vertices:Float32Array.from(m.vertices),indices:Uint32Array.from(m.indices),...('motion' in m?{motion:Float32Array.from(m.motion)}:{})};const b=mesh.nodes[0],radius=Math.hypot(Math.max(Math.abs(b[0]),Math.abs(b[3])),Math.max(Math.abs(b[2]),Math.abs(b[5])));return [kind,{radius,parts:[{name:kind,mesh,c:1,s:0,sx:1,sy:1,flip:false,wave:false}]}] as const;}));
export const armorMesh=(e:Enemy)=>e.balance&&remakeColliders.has(e.kind)?remakeColliders.get(e.kind):colliders.get(e.kind);
/** Lowest articulated armor point, shared with floor clearance. */
export function armorBottom(e:Enemy,originalCadence=true){
 if(e.balance&&e.kind.startsWith('squid')&&!legacyTowerGeometry(e))return towerAnimatedBottom(e,originalCadence);
 const collider=armorMesh(e);if(!collider)return 0;
 let bottom=Infinity;
 for(const p of collider.parts){const b=p.mesh.nodes[0];bottom=Math.min(bottom,(p.flip?-b[4]:b[1])*p.sy+towerPartOffset(e,p.name,originalCadence)*CREATURE_SCALE);}
 return bottom*enemyEmergenceScale(e);
}
export type ArmorHit={t:number;nx:number;ny:number;nz:number};
// Shared scratch stack visits only BVH nodes overlapped by the segment.
// Geometry is shared by all towers; queries allocate only on successful hits.
const stack:number[]=[];
export function sweepArmor(e:Enemy,player:Vec,a:Vec,b:Vec,limit=1,time=0,originalCadence=true):ArmorHit|null{
 if(!hasMeshArmor(e.kind))return null;
 if(e.kind.startsWith('squid')&&!legacyTowerGeometry(e))return sweepTowerStructure(e,player,a,b,limit,time,originalCadence);
 const collider=armorMesh(e);if(!collider)return null;
 // A conservative horizontal cylinder rejects distant aim rays before mesh
 // transforms/BVH traversal. Vertical articulation cannot leave this cylinder.
 const sx=b.x-a.x,sz=b.z-a.z,horizontalLength2=sx*sx+sz*sz;
 const along=horizontalLength2?Math.max(0,Math.min(limit,((e.pos.x-a.x)*sx+(e.pos.z-a.z)*sz)/horizontalLength2)):0;
 const radius=collider.radius*enemyEmergenceScale(e)+.0001;
 if((a.x+sx*along-e.pos.x)**2+(a.z+sz*along-e.pos.z)**2>radius*radius)return null;
 const yaw=enemyYaw(e,player),c=Math.cos(yaw),s=Math.sin(yaw),scale=enemyEmergenceScale(e);if(scale<.0001)return null;
 const ax=((a.x-e.pos.x)*c-(a.z-e.pos.z)*s)/scale,ay=(a.y-e.pos.y)/scale,az=((a.x-e.pos.x)*s+(a.z-e.pos.z)*c)/scale;
 const dx=((b.x-a.x)*c-(b.z-a.z)*s)/scale,dy=(b.y-a.y)/scale,dz=((b.x-a.x)*s+(b.z-a.z)*c)/scale;
 let normal:Vec|null=null,closest=limit;
 for(const p of collider.parts){
  const sign=p.flip?-1:1;
  const ox=(ax*p.c-az*p.s)/p.sx,oy=(ay-towerPartOffset(e,p.name,originalCadence)*CREATURE_SCALE)*sign/p.sy,oz=(ax*p.s+az*p.c)*sign/p.sx;
  const vx=(dx*p.c-dz*p.s)/p.sx,vy=dy*sign/p.sy,vz=(dx*p.s+dz*p.c)*sign/p.sx;
  const bounds=p.mesh.nodes[0],endY=oy+vy*closest;
  if(Math.max(oy,endY)<bounds[1]||Math.min(oy,endY)>bounds[4])continue;
  const hit=p.wave?traceRibbon(p.mesh,ox,oy,oz,vx,vy,vz,closest,time):trace(p.mesh,ox,oy,oz,vx,vy,vz,closest,time);
  if(hit===null)continue;
  closest=hit.t;
  // Inverse transpose of the part transform, then the enemy's yaw.
  const x=hit.nx/p.sx,y=hit.ny*sign/p.sy,z=hit.nz*sign/p.sx;
  const rx=x*p.c+z*p.s,rz=-x*p.s+z*p.c;
  normal={x:rx*c+rz*s,y,z:-rx*s+rz*c};
 }
 if(!normal)return null;
 const length=Math.hypot(normal.x,normal.y,normal.z)||1;
 const sign=normal.x*(b.x-a.x)+normal.y*(b.y-a.y)+normal.z*(b.z-a.z)>0?-1:1;
 return {t:closest,nx:normal.x/length*sign,ny:normal.y/length*sign,nz:normal.z/length*sign};
}

type TowerArmorPart={mesh:NonNullable<ReturnType<typeof meshes.get>>;motion:'fixed'|'foot'|'plinth'|'crown';organic?:{motion:TowerOrganicMotion;rest:THREE.Matrix4;inverse:THREE.Matrix4}[]};
const towerArmor=new Map<Enemy['kind'],TowerArmorPart[]>();
function towerArmorParts(kind:Enemy['kind']){
 let parts=towerArmor.get(kind);if(parts)return parts;
 parts=[];const root=new THREE.Group(),material=new THREE.MeshBasicMaterial();
 buildTowerStructure(root,kind,()=>material);root.updateMatrixWorld(true);
 root.traverse(part=>{
  if(!(part instanceof THREE.Mesh))return;
  const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);geometry.computeBoundingBox();
  const vertices=Float32Array.from(geometry.getAttribute('position').array),indices=geometry.index?Uint32Array.from(geometry.index.array):Uint32Array.from({length:vertices.length/3},(_,i)=>i);
  const motion=part.parent?.name==='tower-foundation'?'foot':part.name==='tower-plinth'?'plinth':part.parent?.name==='warden-crest'?'crown':'fixed';
  const organic:NonNullable<TowerArmorPart['organic']>=[];
  for(let ancestor=part.parent;ancestor;ancestor=ancestor.parent){
   if(ancestor.userData.towerOrganicMotion)organic.unshift({motion:ancestor.userData.towerOrganicMotion,rest:ancestor.matrixWorld.clone(),inverse:ancestor.matrixWorld.clone().invert()});
  }
  parts!.push({mesh:{vertices,...buildCollisionBvh(vertices,indices)},motion,...organic.length?{organic}:{}});
  geometry.dispose();part.geometry.dispose();
 });
 material.dispose();towerArmor.set(kind,parts);return parts;
}
/** Prepare all three static armor trees while gameplay is still loading. */
export function prepareTowerCollisions(){for(const kind of ['squid','squid2','squid3'] as const)towerArmorParts(kind);}
const organicMatrix=new THREE.Matrix4(),organicPoseMatrix=new THREE.Matrix4(),organicJointMatrix=new THREE.Matrix4();
const organicOrigin=new THREE.Vector3(),organicEnd=new THREE.Vector3(),organicScale=new THREE.Vector3(),organicRotation=new THREE.Quaternion(),organicEuler=new THREE.Euler(),organicZero=new THREE.Vector3(),organicHitNormal=new THREE.Vector3();
/** Compose the same ancestor joint chain used by the visible anatomy. */
function composeTowerOrganicMatrix(e:Enemy,part:TowerArmorPart,originalCadence:boolean){
 organicMatrix.identity();
 for(const joint of part.organic??[]){
  const pose=towerOrganicPose(e.age,e.kind,joint.motion,originalCadence);
  organicRotation.setFromEuler(organicEuler.set(pose.rx,0,pose.rz));
  organicPoseMatrix.compose(organicZero,organicRotation,organicScale.set(1,pose.sy,1));
  organicJointMatrix.copy(joint.rest).multiply(organicPoseMatrix).multiply(joint.inverse);
  organicMatrix.multiply(organicJointMatrix);
 }
 return organicMatrix;
}
type OrganicTransform={age:number;cadence:boolean;matrix:THREE.Matrix4;inverse:THREE.Matrix4;normal:THREE.Matrix3};
const towerPoseCache=new WeakMap<Enemy,Map<TowerArmorPart,OrganicTransform>>();
/** All projectile queries in a tick share the same immutable joint pose.
 * Reuse matrix storage across ticks to avoid a new allocation per joint/query. */
function towerOrganicTransform(e:Enemy,part:TowerArmorPart,originalCadence:boolean){
 let cached=towerPoseCache.get(e);
 if(!cached){cached=new Map();towerPoseCache.set(e,cached);}
 let transform=cached.get(part);
 if(!transform){transform={age:NaN,cadence:originalCadence,matrix:new THREE.Matrix4(),inverse:new THREE.Matrix4(),normal:new THREE.Matrix3()};cached.set(part,transform);}
 if(transform.age!==e.age||transform.cadence!==originalCadence){
  transform.matrix.copy(composeTowerOrganicMatrix(e,part,originalCadence));transform.inverse.copy(transform.matrix).invert();transform.normal.getNormalMatrix(transform.matrix);
  transform.age=e.age;transform.cadence=originalCadence;
 }
 return transform;
}
function towerAnimatedBottom(e:Enemy,originalCadence:boolean){
 let bottom=Infinity;
 for(const part of towerArmorParts(e.kind)){
  const b=part.mesh.nodes[0];let y=b[1];
  if(part.organic){
   const m=towerOrganicTransform(e,part,originalCadence).matrix.elements;
   // Support point of the transformed bounds in the downward direction.
   // Small conservative padding prevents moving tendril tips grazing tiles.
   y=m[13]+m[1]*b[m[1]>=0?0:3]+m[5]*b[m[5]>=0?1:4]+m[9]*b[m[9]>=0?2:5];
  }else if(part.motion==='crown')y+=towerPartOffset(e,'crest',originalCadence);
  bottom=Math.min(bottom,y);
 }
 return bottom*enemyEmergenceScale(e);
}
/** Trace the same triangles as the visible tower, including its telescoping foot
 * and opening crown. Historical targets continue using their original BVH. */
function sweepTowerStructure(e:Enemy,player:Vec,a:Vec,b:Vec,limit:number,time:number,originalCadence:boolean):ArmorHit|null{
 const scale=enemyEmergenceScale(e);if(scale<.0001)return null;
 const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length2=dx*dx+dz*dz;
 const along=length2?Math.max(0,Math.min(limit,((e.pos.x-a.x)*dx+(e.pos.z-a.z)*dz)/length2)):0;
 if((a.x+dx*along-e.pos.x)**2+(a.z+dz*along-e.pos.z)**2>(towerRadius(e.kind)*1.65*scale)**2)return null;
 const yaw=enemyYaw(e,player),c=Math.cos(yaw),s=Math.sin(yaw);
 const ax=((a.x-e.pos.x)*c-(a.z-e.pos.z)*s)/scale,ay=(a.y-e.pos.y)/scale,az=((a.x-e.pos.x)*s+(a.z-e.pos.z)*c)/scale;
 const vx=(dx*c-dz*s)/scale,vy=dy/scale,vz=(dx*s+dz*c)/scale;
 const bottom=(towerFloorHeight(e,time)-e.pos.y)/scale,foundation=towerFoundationPose(bottom);
 let closest=limit,normal:ArmorHit|null=null;
 for(const part of towerArmorParts(e.kind)){
  const sy=part.motion==='foot'?foundation.footScale:1;
  const offset=part.motion==='foot'?foundation.footY:part.motion==='plinth'?foundation.plinthY-.3:part.motion==='crown'?towerPartOffset(e,'crest',originalCadence):0;
  let ox=ax,oy=(ay-offset)/sy,oz=az,dx=vx,dy=vy/sy,dz=vz;
  if(part.organic){
   const transform=towerOrganicTransform(e,part,originalCadence);
   organicOrigin.set(ax,ay,az).applyMatrix4(transform.inverse);
   organicEnd.set(ax+vx,ay+vy,az+vz).applyMatrix4(transform.inverse).sub(organicOrigin);
   ox=organicOrigin.x;oy=organicOrigin.y;oz=organicOrigin.z;dx=organicEnd.x;dy=organicEnd.y;dz=organicEnd.z;
  }
  const hit=trace(part.mesh,ox,oy,oz,dx,dy,dz,closest);if(!hit)continue;
  closest=hit.t;normal={...hit,ny:hit.ny/sy};
  if(part.organic){organicHitNormal.set(hit.nx,hit.ny,hit.nz).applyMatrix3(towerOrganicTransform(e,part,originalCadence).normal);normal={...hit,nx:organicHitNormal.x,ny:organicHitNormal.y,nz:organicHitNormal.z};}
 }
 if(!normal)return null;
 const nx=normal.nx*c+normal.nz*s,ny=normal.ny,nz=-normal.nx*s+normal.nz*c,length=Math.hypot(nx,ny,nz)||1;
 const sign=nx*dx+ny*dy+nz*dz>0?-1:1;
 return {t:closest,nx:nx/length*sign,ny:ny/length*sign,nz:nz/length*sign};
}

// Invert the native arm shader in mesh space. Its deformation preserves Y;
// horizontal sweeps are exact, pitched sweeps use short curved-path chords.
function ribbonInverse(x:number,y:number,z:number,time:number,out:Vec){
 const rawY=y/CREATURE_SCALE,wave=Math.max(0,Math.min(1,(-rawY-1.5)*.5))*.5,curve=Math.pow(Math.max(0,-rawY),2.1)*.07;
 const theta=wave*curve*.35,c=Math.cos(theta),s=Math.sin(theta);
 out.x=-x*s-z*c;out.y=y;out.z=x*c-z*s-wave*Math.sin(curve-time*.7)*.6*CREATURE_SCALE;return out;
}
const ribbonA={x:0,y:0,z:0},ribbonB={x:0,y:0,z:0};
function traceRibbon(mesh:NonNullable<ReturnType<typeof meshes.get>>,x:number,y:number,z:number,dx:number,dy:number,dz:number,limit:number,time:number):ArmorHit|null{
 const steps=Math.min(32,Math.max(1,Math.ceil(Math.abs(dy)*limit/.08)));
 ribbonInverse(x,y,z,time,ribbonA);
 for(let i=0;i<steps;i++){
  const start=limit*i/steps,end=limit*(i+1)/steps;
  ribbonInverse(x+dx*end,y+dy*end,z+dz*end,time,ribbonB);
  const hit=trace(mesh,ribbonA.x,ribbonA.y,ribbonA.z,ribbonB.x-ribbonA.x,ribbonB.y-ribbonA.y,ribbonB.z-ribbonA.z,1);
  if(hit!==null){
   const t=start+(end-start)*hit.t,at={x:x+dx*t,y:y+dy*t,z:z+dz*t};
   // The ribbon is non-rigid: transform its mesh normal by the inverse
   // deformation's Jacobian transpose at the contact.
   const base={...ribbonInverse(at.x,at.y,at.z,time,{x:0,y:0,z:0})},out={x:0,y:0,z:0},epsilon=1e-4;
   const derivative=(axis:'x'|'y'|'z')=>{ribbonInverse(at.x+(axis==='x'?epsilon:0),at.y+(axis==='y'?epsilon:0),at.z+(axis==='z'?epsilon:0),time,out);return ((out.x-base.x)*hit.nx+(out.y-base.y)*hit.ny+(out.z-base.z)*hit.nz)/epsilon;};
   return {t,nx:derivative('x'),ny:derivative('y'),nz:derivative('z')};
  }
  Object.assign(ribbonA,ribbonB);
 }
 return null;
}

function trace(mesh:NonNullable<ReturnType<typeof meshes.get>>,ax:number,ay:number,az:number,dx:number,dy:number,dz:number,limit:number,time=0):ArmorHit|null{
 let best=limit,normal:Vec|null=null;const wave=mesh.motion?Math.sin(time*16):0;stack.length=0;stack.push(0);
 while(stack.length){const node=mesh.nodes[stack.pop()!];let lo=0,hi=best;
  for(let i=0;i<3;i++){if(Math.abs((i===0?dx:i===1?dy:dz))<1e-12){if((i===0?ax:i===1?ay:az)<node[i]-.00001||(i===0?ax:i===1?ay:az)>node[i+3]+.00001){hi=-1;break;}}else{const u=(node[i]-.00001-(i===0?ax:i===1?ay:az))/(i===0?dx:i===1?dy:dz),v=(node[i+3]+.00001-(i===0?ax:i===1?ay:az))/(i===0?dx:i===1?dy:dz);lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}}
  if(lo>hi)continue;
  if(node[6]>=0){
   const left=mesh.nodes[node[6]],right=mesh.nodes[node[7]];
   // Visit the nearer child first so its hit shortens every later query.
   const order=(left[0]+left[3]-right[0]-right[3])*dx+(left[1]+left[4]-right[1]-right[4])*dy+(left[2]+left[5]-right[2]-right[5])*dz;
   if(order<0)stack.push(node[7],node[6]);else stack.push(node[6],node[7]);continue;
  }
  for(let t=node[7];t<node[7]+node[8];t++){
   const ia=mesh.indices[t*3]*3,ib=mesh.indices[t*3+1]*3,ic=mesh.indices[t*3+2]*3,v=mesh.vertices;
   const ay0=v[ia+1]+wave*(mesh.motion?.[ia/3]??0),by0=v[ib+1]+wave*(mesh.motion?.[ib/3]??0),cy0=v[ic+1]+wave*(mesh.motion?.[ic/3]??0);
   const ex=v[ib]-v[ia],ey=by0-ay0,ez=v[ib+2]-v[ia+2],fx=v[ic]-v[ia],fy=cy0-ay0,fz=v[ic+2]-v[ia+2];
   const px=dy*fz-dz*fy,py=dz*fx-dx*fz,pz=dx*fy-dy*fx,det=ex*px+ey*py+ez*pz;if(Math.abs(det)<1e-10)continue;
   const tx=ax-v[ia],ty=ay-ay0,tz=az-v[ia+2],u=(tx*px+ty*py+tz*pz)/det;if(u<0||u>1)continue;
   const qx=ty*ez-tz*ey,qy=tz*ex-tx*ez,qz=tx*ey-ty*ex,w=(dx*qx+dy*qy+dz*qz)/det;if(w<0||u+w>1)continue;
   const at=(fx*qx+fy*qy+fz*qz)/det;if(at<1e-7||at>best)continue;
   best=at;normal={x:ey*fz-ez*fy,y:ez*fx-ex*fz,z:ex*fy-ey*fx};
  }
 }
 return normal?{t:best,nx:normal.x,ny:normal.y,nz:normal.z}:null;
}

// Conservative broad phase for the rotated mesh, once per enemy per tick.
export function armorBounds(e:Enemy){if(!hasMeshArmor(e.kind))return null;return e.kind.startsWith('squid')&&!legacyTowerGeometry(e)?towerRadius(e.kind)*1.65:armorMesh(e)?.radius??null;}
