/** View-space depth only: immediate impact, a short hold, then damped recovery.
 * The analytic curve never overshoots or adds rotation to the hand or camera. */
export class HandRecoil {
 private age=0;
 private peak=0;
 private recovery=29;
 private hold=.014;
 private fresh=false;
 value=0;
 trigger(kick:number,recovery:number,hold=.014){
  // A stream starting during recovery must not snap a heavy blast forward.
  if(kick<this.value)return;
  this.peak=this.value=kick;this.recovery=recovery;this.hold=hold;this.age=0;this.fresh=true;
 }
 update(dt:number){
  if(this.fresh){this.fresh=false;return;}
  if(!Number.isFinite(dt)||dt<=0)return;
  this.age+=dt;
  const t=Math.max(0,this.age-this.hold)*this.recovery;
  this.value=this.peak*(1+t)*Math.exp(-t);
  if(this.value<.00001)this.value=0;
 }
 clear(){this.age=this.peak=this.value=0;this.fresh=false;}
}
