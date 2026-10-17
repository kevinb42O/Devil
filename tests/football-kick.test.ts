import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourtyard,FOOTBALL,FOOTBALL_BALL_RADIUS,KICK_CHARGE_TICKS,footballKickPose,validateCourtyard} from '../src/courtyard-state';
import {stepSkull,stepFootballKicks,blockFootball} from '../src/courtyard-physics';
import {idleInput} from '../src/simulation';
import {FriendsSession} from '../src/multiplayer';
import {encodeState,decodeState} from '../src/network-state';
const body=()=>({id:'host',player:{pos:{x:FOOTBALL.x,y:1.7,z:FOOTBALL.z+1.1},vel:{x:0,y:0,z:0}},input:{...idleInput(),fire:true}});
test('every touchline returns the out-of-bounds skull exactly to midfield without altering score',()=>{
 for(const pos of [{x:FOOTBALL.x-18.51,y:FOOTBALL_BALL_RADIUS,z:2},{x:FOOTBALL.x+18.51,y:FOOTBALL_BALL_RADIUS,z:2},{x:45,y:FOOTBALL_BALL_RADIUS,z:FOOTBALL.z-25.51},{x:45,y:FOOTBALL_BALL_RADIUS,z:FOOTBALL.z+25.51}]){
  const c=createCourtyard(1);c.skull.goals=[2,3];c.skull.pos=pos;c.skull.vel={x:1,y:0,z:0};stepSkull(c,[],1,1/120);
  assert.deepEqual(c.skull.pos,{x:36,y:FOOTBALL_BALL_RADIUS,z:2});assert.deepEqual(c.skull.vel,{x:0,y:0,z:0});assert.deepEqual(c.skull.goals,[2,3]);assert.equal(c.skull.reset,1);
 }
 const c=createCourtyard(1);c.skull.pos.x=FOOTBALL.x+18.2;stepSkull(c,[],1,1/120);assert.equal(c.skull.reset,0,'partially crossing a line remains in play');
});
test('hold and release charges exactly once, stays bounded, and produces a stronger kick',()=>{
 const speeds=[];
 for(const duration of [12,KICK_CHARGE_TICKS,KICK_CHARGE_TICKS*3]){
  const c=createCourtyard(1),p=body();for(let i=1;i<=duration;i++)stepSkull(c,[p],i,1/120);
  assert.equal(c.skull.vel.z,0,'holding never kicks');assert.equal(footballKickPose(c,'host',duration)!.charge,Math.min(1,(duration-1)/KICK_CHARGE_TICKS));
  p.input.fire=false;stepSkull(c,[p],duration+1,1/120);speeds.push(-c.skull.vel.z);assert.equal(c.events.filter(e=>e.kind==='kick').length,1);assert.ok(c.kicks.host.power<=1);
  for(let i=duration+2;i<duration+10;i++)stepSkull(c,[p],i,1/120);assert.equal(c.events.filter(e=>e.kind==='kick').length,1);
 }
 assert.ok(speeds[1]>speeds[0]*2);assert.ok(Math.abs(speeds[1]-speeds[2])<.001);assert.ok(speeds[1]<=24);
});
test('right-click input charges and releases a football kick',()=>{
 const c=createCourtyard(1),p=body();p.input.fire=false;p.input.homing=true;
 stepFootballKicks(c,[p],1);p.input.homing=false;stepFootballKicks(c,[p],2);
 assert.equal(c.events.filter(e=>e.kind==='kick').length,1);assert.ok(c.skull.vel.z<0);assert.equal(footballKickPose(c,'host',2)!.right,true);
 const left=createCourtyard(1),leftPlayer=body();stepFootballKicks(left,[leftPlayer],1);leftPlayer.input.fire=false;stepFootballKicks(left,[leftPlayer],2);assert.equal(footballKickPose(left,'host',2)!.right,false);
});

test('casual taps sustain a stationary juggle with either foot or alternating feet',()=>{
 for(const mode of ['left','right','alternate'])for(const cadence of [24,48,72]){
  const c=createCourtyard(1),p=body();let peak=0;
  for(let tick=1;tick<=2400;tick++){
   const right=mode==='right'||mode==='alternate'&&Math.floor((tick-1)/cadence)%2===1;
   p.input.fire=(tick-1)%cadence===0&&!right;p.input.homing=(tick-1)%cadence===0&&right;
   stepSkull(c,[p],tick,1/120);peak=Math.max(peak,c.skull.pos.y);
   if(tick>2)assert.ok(c.skull.pos.y>FOOTBALL_BALL_RADIUS,`${mode} / ${cadence}: ball dropped at ${tick}`);
   assert.ok(Math.hypot(c.skull.pos.x-p.player.pos.x,c.skull.pos.z-p.player.pos.z)<2.5,'no chasing needed');
   assert.ok(c.skull.pos.y<3.2,'rapid taps never stack upward impulses');
  }
  assert.ok(peak>2.9,'touches lift the ball high enough to show off');assert.ok(c.sequence>20);assert.equal(validateCourtyard(c),true);
 }
});

test('an early tap waits for the descending ball and animates the selected foot on contact',()=>{
 const c=createCourtyard(1),p=body();p.input.fire=false;p.input.homing=true;c.skull.pos.y=3.05;c.skull.vel.y=.5;
 stepSkull(c,[p],1,1/120);p.input.homing=false;stepSkull(c,[p],2,1/120);
 assert.equal(c.events.length,0,'no remote touch while the ball is overhead');assert.ok(c.kicks.host.tapUntil!>2);
 for(let tick=3;tick<=60;tick++)stepSkull(c,[p],tick,1/120);
 assert.equal(c.events.filter(e=>e.kind==='kick').length,1);const touch=c.events.find(e=>e.kind==='kick')!;
 assert.ok(touch.tick>2);assert.equal(footballKickPose(structuredClone(c),'host',touch.tick)!.right,true);assert.equal(c.kicks.host.tapUntil,undefined);
});

