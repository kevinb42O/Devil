import type {Enemy,Vec} from './simulation';

/** Lifecycle is observed in original gameplay; steering values remain replica tuning.
 * See CENTIPEDE_RESEARCH.md for evidence and the original-parity limitations. */
export const CENTIPEDE_TUNING={speed:14*.62,turnRate:1.2,turnAcceleration:3,riseSpeed:14*.62,roamTime:3,surfaceTime:15,graceTime:3,undergroundTime:10,spacing:1.3,depth:5};
export type CentipedeMotion={stage:'rising'|'flying'|'overpass'|'diving'|'underground';started:number;surfaceAt:number;path:Vec[];divePoint:Vec;cue:boolean;nextDust:number;arc?:FlightArc;yawRate?:number;pitchRate?:number};
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
type ArcPoint={pos:Vec;dir:Vec;s:number};
type FlightArc={points:ArcPoint[];distance:number;crestDistance:number;kind:'emerge'|'pass';burrowCue:boolean};
const add=(p:Vec,d:Vec,n:number):Vec=>({x:p.x+d.x*n,y:p.y+d.y*n,z:p.z+d.z*n});
/** Quintic Hermite spans have continuous position/tangent and zero endpoint
 * curvature. The two pass spans meet flat at the crest, without a pitch snap. */
