import {ascentAt,createAscentState} from './ascent-state';
import {feedbackIntensity} from './camera-feedback-tuning';

export const ASCENT_RUMBLE={maxOffset:.60,launchLoad:.65,sustained:.26} as const;
/** Camera translation only: acceleration loads the view downward, with layered
 * chassis vibration. Absolute match time keeps pause and replay seeks exact. */
export class AscentRumble {
 readonly offset={x:0,y:0,z:0};
 private intensity=feedbackIntensity(undefined)/100;private reduced=false;
 private state=createAscentState();
 configure(value:unknown,reduced=false){this.intensity=feedbackIntensity(value)/100;this.reduced=reduced;this.clear();}
 clear(){this.offset.x=this.offset.y=this.offset.z=0;}
 sample(time:number,enabled=true){
  const out=this.offset;this.clear();
  if(!enabled||this.reduced||!this.intensity)return out;
  const s=ascentAt(time,this.state);if(s.amount===0&&s.charge===0&&s.shock===0)return out;
  const t=s.phase-482,tau=Math.PI*2;
  const engine=s.amount*(.65+.35*Math.min(1,s.speed/158));
  const charge=s.charge*.5;
  // Low structural wobble plus fine vibration, rather than independent random kicks.
  const low=Math.sin(t*tau*3.7),fine=Math.sin(t*tau*10.9+.7);
  const body=(low*.68+fine*.32)*ASCENT_RUMBLE.sustained;
  const recoil=t>=0?Math.exp(-t*5)*Math.sin(t*19)*.18:0;
  // Intermittent structural knocks keep the sustained climb violent rather
  // than reading as a gentle periodic engine hum.
  const knocks=t>=0?Math.pow(Math.max(0,Math.sin(t*tau*2.3+.3)),8)*Math.sin(t*38)*.15*engine:0;
  out.x=(Math.sin(t*tau*5.3+.4)*.11+Math.sin(t*tau*12.1)*.045)*(engine+charge)*this.intensity;
  out.y=(body*(engine+charge)-s.shock*ASCENT_RUMBLE.launchLoad+recoil+knocks)*this.intensity;
  out.z=(Math.sin(t*tau*4.1+1.2)*.12*(engine+charge)+s.shock*.14)*this.intensity;
  const length=Math.hypot(out.x,out.y,out.z),limit=ASCENT_RUMBLE.maxOffset*this.intensity;
  if(length>limit){const scale=limit/length;out.x*=scale;out.y*=scale;out.z*=scale;}
  return out;
 }
 get diagnostics(){return {intensity:this.intensity*100,reduced:this.reduced,offset:{...this.offset}};}
}
