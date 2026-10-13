import baked from './projectile-colliders.json';
import {enemyYaw} from './enemy-presentation';
import type {Enemy,Vec} from './simulation';
const meshes=new Map(Object.entries(baked.meshes).map(([kind,m])=>[kind,{nodes:m.nodes,vertices:new Float32Array(m.vertices),indices:new Uint32Array(m.indices)}]));
const colliders=new Map(Object.entries(baked.instances).map(([kind,instances])=>{
 const parts=instances.map(p=>({...p,mesh:meshes.get(p.name)!,c:Math.cos(p.yaw),s:Math.sin(p.yaw)}));
 let radius=0;
 for(const p of parts){
  const b=p.mesh.nodes[0],x=Math.max(Math.abs(b[0]),Math.abs(b[3]))*p.sx,z=Math.max(Math.abs(b[2]),Math.abs(b[5]))*p.sx;
  radius=Math.max(radius,Math.hypot(x,z)+(p.wave ? .4 : 0));
 }
 return [kind,{parts,radius}] as const;
}));
export const armorMesh=(e:Enemy)=>colliders.get(e.kind);
export type ArmorHit={t:number;nx:number;ny:number;nz:number};
// Shared scratch stack visits only BVH nodes overlapped by the segment.
// Geometry is shared by all towers; only the final successful query allocates.
const stack:number[]=[];
export function sweepArmor(e:Enemy,player:Vec,a:Vec,b:Vec,limit=1,time=0):ArmorHit|null{
 const collider=armorMesh(e);if(!collider)return null;
 const yaw=enemyYaw(e,player),c=Math.cos(yaw),s=Math.sin(yaw),scale=Math.min(1,e.age/(e.kind==='leviathan'?8.533333:1.1));if(scale<.0001)return null;
 const ax=((a.x-e.pos.x)*c-(a.z-e.pos.z)*s)/scale,ay=(a.y-e.pos.y)/scale,az=((a.x-e.pos.x)*s+(a.z-e.pos.z)*c)/scale;
 const dx=((b.x-a.x)*c-(b.z-a.z)*s)/scale,dy=(b.y-a.y)/scale,dz=((b.x-a.x)*s+(b.z-a.z)*c)/scale;
 let found=false,closest=limit;
 for(const p of collider.parts){
  const sign=p.flip?-1:1;
  const ox=(ax*p.c-az*p.s)/p.sx,oy=ay*sign/p.sy,oz=(ax*p.s+az*p.c)*sign/p.sx;
  const vx=(dx*p.c-dz*p.s)/p.sx,vy=dy*sign/p.sy,vz=(dx*p.s+dz*p.c)*sign/p.sx;
  const bounds=p.mesh.nodes[0],endY=oy+vy*closest;
  if(Math.max(oy,endY)<bounds[1]||Math.min(oy,endY)>bounds[4])continue;
  const hit:number|null=p.wave?traceRibbon(p.mesh,ox,oy,oz,vx,vy,vz,closest,time):trace(p.mesh,ox,oy,oz,vx,vy,vz,closest);
  if(hit===null)continue;
  closest=hit;found=true;
 }
 if(!found)return null;
 const speed=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)||1;
 return {t:closest,nx:(a.x-b.x)/speed,ny:(a.y-b.y)/speed,nz:(a.z-b.z)/speed};
}

// Invert the native arm shader in mesh space. Its deformation preserves Y;
// horizontal sweeps are exact, pitched sweeps use short curved-path chords.
function ribbonInverse(x:number,y:number,z:number,time:number,out:Vec){
 const rawY=y/.62,wave=Math.max(0,Math.min(1,(-rawY-1.5)*.5))*.5,curve=Math.pow(Math.max(0,-rawY),2.1)*.07;
 const theta=wave*curve*.35,c=Math.cos(theta),s=Math.sin(theta);
 out.x=-x*s-z*c;out.y=y;out.z=x*c-z*s-wave*Math.sin(curve-time*.7)*.6*.62;return out;
}
const ribbonA={x:0,y:0,z:0},ribbonB={x:0,y:0,z:0};
function traceRibbon(mesh:NonNullable<ReturnType<typeof meshes.get>>,x:number,y:number,z:number,dx:number,dy:number,dz:number,limit:number,time:number):number|null{
 const steps=Math.min(32,Math.max(1,Math.ceil(Math.abs(dy)*limit/.08)));
 ribbonInverse(x,y,z,time,ribbonA);
 for(let i=0;i<steps;i++){
  const start=limit*i/steps,end=limit*(i+1)/steps;
  ribbonInverse(x+dx*end,y+dy*end,z+dz*end,time,ribbonB);
  const hit=trace(mesh,ribbonA.x,ribbonA.y,ribbonA.z,ribbonB.x-ribbonA.x,ribbonB.y-ribbonA.y,ribbonB.z-ribbonA.z,1);
  if(hit!==null)return start+(end-start)*hit;
  Object.assign(ribbonA,ribbonB);
 }
 return null;
}

function trace(mesh:NonNullable<ReturnType<typeof meshes.get>>,ax:number,ay:number,az:number,dx:number,dy:number,dz:number,limit:number):number|null{
 let best=limit,hit=false;stack.length=0;stack.push(0);
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
   best=at;hit=true;
  }
 }
 return hit?best:null;
}

// Conservative broad phase for the rotated mesh, once per enemy per tick.
export function armorBounds(e:Enemy){return armorMesh(e)?.radius??null;}
