/** Presentation-only neck lean shared by the prelobby and combat renderer.
 * Movement, simulation aiming and the body origin never use these offsets. */
export class CourtyardNeck {
 readonly pose={forward:0,drop:0};
 private bend=0;
 clear(){this.bend=0;this.pose.forward=this.pose.drop=0;}
 update(pitch:number,dt:number){
  if(!Number.isFinite(pitch)||!Number.isFinite(dt)||dt<=0)return this.pose;
  // A small neutral zone keeps level/upward views still. Ease the bend rather
  // than the world position so turning follows the current body heading.
  const target=Math.max(0,Math.min(Math.PI/2,-pitch-.1));
  this.bend+=(target-this.bend)*(1-Math.exp(-12*dt));
  if(target===0&&this.bend<1e-6)this.bend=0;
  const arc=1-Math.cos(this.bend);
  this.pose.forward=Math.min(.42,.34*Math.sin(this.bend)+.08*arc);
  this.pose.drop=.07*arc;
  return this.pose;
 }
}

/** Limit the lean along its original segment: never pull the eye backward at a
 * boundary, and never let it enter the climbing blocks while looking down. */
export function courtyardNeckFraction(position:{x:number;y:number;z:number},yaw:number,pose:{forward:number;drop:number},bounds:{halfWidth:number;frontZ:number;backZ:number},obstacles:readonly {x:number;z:number;w:number;d:number;h:number}[]=[]){
 const delta={x:-Math.sin(yaw)*pose.forward,y:-pose.drop,z:-Math.cos(yaw)*pose.forward};
 let fraction=1;
 for(const [axis,min,max]of [['x',-bounds.halfWidth,bounds.halfWidth],['z',bounds.frontZ,bounds.backZ]] as const){
  const d=delta[axis];if(Math.abs(d)>1e-10)fraction=Math.min(fraction,Math.max(0,((d>0?max:min)-position[axis])/d));
 }
 for(const block of obstacles){
  let enter=0,exit=fraction;
  for(const [axis,min,max]of [['x',block.x-block.w/2-.06,block.x+block.w/2+.06],['y',-.06,block.h+.06],['z',block.z-block.d/2-.06,block.z+block.d/2+.06]] as const){
   const p=position[axis],d=delta[axis];
   if(Math.abs(d)<1e-10){if(p<min||p>max){exit=-1;break;}}
   else {const a=(min-p)/d,b=(max-p)/d;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
  }
  if(enter<=exit&&exit>=0)fraction=Math.min(fraction,enter);
 }
 return fraction;
}
