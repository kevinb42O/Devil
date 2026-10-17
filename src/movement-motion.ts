import type {Vec} from './simulation';

/** Presentation only. Distances are metres, angles radians, intensity percent. */
export const MOVEMENT_MOTION={defaultIntensity:60,stride:4.8,maxCamera:.012,maxArm:.065,maxRotation:.15} as const;
export type MovementPose={arm:Vec;rotation:Vec;camera:Vec;counterSwing?:number};
type Player={pos:Vec;vel:Vec;grounded:boolean};
const TAU=Math.PI*2;
const clamp=(x:number,max:number)=>Math.max(-max,Math.min(max,x));
const angle=(x:number)=>Math.atan2(Math.sin(x),Math.cos(x));
const axes=['x','y','z'] as const;
export function movementIntensity(value:unknown,fallback:number=MOVEMENT_MOTION.defaultIntensity){return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):fallback;}
class Spring{
 value=0;velocity=0;
 reset(){this.value=this.velocity=0;}
 update(target:number,dt:number){
  // Exact critically damped integration for a constant target over this frame.
  const frequency=20,delta=this.value-target,c=this.velocity+frequency*delta,decay=Math.exp(-frequency*dt);
  this.value=target+(delta+c*dt)*decay;this.velocity=(this.velocity-frequency*c*dt)*decay;
  if(target===0&&Math.abs(this.value)<1e-8&&Math.abs(this.velocity)<1e-8)this.reset();
  return this.value;
 }
}
function limit(v:Vec,max:number){const length=Math.hypot(v.x,v.y,v.z);if(length>max){const k=max/length;v.x*=k;v.y*=k;v.z*=k;}}
/** Velocity supplies travelled distance, so network position corrections cannot
 * introduce a fake footstep, acceleration kick, or turn. No simulation writes. */
