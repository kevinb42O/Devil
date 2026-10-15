import {handIndex} from './weapon-levels';
/** Sockets measured from the original hand meshes, in their OBJ local coordinates. */
export const HAND_POSE={x:-.028,y:-.16,z:-.36,rotationX:1.8,rotationY:Math.PI,screenScale:16/9} as const;
const ORIGINAL_HAND_SOCKETS=[
 [{x:.0046,y:-.1962,z:.0135}],
 [{x:.0036,y:-.1961,z:.0305},{x:-.0306,y:-.1871,z:.0232}],
 [{x:.0011,y:-.199,z:.0338},{x:-.0405,y:-.1835,z:.0232},{x:.0475,y:-.1836,z:.022}],
 [{x:.0013,y:-.1895,z:.0638},{x:-.0422,y:-.1805,z:.0502},{x:.0412,y:-.1779,z:.0459},{x:-.0728,y:-.1388,z:.0188},{x:.069,y:-.1224,z:-.0184}],
] as const;
type Point={x:number;y:number;z:number};
// Interleaved right/left sockets: parity is the hand, floor(index/2) the finger.
const twinSockets=ORIGINAL_HAND_SOCKETS[3].flatMap(p=>[{...p},{x:-p.x,y:p.y,z:p.z}]);
export const HAND_SOCKETS:readonly (readonly Point[])[]=[...ORIGINAL_HAND_SOCKETS,twinSockets,twinSockets,twinSockets];
const sin=Math.sin(HAND_POSE.rotationX),cos=Math.cos(HAND_POSE.rotationX);
// Rx(1.8) * Ry(pi), followed by the shared camera-local hand projection scale.
export const HAND_TIP_MUZZLES=ORIGINAL_HAND_SOCKETS.map(sockets=>sockets.map(p=>({
 x:(HAND_POSE.x-p.x)*HAND_POSE.screenScale,
 y:(HAND_POSE.y+cos*p.y+sin*p.z)*HAND_POSE.screenScale,
 z:HAND_POSE.z+sin*p.y-cos*p.z,
})));
/** Pull the launch sockets beneath the palm, preserving a small socket fan.
 * Camera-local metres: down 7 cm, back 10 cm, with 15% of fingertip spacing.
 */
export const HAND_EMITTER_PLACEMENT={drop:.07,retract:.1,socketWidth:.15} as const;
const palmX=HAND_POSE.x*HAND_POSE.screenScale;
export const HAND_MUZZLES=HAND_TIP_MUZZLES.map(sockets=>sockets.map(p=>({
 x:palmX+(p.x-palmX)*HAND_EMITTER_PLACEMENT.socketWidth,
 y:p.y-HAND_EMITTER_PLACEMENT.drop,z:p.z+HAND_EMITTER_PLACEMENT.retract,
})));
// Fixed gameplay origins are independent of responsive overlay framing.
for(let level=5;level<=7;level++){
 HAND_TIP_MUZZLES.push(twinSockets.map((p,i)=>({x:(i%2?-1:1)*.1-p.x*.15,y:-.27,z:-.5})));
 HAND_MUZZLES.push(twinSockets.map((p,i)=>({x:(i%2?-1:1)*.1-p.x*.15,y:-.27,z:-.5})));
}
export function projectileSocket(level:number,index:number,shotgun=false){return level>=5?(shotgun?index%2:index%10):shotgun?0:index%HAND_MUZZLES[handIndex(level)].length;}
/** Camera basis agrees with the Three YXZ camera, including vertical aim. */
export function weaponMuzzle(eye:Point,yaw:number,pitch:number,level:number,socket=0,legacy=false):Point{
 const sockets=(legacy?HAND_TIP_MUZZLES:HAND_MUZZLES)[handIndex(level)],p=sockets[socket%sockets.length];
 const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
 return {x:eye.x+cy*p.x+sy*sp*p.y+sy*cp*p.z,
  y:eye.y+cp*p.y-sp*p.z,z:eye.z-sy*p.x+cy*sp*p.y+cy*cp*p.z};
}
