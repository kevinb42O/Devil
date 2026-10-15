/** One firing budget for both hands. Thresholds use lifetime collected gems. */
export const HAND_THRESHOLDS=[0,10,70,200,350,550,800] as const;
export const HAND_LABELS=['I','II','III','IV','V','VI','VII'] as const;
export const HAND_NAMES=['AWAKENED','KINDLED','ASCENDANT','UNBOUND','TWINFLAME','DOMINION','ECLIPSE'] as const;
export const STREAM_COUNTS=[1,2,4,8,10,12,14] as const;
export const BURST_COUNTS=[10,20,40,60,72,84,96] as const;
export const COMBAT_REVISION=20;
export function handIndex(level:number){return Math.max(0,Math.min(6,Math.round(level)-1));}
export function collectedLevel(gems:number,max=7){let level=1;while(level<max&&gems>=HAND_THRESHOLDS[level])level++;return level;}
export function handProgress(level:number,gems:number){const i=handIndex(level);return i===6?1:Math.max(0,Math.min(1,(gems-HAND_THRESHOLDS[i])/(HAND_THRESHOLDS[i+1]-HAND_THRESHOLDS[i])));}
/** Native hand4left geometry is already mirrored. Positive scale on both sides. */
export const TWIN_POSE={spacing:.125,scale:.94,y:-.16,z:-.36} as const;
export const TWIN_COLORS=[[1,.16,.045],[1,.025,.22],[.64,.32,1]] as const;
