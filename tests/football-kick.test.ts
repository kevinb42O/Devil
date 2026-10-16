import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourtyard,FOOTBALL,FOOTBALL_BALL_RADIUS,KICK_CHARGE_TICKS,footballKickPose,validateCourtyard} from '../src/courtyard-state';
import {stepSkull,stepFootballKicks} from '../src/courtyard-physics';
import {idleInput} from '../src/simulation';
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
 assert.equal(c.events.filter(e=>e.kind==='kick').length,1);assert.ok(c.skull.vel.z<0);
});
test('cancel, backwards facing and distant releases do not kick the ball',()=>{
 for(const mode of ['back','far']){const c=createCourtyard(1),p=body();stepFootballKicks(c,[p],1);p.input.fire=false;if(mode==='back')p.input.yaw=Math.PI;if(mode==='far')p.player.pos.x+=10;stepFootballKicks(c,[p],145);assert.deepEqual(c.skull.vel,{x:0,y:0,z:0});assert.equal(c.events.length,0);assert.equal(c.kicks.host.started,-1);}
});
test('kick pose expires, departures remove state, and snapshot validation rejects unbounded kick power',()=>{
 const c=createCourtyard(1),p=body();stepFootballKicks(c,[p],1);p.input.fire=false;stepFootballKicks(c,[p],145);assert.ok(footballKickPose(c,'host',146));assert.equal(footballKickPose(c,'host',206),undefined);assert.equal(validateCourtyard(c),true);c.kicks.host.power=2;assert.equal(validateCourtyard(c),false);stepFootballKicks(c,[],207);assert.deepEqual(c.kicks,{});
});
