/** World units are meters. The seal is exactly seven meters ahead of spawn. */
export const ENTRANCE_SPAWN={x:0,y:1.7,z:0};
export const ENTRANCE_SEAL={x:0,y:1.7,z:-7};
export const ENTRANCE_PLATFORM={width:17.36,depth:27.28,centerZ:-3,columns:7,rows:11};
export const ENTRANCE_COURTYARD={halfWidth:6.3,frontZ:-6.35,backZ:10.5};
export function entranceFloor(x:number,z:number){return Math.abs(x)<=ENTRANCE_PLATFORM.width/2&&Math.abs(z-ENTRANCE_PLATFORM.centerZ)<=ENTRANCE_PLATFORM.depth/2?0:-1000;}
// Match the visible 3m seal plus the player's footprint. Eye-height bounds
// include a normal jump through the opening, without catching falls below it.
export const ENTRANCE_OPENING={halfWidth:1.7,halfDepth:.8,minEyeY:.2,maxEyeY:4.4};
type EntrancePosition={x:number;y:number;z:number};
export function touchesEntranceSeal(pos:EntrancePosition,previous:EntrancePosition=pos){
 let enter=0,exit=1;
 for(const [axis,min,max] of [
  ['x',ENTRANCE_SEAL.x-ENTRANCE_OPENING.halfWidth,ENTRANCE_SEAL.x+ENTRANCE_OPENING.halfWidth],
  ['y',ENTRANCE_OPENING.minEyeY,ENTRANCE_OPENING.maxEyeY],
  ['z',ENTRANCE_SEAL.z-ENTRANCE_OPENING.halfDepth,ENTRANCE_SEAL.z+ENTRANCE_OPENING.halfDepth],
 ] as const){
  const delta=pos[axis]-previous[axis];
  if(Math.abs(delta)<1e-10){if(previous[axis]<min||previous[axis]>max)return false;continue;}
  const a=(min-previous[axis])/delta,b=(max-previous[axis])/delta;
  enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  if(enter>exit)return false;
 }
 return true;
}
