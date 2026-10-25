/** Native recordings use Web Audio's ordinary inverse-distance defaults.
 * The preserved footsteps retain their existing near-field profile. */
export type HearingProfile={refDistance:number;maxDistance:number};
export function hearingProfile(_name:string,role?:string):HearingProfile{
 return role==='footstep'?{refDistance:2,maxDistance:20}:{refDistance:1,maxDistance:10000};
}
/** Used only by the preserved footstep path, including existing remote voices. */
export function distanceEnvelope(distance:number,maxDistance:number){
 if(!Number.isFinite(distance)||distance>=maxDistance)return 0;
 const t=Math.max(0,Math.min(1,(distance-maxDistance*.5)/(maxDistance*.5)));
 return 1-t*t*(3-2*t);
}
