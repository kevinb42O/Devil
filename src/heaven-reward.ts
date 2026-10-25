import {BEYOND_END,ENVIRONMENT_CYCLE} from './descent';

export const HEAVEN_GEMS=50,HEAVEN_RAIN_DURATION=2.5;
/** Scheduled drops crossed by this simulation tick. No mutable claim counter or RNG. */
export function heavenDropsBetween(before:number,after:number):{cycle:number;index:number}[]{
 const drops:{cycle:number;index:number}[]=[];
 if(!Number.isFinite(before)||!Number.isFinite(after)||after<=before)return drops;
 for(let cycle=Math.max(0,Math.floor((before-BEYOND_END-HEAVEN_RAIN_DURATION)/ENVIRONMENT_CYCLE));cycle<=Math.floor(after/ENVIRONMENT_CYCLE);cycle++){
  const start=cycle*ENVIRONMENT_CYCLE+BEYOND_END;
  if(after+1e-7<start||before>=start+HEAVEN_RAIN_DURATION)continue;
  for(let index=0;index<HEAVEN_GEMS;index++){
   const at=start+index*HEAVEN_RAIN_DURATION/HEAVEN_GEMS;
   if(at>before+1e-7&&at<=after+1e-7)drops.push({cycle,index});
  }
 }
 return drops;
}
