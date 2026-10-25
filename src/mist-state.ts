import {createDescentState,descentAt,DESCENT_CHAPTERS} from './descent';

type MistChapter={density:number;height:number;falloff:number;bank:number;smoke:number;shafts:number;clear:number;color:readonly number[]};
// Chapter endpoints use the sky's exact transition windows. Density is extinction per meter.
const CHAPTERS:readonly MistChapter[]=[
  {density:.16,height:3.8,falloff:1.25,bank:0,smoke:0,shafts:0,clear:0,color:[.11,.14,.17]},
  {density:.13,height:13,falloff:.12,bank:1,smoke:0,shafts:0,clear:1,color:[.095,.135,.18]},
  {density:.055,height:9,falloff:.22,bank:1,smoke:0,shafts:0,clear:1,color:[.052,.041,.078]},
  {density:.065,height:12,falloff:.38,bank:.25,smoke:1,shafts:0,clear:1,color:[.10,.027,.012]},
  {density:.065,height:22,falloff:.095,bank:.22,smoke:0,shafts:1,clear:1,color:[.040,.033,.061]},
  {density:.065,height:10,falloff:.2,bank:.65,smoke:0,shafts:0,clear:1,color:[.003,.002,.007]},
];
const COSMIC_COLOR=[.11,.085,.155] as const;
export function createMistState(){return {time:0,environmentTime:0,cosmic:0,chapter:0,blend:0,density:0,height:0,falloff:0,bank:0,smoke:0,shafts:0,clear:0,pulse:1,color:[0,0,0]};}
export type MistState=ReturnType<typeof createMistState>;
const ease=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
/** Stateless sampling makes practice skips, replay seeks and pause agree with the sky. */
export function mistAt(time:number,reduced=false,out=createMistState(),sky=createDescentState()):MistState{
  const s=descentAt(time,sky),a=CHAPTERS[s.chapter],b=CHAPTERS[Math.min(s.chapter+1,CHAPTERS.length-1)];
  const blend=s.blend,t=s.environmentTime;
  out.time=s.time;out.environmentTime=t;out.cosmic=s.cosmic;out.chapter=s.chapter;out.blend=blend;
  for(const key of ['density','height','falloff','bank','smoke','shafts','clear'] as const)out[key]=a[key]+(b[key]-a[key])*blend;
  for(let i=0;i<3;i++)out.color[i]=a.color[i]+(b.color[i]-a.color[i])*blend;
  // The opening still exhales before the cloud layer arrives from 21–39s.
  if(s.chapter===0)out.density=.16*(1-ease((t-8)/22))*(1-blend)+b.density*blend;
  // Gentle breathing, rather than random full-screen visibility changes.
  out.pulse=reduced?1:.78+.22*(.5+.5*Math.sin((t-39)*Math.PI*2/26));
  if(s.cosmic>0){
    const c=s.cosmic;
    out.density+=(.035-out.density)*c;
    out.height+=(34-out.height)*c;out.falloff+=(.025-out.falloff)*c;
    out.clear+=(1-out.clear)*c;
    for(let i=0;i<3;i++)out.color[i]+=(COSMIC_COLOR[i]-out.color[i])*c;
    out.pulse+=(1-out.pulse)*c;
  }
  // The launch clears the black fog; the far side has a thin sunlit haze.
  if(s.escape>0){
    out.density+=(.008-out.density)*s.escape;
    out.height+=(34-out.height)*s.escape;out.falloff+=(.025-out.falloff)*s.escape;out.clear+=(1-out.clear)*s.escape;
    out.smoke*=1-s.escape;out.shafts*=1-s.escape;out.bank*=1-s.escape;out.pulse+=(1-out.pulse)*s.escape;
    for(let i=0;i<3;i++)out.color[i]+=([.46,.39,.27][i]-out.color[i])*s.beyond;
  }
  return out;
}
export const mistChapterName=(state:MistState)=>state.cosmic>.5?'The Cosmic Expanse':DESCENT_CHAPTERS[state.chapter].name;
