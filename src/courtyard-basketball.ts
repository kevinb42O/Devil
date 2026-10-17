import type {Point,CourtyardState} from './courtyard-state';
import {courtyardEvent} from './courtyard-events';

/** A street court beside spawn, with its own doorway before the football passage. */
export const BASKETBALL={minX:6.3,maxX:13.4,minZ:5.8,maxZ:24,x:9.85,boardZ:22,hoopZ:21.38,hoopY:3.041,rim:.43,rimTube:.024,ballRadius:.14,gravity:12,chargeTicks:108,threeDistance:6};
export type BasketballBody={id:string;player:{pos:Point;vel:Point};input:{yaw:number;pitch?:number;fire?:boolean;homing?:boolean}};
export type BasketballBall={pos:Point;vel:Point;rotation:Point;owner:string|null;shooter:string|null;points:number;scored:boolean;released:number};
export type BasketballState={balls:BasketballBall[];scores:Record<string,{points:number;made:number;attempts:number}>;hands:Record<string,{held:boolean;charge:number;armed:boolean;released?:number;power?:number;secondary?:boolean;dunk?:{started:number;from:Point;approach?:Point}}>};
const zero=()=>({x:0,y:0,z:0});
export function createBasketball():BasketballState{return {balls:Array.from({length:6},(_,i)=>({pos:{x:12.5,y:BASKETBALL.ballRadius,z:8+i*.65},vel:zero(),rotation:zero(),owner:null,shooter:null,points:2,scored:false,released:-1000})),scores:{},hands:{}};}
export function nearBasketball(p:Point){return p.x>=BASKETBALL.minX-.4&&p.x<=BASKETBALL.maxX&&p.z>=BASKETBALL.minZ&&p.z<=BASKETBALL.maxZ;}
export function basketballCharge(b:BasketballState|undefined,id:string,tick:number){const hand=b?.hands[id];return hand&&hand.charge>=0?Math.min(1,(tick-hand.charge)/BASKETBALL.chargeTicks):0;}
export type BasketballPose={holding:boolean;charge:number;gather:number;age:number;dunkAge?:number;dunkTarget?:Point};
const smooth=(v:number)=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
/** The ball and both palm targets share this pose in simulation and presentation. */
export function basketballHoldOffset(gather:number):Point{const set=smooth(gather);return {x:.14,y:-.44+.68*set,z:-.55};}
export function basketballHeldPoint(p:BasketballBody,gather:number):Point{const o=basketballHoldOffset(gather),yaw=p.input.yaw;return {x:p.player.pos.x+Math.cos(yaw)*o.x+Math.sin(yaw)*o.z,y:p.player.pos.y+o.y,z:p.player.pos.z-Math.sin(yaw)*o.x+Math.cos(yaw)*o.z};}
export function basketballPose(b:BasketballState|undefined,id:string,tick:number,p?:BasketballBody):BasketballPose|undefined{
 const h=b?.hands[id];if(!h)return;
 const holding=!!b?.balls.some(ball=>ball.owner===id),age=h.released===undefined?-1:(tick-h.released)/120;
 if(!holding&&(age<0||age>.65)&&(!h.dunk||tick-h.dunk.started>108))return;
 const charge=holding?basketballCharge(b,id,tick):h.power??0;
 const dunkAge=h.dunk?(tick-h.dunk.started)/120:undefined;
 let dunkTarget:Point|undefined;
 if(p&&h.dunk&&dunkAge!==undefined&&dunkAge<.9){const point=dunkAge<.3?basketballDunkPoint(h.dunk,tick):{x:BASKETBALL.x,y:BASKETBALL.hoopY+.12,z:BASKETBALL.hoopZ},dx=point.x-p.player.pos.x,dz=point.z-p.player.pos.z,yaw=p.input.yaw;dunkTarget={x:Math.cos(yaw)*dx-Math.sin(yaw)*dz,y:point.y-p.player.pos.y,z:Math.sin(yaw)*dx+Math.cos(yaw)*dz};}
 return {holding,charge,...(dunkAge!==undefined&&dunkAge<.9?{dunkAge,dunkTarget}:{}),gather:Math.min(1,charge*BASKETBALL.chargeTicks/29),age:holding?-1:age};
}
export function basketballLaunch(p:BasketballBody,power:number){
 const pitch=Math.max(-1.3,Math.min(1.4,p.input.pitch??0)),speed=5.5+9.5*Math.max(0,Math.min(1,power));
 return {pos:basketballHeldPoint(p,Math.min(1,power*BASKETBALL.chargeTicks/29)),vel:{x:-Math.sin(p.input.yaw)*Math.cos(pitch)*speed+p.player.vel.x*.15,y:Math.sin(pitch)*speed,z:-Math.cos(p.input.yaw)*Math.cos(pitch)*speed+p.player.vel.z*.15}};
}
export function canBasketballDunk(p:BasketballBody){
 const dx=BASKETBALL.x-p.player.pos.x,dz=BASKETBALL.hoopZ-p.player.pos.z,d=Math.hypot(dx,dz);
 return nearBasketball(p.player.pos)&&d<=1.75&&p.player.pos.y>=1.5&&p.player.pos.y<4.2&&(d<.45||(-Math.sin(p.input.yaw)*dx-Math.cos(p.input.yaw)*dz)/d>.25);
}
/** The same short approach is used by host movement and guest prediction. */
export function basketballDunkApproach(b:BasketballState|undefined,id:string,tick:number){
 const dunk=b?.hands[id]?.dunk,from=dunk?.approach;if(!dunk||!from||tick<dunk.started||tick-dunk.started>45)return;
 const dx=BASKETBALL.x-from.x,dz=BASKETBALL.hoopZ-from.z,d=Math.hypot(dx,dz),ease=smooth((tick-dunk.started)/36),travel=Math.max(0,d-.5)*ease;
 return {x:from.x+(d>.001?dx/d:0)*travel,z:from.z+(d>.001?dz/d:0)*travel};
}
export function basketballDunkPoint(dunk:{started:number;from:Point},tick:number):Point{
 const t=Math.max(0,Math.min(1,(tick-dunk.started)/36)),ease=smooth(t);
 return {x:dunk.from.x+(BASKETBALL.x-dunk.from.x)*ease,y:dunk.from.y+(BASKETBALL.hoopY+.24-dunk.from.y)*ease+Math.sin(Math.PI*t)*.35,z:dunk.from.z+(BASKETBALL.hoopZ-dunk.from.z)*ease};
}
export function basketballAction(b:BasketballState,p:BasketballBody,tick:number){
 const owned=b.balls.find(ball=>ball.owner===p.id);
 if(owned){if(b.hands[p.id]?.dunk&&tick-b.hands[p.id].dunk!.started<36)return false;owned.owner=null;owned.shooter=null;owned.vel={x:p.player.vel.x,y:0,z:p.player.vel.z};owned.released=tick;return true;}
 if(!nearBasketball(p.player.pos))return false;
 const ball=b.balls.filter(ball=>!ball.owner&&tick-ball.released>36&&Math.hypot(ball.pos.x-p.player.pos.x,ball.pos.z-p.player.pos.z)<1.65&&Math.abs(ball.pos.y-(p.player.pos.y-.9))<1.7&&Math.hypot(ball.vel.x,ball.vel.y,ball.vel.z)<5).sort((a,c)=>Math.hypot(a.pos.x-p.player.pos.x,a.pos.z-p.player.pos.z)-Math.hypot(c.pos.x-p.player.pos.x,c.pos.z-p.player.pos.z))[0];
 if(!ball)return false;
 ball.owner=p.id;ball.shooter=null;ball.scored=false;ball.vel=zero();b.hands[p.id]={held:!!p.input.fire,charge:-1,armed:!p.input.fire,secondary:!!p.input.homing};return true;
}
/** Called exclusively on the host. Raw input edges control ownership and charge. */
export function stepBasketball(c:CourtyardState,players:BasketballBody[],tick:number,dt:number){
 const b=c.basketball??=createBasketball(),ids=new Set(players.map(p=>p.id));
 for(const id of Object.keys(b.hands))if(!ids.has(id))delete b.hands[id];
 for(const p of players){
  const h=b.hands[p.id]??={held:false,charge:-1,armed:true},held=!!p.input.fire,secondary=!!p.input.homing;let ball=b.balls.find(ball=>ball.owner===p.id);
  if(!ball&&held&&!h.held&&nearBasketball(p.player.pos)){basketballAction(b,p,tick);ball=b.balls.find(ball=>ball.owner===p.id);if(ball){h.armed=false;h.charge=-1;}}
  if(ball&&!nearBasketball(p.player.pos)){ball.owner=null;ball.shooter=null;ball.vel=zero();h.charge=-1;ball=undefined;}
  if(ball&&secondary&&!h.secondary&&h.armed&&(!h.dunk||tick-h.dunk.started>108)&&canBasketballDunk(p)){
   h.dunk={started:tick,from:{...ball.pos},approach:{...p.player.pos}};h.charge=-1;h.power=0;
   if(p.player.pos.y<2.3)p.player.vel.y=Math.max(p.player.vel.y,7.5);
  }
  if(ball&&h.dunk&&tick-h.dunk.started<36){ball.pos=basketballDunkPoint(h.dunk,tick);ball.vel=zero();h.held=held;h.secondary=secondary;continue;}
  if(ball&&h.dunk&&tick-h.dunk.started===36){
   ball.pos=basketballDunkPoint(h.dunk,tick);ball.vel={x:0,y:-6,z:0};ball.owner=null;ball.shooter=p.id;ball.scored=false;ball.points=2;ball.released=tick;h.released=tick;h.charge=-1;h.armed=false;
   (b.scores[p.id]??={points:0,made:0,attempts:0}).attempts++;courtyardEvent(c,tick,'kick',ball.pos,[p.id]);ball=undefined;
  }
  if(ball){
   if(held&&!h.held&&h.armed)h.charge=tick;
   const gather=h.charge>=0?Math.min(1,(tick-h.charge)/29):0;
   ball.pos=basketballHeldPoint(p,gather);ball.vel=zero();
   if(!held&&h.held&&h.charge>=0){
    const power=Math.min(1,(tick-h.charge)/BASKETBALL.chargeTicks),launch=basketballLaunch(p,power);
    ball.owner=null;ball.shooter=p.id;ball.scored=false;ball.points=Math.hypot(p.player.pos.x-BASKETBALL.x,p.player.pos.z-BASKETBALL.hoopZ)>=BASKETBALL.threeDistance?3:2;ball.released=tick;
    ball.pos=launch.pos;ball.vel=launch.vel;h.released=tick;h.power=power;
    (b.scores[p.id]??={points:0,made:0,attempts:0}).attempts++;h.charge=-1;
    courtyardEvent(c,tick,'kick',ball.pos,[p.id]);
   }
   if(!held)h.armed=true;
  }else h.charge=-1;
  h.held=held;h.secondary=secondary;
 }
 for(const ball of b.balls){
  if(ball.owner){if(ids.has(ball.owner))continue;ball.owner=null;ball.shooter=null;ball.vel=zero();}
  const result=integrateBasketball(ball,dt);
  if(result.goal&&ball.shooter){const score=b.scores[ball.shooter]??={points:0,made:0,attempts:0};score.points+=ball.points;score.made++;courtyardEvent(c,tick,'goal',result.goal,[ball.shooter]);}
  if(result.bounce&&!c.events.some(e=>e.kind==='bounce'&&tick-e.tick<18))courtyardEvent(c,tick,'bounce',result.bounce);
 }
}
export type BasketballImpact='rim'|'backboard'|'floor'|'wall';
/** One collision solver for host flight and the release preview, at the same 120 Hz. */
export function integrateBasketball(ball:BasketballBall,dt:number){
 const result:{goal?:Point;bounce?:Point;impact?:BasketballImpact}={};
  // Substeps keep rim/backboard collision reliable even on maximum-power shots.
  for(let sub=0;sub<3;sub++){
   const step=dt/3,previous={...ball.pos},r=BASKETBALL.ballRadius;ball.vel.y-=BASKETBALL.gravity*step;
   ball.pos.x+=ball.vel.x*step;ball.pos.y+=ball.vel.y*step;ball.pos.z+=ball.vel.z*step;
   const dx=ball.pos.x-BASKETBALL.x,dz=ball.pos.z-BASKETBALL.hoopZ,radial=Math.hypot(dx,dz),ringDistance=Math.hypot(radial-BASKETBALL.rim,ball.pos.y-BASKETBALL.hoopY),contact=r+BASKETBALL.rimTube;
   if(ringDistance<contact){result.impact??='rim';
    const nx=radial>.00001?dx/radial:1,nz=radial>.00001?dz/radial:0,ex=nx*(radial-BASKETBALL.rim),ey=ball.pos.y-BASKETBALL.hoopY,ez=nz*(radial-BASKETBALL.rim),len=Math.max(.00001,ringDistance),normal={x:ex/len,y:ey/len,z:ez/len},dot=ball.vel.x*normal.x+ball.vel.y*normal.y+ball.vel.z*normal.z;
    if(dot<0){ball.vel.x-=1.65*dot*normal.x;ball.vel.y-=1.65*dot*normal.y;ball.vel.z-=1.65*dot*normal.z;}
    ball.pos.x+=normal.x*(contact-len);ball.pos.y+=normal.y*(contact-len);ball.pos.z+=normal.z*(contact-len);
   }
   if(Math.abs(ball.pos.x-BASKETBALL.x)<.9+r&&ball.pos.y>2.9-r&&ball.pos.y<3.95+r&&Math.abs(ball.pos.z-BASKETBALL.boardZ)<r+.014){result.impact??='backboard';ball.pos.z=BASKETBALL.boardZ+Math.sign(previous.z-BASKETBALL.boardZ||-1)*(r+.015);ball.vel.z*=-.72;}
   if(ball.shooter&&!ball.scored&&previous.y>BASKETBALL.hoopY&&ball.pos.y<=BASKETBALL.hoopY&&ball.vel.y<0){
    const t=(previous.y-BASKETBALL.hoopY)/(previous.y-ball.pos.y),x=previous.x+(ball.pos.x-previous.x)*t,z=previous.z+(ball.pos.z-previous.z)*t;
    if(Math.hypot(x-BASKETBALL.x,z-BASKETBALL.hoopZ)<BASKETBALL.rim-r-BASKETBALL.rimTube){ball.scored=true;result.goal={x,y:BASKETBALL.hoopY,z};ball.vel.x*=.65;ball.vel.z*=.65;}
   }
   if(ball.pos.y<r){result.impact??='floor';const impact=-ball.vel.y;ball.pos.y=r;ball.vel.y=impact>.6?impact*.68:0;const friction=Math.exp(-3*step);ball.vel.x*=friction;ball.vel.z*=friction;if(impact>2)result.bounce={...ball.pos};}
   for(const [axis,min,max] of [['x',BASKETBALL.minX,BASKETBALL.maxX],['z',BASKETBALL.minZ,BASKETBALL.maxZ]] as const){if(ball.pos[axis]<min+r||ball.pos[axis]>max-r){result.impact??='wall';ball.pos[axis]=Math.max(min+r,Math.min(max-r,ball.pos[axis]));ball.vel[axis]*=-.65;}}
   ball.rotation.x+=ball.vel.z*step/r;ball.rotation.z-=ball.vel.x*step/r;
  }
  if(ball.pos.y===BASKETBALL.ballRadius&&Math.hypot(ball.vel.x,ball.vel.z)<.03)ball.vel=zero();
 return result;
}
export function predictBasketball(p:BasketballBody,power:number){
 const launch=basketballLaunch(p,power),ball:BasketballBall={...launch,rotation:zero(),owner:null,shooter:p.id,points:2,scored:false,released:0},points:Point[]=[{...ball.pos}];
 for(let tick=0;tick<480;tick++){
  const result=integrateBasketball(ball,1/120);
  if(tick%4===3||result.impact||result.goal)points.push({...ball.pos});
  if(result.goal||result.impact)return {points,end:result.goal??{...ball.pos},impact:result.goal?'basket' as const:result.impact,ticks:tick+1};
 }
 return {points,end:{...ball.pos},impact:undefined,ticks:480};
}
export function validateBasketball(value:unknown):value is BasketballState{
 if(!value||typeof value!=='object')return false;const b=value as BasketballState,point=(p:Point)=>p&&[p.x,p.y,p.z].every(n=>Number.isFinite(n)&&Math.abs(n)<1e6),id=(s:unknown)=>s===null||typeof s==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s),record=(o:object)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length<=64&&Object.keys(o).every(id);
 return Array.isArray(b.balls)&&b.balls.length===6&&b.balls.every(ball=>ball&&point(ball.pos)&&point(ball.vel)&&point(ball.rotation)&&id(ball.owner)&&id(ball.shooter)&&[2,3].includes(ball.points)&&typeof ball.scored==='boolean'&&Number.isSafeInteger(ball.released))&&new Set(b.balls.filter(ball=>ball.owner).map(ball=>ball.owner)).size===b.balls.filter(ball=>ball.owner).length&&record(b.scores)&&Object.values(b.scores).every(s=>s&&[s.points,s.made,s.attempts].every(n=>Number.isSafeInteger(n)&&n>=0))&&record(b.hands)&&Object.values(b.hands).every(h=>h&&typeof h.held==='boolean'&&typeof h.armed==='boolean'&&Number.isSafeInteger(h.charge)&&h.charge>=-1&&(h.released===undefined||Number.isSafeInteger(h.released))&&(h.power===undefined||Number.isFinite(h.power)&&h.power>=0&&h.power<=1)&&(h.secondary===undefined||typeof h.secondary==='boolean')&&(h.dunk===undefined||Number.isSafeInteger(h.dunk.started)&&point(h.dunk.from)&&(h.dunk.approach===undefined||point(h.dunk.approach))));
}
