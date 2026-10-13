import type {Projectile,Vec} from './simulation';
/** Linear RGB shared by dagger meshes, halos, floor spill and launch effects.
 * Hand I: ember, II: gold, III: ice, IV: arcane violet.
 * Homing accents stay in their hand's family, with a greener/pinker hue.
 */
export const PROJECTILE_COLORS = [
 [1,.18,.025], [1,.68,.045], [.025,.65,1], [.045,1,.58], [.5,.085,1], [1,.12,.55],
] as const;
export function projectileStyleIndex(level:number,homing:boolean){
 return level===1?0:level===2?1:level===3?(homing?3:2):(homing?5:4);
}
/** Sample the same bent flight path for the physical dagger and its glow. */
export function sampleProjectile(p:Projectile,alpha:number,out:Vec,velocity?:Vec){
 let a=p.previous??p.pos,b=p.pos,start=0,end=1;
 for(const point of p.path??[]){if(alpha<=point.t){b=point.pos;end=point.t;break;}a=point.pos;start=point.t;}
 if(velocity){
  if(p.path?.length&&end>start){const scale=120/(end-start);velocity.x=(b.x-a.x)*scale;velocity.y=(b.y-a.y)*scale;velocity.z=(b.z-a.z)*scale;}
  else{velocity.x=p.vel.x;velocity.y=p.vel.y;velocity.z=p.vel.z;}
 }
 const t=end>start?Math.max(0,Math.min(1,(alpha-start)/(end-start))):1;
 out.x=a.x+(b.x-a.x)*t;out.y=a.y+(b.y-a.y)*t;out.z=a.z+(b.z-a.z)*t;return out;
}
