import baked from './projectile-colliders.json';
import {enemyYaw,enemyEmergenceScale,towerPartOffset,CREATURE_SCALE,CREATURE_SCALE_RATIO} from './enemy-presentation';
import type {Enemy,Vec} from './simulation';
// BVH topology stays shared; resize bounds and vertices together from the .62 bake.
const meshes=new Map(Object.entries(baked.meshes).map(([kind,m])=>[kind,{nodes:m.nodes.map(n=>n.map((v,i)=>i<6?v*CREATURE_SCALE_RATIO:v)),vertices:Float32Array.from(m.vertices,v=>v*CREATURE_SCALE_RATIO),indices:new Uint32Array(m.indices)}]));
const colliders=new Map(Object.entries(baked.instances).map(([kind,instances])=>{
 const parts=instances.map(p=>({...p,mesh:meshes.get(p.name)!,c:Math.cos(p.yaw),s:Math.sin(p.yaw)}));
 let radius=0;
 for(const p of parts){
  const b=p.mesh.nodes[0],x=Math.max(Math.abs(b[0]),Math.abs(b[3]))*p.sx,z=Math.max(Math.abs(b[2]),Math.abs(b[5]))*p.sx;
  radius=Math.max(radius,Math.hypot(x,z)+(p.wave ? .4*CREATURE_SCALE_RATIO : 0));
 }
 return [kind,{parts,radius}] as const;
}));
export const armorMesh=(e:Enemy)=>colliders.get(e.kind);
/** Lowest animated armor point, relative to the same root used for damage. */
export function armorBottom(e:Enemy,originalCadence=true){
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
 const collider=armorMesh(e);if(!collider)return null;
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
  const hit=p.wave?traceRibbon(p.mesh,ox,oy,oz,vx,vy,vz,closest,time):trace(p.mesh,ox,oy,oz,vx,vy,vz,closest);
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

function trace(mesh:NonNullable<ReturnType<typeof meshes.get>>,ax:number,ay:number,az:number,dx:number,dy:number,dz:number,limit:number):ArmorHit|null{
 let best=limit,normal:Vec|null=null;stack.length=0;stack.push(0);
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
   const ex=v[ib]-v[ia],ey=v[ib+1]-v[ia+1],ez=v[ib+2]-v[ia+2],fx=v[ic]-v[ia],fy=v[ic+1]-v[ia+1],fz=v[ic+2]-v[ia+2];
   const px=dy*fz-dz*fy,py=dz*fx-dx*fz,pz=dx*fy-dy*fx,det=ex*px+ey*py+ez*pz;if(Math.abs(det)<1e-10)continue;
   const tx=ax-v[ia],ty=ay-v[ia+1],tz=az-v[ia+2],u=(tx*px+ty*py+tz*pz)/det;if(u<0||u>1)continue;
   const qx=ty*ez-tz*ey,qy=tz*ex-tx*ez,qz=tx*ey-ty*ex,w=(dx*qx+dy*qy+dz*qz)/det;if(w<0||u+w>1)continue;
   const at=(fx*qx+fy*qy+fz*qz)/det;if(at<1e-7||at>best)continue;
   best=at;normal={x:ey*fz-ez*fy,y:ez*fx-ex*fz,z:ex*fy-ey*fx};
  }
 }
 return normal?{t:best,nx:normal.x,ny:normal.y,nz:normal.z}:null;
}

// Conservative broad phase for the rotated mesh, once per enemy per tick.
export function armorBounds(e:Enemy){return armorMesh(e)?.radius??null;}
