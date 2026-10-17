import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MovementMotion,MOVEMENT_MOTION as T,movementIntensity} from '../src/movement-motion.ts';
const player=()=>({pos:{x:0,y:1.7,z:0},vel:{x:0,y:0,z:0},grounded:true});
const length=(p:{x:number;y:number;z:number})=>Math.hypot(p.x,p.y,p.z);
const snapshot=(m:MovementMotion)=>structuredClone(m.diagnostics);
function motion(){const m=new MovementMotion();m.configure(100);return m;}
function frames(m:MovementMotion,p:ReturnType<typeof player>,n:number,dt=1/120,yaw=0,pitch=0){for(let i=0;i<n;i++)m.update(p,yaw,pitch,dt);}

test('movement preference is independent, bounded, and tolerates old or corrupt settings',()=>{
 assert.equal(movementIntensity(undefined),60);assert.equal(movementIntensity(null,0),0);assert.equal(movementIntensity(0),0);assert.equal(movementIntensity(-1),0);assert.equal(movementIntensity(999),100);assert.equal(movementIntensity(NaN),60);
});
test('stationary players have no invented idle bob or arm oscillation',()=>{
 const m=motion(),p=player();frames(m,p,600);
 assert.deepEqual(m.pose,{arm:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},camera:{x:0,y:0,z:0},counterSwing:0});assert.equal(m.diagnostics.phase,0);
});
test('gait phase follows travelled ground distance at 30, 60 and 144 fps',()=>{
 const samples=[];
 for(const fps of [30,60,144]){const m=motion(),p=player();p.vel.z=-11;
  for(let i=0;i<fps/2;i++){p.pos.z-=11/fps;m.update(p,0,0,1/fps);}samples.push(snapshot(m));
 }
 for(const s of samples){assert.ok(Math.abs(s.phase-samples[0].phase)<1e-12);for(const part of ['arm','rotation','camera'] as const)for(const k of ['x','y','z'] as const)assert.ok(Math.abs(s[part][k]-samples[0][part][k])<1e-10,`${part}.${k}`);}
});
test('walking and running have distinct cadence and bounded expressive arm motion',()=>{
 const slow=motion(),fast=motion(),a=player(),b=player();a.vel.z=-3;b.vel.z=-11;frames(slow,a,12);frames(fast,b,12);
 assert.ok(fast.diagnostics.phase>slow.diagnostics.phase);assert.ok(length(fast.pose.arm)>0);assert.ok(length(fast.pose.rotation)>0);
});
test('airborne motion stops the gait and settles camera bob while retaining arm inertia',()=>{
 const m=motion(),p=player();p.vel.z=-11;frames(m,p,60);const phase=m.diagnostics.phase;
 p.grounded=false;p.vel.y=9;frames(m,p,120);assert.equal(m.diagnostics.phase,phase);assert.equal(length(m.pose.camera),0);assert.ok(Math.abs(m.pose.arm.y)>0);
});
test('strafing leans the arm opposite movement and braking produces a settling response',()=>{
 const m=motion(),p=player();p.grounded=false;p.vel.x=11;frames(m,p,120);
 assert.ok(m.pose.arm.x<0);assert.ok(m.pose.rotation.z>0);
 p.vel.x=0;frames(m,p,12);assert.ok(length(m.pose.arm)>0);frames(m,p,480);
 assert.deepEqual(m.pose.arm,{x:0,y:0,z:0});assert.deepEqual(m.pose.rotation,{x:0,y:0,z:0});assert.equal(length(m.pose.camera),0);
});
test('reversing direction produces opposite, limited arm inertia',()=>{
 const m=motion(),p=player();p.grounded=false;p.vel.x=11;frames(m,p,120);p.vel.x=-11;frames(m,p,120);
 assert.ok(m.pose.arm.x>0);assert.ok(m.pose.rotation.z<0);assert.ok(length(m.pose.arm)<=T.maxArm);
});
test('look sway wraps yaw correctly and never rotates the gameplay camera',()=>{
 const m=motion(),p=player();m.update(p,Math.PI-.001,0,1/60);m.update(p,-Math.PI+.001,0,1/60);
 assert.ok(Math.abs(m.pose.rotation.y)<.001,'crossing the yaw wrap is a tiny turn');
 for(let i=0;i<200;i++)m.update(p,i*.4,Math.sin(i)*1.5,1/60);
 assert.ok(length(m.pose.rotation)<=T.maxRotation+1e-12);assert.ok(length(m.pose.camera)<=T.maxCamera+1e-12);
});
test('pause and invalid dt preserve exact visual state, including angular history',()=>{
 const m=motion(),p=player();p.vel.z=-11;frames(m,p,30);const before=snapshot(m);
 for(const dt of [0,-1,NaN,Infinity]){m.update(p,2,1,dt);assert.deepEqual(snapshot(m),before);}
});
test('large position corrections and tab interruptions reset instead of kicking',()=>{
 const m=motion(),p=player();p.vel.z=-11;frames(m,p,30);p.pos.x+=50;m.update(p,1,0,1/60);
 assert.equal(length(m.pose.camera),0);assert.equal(length(m.pose.arm),0);assert.equal(m.diagnostics.phase,0);
 frames(m,p,30);m.update(p,1,0,2);assert.equal(length(m.pose.arm),0);assert.equal(length(m.pose.camera),0);
});
test('small network position corrections cannot add fake footsteps or acceleration',()=>{
 const a=motion(),b=motion(),p=player(),q=player();p.vel.z=q.vel.z=-11;
 for(let i=0;i<120;i++){p.pos.z-=11/120;q.pos.z=p.pos.z+(i%2?.08:-.08);a.update(p,0,0,1/120);b.update(q,0,0,1/120);}
 assert.deepEqual(a.pose,b.pose);assert.equal(a.diagnostics.phase,b.diagnostics.phase);
});
test('off clears motion immediately and re-enabling cannot replay old inertia',()=>{
 const m=motion(),p=player();p.vel.z=-11;frames(m,p,30);m.configure(0);assert.equal(length(m.pose.arm),0);frames(m,p,30);assert.equal(m.diagnostics.phase,0);
 m.configure(100);p.vel.z=0;m.update(p,0,0,1/60);assert.equal(length(m.pose.arm),0);assert.equal(length(m.pose.camera),0);
});
test('intensity scales position and rotation without changing the gait',()=>{
 const a=motion(),b=motion(),p=player();p.vel.z=-11;b.configure(35);frames(a,p,30);frames(b,p,30);
 assert.equal(a.diagnostics.phase,b.diagnostics.phase);
 for(const part of ['arm','rotation','camera'] as const)for(const k of ['x','y','z'] as const)assert.ok(Math.abs(a.pose[part][k]*.35-b.pose[part][k])<1e-12);
});
test('aggressive motion remains finite and bounded and never mutates player state',()=>{
 const m=motion(),p=player();
 for(let i=0;i<2400;i++){
  p.vel={x:Math.sin(i*.31)*18,y:Math.cos(i*.19)*26,z:Math.cos(i*.25)*18};p.grounded=i%30<18;const before=JSON.stringify(p);
  m.update(p,i*.1,Math.sin(i*.1)*1.5,1/120);assert.equal(JSON.stringify(p),before);
  for(const [part,max] of [['arm',T.maxArm],['rotation',T.maxRotation],['camera',T.maxCamera]] as const){assert.ok(Number.isFinite(length(m.pose[part])));assert.ok(length(m.pose[part])<=max+1e-12);}
 }
 m.clear();assert.equal(length(m.pose.arm),0);assert.equal(length(m.pose.rotation),0);assert.equal(length(m.pose.camera),0);
});

