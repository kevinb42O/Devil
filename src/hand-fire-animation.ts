/** Stream events sustain a dim, smoothly blended glow. A blast has its own
 * envelope so a following stream cannot cut it off. */
export class HandFireAnimation {
 level=1;
 private streamGlow=0;
 private stream=0;
 private blast=0;
 private freshStream=false;
 private freshBlast=false;
 get remaining(){return Math.max(this.stream,this.blast);}
 get power(){
  const pulse=this.blast>0?Math.pow(this.blast/.18,1.5):0;
  return Math.max(pulse,this.streamGlow);
 }
 trigger(level:number,burst:boolean){
  if(this.level!==level)this.clear();
  this.level=level;
  if(burst){this.blast=.18;this.freshBlast=true;}
  else {this.stream=.12;this.freshStream=true;}
 }
 update(dt:number){
  if(!Number.isFinite(dt)||dt<0)return;
  // Integrate both sides of expiry so fading is consistent across frame rates.
  // Repeated shots only extend the hold; they never restart or pulse the glow.
  const active=this.freshStream?dt:Math.min(dt,this.stream);
  if(active>0)this.streamGlow=.18+(this.streamGlow-.18)*Math.exp(-24*active);
  this.streamGlow*=Math.exp(-20*(dt-active));
  if(this.streamGlow<.0001)this.streamGlow=0;
  // Preserve a newly arrived shot for one rendered frame after a stall.
  if(!this.freshStream)this.stream=Math.max(0,this.stream-dt);
  if(!this.freshBlast)this.blast=Math.max(0,this.blast-dt);
  this.freshStream=this.freshBlast=false;
 }
 clear(){this.streamGlow=this.stream=this.blast=0;this.freshStream=this.freshBlast=false;}
}
