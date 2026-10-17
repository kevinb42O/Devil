import {CREW_COUNTDOWN_SECONDS,CREW_COUNTDOWN_MS} from './crew-arrival-timing';
/** Presentation follows the host's start gate; it never owns the simulation clock. */
export class CrewArrival {
 readonly element:HTMLElement;
 private value:HTMLElement;
 private detail:HTMLElement;
 private epoch:number|null=null;
 private beat=-1;
 private deadline=0;
 private releasedAt:number|null=null;
 private orbitElement:HTMLElement;
 private orbit:Animation|null=null;
 private pulse:Animation|null=null;
 private release:Animation|null=null;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private cue:(beat:number,remainingMs:number)=>void){
  this.element=document.createElement('div');this.element.id='crew-arrival';this.element.hidden=true;
  this.element.innerHTML='<div class="arrival-vignette"></div><div class="arrival-sigil" aria-hidden="true"><i></i><i></i><i></i></div><div class="arrival-copy"><p class="arrival-eyebrow">THE SEAL IS BROKEN</p><div class="arrival-value" role="status" aria-live="polite" aria-atomic="true"></div><p class="arrival-detail"></p><div class="arrival-beats" aria-hidden="true"><i></i><i></i><i></i></div></div>';
  this.orbitElement=this.element.querySelector('.arrival-sigil>i:nth-child(3)')!;
  this.value=this.element.querySelector('.arrival-value')!;this.detail=this.element.querySelector('.arrival-detail')!;
  document.body.append(this.element);
 }
 reset(){
  if(!this.element.hidden)this.element.hidden=true;
  this.orbit?.cancel();this.pulse?.cancel();this.release?.cancel();
  this.orbit=this.pulse=this.release=null;
  this.epoch=null;this.beat=-1;this.releasedAt=null;
 }
 update(epoch:number,startAt:number,now:number,players:number){
  if(this.epoch!==epoch){
   this.reset();this.epoch=epoch;this.deadline=startAt;
   // Joining a run already in progress must not replay its arrival.
   if(!startAt||now>startAt+800){this.beat=0;return;}
  }
  if(this.beat===0&&this.releasedAt===null)return;
  // Guests clear startAt as soon as survival advances; retain the gate for its release.
  if(startAt)this.deadline=startAt;
  const remaining=this.deadline-now;
  // Schedule the voice during the silent settling second. Its first sample
  // and the visual three both begin at the same countdown boundary.
  if(remaining>CREW_COUNTDOWN_MS){
   if(!this.element.hidden)this.element.hidden=true;
   if(this.beat<0){this.beat=CREW_COUNTDOWN_SECONDS+1;if(!document.hidden)this.cue(this.beat,remaining);}
   return;
  }
  if(remaining<=0&&this.releasedAt===null){
   this.releasedAt=now;
   // A hidden tab must never play a delayed release on returning to the run.
   if(remaining < -800){this.element.hidden=true;this.beat=0;this.releasedAt=null;return;}
  }
  if(this.releasedAt!==null&&now-this.releasedAt>=850){if(!this.element.hidden)this.element.hidden=true;return;}
  const beat=Math.max(0,Math.min(this.beat<0?CREW_COUNTDOWN_SECONDS:this.beat,Math.ceil(remaining/1000)));
  const revealing=this.element.hidden;
  if(revealing)this.element.hidden=false;
  // No per-frame style writes: the static ring texture rotates on the compositor.
  // Correct its clock only on reveal/number changes, including resume and guests.
  if(beat===this.beat&&!revealing)return;
  if(!this.reduced.matches&&beat>0){
   this.orbit??=this.orbitElement.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:CREW_COUNTDOWN_MS,fill:'both'});
   this.orbit.currentTime=Math.max(0,Math.min(CREW_COUNTDOWN_MS,CREW_COUNTDOWN_MS-remaining));
  }
  if(beat===this.beat)return;
  this.beat=beat;this.element.dataset.beat=String(beat);
  this.pulse?.cancel();
  if(!this.reduced.matches)this.pulse=this.value.animate([{opacity:.3,transform:'scale(1.12)'},{opacity:1,transform:'scale(1)'}],{duration:450,easing:'cubic-bezier(.16,1,.3,1)'});
  if(beat===0){
   this.orbit?.pause();
   this.release=this.element.animate([{opacity:1},{opacity:0}],{duration:850,fill:'forwards'});
  }
  this.value.textContent=beat?String(beat):'SURVIVE';
  this.value.setAttribute('aria-label',beat?`Run starts in ${beat}`:'Survive. The run has begun.');
  this.detail.textContent=beat?(players===1?'ONE SOUL · THE ABYSS AWAITS':`${players} SOULS BOUND · THE ABYSS AWAITS`):players===1?'KEEP MOVING. DEFY THE ABYSS.':'MOVE TOGETHER. DEFY THE ABYSS.';
  this.element.querySelectorAll<HTMLElement>('.arrival-beats i').forEach((dot,i)=>dot.classList.toggle('is-lit',i>=beat));
  if(!document.hidden)this.cue(beat,Math.max(0,remaining));
 }
}
