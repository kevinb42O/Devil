export const COSMIC_INTRO_DURATION=30;
export const ESCAPE_START=482,ESCAPE_SPACE=490,BEYOND_START=492,BEYOND_END=498;
// Twelve seconds beyond the last star, then a fresh descent. Match time never wraps.
export const ENVIRONMENT_CYCLE=510;
export const environmentClock=(time:number)=>((Number.isFinite(time)?Math.max(0,time):0)%ENVIRONMENT_CYCLE);
export const environmentTime=(time:number)=>Math.max(0,environmentClock(time)-COSMIC_INTRO_DURATION);

export type SkyMotion='full'|'reduced';
type RGB=readonly [number,number,number];
type Chapter={time:number;name:string;zenith:RGB;haze:RGB;cloud:RGB;coverage:number};

/** Original environment offsets; presentation adds the intro without moving encounters. */
export const DESCENT_CHAPTERS:readonly Chapter[]=Object.freeze([
  {time:0,name:'The Last Sky',zenith:[.018,.023,.032],haze:[.012,.016,.022],cloud:[.045,.048,.052],coverage:.33},
  {time:39,name:'The Cloud Grave',zenith:[.025,.05,.08],haze:[.018,.025,.035],cloud:[.075,.085,.105],coverage:.33},
  {time:114,name:'The Bruised Veil',zenith:[.038,.019,.063],haze:[.018,.011,.026],cloud:[.065,.033,.083],coverage:.40},
  {time:229,name:'The Furnace',zenith:[.027,.009,.015],haze:[.037,.014,.013],cloud:[.088,.029,.018],coverage:.42},
  {time:350,name:'The Cathedral Below',zenith:[.038,.019,.044],haze:[.02,.009,.026],cloud:[.046,.023,.051],coverage:.46},
  {time:442,name:'The Unlit Depth',zenith:[.009,.004,.017],haze:[.004,.002,.008],cloud:[.015,.008,.026],coverage:.49},
]);

export type DescentState={time:number;phaseTime:number;cycle:number;environmentTime:number;cosmic:number;cosmicTravel:number;escape:number;beyond:number;chapter:number;blend:number;zenith:number[];haze:number[];cloud:number[];coverage:number;daylight:number;opening:number;furnace:number;cathedral:number;crown:number;travel:number;furnaceHeight:number;cathedralRise:number};
export function createDescentState():DescentState {
  return {time:0,phaseTime:0,cycle:0,environmentTime:0,cosmic:0,cosmicTravel:0,escape:0,beyond:0,chapter:0,blend:0,zenith:[0,0,0],haze:[0,0,0],cloud:[0,0,0],coverage:0,daylight:0,opening:0,furnace:0,cathedral:0,crown:0,travel:0,furnaceHeight:0,cathedralRise:0};
}
const ease=(value:number)=>{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);};

/** Reconstruct at arbitrary replay/practice timestamps; optional output avoids frame allocations. */
export function descentAt(time:number,out=createDescentState()):DescentState {
  const matchTime=Number.isFinite(time)?Math.max(0,time):0,clock=environmentClock(matchTime),t=environmentTime(matchTime);
  const cycle=Math.floor(matchTime/ENVIRONMENT_CYCLE),returning=cycle>0?1-ease(clock/18):0;
  let chapter=0;
  for(let i=1;i<DESCENT_CHAPTERS.length;i++)if(t>=DESCENT_CHAPTERS[i].time)chapter=i;
  const current=DESCENT_CHAPTERS[chapter],next=DESCENT_CHAPTERS[Math.min(chapter+1,DESCENT_CHAPTERS.length-1)];
  const blend=current===next?0:ease((t-next.time+18)/18);
  out.escape=Math.max(returning,ease((clock-ESCAPE_START)/(ESCAPE_SPACE-ESCAPE_START)));
  out.beyond=Math.max(returning,ease((clock-BEYOND_START)/(BEYOND_END-BEYOND_START)));
  out.time=matchTime;out.phaseTime=clock;out.cycle=cycle;out.environmentTime=t;out.cosmic=1-ease((clock-21)/9);out.cosmicTravel=ease(clock/30);out.cosmic=Math.max(out.cosmic,ease((clock-486)/4)*(1-out.beyond));out.cosmic*=1-returning;out.chapter=chapter;out.blend=blend;
  for(let i=0;i<3;i++){
    out.zenith[i]=current.zenith[i]+(next.zenith[i]-current.zenith[i])*blend;
    out.haze[i]=current.haze[i]+(next.haze[i]-current.haze[i])*blend;
    out.cloud[i]=current.cloud[i]+(next.cloud[i]-current.cloud[i])*blend;
  }
  out.coverage=current.coverage+(next.coverage-current.coverage)*blend;
  // A little cold fill keeps silhouettes readable beneath the ash ceiling.
  out.daylight=.18*(1-ease((t-21)/18))*(1-out.beyond);
  out.opening=ease((t-85)/29)*(1-ease((t-190)/39));
  out.furnace=ease((t-211)/48)*(1-ease((t-386)/56));
  out.cathedral=ease((t-326)/24)*(1-ease((t-410)/32));
  out.crown=ease((t-410)/32);
  // Each descent retraces the same scenery; wrapping happens in the luminous hold.
  out.travel=Math.min(t,442)*.018;
  out.furnaceHeight=.19+.57*ease((t-259)/183);
  out.cathedralRise=.22*ease((t-326)/116);
  return out;
}
