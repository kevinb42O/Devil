/** World-space hearing distances, in arena units. The panner supplies HRTF and
 * inverse attenuation; a separate envelope guarantees silence at the boundary. */
export type HearingProfile={refDistance:number;maxDistance:number};
const chatterRanges:Readonly<Record<string,number>>={
 chatterskull:28,chatterskull2:32,chatterskull3:36,chatterskull4:40,
 chatterskullblack:28,chatterskull2black:32,chatterskull3black:36,chatterskull4black:40,
 chatterminisquid:40,chattersquid:48,chattersquidultra:56,chatterspider:32,chattergigaspider:44,
 chatterspiderling:22,chattercentipede:48,chattercentipede2:56,chatterultrapede:56,
 chatterleviathan:64,eyearousedrone:36,chatterthorn:30,eggdrone:22,eggdrone2:26,
 subchattercentipede:24,eyepacifydrone:36,
};
// The recorded chatter bank is calibrated during mastering. Keep this public
// hook for authored exceptions without reapplying trims from the retired bank.
export const CHATTER_TRIM:Readonly<Record<string,number>>=Object.fromEntries(Object.keys(chatterRanges).map(name=>[name,1]));
export function hearingProfile(name:string,role?:string):HearingProfile{
 if(role==='crystal-hit'||role==='crystal-break')return {refDistance:4,maxDistance:32};
 if(chatterRanges[name])return {refDistance:3,maxDistance:chatterRanges[name]};
 if(role==='gem-chatter')return {refDistance:2,maxDistance:18};
 if(role==='homing-flight')return {refDistance:2,maxDistance:26};
 if(role==='movement'||role==='ricochet'||role==='armor-impact'||role==='pickup')return {refDistance:2,maxDistance:24};
 if(role==='ambience')return {refDistance:3,maxDistance:40};
 if(role==='explosion'||role==='enemy-spawn'||role==='enemy-death'||role==='player-death')return {refDistance:4,maxDistance:56};
 return {refDistance:3,maxDistance:40};
}
export function distanceEnvelope(distance:number,maxDistance:number){
 if(!Number.isFinite(distance)||distance>=maxDistance)return 0;
 const t=Math.max(0,Math.min(1,(distance-maxDistance*.5)/(maxDistance*.5)));
 return 1-t*t*(3-2*t);
}
