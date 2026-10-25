import {BURST_COUNTS} from './weapon-levels';
import {HAND_MUZZLES,weaponMuzzle} from './weapon-origin';
import type {ShotLaunch} from './projectile-launch';

/** Hand sockets are shared game data. Transmit their transform and mode once,
 * rather than repeating five world-space muzzle positions for every shot. */
export function packShotLaunch(s:ShotLaunch,level:number):number[]|null{
 // Dual hands only support the current physical origins. Unsupported custom
 // descriptions must use full corrections instead of changing shape on decode.
 if(!!s.dual!==(level>=5&&s.hand===undefined)||level>=5&&(s.camera||s.legacyOrigin))return null;
 const row=[s.pos.x,s.pos.y,s.pos.z,s.yaw,s.pitch,s.spread,s.aimDistance,s.radius??-1,(s.camera?2:s.legacyOrigin?1:0)|(s.focused?4:0)|(s.cone?8:0)|(s.hand===undefined?0:16|(s.hand===1?32:0)),s.seed];
 if(s.shotgunCount)row.push(s.shotgunCount);
 const decoded=unpackShotLaunch(row,level);
 if(decoded.muzzles.length!==s.muzzles.length||s.muzzles.some((p,i)=>Math.hypot(p.x-decoded.muzzles[i].x,p.y-decoded.muzzles[i].y,p.z-decoded.muzzles[i].z)>1e-10))return null;
 return row;
}
export function unpackShotLaunch(row:number[],level:number):ShotLaunch{
 if(!Array.isArray(row)||(row.length!==10&&row.length!==11)||row.some(n=>!Number.isFinite(n))||!Number.isInteger(level)||level<1||level>7||row[5]<0||row[6]<=0||row[7]<-1||!Number.isInteger(row[8])||row[8]<0||row[8]>62||(row[8]&3)===3||!Number.isInteger(row[9]))throw Error('Invalid shot transform');
 if(level>=5&&(row[8]&3)!==0)throw Error('Invalid dual shot origin');
 if(row.length===11&&(!Number.isInteger(row[10])||row[10]<1||row[10]>BURST_COUNTS[level-1]||(row[8]&15)!==8||row[7]<0))throw Error('Invalid shotgun pattern');
 const [x,y,z,yaw,pitch,spread,aimDistance,radius,mode,seed]=row,pos={x,y,z};
 const baseMode=mode&3,hand=mode&16?(mode&32?1:0):undefined;
 if(mode&32&&hand===undefined)throw Error('Invalid shot hand');
 let muzzles=baseMode===2?[{...pos}]:HAND_MUZZLES[level-1].map((_,i)=>weaponMuzzle(pos,yaw,pitch,level,i,baseMode===1));
 if(hand!==undefined&&level>=5)muzzles=muzzles.filter((_,i)=>i%2===hand);
 if(row.length===11)muzzles=level>=5&&hand===undefined?[muzzles[0],muzzles[1]]:[muzzles[0]];
 return {...(hand===undefined?{}:{hand}),...(level>=5&&hand===undefined?{dual:true}:{}),...(row.length===11?{shotgunCount:row[10]}:{}),pos,muzzles,yaw,pitch,spread,aimDistance,radius:radius===-1?null:radius,camera:baseMode===2,legacyOrigin:baseMode===1,cone:!!(mode&8),focused:!!(mode&4),seed};
}
