import './replay-controls-visibility.css';

/** Shared idle behavior for local, shared leaderboard, and team replays. */
export class ReplayControlsVisibility {
 private mode='';
 private timer:ReturnType<typeof setTimeout>|undefined;
 private heldPointers=new Set<number>();
 constructor(private getMode:()=>string,private isMobile:()=>boolean){
  document.addEventListener('mousemove',()=>{if(!this.isMobile())this.reveal();});
  document.addEventListener('pointerdown',event=>{
   if(!this.active)return;
   this.heldPointers.add(event.pointerId);this.reveal();
  },true);
  const release=(event:PointerEvent)=>{if(this.heldPointers.delete(event.pointerId))this.reveal();};
  document.addEventListener('pointerup',release,true);
  document.addEventListener('pointercancel',release,true);
  window.addEventListener('blur',()=>{this.heldPointers.clear();this.reveal();});
  document.addEventListener('keydown',()=>this.reveal(),true);
  document.addEventListener('focusin',event=>{
   if(event.target instanceof HTMLElement&&event.target.closest('#replay-controls,#crew-replay-controls,#crew-replay-height'))this.reveal();
  });
 }
 private get active(){return this.getMode()==='replay'||this.getMode()==='crew-replay';}
 sync(){
  const mode=this.getMode();if(mode===this.mode)return;this.mode=mode;
  clearTimeout(this.timer);this.heldPointers.clear();this.setIdle(false);
  if(this.active)this.reveal();
 }
 reveal(){
  if(!this.active)return;
  this.setIdle(false);clearTimeout(this.timer);
  this.timer=setTimeout(()=>{
   if(!this.active||this.heldPointers.size)return;
   const focused=document.activeElement;
   if(focused instanceof HTMLElement&&focused.closest('#replay-controls,#crew-replay-controls,#crew-replay-height'))focused.blur();
   this.setIdle(true);
  },5000);
 }
 private setIdle(idle:boolean){
  document.body.dataset.replayIdle=String(idle);
  for(const id of ['replay-controls','crew-replay-controls','crew-replay-height']){
   const element=document.getElementById(id);if(element)element.inert=idle;
  }
 }
}
