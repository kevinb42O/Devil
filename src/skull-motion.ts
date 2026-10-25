import type {Enemy,Vec} from './simulation';
import {skullTier} from './enemy-kinds';

const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
export const skullAngleDelta=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
const profiles=[
 {response:24,pitch:.36,bank:.43,lean:.18,drift:.022},
 {response:15,pitch:.26,bank:.32,lean:.15,drift:.012},
 {response:19,pitch:.36,bank:.39,lean:.17,drift:.007},
 {response:18,pitch:.07,bank:.09,lean:.035,drift:0},
];
type Axis={value:number;velocity:number};
/** Exact critically damped response for a held target; stable at any display rate. */
function spring(axis:Axis,target:number,response:number,dt:number,decay:number){
 const offset=axis.value-target,j=(axis.velocity+response*offset)*dt;
 axis.value=target+(offset+j)*decay;
 axis.velocity=(axis.velocity-response*j)*decay;
}
export type SkullPose={yaw:number;pitch:number;roll:number;phase:number;follow:number;lift:number;energy:number};
type State={age:number;time:number;x:number;y:number;z:number;heading:number;speed:number;turn:number;accel:number;seen:number;
 yaw:Axis;pitch:Axis;roll:Axis;follow:Axis;lift:Axis;pose:SkullPose};

/** Cosmetic state only. Source time freezes pauses, and never consumes the world's RNG.
 * Seeks seed from current velocity, not a future pose; no replay format changes. */
export class SkullMotion{
 private states=new Map<number,State>();
 private world:object|null=null;
 private time=-Infinity;
 private frame=0;
 private delta=0;
 private decays=profiles.map(()=>new Float64Array(5));
 get size(){return this.states.size;}
 clear(){this.states.clear();this.world=null;this.time=-Infinity;}
 begin(world:object,time:number){
  if(this.world!==world||time<this.time||time-this.time>.35)this.clear();
  this.delta=time-this.time;
  if(this.delta>0&&Number.isFinite(this.delta))for(let i=0;i<profiles.length;i++){
   const r=profiles[i].response,d=this.decays[i];
   d[0]=Math.exp(-r*this.delta);d[1]=Math.exp(-r*.8*this.delta);d[2]=Math.exp(-r*.9*this.delta);d[3]=Math.exp(-9*this.delta);d[4]=Math.exp(-8*this.delta);
  }
  this.world=world;this.time=time;this.frame++;
 }
 end(){for(const [id,s]of this.states)if(s.seen!==this.frame)this.states.delete(id);}
 sample(e:Enemy,player:Vec,reduced=false,grounded=false):SkullPose{
  const time=this.time,tier=skullTier(e.kind),profile=clamp(tier-1,0,3),p=profiles[profile];
  const horizontal=Math.hypot(e.vel.x,e.vel.z),speed=Math.hypot(horizontal,e.vel.y);
  let s=this.states.get(e.id);
  const heading=horizontal>.08?Math.atan2(e.vel.x,e.vel.z):s?.heading??e.facingYaw;
  const flightPitch=grounded?0:clamp(-Math.atan2(e.vel.y,Math.max(.4,horizontal)),-p.pitch,p.pitch);
  if(!s||e.age<s.age||Math.hypot(e.pos.x-s.x,e.pos.y-s.y,e.pos.z-s.z)>Math.max(3,speed*.3)){
   const phase=e.phase+e.id*2.399963229728653;
   s={age:e.age,time,x:e.pos.x,y:e.pos.y,z:e.pos.z,heading,speed,turn:0,accel:0,seen:this.frame,
    yaw:{value:heading,velocity:0},pitch:{value:flightPitch,velocity:0},roll:{value:0,velocity:0},
    follow:{value:0,velocity:0},lift:{value:0,velocity:0},
    pose:{yaw:heading,pitch:flightPitch,roll:0,phase,follow:0,lift:0,energy:0}};
   this.states.set(e.id,s);
  }
  s.seen=this.frame;
  const dt=time-s.time;
  if(dt>0){
   const filter=1-Math.exp(-12*dt),turn=clamp(skullAngleDelta(heading-s.heading)/dt,-5,5);
   s.turn+=(turn-s.turn)*filter;s.accel+=(clamp((speed-s.speed)/dt,-12,12)-s.accel)*filter;
   const target=s.yaw.value+skullAngleDelta(heading-s.yaw.value);
   const d=this.decays[profile],shared=dt===this.delta;
   spring(s.yaw,target,p.response,dt,shared?d[0]:Math.exp(-p.response*dt));
   // Bounded lag prevents a face looking away from its actual trajectory.
   s.yaw.value=heading+clamp(skullAngleDelta(s.yaw.value-heading),-.32,.32);
   const bankLimit=grounded?.09:p.bank;
   spring(s.roll,clamp(-s.turn*p.lean,-bankLimit,bankLimit),p.response*.8,dt,shared?d[1]:Math.exp(-p.response*.8*dt));
   spring(s.pitch,clamp(flightPitch+(grounded?0:s.accel*.006),-p.pitch,p.pitch),p.response*.9,dt,shared?d[2]:Math.exp(-p.response*.9*dt));
   spring(s.follow,clamp(s.turn*.17,-.65,.65),9,dt,shared?d[3]:Math.exp(-9*dt));
   spring(s.lift,clamp(s.accel*.025,-.25,.25),8,dt,shared?d[4]:Math.exp(-8*dt));
   s.time=time;s.age=e.age;s.heading=heading;s.speed=speed;s.x=e.pos.x;s.y=e.pos.y;s.z=e.pos.z;
  }
  const pose=s.pose,phase=pose.phase;
  const close=clamp((Math.hypot(player.x-e.pos.x,player.z-e.pos.z)-1.5)/5,0,1);
  const freedom=.35+.65*close,motion=reduced?.2:1,hollow=e.kind.startsWith('transmuted');
  const emerge=clamp(e.age/.3,0,1),drift=grounded?0:p.drift*(hollow?.55:1)*close*motion*emerge;
  const hitAge=time-e.lastHit;
  const hit=hitAge>=0&&hitAge<.5?Math.sin(hitAge*29)*Math.exp(-hitAge*12)*.16*motion:0;
  // Analytic impulses cannot stack into uncontrolled spinning under rapid fire.
  pose.yaw=s.yaw.value+Math.sin(e.age*1.3+phase)*drift*.5;
  pose.pitch=s.pitch.value+Math.sin(e.age*1.8+phase)*drift+hit;
  pose.roll=s.roll.value*freedom*(reduced?.55:1)+Math.sin(e.age*1.1+phase*1.7)*drift+hit*Math.sin(phase)*.65;
  pose.follow=s.follow.value*motion*(hollow?.65:1);
  pose.lift=grounded?0:s.lift.value*motion;
  pose.energy=clamp(speed/9,0,1)*motion;
  return pose;
 }
}