test('capped rendering time cannot slow the gait relative to simulated travel',()=>{
 const m=motion(),p=player();p.vel.z=-11;
 for(let i=0;i<10;i++){p.pos.z-=1.1;m.update(p,0,0,.05,.1);}
 const expected=(11*Math.PI*2/T.stride)%(Math.PI*2);
 assert.ok(Math.abs(m.diagnostics.phase-expected)<1e-12);
});

 test('right and left turns trail the view instead of leading it',()=>{
 for(const direction of [-1,1]){
  const m=motion(),p=player();m.update(p,0,0,1/60);m.update(p,direction*.04,0,1/60);
  assert.ok(m.pose.arm.x*direction>0);assert.ok(m.pose.rotation.y*direction<0);
 }
});

test('forward and backward travel have distinct depth and whole-arm pitch',()=>{
 for(const direction of [-1,1]){
  const m=motion(),p=player();p.grounded=false;p.vel.z=-11*direction;frames(m,p,120);
  assert.ok(m.pose.arm.z*direction>.01);assert.ok(m.pose.rotation.x*direction>.02);
 }
});

test('takeoff dips the hand and landing compresses then rebounds with impact speed',()=>{
 const sample=(speed:number)=>{
  const m=motion(),p=player();frames(m,p,1);p.grounded=false;p.vel.y=9;frames(m,p,8);
  assert.ok(m.pose.arm.y<-.015,'takeoff has visible downward arm lag');
  p.vel.y=-speed;frames(m,p,45);p.grounded=true;p.vel.y=0;
  const ys=[];for(let i=0;i<60;i++){frames(m,p,1);ys.push(m.pose.arm.y);}
  assert.ok(Math.min(...ys.slice(0,12))<-.005,'landing compresses');
  assert.ok(Math.max(...ys.slice(12,45))>0,'landing rebounds');
  frames(m,p,240);assert.deepEqual(m.pose.arm,{x:0,y:0,z:0});
  return Math.min(...ys);
 };
 assert.ok(sample(12)<sample(4),'harder falls produce deeper compression');
});

test('jump and landing response agrees across display rates',()=>{
 const samples=[];
 for(const fps of [30,60,144]){
  const m=motion(),p=player();frames(m,p,1,1/fps);p.grounded=false;p.vel.y=-9;frames(m,p,fps/2,1/fps);
  p.grounded=true;p.vel.y=0;frames(m,p,Math.round(fps/6),1/fps);samples.push({...m.pose.arm});
 }
 for(const p of samples)assert.ok(Math.abs(p.y-samples[0].y)<.004,'landing timing is consistent');
});
