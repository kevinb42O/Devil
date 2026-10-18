import type {Vec,World} from './simulation';
import {MOVEMENT_MOTION} from './movement-motion';
import {rainAt} from './rain-state';

export const FOOTSTEP_SOUNDS=Array.from({length:12},(_,i)=>`footstep-stone${i+1}`);
export const WET_FOOTSTEP_SOUNDS=Array.from({length:12},(_,i)=>`footstep-wet${i+1}`);
export const ALL_FOOTSTEP_SOUNDS=[...FOOTSTEP_SOUNDS,...WET_FOOTSTEP_SOUNDS];
/** Linear amplitude weights keep the wet transition inside the same peak
 * ceiling as one dry step, even if the two recorded transients coincide. */
export function footstepSurface(time:number,courtyard=false){
 const wet=courtyard?0:rainAt(time).wetness;
 return {dry:1-wet,wet};
}
type Gait={pos:Vec;time:number;distance:number;side:number;grounded:boolean;lastStep:number;lastMotion:number};
export type Footfall={side:number;speed:number};
/** Presentation-only odometer: no network events or gameplay RNG consumption. */
export class FootstepGait{
 private actors=new Map<string,Gait>();
 clear(){this.actors.clear();}
 retain(ids:Set<string>){for(const id of this.actors.keys())if(!ids.has(id))this.actors.delete(id);}
 update(id:string,player:World['player'],time:number,rate=1):Footfall|undefined{
  const old=this.actors.get(id),pos={...player.pos};
  if(!old){this.actors.set(id,{pos,time,distance:0,side:0,grounded:player.grounded,lastStep:-Infinity,lastMotion:time});return;}
  const dt=(time-old.time)*rate,travel=Math.hypot(pos.x-old.pos.x,pos.z-old.pos.z),vertical=Math.abs(pos.y-old.pos.y);
  old.pos=pos;old.time=time;
  // Reject seeks, respawns, tab gaps and network corrections. Never catch up
  // missed steps as a burst after a stalled rendering frame.
  if(dt<=0||dt>.2||travel>Math.max(1.8,dt*23)||vertical>1){old.distance=0;old.grounded=player.grounded;return;}
  const landed=player.grounded&&!old.grounded;old.grounded=player.grounded;
  if(!player.grounded||landed){old.distance=0;if(landed)old.lastStep=time;return;}
  const speed=Math.min(Math.hypot(player.vel.x,player.vel.z),travel/dt);
  if(speed<.65){if(time-old.lastMotion>.2){old.distance=0;}return;}
  old.lastMotion=time;
  // Two contacts per full arm/camera gait cycle. A fixed distance keeps
  // cadence stable through acceleration, frame jitter and network packets.
  const stride=MOVEMENT_MOTION.stride/2;
  old.distance+=travel;
  if(old.distance<stride||(time-old.lastStep)*rate<.17)return;
  old.distance=old.distance%stride;old.lastStep=time;
  const side=old.side;old.side=1-old.side;return {side,speed};
 }
}
