import type {Vec} from './simulation';

/** Immutable authoritative launch description shared by every dagger in a shot.
 * Clients reproduce the same spread; collisions and homing remain on the host. */
export type ShotLaunch={pos:Vec;muzzles:Vec[];yaw:number;pitch:number;spread:number;aimDistance:number;radius:number|null;camera:boolean;legacyOrigin?:boolean;seed:number;cone?:boolean;focused?:boolean};
export function daggerLaunch(s:ShotLaunch,index:number,u:number,w:number,speed:number){
 // Keep the outer cone intact. II/III have one focused lane, IV has two,
 // maintaining distant damage progression despite IV's slower salvo cadence.
 const focusedLanes=s.focused?(s.muzzles.length>=5?2:1):0;
 const angle=u*Math.PI*2,radialSpread=(index<focusedLanes?Math.min(s.spread,.005):s.spread)*Math.sqrt(w);
 const yaw=s.radius!==null?s.yaw-Math.cos(angle)*radialSpread:s.yaw+(u-.5)*s.spread*2;
 const pitch=s.radius!==null?s.pitch+Math.sin(angle)*radialSpread:s.pitch+(w-.5)*s.spread*2;
 const pos={...s.muzzles[index%s.muzzles.length]},target={x:s.pos.x-Math.sin(yaw)*Math.cos(pitch)*s.aimDistance,y:s.pos.y+Math.sin(pitch)*s.aimDistance,z:s.pos.z-Math.cos(yaw)*Math.cos(pitch)*s.aimDistance};
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
