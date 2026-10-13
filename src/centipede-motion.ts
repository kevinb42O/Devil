import type {Enemy,Vec} from './simulation';

/** Lifecycle is observed in original gameplay; steering values remain replica tuning.
 * See CENTIPEDE_RESEARCH.md for evidence and the original-parity limitations. */
export const CENTIPEDE_TUNING={speed:14*.62,turnRate:3,riseSpeed:14*.62,roamTime:3,surfaceTime:15,graceTime:3,undergroundTime:10,spacing:1.3,depth:5};
export type CentipedeMotion={stage:'rising'|'flying'|'diving'|'underground';started:number;surfaceAt:number;path:Vec[];divePoint:Vec;cue:boolean;nextDust:number};
const dist=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const unit=(a:Vec):Vec=>{const d=Math.hypot(a.x,a.y,a.z)||1;return {x:a.x/d,y:a.y/d,z:a.z/d};};
const copy=(p:Vec)=>({...p});
function pathFromBody(e:Enemy){return [copy(e.pos),...e.segments.map(s=>copy(s.pos))];}
export function initializeCentipede(e:Enemy){
 e.pos.y=-4*.62;
 e.vel={x:0,y:CENTIPEDE_TUNING.riseSpeed,z:0};
 // The un-emerged body is below the exit, not laid out across the arena.
 for(let i=0;i<e.segments.length;i++)e.segments[i].pos={x:e.pos.x,y:e.pos.y-(i+1)*CENTIPEDE_TUNING.spacing,z:e.pos.z};
}
/** A segment samples distance along the head's actual trail. This lets each piece
 * enter the floor separately and prevents tail cutting, collective sinking and resets. */
