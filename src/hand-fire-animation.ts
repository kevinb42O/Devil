/** Presentation clock: stream events keep a flicker alive without restarting its
 * phase. A blast has its own envelope so a following stream cannot cut it off. */
export class HandFireAnimation {
 level=1;
 private phase=0;
 private stream=0;
 private blast=0;
 private freshStream=false;
 private freshBlast=false;
 private start=false;
 get remaining(){return Math.max(this.stream,this.blast);}
 get power(){
  const pulse=this.blast>0?Math.pow(this.blast/.18,1.5):0;
  const flicker=this.stream>0&&this.phase%.11<.045?1:0;
  return Math.max(pulse,flicker);
 }
 trigger(level:number,burst:boolean){
  if(this.level!==level)this.clear();
  this.level=level;
  if(burst){this.blast=.18;this.freshBlast=true;}
  else {if(this.stream<=0){this.phase=0;this.start=true;}this.stream=.12;this.freshStream=true;}
 }
 update(dt:number){
  if(!Number.isFinite(dt)||dt<0)return;
  if(!this.start)this.phase+=dt;
  this.start=false;
  // Preserve a newly arrived shot for one rendered frame after a stall.
  if(!this.freshStream)this.stream=Math.max(0,this.stream-dt);
  if(!this.freshBlast)this.blast=Math.max(0,this.blast-dt);
  this.freshStream=this.freshBlast=false;
 }
 clear(){this.phase=this.stream=this.blast=0;this.freshStream=this.freshBlast=this.start=false;}
}
