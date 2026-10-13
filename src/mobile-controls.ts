import {stick} from './controls';
export type TouchPoint={id:number;x:number;y:number};
type Finger=TouchPoint&{startX:number;startY:number;started:number;travel:number};
export type TouchAction={button:'fire'|'jump';held:boolean};
/** Two invisible, floating sticks. A finger owns its starting half until release. */
export class MobileControls{
 private left:Finger|null=null;private right:Finger|null=null;
 private actions:TouchAction[]=[];private lookX=0;private lookY=0;
 get active(){return !!(this.left||this.right);}
 begin(point:TouchPoint,width:number,now:number){
  const side=point.x<width/2?'left':'right';if(this[side])return false;
  this[side]={...point,startX:point.x,startY:point.y,started:now,travel:0};
  if(side==='right')this.actions.push({button:'fire',held:true});return true;
 }
 move(point:TouchPoint){
  const finger=this.left?.id===point.id?this.left:this.right?.id===point.id?this.right:null;if(!finger)return;
  if(finger===this.right){this.lookX+=point.x-finger.x;this.lookY+=point.y-finger.y;}
  finger.x=point.x;finger.y=point.y;finger.travel=Math.max(finger.travel,Math.hypot(point.x-finger.startX,point.y-finger.startY));
 }
 end(id:number,now:number,cancelled=false){
  if(this.left?.id===id){const finger=this.left;this.left=null;if(!cancelled&&now-finger.started<=160&&finger.travel<=12){this.actions.push({button:'jump',held:true},{button:'jump',held:false});}return true;}
  if(this.right?.id===id){this.right=null;this.actions.push({button:'fire',held:false});return true;}return false;
 }
 sample(height:number){
  const radius=Math.max(48,Math.min(90,height*.22));
  const [strafe,y]=this.left?stick((this.left.x-this.left.startX)/radius,(this.left.y-this.left.startY)/radius,.08):[0,0];
  const sample={forward:y?-y:0,strafe,lookX:this.lookX,lookY:this.lookY};this.lookX=this.lookY=0;return sample;
 }
 drain(){const actions=this.actions;this.actions=[];return actions;}
 reset(){this.left=this.right=null;this.actions=[];this.lookX=this.lookY=0;}
}
