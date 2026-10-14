import {STEP} from './simulation';

/** Both render frames and worker messages use one clock: a wake-up can never
 * simulate the same elapsed time twice. Suspend/resume work stays bounded. */
export class CrewClock {
 private last:number|null=null;private accumulated=0;
 reset(){this.last=null;this.accumulated=0;}
 advance(now:number,step:()=>void){
  if(this.last===null){this.last=now;return;}
  if(now<=this.last)return;
  this.accumulated+=Math.max(0,Math.min(.25,(now-this.last)/1000));this.last=now;
  let ticks=0;while(this.accumulated+1e-10>=STEP&&ticks++<30){this.accumulated-=STEP;step();}
 }
 get alpha(){return Math.max(0,Math.min(1,this.accumulated/STEP));}
}
