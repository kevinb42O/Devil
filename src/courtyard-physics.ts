import {courtyardEvent,resetSkull,courtyardFloor,insidePit,pitIsOpen,COURTYARD_SOLIDS,FOOTBALL,FOOTBALL_BALL_RADIUS,KICK_CHARGE_TICKS,constrainCourtyard,type CourtyardState,type Point} from './courtyard-state';
type Body={id:string;player:{pos:Point;vel:Point};input:{yaw:number;pitch?:number;fire?:boolean;homing?:boolean;leftArm?:boolean;rightArm?:boolean}};
/** Charge timing and contact are authoritative; client packets carry only held buttons. */
export function stepFootballKicks(c:CourtyardState,players:Body[],tick:number){
 const ids=new Set(players.map(p=>p.id));for(const id of Object.keys(c.kicks))if(!ids.has(id))delete c.kicks[id];
 for(const p of players){
  const k=c.kicks[p.id]??={started:-1,released:-1000,power:0},held=p.input.fire||p.input.homing;
  if(held){if(k.started<0&&tick-k.released>=30){k.started=tick;k.right=p.input.homing===true&&!p.input.fire;}continue;}
  if(k.started<0)continue;
  k.power=Math.min(1,Math.max(0,(tick-k.started)/KICK_CHARGE_TICKS));k.started=-1;k.released=tick;
  const s=c.skull,dx=s.pos.x-p.player.pos.x,dz=s.pos.z-p.player.pos.z,d=Math.hypot(dx,dz),forward={x:-Math.sin(p.input.yaw),z:-Math.cos(p.input.yaw)};
  if(s.resetAt||d>1.8||Math.abs(p.player.pos.y-1.7-s.pos.y)>1.2||d>.25&&(dx*forward.x+dz*forward.z)/d<.2)continue;
  const speed=5+18*k.power,loft=Math.max(0,Math.min(.55,p.input.pitch??0));
  s.vel={x:forward.x*speed+p.player.vel.x*.15,y:1+3*k.power+Math.sin(loft)*speed*.55,z:forward.z*speed+p.player.vel.z*.15};s.lastContact[p.id]=tick;
  courtyardEvent(c,tick,'kick',s.pos,[p.id]);
 }
}
/** One bounded toy, stepped only by the host. It never applies impulses to players. */
export function stepSkull(c:CourtyardState,players:Body[],tick:number,dt:number){
 stepFootballKicks(c,players,tick);
 const s=c.skull;
 if(s.resetAt){if(tick>=s.resetAt)resetSkull(c,players);return;}
 const previous={...s.pos};
 for(const p of players){
  const dx=s.pos.x-p.player.pos.x,dz=s.pos.z-p.player.pos.z,d=Math.hypot(dx,dz);
  if((c.kicks[p.id]?.started??-1)>=0||d>.85||Math.abs(p.player.pos.y-1.7-s.pos.y)>.9||tick-(s.lastContact[p.id]??-1000)<20)continue;
  const nx=d>.01?dx/d:-Math.sin(p.input.yaw),nz=d>.01?dz/d:-Math.cos(p.input.yaw),approach=Math.max(0,p.player.vel.x*nx+p.player.vel.z*nz);
  if(approach<.25)continue;
  const impulse=Math.min(11,1.5+approach*.9);s.vel.x+=nx*impulse;s.vel.z+=nz*impulse;s.vel.y=Math.min(3,.35+approach*.12);s.lastContact[p.id]=tick;
  courtyardEvent(c,tick,'kick',s.pos,[p.id]);
 }
 const speed=Math.hypot(s.vel.x,s.vel.z);if(speed>24){s.vel.x*=24/speed;s.vel.z*=24/speed;}
 s.vel.y-=18*dt;s.pos.x+=s.vel.x*dt;s.pos.y+=s.vel.y*dt;s.pos.z+=s.vel.z*dt;
 let impact=0;
 for(const block of COURTYARD_SOLIDS){
  const hx=block.w/2+FOOTBALL_BALL_RADIUS,hz=block.d/2+FOOTBALL_BALL_RADIUS,dx=s.pos.x-block.x,dz=s.pos.z-block.z;
  if(Math.abs(dx)>=hx||Math.abs(dz)>=hz||s.pos.y-FOOTBALL_BALL_RADIUS>=block.h||previous.y-FOOTBALL_BALL_RADIUS>=block.h-.05)continue;
  if(hx-Math.abs(dx)<hz-Math.abs(dz)){s.pos.x=block.x+Math.sign(dx||1)*hx;impact=Math.max(impact,Math.abs(s.vel.x));s.vel.x*=-.58;}else{s.pos.z=block.z+Math.sign(dz||1)*hz;impact=Math.max(impact,Math.abs(s.vel.z));s.vel.z*=-.58;}
 }
 // Crossbars block the skull without turning the goal mouth into a solid wall.
 for(const z of FOOTBALL.goalZ){const h=FOOTBALL.goalHeight,half=.48;
  if(Math.abs(s.pos.x-FOOTBALL.x)>=FOOTBALL.goalHalfWidth+FOOTBALL_BALL_RADIUS||Math.abs(s.pos.z-z)>=half||Math.abs(s.pos.y-h)>=half)continue;
  if(previous.y>=h+half){s.pos.y=h+half;impact=Math.max(impact,Math.abs(s.vel.y));s.vel.y=Math.abs(s.vel.y)*.58;}
  else if(previous.y<=h-half){s.pos.y=h-half;impact=Math.max(impact,Math.abs(s.vel.y));s.vel.y=-Math.abs(s.vel.y)*.58;}
  else {s.pos.z=z+Math.sign(previous.z-z||1)*half;impact=Math.max(impact,Math.abs(s.vel.z));s.vel.z*=-.58;}
 }
 const floor=courtyardFloor(s.pos.x,s.pos.z,c)+FOOTBALL_BALL_RADIUS;
 if(s.pos.y<floor){impact=Math.max(impact,Math.abs(s.vel.y));s.pos.y=floor;s.vel.y=Math.abs(s.vel.y)>1?-s.vel.y*.28:0;const friction=Math.exp(-(s.pos.x>=14?.65:2.1)*dt);s.vel.x*=friction;s.vel.z*=friction;}
 const confined=constrainCourtyard(previous,s.pos,FOOTBALL_BALL_RADIUS);
 for(const axis of ['x','z'] as const)if(confined[axis]!==s.pos[axis]){impact=Math.max(impact,Math.abs(s.vel[axis]));s.pos[axis]=confined[axis];s.vel[axis]*=-.62;}
 if(impact>2&&!c.events.some(e=>e.kind==='bounce'&&tick-e.tick<18))courtyardEvent(c,tick,'bounce',s.pos);
 s.rotation.x+=s.vel.z*dt/FOOTBALL_BALL_RADIUS;s.rotation.z-=s.vel.x*dt/FOOTBALL_BALL_RADIUS;s.rotation.y+=s.vel.y*dt*.2;
 // A score requires the entire skull to cross from the pitch into the goal.
 for(const [i,goalZ] of FOOTBALL.goalZ.entries()){
  const direction=i===0?-1:1,plane=goalZ+direction*FOOTBALL_BALL_RADIUS;
  if((previous.z-plane)*direction<=0&&(s.pos.z-plane)*direction>0&&Math.abs(s.pos.x-FOOTBALL.x)<FOOTBALL.goalHalfWidth-FOOTBALL_BALL_RADIUS&&s.pos.y+FOOTBALL_BALL_RADIUS<FOOTBALL.goalHeight){s.goals[i]++;s.resetAt=tick+105;courtyardEvent(c,tick,'goal',s.pos);break;}
 }
 // Let a valid goal win first, then reset any ball fully beyond a touchline.
 if(!s.resetAt&&(Math.abs(s.pos.x-FOOTBALL.x)>FOOTBALL.width/2+FOOTBALL_BALL_RADIUS||Math.abs(s.pos.z-FOOTBALL.z)>FOOTBALL.length/2+FOOTBALL_BALL_RADIUS)){resetSkull(c,players);return;}
 if(s.pos.y<-4||!Number.isFinite(s.pos.x))s.resetAt=tick+90;
 if(Math.hypot(s.vel.x,s.vel.y,s.vel.z)<.045)s.vel={x:0,y:0,z:0};
 if(pitIsOpen(c)&&insidePit(s.pos)&&s.pos.y<0)s.resetAt ||=tick+90;
}
/** Release-to-rearm hand contact, with no camera or player-position manipulation. */
export function stepHighFives(c:CourtyardState,players:Body[],tick:number,contacts:Set<string>){
 const active=new Set<string>();
 for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
  const a=players[i],b=players[j],dx=b.player.pos.x-a.player.pos.x,dz=b.player.pos.z-a.player.pos.z,d=Math.hypot(dx,dz);
  if(d<.5||d>2.2||Math.abs(a.player.pos.y-b.player.pos.y)>.7)continue;
  if((-Math.sin(a.input.yaw)*dx-Math.cos(a.input.yaw)*dz)/d<.45||(Math.sin(b.input.yaw)*dx+Math.cos(b.input.yaw)*dz)/d<.45)continue;
  if(!(a.input.leftArm&&b.input.rightArm||a.input.rightArm&&b.input.leftArm))continue;
  const key=[a.id,b.id].sort().join(':');active.add(key);
  if(!contacts.has(key)&&!c.events.some(e=>e.kind==='highfive'&&tick-e.tick<90&&e.players.includes(a.id)&&e.players.includes(b.id)))courtyardEvent(c,tick,'highfive',{x:(a.player.pos.x+b.player.pos.x)/2,y:(a.player.pos.y+b.player.pos.y)/2+.35,z:(a.player.pos.z+b.player.pos.z)/2},[a.id,b.id]);
 }
 contacts.clear();for(const key of active)contacts.add(key);
}