test('missed buffered taps expire and cannot touch distant or resetting balls',()=>{
 for(const mode of ['far','reset','behind']){
  const c=createCourtyard(1),p=body();if(mode==='far')p.player.pos.x+=10;if(mode==='behind')p.input.yaw=Math.PI;if(mode==='reset')c.skull.resetAt=500;
  stepFootballKicks(c,[p],1);p.input.fire=false;
  for(let tick=2;tick<=100;tick++)stepFootballKicks(c,[p],tick);
  assert.equal(c.events.length,0);assert.equal(c.kicks.host.tapUntil,undefined);
 }
});

test('juggle height, selected foot and buffered taps survive multiplayer snapshots',()=>{
 const h=new FriendsSession('host');
 try{
  h.enterPrelobby();const c=h.courtyard!,p=body();p.input.fire=false;p.input.homing=true;c.skull.pos.y=3.05;
  stepFootballKicks(c,[p],1);p.input.homing=false;stepFootballKicks(c,[p],2);
  const pending=decodeState(encodeState(h.snapshot()!,1,0),new Map())!.snapshot.courtyard!;
  assert.equal(pending.kicks.host.tapUntil,c.kicks.host.tapUntil);assert.equal(pending.kicks.host.right,true);
  for(let tick=3;tick<=60;tick++)stepSkull(c,[p],tick,1/120);
  const visible=decodeState(encodeState(h.snapshot()!,2,0),new Map())!.snapshot.courtyard!;
  assert.ok(Math.abs(visible.skull.pos.y-c.skull.pos.y)<.01);assert.ok(visible.skull.vel.y>0);
  assert.equal(footballKickPose(visible,'host',c.kicks.host.released)!.right,true);assert.equal(visible.events.at(-1)!.kind,'kick');
  c.kicks.host.tapUntil=Infinity;assert.equal(validateCourtyard(c),false);
 }finally{h.close();}
});
test('walking dribbles on the ground without stacking launch impulses, even while charging',()=>{
 const c=createCourtyard(1),p=body();p.player.vel.z=-3;
 for(let tick=1;tick<=120;tick++){
  p.player.pos.z=c.skull.pos.z+1;
  stepSkull(c,[p],tick,1/120);
  assert.ok(Math.abs(c.skull.vel.z)<4,'gentle touches keep the ball close');
  assert.equal(c.skull.pos.y,FOOTBALL_BALL_RADIUS,'walking never launches the ball');
 }
});
test('body blocks intercept fast passes from either direction without needing a kick',()=>{
 for(const direction of [-1,1]){
  const c=createCourtyard(1),p=body();p.player.pos={x:36,y:1.7,z:2};p.input.fire=false;
  const previous={x:36,y:.5,z:2+direction*2};
  c.skull.pos={x:36,y:.5,z:2-direction*2};c.skull.vel={x:0,y:0,z:-direction*24};
  blockFootball(c,[p],previous,1/6);
  assert.ok((c.skull.pos.z-2)*direction>.88,'ball stays on the incoming side');
  assert.ok(c.skull.vel.z*direction>0,'body deflects the ball away');
 }
});
test('a moving player can intercept while an overhead ball clears the body',()=>{
 const c=createCourtyard(1),p=body();p.player.pos={x:36,y:1.7,z:2};p.player.vel.x=3;p.input.fire=false;
 c.skull.pos={x:36,y:.5,z:2};c.skull.vel={x:0,y:0,z:-24};
 blockFootball(c,[p],{x:36,y:.5,z:4},.1);
 assert.ok(c.skull.pos.z>2.88,'moving defender blocks the pass');
 c.skull.pos={x:36,y:3,z:0};c.skull.vel={x:0,y:0,z:-24};
 blockFootball(c,[p],{x:36,y:3,z:4},1/6);
 assert.equal(c.skull.pos.z,0,'high ball passes above the defender');
});
test('dribbling keeps the ball ahead at walking and full movement speed',()=>{
 for(const speed of [3,11]){
  const c=createCourtyard(1),p=body();p.player.vel.z=-speed;
  for(let tick=1;tick<=240;tick++){p.player.pos.z-=speed/120;stepSkull(c,[p],tick,1/120);assert.ok(c.skull.pos.z<p.player.pos.z,'player does not run past the ball');}
  assert.ok(c.skull.pos.z<FOOTBALL.z-speed*1.5,'ball follows the moving player down the pitch');
 }
});
test('backwards facing and distant releases do not kick the ball',()=>{
 for(const mode of ['back','far']){const c=createCourtyard(1),p=body();stepFootballKicks(c,[p],1);p.input.fire=false;if(mode==='back')p.input.yaw=Math.PI;if(mode==='far')p.player.pos.x+=10;stepFootballKicks(c,[p],145);assert.deepEqual(c.skull.vel,{x:0,y:0,z:0});assert.equal(c.events.length,0);assert.equal(c.kicks.host.started,-1);}
});
test('kick pose expires, departures remove state, and snapshot validation rejects unbounded kick power',()=>{
 const c=createCourtyard(1),p=body();stepFootballKicks(c,[p],1);p.input.fire=false;stepFootballKicks(c,[p],145);assert.ok(footballKickPose(c,'host',146));assert.equal(footballKickPose(c,'host',206),undefined);assert.equal(validateCourtyard(c),true);c.kicks.host.power=2;assert.equal(validateCourtyard(c),false);stepFootballKicks(c,[],207);assert.deepEqual(c.kicks,{});
});
