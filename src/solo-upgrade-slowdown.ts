/** Real-time envelope; fixed simulation ticks and recorded inputs stay unchanged. */
export const SOLO_UPGRADE_SLOWDOWN={duration:.65,hold:.12,minimum:.35} as const;
export class SoloUpgradeSlowdown {
 private age:number=SOLO_UPGRADE_SLOWDOWN.duration;
 begin(){this.age=0;}
 clear(){this.age=SOLO_UPGRADE_SLOWDOWN.duration;}
 get rate(){const t=SOLO_UPGRADE_SLOWDOWN,u=Math.max(0,Math.min(1,(this.age-t.hold)/(t.duration-t.hold)));return t.minimum+(1-t.minimum)*u*u*(3-2*u);}
 /** Integral of the rate curve: equal wall time admits equal simulation time. */
 private integral(age:number){
  const t=SOLO_UPGRADE_SLOWDOWN,a=Math.max(0,Math.min(t.duration,age)),recovery=t.duration-t.hold;
  const u=Math.max(0,(a-t.hold)/recovery);
  return t.minimum*a+(1-t.minimum)*recovery*(u**3-.5*u**4)+Math.max(0,age-t.duration);
 }
 advance(realSeconds:number){
  const dt=Number.isFinite(realSeconds)?Math.max(0,realSeconds):0,before=this.age;
  this.age=Math.min(SOLO_UPGRADE_SLOWDOWN.duration,this.age+dt);
  return this.integral(before+dt)-this.integral(before);
 }
}
