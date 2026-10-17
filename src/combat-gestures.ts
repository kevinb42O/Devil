/** Mobile holds live outside the courtyard HUD so arena gestures remain usable. */
export class CombatGestures{
 readonly root=document.createElement('div');
 private held={leftArm:false,rightArm:false};
 constructor(){
  this.root.id='combat-gestures';this.root.hidden=true;
  this.root.setAttribute('aria-label','Hand gestures');
  this.root.innerHTML='<button aria-label="Hold left hand up">LEFT HAND</button><button aria-label="Hold right hand up">RIGHT HAND</button>';
  this.root.querySelectorAll('button').forEach((button,i)=>{
   const key=i?'rightArm':'leftArm';
   button.onpointerdown=event=>{event.preventDefault();event.stopPropagation();button.setPointerCapture(event.pointerId);this.held[key]=true;button.setAttribute('aria-pressed','true');};
   button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>{this.held[key]=false;button.setAttribute('aria-pressed','false');};
  });
  document.body.append(this.root);window.addEventListener('blur',()=>this.reset());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
 }
 get arms(){return this.held;}
 reset(){this.held={leftArm:false,rightArm:false};this.root.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed','false'));}
 show(visible:boolean){this.root.hidden=!visible;if(!visible)this.reset();}
}
