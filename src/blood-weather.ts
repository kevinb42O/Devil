import {COSMIC_INTRO_DURATION,DESCENT_CHAPTERS} from './descent';
const RAMP=18;
const START=COSMIC_INTRO_DURATION+DESCENT_CHAPTERS[1].time-RAMP;
const END=COSMIC_INTRO_DURATION+DESCENT_CHAPTERS[2].time-RAMP;
function integratedRamp(time:number,start:number){
 const x=Math.max(0,Math.min(1,(time-start)/RAMP));
 return RAMP*(x*x*x-.5*x*x*x*x)+Math.max(0,time-start-RAMP);
}
/** Exact integral of the visible rain, in full-strength rain seconds. Remains
 * constant once the storm ends, so washed blood cannot return in later scenes. */
export function bloodRainDose(time:number){const clock=Math.min(END+RAMP,Math.max(0,time));return integratedRamp(clock,START)-integratedRamp(clock,END);}
export function bloodWashRetention(born:number,time:number,rate=.065){
 const retention=Math.exp(-Math.max(0,bloodRainDose(time)-bloodRainDose(born))*rate);
 const x=Math.max(0,Math.min(1,(retention-.006)/.019));
 return retention*x*x*(3-2*x);
}
/** Shared analytic rule for CPU contacts and GPU appearance; no per-frame texture scans. */
export const BLOOD_WEATHER_GLSL=/* glsl */`
float bloodRainRamp(float time,float start){
 float x=clamp((time-start)/${RAMP.toFixed(1)},0.,1.);
 return ${RAMP.toFixed(1)}*(x*x*x-.5*x*x*x*x)+max(0.,time-start-${RAMP.toFixed(1)});
}
float bloodRainDose(float time){float clock=clamp(time,0.,${(END+RAMP).toFixed(1)});return bloodRainRamp(clock,${START.toFixed(1)})-bloodRainRamp(clock,${END.toFixed(1)});}
float bloodWash(float born,float time,float rate){
 float retention=exp(-max(0.,bloodRainDose(time)-bloodRainDose(born))*rate);
 return retention*smoothstep(.006,.025,retention);
}
`;
