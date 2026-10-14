import {HAND_MUZZLES,weaponMuzzle} from './weapon-origin';
import type {ShotLaunch} from './projectile-launch';

/** Hand sockets are shared game data. Transmit their transform and mode once,
 * rather than repeating five world-space muzzle positions for every shot. */
export function packShotLaunch(s:ShotLaunch,level:number):number[]|null{
 const row=[s.pos.x,s.pos.y,s.pos.z,s.yaw,s.pitch,s.spread,s.aimDistance,s.radius??-1,(s.camera?2:s.legacyOrigin?1:0)|(s.focused?4:0)|(s.cone?8:0),s.seed];
 const decoded=unpackShotLaunch(row,level);
 if(decoded.muzzles.length!==s.muzzles.length||s.muzzles.some((p,i)=>Math.hypot(p.x-decoded.muzzles[i].x,p.y-decoded.muzzles[i].y,p.z-decoded.muzzles[i].z)>1e-10))return null;
 return row;
}
export function unpackShotLaunch(row:number[],level:number):ShotLaunch{
 if(!Array.isArray(row)||row.length!==10||row.some(n=>!Number.isFinite(n))||!Number.isInteger(level)||level<1||level>4||row[5]<0||row[6]<=0||row[7]<-1||!Number.isInteger(row[8])||row[8]<0||row[8]>14||(row[8]&3)===3||!Number.isInteger(row[9]))throw Error('Invalid shot transform');
 const [x,y,z,yaw,pitch,spread,aimDistance,radius,mode,seed]=row,pos={x,y,z};
 const baseMode=mode&3;
 const muzzles=baseMode===2?[{...pos}]:HAND_MUZZLES[level-1].map((_,i)=>weaponMuzzle(pos,yaw,pitch,level,i,baseMode===1));
 return {pos,muzzles,yaw,pitch,spread,aimDistance,radius:radius===-1?null:radius,camera:baseMode===2,legacyOrigin:baseMode===1,cone:!!(mode&8),focused:!!(mode&4),seed};
}