function followPath(e:Enemy,m:CentipedeMotion){
 if(dist(e.pos,m.path[0])>1e-8)m.path.unshift(copy(e.pos));
 let edge=0,covered=0;
 for(let i=0;i<e.segments.length;i++){
  const wanted=(i+1)*CENTIPEDE_TUNING.spacing;
  while(edge<m.path.length-2&&covered+dist(m.path[edge],m.path[edge+1])<wanted){covered+=dist(m.path[edge],m.path[edge+1]);edge++;}
  const a=m.path[edge],b=m.path[edge+1]??a,length=dist(a,b),t=length?Math.max(0,Math.min(1,(wanted-covered)/length)):0;
  e.segments[i].pos={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
 }
 m.path.length=Math.min(m.path.length,edge+3);
}
function steer(current:Vec,goal:Vec,amount:number):Vec{
 const from=unit(current),to=unit(goal),dot=Math.max(-1,Math.min(1,from.x*to.x+from.y*to.y+from.z*to.z)),angle=Math.acos(dot);
 if(angle<=amount)return to;
 // Spherical turn limiting avoids the point-seeking slowdown at a turn.
 if(dot<-.9999){const axis=unit(Math.abs(from.y)<.9?{x:-from.z,y:0,z:from.x}:{x:0,y:-from.z,z:from.y});return unit({x:from.x*Math.cos(amount)+axis.x*Math.sin(amount),y:from.y*Math.cos(amount)+axis.y*Math.sin(amount),z:from.z*Math.cos(amount)+axis.z*Math.sin(amount)});}
 const t=amount/angle,sin=Math.sin(angle),a=Math.sin((1-t)*angle)/sin,b=Math.sin(t*angle)/sin;
 return {x:from.x*a+to.x*b,y:from.y*a+to.y*b,z:from.z*a+to.z*b};
}
export function updateCentipede(e:Enemy,dt:number,context:{radius:number;players:Vec[];floor:(x:number,z:number)=>number;random:()=>number;emit:(kind:'burrow'|'emerge'|'dust',pos:Vec)=>void}){
 const t=CENTIPEDE_TUNING;
 let m=e.centipedeMotion;
 if(!m){
  const flying=e.status==='idle'||e.status==='hunting';
  m=e.centipedeMotion={stage:flying?'flying':'rising',started:e.age,surfaceAt:flying?Math.max(e.activeAt,e.nextMove-t.roamTime):Infinity,path:pathFromBody(e),divePoint:copy(e.pos),cue:false,nextDust:e.age};
  if(!flying){e.vel={x:0,y:t.riseSpeed,z:0};e.status='emerging';}
 }
 if(e.age+1e-7<e.activeAt){
  const remaining=Math.max(0,e.activeAt-e.age);e.pos.y=-4*.62*Math.min(1,remaining/3);e.vel={x:0,y:4*.62/3,z:0};
  if(e.age>=m.nextDust){context.emit('dust',{x:e.pos.x,y:Math.max(0,context.floor(e.pos.x,e.pos.z)),z:e.pos.z});m.nextDust=e.age+.15;}
  followPath(e,m);return;
 }
 const floor=Math.max(0,context.floor(e.pos.x,e.pos.z));
 if(m.stage==='underground'){
  e.vel={x:0,y:0,z:0};
  if(e.age+1e-7<e.statusUntil-3)return;
  const old=copy(e.pos),angle=Math.atan2(old.x,old.z)+Math.PI*.6+context.random()*Math.PI*.8,radius=context.radius*(.45+context.random()*.25);
  const x=Math.sin(angle)*radius,z=Math.cos(angle)*radius;
  e.pos={x,y:-t.depth,z};e.facingYaw=Math.atan2(-x,-z);initializeCentipede(e);
  m.stage='rising';m.started=e.age;m.path=pathFromBody(e);m.cue=false;m.nextDust=e.age;m.surfaceAt=Infinity;e.status='emerging';e.activeAt=e.statusUntil;
  return;
 }
 if(m.stage==='rising'){
  const old=copy(e.pos);
  if(e.age>=m.nextDust&&e.pos.y<1){context.emit('dust',{x:e.pos.x,y:floor,z:e.pos.z});m.nextDust=e.age+.15;}
  e.pos.y+=t.riseSpeed*dt;e.vel={x:0,y:t.riseSpeed,z:0};
  if(!m.cue&&e.pos.y>=floor){m.cue=true;m.surfaceAt=e.age;context.emit('emerge',{x:e.pos.x,y:floor,z:e.pos.z});}
  if(e.pos.y>=7){e.pos.y=7;m.stage='flying';e.status='idle';e.nextMove=m.surfaceAt+t.roamTime;e.statusUntil=m.surfaceAt+t.surfaceTime;e.vel={x:Math.sin(e.facingYaw)*t.speed,y:0,z:Math.cos(e.facingYaw)*t.speed};}
  // Derive pitch from actual travel even on the final rising tick.
  if(m.stage==='rising')e.vel.y=(e.pos.y-old.y)/dt;
  followPath(e,m);return;
 }
 if(m.stage==='diving'){
  const desired={x:m.divePoint.x-e.pos.x,y:-12,z:m.divePoint.z-e.pos.z},heading=steer(e.vel,desired,t.turnRate*2*dt);
  e.vel={x:heading.x*t.speed,y:heading.y*t.speed,z:heading.z*t.speed};
  e.pos.x+=e.vel.x*dt;e.pos.y+=e.vel.y*dt;e.pos.z+=e.vel.z*dt;followPath(e,m);
  if(e.pos.y<-t.depth&&e.segments.every(s=>s.pos.y<-t.depth)){
   m.stage='underground';m.started=e.age;e.statusUntil=e.age+t.undergroundTime;e.vel={x:0,y:0,z:0};
  }
  return;
 }
 if(e.status==='idle'&&e.age+1e-7>=e.nextMove)e.status='hunting';
 const nearest=context.players.reduce((a,b)=>dist(e.pos,a)<dist(e.pos,b)?a:b,context.players[0]);
 const horizontal=Math.hypot(nearest.x-e.pos.x,nearest.z-e.pos.z),underneath=nearest.y<e.pos.y&&horizontal<2.5;
 if(e.age+1e-7>=e.statusUntil||(e.status==='hunting'&&e.age+1e-7>=e.nextMove+t.graceTime&&underneath)){
  m.stage='diving';m.started=e.age;m.divePoint={x:e.pos.x+e.vel.x*.5,y:floor,z:e.pos.z+e.vel.z*.5};e.status='burrowing';context.emit('burrow',{x:e.pos.x,y:floor,z:e.pos.z});
  // Start the dive without changing any segment's world position.
  return;
 }
 const goal=e.status==='idle'?{x:-e.pos.z*.55,y:6,z:e.pos.x*.55}:{x:nearest.x,y:floor+.8,z:nearest.z};
 // During the initial grace interval a low head turns back upward instead of
 // burrowing/stalling; its trail can fold over itself, as seen in current gameplay.
 if(e.pos.y<floor+1.3)goal.y=floor+8;
 // Avoid a stationary vertical chase at the arena edge.
 if(Math.hypot(e.pos.x,e.pos.z)>context.radius*.9){goal.x*=.3;goal.z*=.3;}
 const heading=steer(e.vel,{x:goal.x-e.pos.x,y:goal.y-e.pos.y,z:goal.z-e.pos.z},t.turnRate*dt);
 e.vel={x:heading.x*t.speed,y:heading.y*t.speed,z:heading.z*t.speed};
 e.pos.x+=e.vel.x*dt;e.pos.y+=e.vel.y*dt;e.pos.z+=e.vel.z*dt;followPath(e,m);
}
