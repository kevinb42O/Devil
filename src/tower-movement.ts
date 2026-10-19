import type {Enemy} from './simulation';
import {isSquid} from './enemy-kinds';
import {armorBounds} from './projectile-collision';
import {enemyRigScale} from './enemy-presentation';
import {towerGameplayEntrancePose} from './tower-spawn';

export const TOWER_SPACING=.5;
/** Reserve the mature footprint even during emergence, so growing towers do
 * not push their neighbours abruptly when their entrance finishes. */
export function towerFootprint(e:Enemy){return (armorBounds(e)??e.radius)*enemyRigScale(e);}

/** Plan all towers together before emitting skulls or testing player contact.
 * Project inward travel onto non-overlapping footprints; axial spin is free. */
export function planTowerMovement(enemies:readonly Enemy[],time:number,dt:number,speed:number){
 if(enemies.some(e=>e.balance&&isSquid(e.kind)))return planAnchoredMovement(enemies,time,dt,speed);
 const bodies=enemies.filter(e=>e.hp>0&&isSquid(e.kind)).sort((a,b)=>a.id-b.id).map(e=>{
  const radius=Math.hypot(e.pos.x,e.pos.z),motion=e.towerEntrance;
  const travel=Math.min(radius,motion?Math.max(0,towerGameplayEntrancePose(e.kind,motion.elapsed).radius-towerGameplayEntrancePose(e.kind,Math.max(0,time-motion.born)).radius):speed*dt);
  const factor=radius>0?(radius-travel)/radius:0;
  return {e,x:e.pos.x*factor,z:e.pos.z*factor,r:towerFootprint(e)};
 });
 // Revisit neighbours displaced by earlier pairs. Sorted IDs make both exact
 // coincidences and crowded groups deterministic across checkpoint restores.
 for(let pass=0;pass<128;pass++){
  let overlap=0;
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j],dx=b.x-a.x,dz=b.z-a.z,distance=Math.hypot(dx,dz),minimum=a.r+b.r+TOWER_SPACING;
   if(distance>=minimum)continue;
   const depth=minimum-distance;overlap=Math.max(overlap,depth);
   const angle=((a.e.id*73856093^b.e.id*19349663)>>>0)/4294967296*Math.PI*2;
   const nx=distance>1e-10?dx/distance:Math.cos(angle),nz=distance>1e-10?dz/distance:Math.sin(angle),push=(depth+1e-7)*.5;
   a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;
  }
  if(overlap<1e-7)break;
 }
 // Bound the solver cost even for pathological piles. A uniform expansion
 // preserves every resolved pair and clears any residual crowding at once.
 let expansion=1;
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
  const a=bodies[i],b=bodies[j];
  expansion=Math.max(expansion,(a.r+b.r+TOWER_SPACING)/Math.hypot(a.x-b.x,a.z-b.z));
 }
 if(expansion>1){
  const cx=bodies.reduce((sum,b)=>sum+b.x,0)/bodies.length,cz=bodies.reduce((sum,b)=>sum+b.z,0)/bodies.length;
  for(const b of bodies){b.x=cx+(b.x-cx)*(expansion+1e-9);b.z=cz+(b.z-cz)*(expansion+1e-9);}
 }
 return new Map(bodies.map(b=>[b.e,{x:b.x,z:b.z}]));
}

/** Keep every spawn ray and bound displacement by requested inward travel.
 * Occupied space stops a tower; it never pushes another tower or banks travel.
 * Sweep the entire step so a slow frame cannot tunnel through a neighbour. */
function planAnchoredMovement(enemies:readonly Enemy[],time:number,dt:number,speed:number){
 const towers=enemies.filter(e=>e.hp>0&&isSquid(e.kind)).sort((a,b)=>a.id-b.id);
 const planned=new Map<Enemy,{x:number;z:number}>();
 for(const e of towers){
  const radius=Math.hypot(e.pos.x,e.pos.z),motion=e.towerEntrance;
  const travel=Math.min(radius,motion?Math.max(0,towerGameplayEntrancePose(e.kind,motion.elapsed).radius-towerGameplayEntrancePose(e.kind,Math.max(0,time-motion.born)).radius):speed*dt);
  const dx=radius?-e.pos.x/radius*travel:0,dz=radius?-e.pos.z/radius*travel:0,length2=dx*dx+dz*dz;
  let fraction=1;
  if(length2)for(const other of towers){
   if(other===e)continue;
   const pos=planned.get(other)??other.pos,ox=e.pos.x-pos.x,oz=e.pos.z-pos.z;
   const minimum=towerFootprint(e)+towerFootprint(other)+TOWER_SPACING;
   const c=ox*ox+oz*oz-minimum*minimum,b=ox*dx+oz*dz;
   // Recover an overlapping imported/debug pose only by reducing penetration.
   if(c<0){if(b<0)fraction=0;continue;}
   if(b>=0)continue;
   const discriminant=b*b-length2*c;if(discriminant<0)continue;
   const hit=(-b-Math.sqrt(discriminant))/length2;
   if(hit>=0&&hit<=fraction)fraction=Math.max(0,hit-1e-7);
  }
  planned.set(e,{x:e.pos.x+dx*fraction,z:e.pos.z+dz*fraction});
 }
 return planned;
}
