/** Sockets measured from the original hand meshes, in their OBJ local coordinates. */
export const HAND_POSE={x:-.028,y:-.16,z:-.36,rotationX:1.8,rotationY:Math.PI,screenScale:16/9} as const;
export const HAND_SOCKETS=[
 [{x:.0046,y:-.1962,z:.0135}],
 [{x:.0036,y:-.1961,z:.0305},{x:-.0306,y:-.1871,z:.0232}],
 [{x:.0011,y:-.199,z:.0338},{x:-.0405,y:-.1835,z:.0232},{x:.0475,y:-.1836,z:.022}],
 [{x:.0013,y:-.1895,z:.0638},{x:-.0422,y:-.1805,z:.0502},{x:.0412,y:-.1779,z:.0459},{x:-.0728,y:-.1388,z:.0188},{x:.069,y:-.1224,z:-.0184}],
] as const;
type Point={x:number;y:number;z:number};
const sin=Math.sin(HAND_POSE.rotationX),cos=Math.cos(HAND_POSE.rotationX);
// Rx(1.8) * Ry(pi), followed by the shared camera-local hand projection scale.
export const HAND_MUZZLES=HAND_SOCKETS.map(sockets=>sockets.map(p=>({
 x:(HAND_POSE.x-p.x)*HAND_POSE.screenScale,
 y:(HAND_POSE.y+cos*p.y+sin*p.z)*HAND_POSE.screenScale,
 z:HAND_POSE.z+sin*p.y-cos*p.z,
})));
/** Camera basis agrees with the Three YXZ camera, including vertical aim. */
export function weaponMuzzle(eye:Point,yaw:number,pitch:number,level:number,socket=0):Point{
 const sockets=HAND_MUZZLES[Math.max(0,Math.min(3,level-1))],p=sockets[socket%sockets.length];
 const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
 return {x:eye.x+cy*p.x+sy*sp*p.y+sy*cp*p.z,
  y:eye.y+cp*p.y-sp*p.z,z:eye.z-sy*p.x+cy*sp*p.y+cy*cp*p.z};
}
