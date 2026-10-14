/** Shared by the fixed-step combat wave and its floor lighting. */
export const UPGRADE_PULSE={duration:1.45,startRadius:.85,speed:10,verticalReach:6,damage:[0,0,5,10,20]} as const;
export function upgradePulseRadius(age:number){return UPGRADE_PULSE.startRadius+Math.min(UPGRADE_PULSE.duration,Math.max(0,age))*UPGRADE_PULSE.speed;}
