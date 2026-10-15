import {projectileSocket} from './weapon-origin';
import {SHOTGUN_TUNING} from './weapon-tuning';
import type {Vec} from './simulation';

/** Immutable authoritative launch description shared by every dagger in a shot.
 * Clients reproduce the same spread; collisions and homing remain on the host. */
export type ShotLaunch={pos:Vec;muzzles:Vec[];yaw:number;pitch:number;spread:number;aimDistance:number;radius:number|null;camera:boolean;legacyOrigin?:boolean;seed:number;cone?:boolean;focused?:boolean;dual?:boolean;shotgunCount?:number};
export function daggerLaunch(s:ShotLaunch,index:number,u:number,w:number,speed:number){
 if(s.shotgunCount)return shotgunLaunch(s,index,u,w,speed);
 // Keep the outer cone intact. II/III have one focused lane, IV has two,
 // maintaining distant damage progression despite IV's slower salvo cadence.
 const focusedLanes=s.focused?(s.dual?2:s.muzzles.length>=5?2:1):0;
 const angle=u*Math.PI*2,radialSpread=(index<focusedLanes?Math.min(s.spread,.005):s.spread)*Math.sqrt(w);
 const yaw=s.radius!==null?s.yaw-Math.cos(angle)*radialSpread:s.yaw+(u-.5)*s.spread*2;
 const pitch=s.radius!==null?s.pitch+Math.sin(angle)*radialSpread:s.pitch+(w-.5)*s.spread*2;
 const pos={...s.muzzles[s.dual?projectileSocket(5,index):index%s.muzzles.length]},target={x:s.pos.x-Math.sin(yaw)*Math.cos(pitch)*s.aimDistance,y:s.pos.y+Math.sin(pitch)*s.aimDistance,z:s.pos.z-Math.cos(yaw)*Math.cos(pitch)*s.aimDistance};
 if(s.radius!==null){
  const radius=s.radius*Math.sqrt(w),side=Math.cos(angle)*radius,up=Math.sin(angle)*radius;
  const sy=Math.sin(s.yaw),cy=Math.cos(s.yaw),sp=Math.sin(s.pitch),cp=Math.cos(s.pitch);
  pos.x+=cy*side+sy*sp*up;pos.y+=cp*up;pos.z+=-sy*side+cy*sp*up;
 }
 if(s.cone){
  // Sample in the aim's perpendicular plane so steep aim keeps the same cone.
  const sy=Math.sin(s.yaw),cy=Math.cos(s.yaw),sp=Math.sin(s.pitch),cp=Math.cos(s.pitch);
  const side=s.radius!==null?Math.cos(angle)*Math.tan(radialSpread):Math.tan((u-.5)*s.spread*2);
  const up=s.radius!==null?Math.sin(angle)*Math.tan(radialSpread):Math.tan((w-.5)*s.spread*2);
  target.x=s.pos.x+(-sy*cp+cy*side+sy*sp*up)*s.aimDistance;
  target.y=s.pos.y+(sp+cp*up)*s.aimDistance;
  target.z=s.pos.z+(-cy*cp-sy*side+cy*sp*up)*s.aimDistance;
 }
 const d=Math.max(.001,Math.hypot(target.x-pos.x,target.y-pos.y,target.z-pos.z));
 const vel=s.camera?{x:-Math.sin(yaw)*Math.cos(pitch)*speed,y:Math.sin(pitch)*speed,z:-Math.cos(yaw)*Math.cos(pitch)*speed}:{x:(target.x-pos.x)/d*speed,y:(target.y-pos.y)/d*speed,z:(target.z-pos.z)/d*speed};
 return {pos,vel};
}
export function shotLaunches(s:ShotLaunch,count:number,speed:number){
 let seed=s.seed;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
 return Array.from({length:count},(_,i)=>daggerLaunch(s,i,random(),random(),speed));
}

/** Separate pattern leaves historical/stream launches and their RNG untouched.
 * Strata guarantee a useful packet even with ten pellets. Original count is
 * immutable: a network snapshot may contain only a few surviving indices. */
function shotgunLaunch(s:ShotLaunch,index:number,u:number,w:number,speed:number){
 const count=s.shotgunCount!,core=Math.max(1,Math.round(count*SHOTGUN_TUNING.coreFraction));
 const inner=index<core,n=inner?core:count-core,j=inner?index:index-core;
 // Golden-angle ordering distributes adjacent radial strata around the disc.
 // A per-shot rotation avoids a fixed pattern; jitter cannot empty the core.
 const rotation=((Math.imul(s.seed,1664525)+1013904223)>>>0)/4294967296;
 const angle=(rotation+j*.3819660112501051+(u-.5)*.35/Math.max(1,n))*Math.PI*2;
 const spread=(inner?Math.min(s.spread*SHOTGUN_TUNING.coreSpread,SHOTGUN_TUNING.maxCoreSpread):s.spread)*Math.sqrt((j+w)/Math.max(1,n));
 const side=Math.cos(angle),up=Math.sin(angle),sy=Math.sin(s.yaw),cy=Math.cos(s.yaw),sp=Math.sin(s.pitch),cp=Math.cos(s.pitch);
 const radius=(s.radius??SHOTGUN_TUNING.radius)*Math.sqrt(w),pos={...s.muzzles[s.dual?index%2:0]};
 pos.x+=(cy*side+sy*sp*up)*radius;pos.y+=cp*up*radius;pos.z+=(-sy*side+cy*sp*up)*radius;
 const slope=Math.tan(spread),x=s.pos.x+(-sy*cp+(cy*side+sy*sp*up)*slope)*s.aimDistance-pos.x;
 const y=s.pos.y+(sp+cp*up*slope)*s.aimDistance-pos.y;
 const z=s.pos.z+(-cy*cp+(-sy*side+cy*sp*up)*slope)*s.aimDistance-pos.z;
 const scale=speed/Math.max(.001,Math.hypot(x,y,z));
 return {pos,vel:{x:x*scale,y:y*scale,z:z*scale}};
}