function appendSpan(points:ArcPoint[],a:Vec,b:Vec,da:Vec,db:Vec){
 for(let i=points.length?1:0;i<=256;i++){
  const u=i/256,u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
  const h=[1-10*u3+15*u4-6*u5,u-6*u3+8*u4-3*u5,10*u3-15*u4+6*u5,-4*u3+7*u4-3*u5];
  const dh=[-30*u2+60*u3-30*u4,1-18*u2+32*u3-15*u4,30*u2-60*u3+30*u4,-12*u2+28*u3-15*u4];
  const pos={x:0,y:0,z:0},dir={x:0,y:0,z:0};
  for(const axis of ['x','y','z'] as const){pos[axis]=a[axis]*h[0]+da[axis]*h[1]+b[axis]*h[2]+db[axis]*h[3];dir[axis]=a[axis]*dh[0]+da[axis]*dh[1]+b[axis]*dh[2]+db[axis]*dh[3];}
  const previous=points.at(-1);points.push({pos,dir:unit(dir),s:previous?previous.s+dist(previous.pos,pos):0});
 }
}
function emergenceArc(e:Enemy,floor:number):FlightArc{
 const forward={x:Math.sin(e.facingYaw),y:0,z:Math.cos(e.facingYaw)},end=add(e.pos,forward,8);end.y=floor+7;
 const points:ArcPoint[]=[];appendSpan(points,e.pos,end,{x:0,y:8,z:0},add({x:0,y:0,z:0},forward,8));
 return {points,distance:0,crestDistance:Infinity,kind:'emerge',burrowCue:false};
}
function overpassArc(e:Enemy,player:Vec,floor:number):FlightArc{
 let forward=unit({x:e.vel.x,y:0,z:e.vel.z});
 if(Math.hypot(forward.x,forward.z)<.1)forward={x:Math.sin(e.facingYaw),y:0,z:Math.cos(e.facingYaw)};
 const toPlayer={x:player.x-e.pos.x,y:0,z:player.z-e.pos.z},ahead=toPlayer.x*forward.x+toPlayer.z*forward.z;
 // Commit beyond the player. The head does not turn back as the player gets underneath.
 const run=Math.max(8,ahead+4),crest=ahead>2?add(player,forward,4):add(e.pos,forward,run);crest.y=Math.max(floor+7,e.pos.y+2);
 const end=add(crest,forward,19);end.y=-CENTIPEDE_TUNING.depth-e.segments.length*CENTIPEDE_TUNING.spacing-3;
 const entry=unit(e.vel),entryLength=entry.y<0?Math.min(5,Math.max(1,(e.pos.y-floor)*2)):8;
 const flat=add({x:0,y:0,z:0},forward,10),points:ArcPoint[]=[];
 appendSpan(points,e.pos,crest,add({x:0,y:0,z:0},entry,entryLength),flat);
 const crestDistance=points.at(-1)!.s;
 appendSpan(points,crest,end,flat,{x:0,y:-24,z:0});
 return {points,distance:0,crestDistance,kind:'pass',burrowCue:false};
}
function advanceArc(e:Enemy,arc:FlightArc,dt:number){
 arc.distance=Math.min(arc.points.at(-1)!.s,arc.distance+CENTIPEDE_TUNING.speed*dt);
 let lo=0,hi=arc.points.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(arc.points[mid].s<arc.distance)lo=mid;else hi=mid;}
 const a=arc.points[lo],b=arc.points[hi],t=(arc.distance-a.s)/(b.s-a.s||1);
 e.pos={x:a.pos.x+(b.pos.x-a.pos.x)*t,y:a.pos.y+(b.pos.y-a.pos.y)*t,z:a.pos.z+(b.pos.z-a.pos.z)*t};
 const heading=unit({x:a.dir.x+(b.dir.x-a.dir.x)*t,y:a.dir.y+(b.dir.y-a.dir.y)*t,z:a.dir.z+(b.dir.z-a.dir.z)*t});
 e.vel=add({x:0,y:0,z:0},heading,CENTIPEDE_TUNING.speed);
 return arc.distance>=arc.points.at(-1)!.s-1e-7;
}
function cruise(e:Enemy,m:CentipedeMotion,goal:Vec,dt:number){
 const yaw=Math.atan2(e.vel.x,e.vel.z),pitch=Math.atan2(e.vel.y,Math.hypot(e.vel.x,e.vel.z));
 const desiredYaw=Math.atan2(goal.x-e.pos.x,goal.z-e.pos.z),desiredPitch=Math.atan2(goal.y-e.pos.y,Math.hypot(goal.x-e.pos.x,goal.z-e.pos.z));
 const deltaYaw=Math.atan2(Math.sin(desiredYaw-yaw),Math.cos(desiredYaw-yaw));
 const rate=(old:number,target:number)=>old+Math.max(-dt*CENTIPEDE_TUNING.turnAcceleration,Math.min(dt*CENTIPEDE_TUNING.turnAcceleration,target-old));
 m.yawRate=rate(m.yawRate??0,Math.max(-CENTIPEDE_TUNING.turnRate,Math.min(CENTIPEDE_TUNING.turnRate,deltaYaw*1.8)));
 m.pitchRate=rate(m.pitchRate??0,Math.max(-CENTIPEDE_TUNING.turnRate,Math.min(CENTIPEDE_TUNING.turnRate,(desiredPitch-pitch)*1.8)));
 const y=yaw+m.yawRate*dt,p=pitch+m.pitchRate*dt;
 e.vel={x:Math.sin(y)*Math.cos(p)*CENTIPEDE_TUNING.speed,y:Math.sin(p)*CENTIPEDE_TUNING.speed,z:Math.cos(y)*Math.cos(p)*CENTIPEDE_TUNING.speed};
 e.pos=add(e.pos,e.vel,dt);
}
export function updateCentipede(e:Enemy,dt:number,context:{radius:number;players:Vec[];floor:(x:number,z:number)=>number;random:()=>number;emit:(kind:'burrow'|'emerge'|'dust',pos:Vec)=>void}){
 if(!context.players.length)return;
 const t=CENTIPEDE_TUNING;
 let m=e.centipedeMotion;
 if(!m){
  const flying=e.status==='idle'||e.status==='hunting';
  m=e.centipedeMotion={stage:flying?'flying':'rising',started:e.age,surfaceAt:flying?Math.max(e.activeAt,e.nextMove-t.roamTime):Infinity,path:pathFromBody(e),divePoint:copy(e.pos),cue:false,nextDust:e.age};
  if(!flying){e.vel={x:0,y:t.riseSpeed,z:0};e.status='emerging';}
 }
 if(e.age+1e-7<e.activeAt){
  const u=Math.max(0,Math.min(1,1-(e.activeAt-e.age)/3)),u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
  // Accelerate beneath the floor and reach the surface at full flight speed.
  e.pos.y=-4*.62*(1-10*u3+15*u4-6*u5)+t.speed*3*(-4*u3+7*u4-3*u5);
  e.vel={x:0,y:(-4*.62*(-30*u2+60*u3-30*u4)+t.speed*3*(-12*u2+28*u3-15*u4))/3,z:0};
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
 if(m.stage==='rising'&&!m.arc){
  if(!m.cue){m.cue=true;m.surfaceAt=e.age;context.emit('emerge',{x:e.pos.x,y:floor,z:e.pos.z});}
  m.arc=emergenceArc(e,floor);
 }
 if(m.arc){
  const arc=m.arc,done=advanceArc(e,arc,dt);followPath(e,m);
  if(arc.kind==='emerge'&&done){m.arc=undefined;m.stage='flying';m.yawRate=m.pitchRate=0;e.status='idle';e.nextMove=m.surfaceAt+t.roamTime;e.statusUntil=m.surfaceAt+t.surfaceTime;}
  if(arc.kind==='pass'){
   if(arc.distance>=arc.crestDistance){m.stage='diving';e.status='burrowing';}
   if(!arc.burrowCue&&e.pos.y<floor){arc.burrowCue=true;context.emit('burrow',{x:e.pos.x,y:floor,z:e.pos.z});}
   if(e.pos.y<-t.depth&&e.segments.every(s=>s.pos.y<-t.depth)){
    m.arc=undefined;m.stage='underground';m.started=e.age;e.statusUntil=e.age+t.undergroundTime;e.vel={x:0,y:0,z:0};
   }
  }
  return;
 }
 if(e.status==='idle'&&e.age+1e-7>=e.nextMove)e.status='hunting';
 const nearest=context.players.reduce((a,b)=>dist(e.pos,a)<dist(e.pos,b)?a:b,context.players[0]);
 const horizontal=Math.hypot(nearest.x-e.pos.x,nearest.z-e.pos.z),underneath=nearest.y<e.pos.y&&horizontal<2.5;
 const approach=unit({x:e.vel.x,y:0,z:e.vel.z}),toward=(nearest.x-e.pos.x)*approach.x+(nearest.z-e.pos.z)*approach.z;
 const liningUp=e.status==='hunting'&&horizontal<14&&toward>0;
 if(e.age+1e-7>=e.statusUntil||liningUp||(e.status==='hunting'&&e.age+1e-7>=e.nextMove+t.graceTime&&underneath)){
  m.stage='overpass';m.started=e.age;m.arc=overpassArc(e,nearest,floor);advanceArc(e,m.arc,dt);followPath(e,m);return;
 }
 const goal=e.status==='idle'?{x:-e.pos.z*.55,y:6,z:e.pos.x*.55}:{x:nearest.x,y:floor+4,z:nearest.z};
 // Continuous altitude target replaces the old low-height on/off switch.
 goal.y+=Math.max(0,3-e.pos.y)*2;
 if(Math.hypot(e.pos.x,e.pos.z)>context.radius*.9){goal.x*=.3;goal.z*=.3;}
 cruise(e,m,goal,dt);followPath(e,m);
}
