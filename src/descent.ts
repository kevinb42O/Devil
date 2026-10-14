export type SkyMotion='full'|'reduced';
type RGB=readonly [number,number,number];
type Chapter={time:number;name:string;zenith:RGB;haze:RGB;cloud:RGB;coverage:number};

/** Encounter times, independent of frame rate, player life, and renderer age. */
export const DESCENT_CHAPTERS:readonly Chapter[]=Object.freeze([
  {time:0,name:'The Last Sky',zenith:[.018,.023,.032],haze:[.012,.016,.022],cloud:[.045,.048,.052],coverage:.33},
  {time:39,name:'The Cloud Grave',zenith:[.025,.05,.08],haze:[.018,.025,.035],cloud:[.075,.085,.105],coverage:.33},
  {time:114,name:'The Bruised Veil',zenith:[.038,.019,.063],haze:[.018,.011,.026],cloud:[.065,.033,.083],coverage:.40},
  {time:229,name:'The Furnace',zenith:[.027,.009,.015],haze:[.037,.014,.013],cloud:[.088,.029,.018],coverage:.42},
  {time:350,name:'The Cathedral Below',zenith:[.038,.019,.044],haze:[.02,.009,.026],cloud:[.046,.023,.051],coverage:.46},
  {time:442,name:'The Unlit Depth',zenith:[.009,.004,.017],haze:[.004,.002,.008],cloud:[.015,.008,.026],coverage:.49},
]);

export type DescentState={time:number;chapter:number;blend:number;zenith:number[];haze:number[];cloud:number[];coverage:number;daylight:number;opening:number;furnace:number;cathedral:number;crown:number;travel:number;furnaceHeight:number;cathedralRise:number};
export function createDescentState():DescentState {
  return {time:0,chapter:0,blend:0,zenith:[0,0,0],haze:[0,0,0],cloud:[0,0,0],coverage:0,daylight:0,opening:0,furnace:0,cathedral:0,crown:0,travel:0,furnaceHeight:0,cathedralRise:0};
}
const ease=(value:number)=>{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);};

/** Reconstruct at arbitrary replay/practice timestamps; optional output avoids frame allocations. */
export function descentAt(time:number,out=createDescentState()):DescentState {
  const t=Number.isFinite(time)?Math.max(0,time):0;
  let chapter=0;
  for(let i=1;i<DESCENT_CHAPTERS.length;i++)if(t>=DESCENT_CHAPTERS[i].time)chapter=i;
  const current=DESCENT_CHAPTERS[chapter],next=DESCENT_CHAPTERS[Math.min(chapter+1,DESCENT_CHAPTERS.length-1)];
  const blend=current===next?0:ease((t-next.time+18)/18);
  out.time=t;out.chapter=chapter;out.blend=blend;
  for(let i=0;i<3;i++){
    out.zenith[i]=current.zenith[i]+(next.zenith[i]-current.zenith[i])*blend;
    out.haze[i]=current.haze[i]+(next.haze[i]-current.haze[i])*blend;
    out.cloud[i]=current.cloud[i]+(next.cloud[i]-current.cloud[i])*blend;
  }
  out.coverage=current.coverage+(next.coverage-current.coverage)*blend;
  // A little cold fill keeps silhouettes readable beneath the ash ceiling.
  out.daylight=.18*(1-ease((t-21)/18));
  out.opening=ease((t-85)/29)*(1-ease((t-190)/39));
  out.furnace=ease((t-211)/48)*(1-ease((t-386)/56));
  out.cathedral=ease((t-326)/24)*(1-ease((t-410)/32));
  out.crown=ease((t-410)/32);
  // Bounded motion: nothing wraps or returns from above during endless survival.
  out.travel=Math.min(t,442)*.018;
  out.furnaceHeight=.19+.57*ease((t-259)/183);
  out.cathedralRise=.22*ease((t-326)/116);
  return out;
}