export class MovementMotion{
 readonly pose:MovementPose={arm:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},camera:{x:0,y:0,z:0},counterSwing:0};
 private amount=MOVEMENT_MOTION.defaultIntensity/100;
 private arm={x:new Spring(),y:new Spring(),z:new Spring()};
 private rotation={x:new Spring(),y:new Spring(),z:new Spring()};
 private cameraSpring=new Spring();
 private previous={x:0,y:0,z:0};private filtered={x:0,y:0,z:0};
 private primed=false;private yaw=0;private pitch=0;private phase=0;private ground=0;private speedWeight=0;
 private wasGrounded=true;private verticalSpeed=0;
 private impactAge=10;private impactStrength=0;private takeoffAge=10;
 configure(value:unknown){this.amount=movementIntensity(value)/100;if(!this.amount)this.clear();}
 clear(){
  this.primed=false;this.phase=this.ground=this.speedWeight=0;this.cameraSpring.reset();
  this.impactAge=this.takeoffAge=10;this.impactStrength=0;this.pose.counterSwing=0;
  for(const key of axes){this.arm[key].reset();this.rotation[key].reset();this.pose.arm[key]=this.pose.rotation[key]=this.pose.camera[key]=0;}
 }
 private prime(player:Player,yaw:number,pitch:number){
  this.primed=true;this.yaw=yaw;this.pitch=pitch;
  this.wasGrounded=player.grounded;this.verticalSpeed=player.vel.y;
  for(const key of axes){this.previous[key]=player.pos[key];this.filtered[key]=player.vel[key];}
 }
 update(player:Player,yaw:number,pitch:number,dt:number,travelDt=dt):MovementPose{
  if(!this.amount)return this.pose;
  if(!Number.isFinite(dt)||dt<=0)return this.pose;
  const speed=Math.min(18,Math.hypot(player.vel.x,player.vel.z));
  const distance=Math.hypot(player.pos.x-this.previous.x,player.pos.y-this.previous.y,player.pos.z-this.previous.z);
  if(dt>.25||this.primed&&distance>Math.max(2,speed*dt*3+.15)){
   this.clear();this.prime(player,yaw,pitch);return this.pose;
  }
  if(!this.primed)this.prime(player,yaw,pitch);
  // Ground transitions drive the arm's compression and rebound, independently
  // of camera shake. Retain descent speed before the simulation zeros it.
  if(player.grounded&&!this.wasGrounded){this.impactAge=0;this.impactStrength=Math.min(1.4,Math.max(0,-this.verticalSpeed)/9);}
  if(!player.grounded&&this.wasGrounded&&player.vel.y>1)this.takeoffAge=0;
  this.wasGrounded=player.grounded;this.verticalSpeed=player.vel.y;
  this.impactAge+=dt;this.takeoffAge+=dt;
  const sy=Math.sin(yaw),cy=Math.cos(yaw),v=player.vel;
  const side=clamp(v.x*cy-v.z*sy,18),forward=clamp(-v.x*sy-v.z*cy,18),vertical=clamp(v.y,12);
  const dx=clamp(v.x-this.filtered.x,6),dy=clamp(v.y-this.filtered.y,8),dz=clamp(v.z-this.filtered.z,6);
  const accelerationSide=dx*cy-dz*sy,accelerationForward=-dx*sy-dz*cy;
  const turn=clamp(angle(yaw-this.yaw)/dt,4),look=clamp((pitch-this.pitch)/dt,4);
  const k=1-Math.exp(-12*dt);
  for(const key of axes){this.filtered[key]+=(v[key]-this.filtered[key])*k;if(Math.abs(v[key]-this.filtered[key])<1e-6)this.filtered[key]=v[key];this.previous[key]=player.pos[key];}
  this.yaw=yaw;this.pitch=pitch;
  this.ground+=(Number(player.grounded)-this.ground)*(1-Math.exp(-20*dt));
  this.speedWeight+=(Math.min(1,speed/11)-this.speedWeight)*(1-Math.exp(-10*dt));
  if(this.ground<1e-6)this.ground=0;if(this.speedWeight<1e-6)this.speedWeight=0;
  // Rendering dt may be capped during a slow frame. The renderer supplies
  // sampled simulation time separately so cadence still matches ground travel.
  const travel=Number.isFinite(travelDt)?Math.max(0,Math.min(.25,travelDt)):0;
  if(player.grounded&&speed>.05)this.phase=(this.phase+speed*travel*TAU/MOVEMENT_MOTION.stride)%TAU;
  const weight=this.ground*this.speedWeight,swing=Math.sin(this.phase)*weight,step=Math.cos(this.phase*2)*weight,scale=this.amount;
  const a=this.pose.arm,r=this.pose.rotation,camera=this.pose.camera;
  const travelForward=clamp(forward/11,1),travelSide=clamp(side/11,1);
  // A footfall is a quick downstroke followed by a slower lift. Direction
  // changes the arc: backpedalling retracts the arm, strafing banks it.
  const footfall=(Math.cos(this.phase*2)*.7+Math.cos(this.phase*4)*.3)*weight;
  const landing=this.impactAge<1.5?this.impactStrength*Math.exp(-this.impactAge*11)*Math.sin(this.impactAge*23):0;
  const takeoff=this.takeoffAge<1.5?Math.exp(-this.takeoffAge*13)*Math.sin(this.takeoffAge*19):0;
  a.x=(this.arm.x.update(-side*.00115-accelerationSide*.0028+turn*.003,dt)+swing*.012+footfall*travelSide*.004)*scale;
  a.y=(this.arm.y.update(-vertical*.0016-dy*.0014-look*.002,dt)+footfall*.009-landing*.038-takeoff*.019)*scale;
  a.z=(this.arm.z.update(forward*.00115+accelerationForward*.0028,dt)+Math.sin(this.phase*2)*weight*(.004+Math.abs(travelForward)*.003)+landing*.015)*scale;
  r.x=(this.rotation.x.update(vertical*.0024+forward*.0022+accelerationForward*.003-look*.008,dt)+footfall*.023-landing*.095-takeoff*.035)*scale;
  r.y=(this.rotation.y.update(-side*.0024-accelerationSide*.002-turn*.01,dt)+swing*travelForward*.012)*scale;
  r.z=(this.rotation.z.update(side*.0038+accelerationSide*.003,dt)-swing*.033+landing*travelSide*.025)*scale;
  this.pose.counterSwing=swing*scale;
  camera.x=swing*.0018*scale;
  camera.y=step*.0055*scale;
  // Airborne camera motion fades away while the arm retains vertical inertia.
  camera.z=this.cameraSpring.update(accelerationForward*.00035,dt)*this.ground*scale;
  limit(a,MOVEMENT_MOTION.maxArm*scale);limit(r,MOVEMENT_MOTION.maxRotation*scale);limit(camera,MOVEMENT_MOTION.maxCamera*scale);
  return this.pose;
 }
 get diagnostics(){return {intensity:this.amount*100,phase:this.phase,ground:this.ground,arm:{...this.pose.arm},rotation:{...this.pose.rotation},camera:{...this.pose.camera}};}
}
