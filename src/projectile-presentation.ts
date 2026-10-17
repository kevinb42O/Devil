import {SHOTGUN_COLORS} from './weapon-tuning';
import type {Projectile,Vec} from './simulation';
/** Linear RGB shared by dagger meshes, halos, floor spill and launch effects.
 * Native textures: warm regular blades, cyan seeking III and magenta seeking IV.
 */
export const PROJECTILE_COLORS = [
 [1,.12,.025], [1,.2,.035], [1,.22,.025], [.025,.75,1], [1,.04,.025], [1,.025,.4],
 [1,.04,.025], [1,.025,.4], [1,.04,.025], [1,.025,.4], [1,.04,.025], [1,.025,.4],
] as const;
export function projectileStyleIndex(level:number,homing:boolean){
 // Twin tiers inherit IV's native regular/seeking blades and their shared lighting.
 return level===1?0:level===2?(homing?3:1):level===3?(homing?3:2):(homing?5:4);
}
export function shotgunStyleIndex(level:number,homing=false){
 return PROJECTILE_COLORS.length+(Math.max(1,Math.min(4,Math.floor(level)))-1)*2+(homing?1:0);
}
/** One style selector keeps mesh, halo, and floor spill in agreement. */
export function projectileVisualIndex(p:Pick<Projectile,'level'|'homing'|'kind'>,fallbackLevel=1){
 return p.kind==='shotgun'?shotgunStyleIndex(p.level??fallbackLevel,p.homing):projectileStyleIndex(p.level??fallbackLevel,p.homing);
}
export const ALL_PROJECTILE_COLORS=[...PROJECTILE_COLORS,...SHOTGUN_COLORS] as const;
/** Stable launch roll, independent of combat RNG and shared by prediction/host.
 * Roll only around the blade's +Z flight axis; it never changes its trajectory.
 */
export function projectileRoll(p:Pick<Projectile,'id'|'shotKey'>):number{
 let hash=Math.abs(p.id)>>>0;
 if(p.shotKey){hash=2166136261;for(let i=0;i<p.shotKey.length;i++)hash=Math.imul(hash^p.shotKey.charCodeAt(i),16777619);}
 hash=Math.imul(hash^(hash>>>16),0x7feb352d);hash=Math.imul(hash^(hash>>>15),0x846ca68b);hash^=hash>>>16;
 return (hash>>>0)/4294967296*Math.PI*2;
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
