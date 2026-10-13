import type {Enemy,Vec} from './simulation';

// Replica tuning. Continuous flight and head-led emergence replace the old
// whole-body teleport; these coefficients are not recovered original AI.
export const GIGAPEDE_TUNING={speed:10,spacing:1.95,turnRate:1.05,turnAcceleration:2.4};
export type GigapedeMotion={path:Vec[];yawRate:number;pitchRate:number;surfaceAt:number;exit:Vec;nextDust:number};
const distance=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clamp=(x:number,n:number)=>Math.max(-n,Math.min(n,x));
export function initializeGigapede(e:Enemy){
 e.pos.y=-4*.62;e.vel={x:0,y:0,z:0};
 for(let i=0;i<e.segments.length;i++)e.segments[i].pos={x:e.pos.x,y:e.pos.y-(i+1)*GIGAPEDE_TUNING.spacing,z:e.pos.z};
}
function follow(e:Enemy,m:GigapedeMotion){
 if(distance(e.pos,m.path[0])>1e-8)m.path.unshift({...e.pos});
 let edge=0,covered=0;
 for(let i=0;i<e.segments.length;i++){
  const wanted=(i+1)*GIGAPEDE_TUNING.spacing;
  while(edge<m.path.length-2&&covered+distance(m.path[edge],m.path[edge+1])<wanted){covered+=distance(m.path[edge],m.path[edge+1]);edge++;}
  const a=m.path[edge],b=m.path[edge+1]??a,length=distance(a,b),u=length?Math.min(1,(wanted-covered)/length):0;
  e.segments[i].pos={x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u};
 }
 m.path.length=Math.min(m.path.length,edge+3);
}
export function updateGigapede(e:Enemy,dt:number,player:Vec,floor:number,emit:(kind:'emerge'|'dust',pos:Vec)=>void){
 const t=GIGAPEDE_TUNING;
 const m=e.gigapedeMotion??(e.gigapedeMotion={path:[{...e.pos},...e.segments.map(s=>({...s.pos}))],yawRate:0,pitchRate:0,surfaceAt:e.activeAt,exit:{...e.pos},nextDust:e.age});
 if(e.age+1e-7<e.activeAt){
  const u=Math.max(0,Math.min(1,1-(e.activeAt-e.age)/3)),u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
  e.pos.y=m.exit.y*(1-10*u3+15*u4-6*u5)+t.speed*3*(-4*u3+7*u4-3*u5);
  e.vel={x:0,y:(m.exit.y*(-30*u2+60*u3-30*u4)+t.speed*3*(-12*u2+28*u3-15*u4))/3,z:0};
  if(e.age>=m.nextDust){emit('dust',{x:e.pos.x,y:Math.max(0,floor),z:e.pos.z});m.nextDust=e.age+.15;}
  follow(e,m);return;
 }
 if(e.status==='emerging'){
  e.status='hunting';e.vel={x:0,y:t.speed,z:0};emit('emerge',{x:e.pos.x,y:Math.max(0,floor),z:e.pos.z});
 }
 // Keep forward speed while turning and pitching. A jump cannot drag the
 // head down onto the player's eyes. The tail samples this exact flight trail.
 const yaw=Math.hypot(e.vel.x,e.vel.z)>.001?Math.atan2(e.vel.x,e.vel.z):e.facingYaw;
 const pitch=Math.atan2(e.vel.y,Math.hypot(e.vel.x,e.vel.z));
 const targetYaw=Math.atan2(player.x-e.pos.x,player.z-e.pos.z);
 const height=Math.max(0,floor)+5.5+Math.sin((e.age-m.surfaceAt)*.55)*2;
 const targetPitch=Math.atan2(height-e.pos.y,Math.max(6,Math.hypot(player.x-e.pos.x,player.z-e.pos.z)));
 const yawDelta=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw));
 m.yawRate+=clamp(clamp(yawDelta*1.8,t.turnRate)-m.yawRate,t.turnAcceleration*dt);
 m.pitchRate+=clamp(clamp((targetPitch-pitch)*1.8,t.turnRate)-m.pitchRate,t.turnAcceleration*dt);
 const y=yaw+m.yawRate*dt,p=pitch+m.pitchRate*dt;
 e.vel={x:Math.sin(y)*Math.cos(p)*t.speed,y:Math.sin(p)*t.speed,z:Math.cos(y)*Math.cos(p)*t.speed};
 e.pos={x:e.pos.x+e.vel.x*dt,y:e.pos.y+e.vel.y*dt,z:e.pos.z+e.vel.z*dt};e.facingYaw=y;
 follow(e,m);
}
