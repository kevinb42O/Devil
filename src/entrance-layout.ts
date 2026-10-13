/** World units are meters. The seal is exactly seven meters ahead of spawn. */
export const ENTRANCE_SPAWN={x:0,y:1.7,z:0};
export const ENTRANCE_SEAL={x:0,y:1.7,z:-7};
export const ENTRANCE_PLATFORM={width:12.4,depth:17.36,centerZ:-3};
export function entranceFloor(x:number,z:number){return Math.abs(x)<=ENTRANCE_PLATFORM.width/2&&Math.abs(z-ENTRANCE_PLATFORM.centerZ)<=ENTRANCE_PLATFORM.depth/2?0:-1000;}
export function touchesEntranceSeal(pos:{x:number;y:number;z:number}){return Math.hypot(pos.x-ENTRANCE_SEAL.x,pos.z-ENTRANCE_SEAL.z)<=.65&&Math.abs(pos.y-ENTRANCE_SEAL.y)<1.5;}
