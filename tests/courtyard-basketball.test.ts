import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourtyard,courtyardCanOccupy,validateCourtyard} from '../src/courtyard-state';
import {BASKETBALL as B,basketballAction,stepBasketball,basketballPose,basketballLaunch,basketballHeldPoint,predictBasketball,canBasketballDunk,type BasketballBody} from '../src/courtyard-basketball';
import {FriendsSession} from '../src/multiplayer';
import {idleInput,STEP,World} from '../src/simulation';
import {encodeState,decodeState} from '../src/network-state';

const player=(id='host'):BasketballBody=>({id,player:{pos:{x:12,y:1.7,z:8},vel:{x:0,y:0,z:0}},input:{yaw:Math.PI,pitch:.75,fire:false}});
test('court is directly walkable to the right of spawn, without entering football',()=>{
 for(let x=0;x<10;x+=.1)assert.ok(courtyardCanOccupy(x,8),String(x));
 for(let z=8;z<23;z+=.1)assert.ok(courtyardCanOccupy(B.x,z),String(z));
 assert.equal(courtyardCanOccupy(B.maxX+.3,15),false);
 assert.equal(courtyardCanOccupy(B.x,24.3),false);
});
test('exclusive pickup, release-to-rearm, charge, shoot and retrieve; no automatic return',()=>{
 const c=createCourtyard(1),b=c.basketball!,p=player();
 assert.ok(basketballAction(b,p,0));assert.equal(b.balls[0].owner,p.id);
 const other=player('guest');b.balls.slice(1).forEach(ball=>ball.pos.z=20);
 assert.equal(basketballAction(b,other,0),false);
 p.input.fire=true;stepBasketball(c,[p],1,STEP);for(let t=2;t<109;t++)stepBasketball(c,[p],t,STEP);
 assert.equal(b.balls[0].owner,'host');assert.equal(typeof b.scores.host,'undefined');
 p.input.fire=false;stepBasketball(c,[p],109,STEP);assert.equal(b.balls[0].owner,null);assert.equal(b.scores.host.attempts,1);assert.ok(b.balls[0].vel.y>5);
 for(let t=110;t<1300;t++)stepBasketball(c,[p],t,STEP);
 assert.equal(b.balls[0].owner,null);assert.ok(b.balls[0].pos.y<.2);p.player.pos={...b.balls[0].pos,y:1.7};
 assert.ok(basketballAction(b,p,1301));assert.equal(b.balls[0].owner,'host');assert.equal(b.scores.host.attempts,1);
});
test('click pickup cannot accidentally shoot on the pickup release',()=>{
 const c=createCourtyard(1),p=player();p.input.fire=true;stepBasketball(c,[p],0,STEP);p.input.fire=false;stepBasketball(c,[p],1,STEP);
 assert.equal(c.basketball!.balls[0].owner,p.id);assert.equal(typeof c.basketball!.scores.host,'undefined');
 p.input.fire=true;stepBasketball(c,[p],2,STEP);p.input.fire=false;stepBasketball(c,[p],30,STEP);assert.equal(c.basketball!.scores.host.attempts,1);
});
test('only downward shots inside the ring score once for the shooter; 2 and 3 point shots coexist',()=>{
 const c=createCourtyard(1),b=c.basketball!;
 for(const [i,shooter,points]of [[0,'host',2],[1,'guest',3]] as const){const ball=b.balls[i];ball.pos={x:B.x,y:B.hoopY+.02,z:B.hoopZ};ball.vel={x:0,y:-4,z:0};ball.shooter=shooter;ball.points=points;}
 for(let t=0;t<400;t++)stepBasketball(c,[],t,STEP);
 assert.equal(b.scores.host.points,2);assert.equal(b.scores.guest.points,3);assert.equal(b.scores.host.made,1);assert.equal(c.events.filter(e=>e.kind==='goal').length,2);
 const miss=b.balls[2];miss.shooter='host';miss.pos={x:B.x+.7,y:B.hoopY+.01,z:B.hoopZ};miss.vel={x:0,y:-4,z:0};stepBasketball(c,[],401,STEP);assert.equal(b.scores.host.points,2);
 const under=b.balls[3];under.shooter='host';under.pos={x:B.x,y:B.hoopY-.02,z:B.hoopZ};under.vel={x:0,y:4,z:0};stepBasketball(c,[],402,STEP);assert.equal(b.scores.host.points,2);
});
test('rim and backboard rebound shots; court contains loose balls and disconnects release ownership',()=>{
 const c=createCourtyard(1),ball=c.basketball!.balls[0];ball.pos={x:B.x+B.rim,y:B.hoopY+.15,z:B.hoopZ};ball.vel={x:0,y:-5,z:0};stepBasketball(c,[],1,STEP);assert.ok(ball.vel.y>0);
 ball.pos={x:B.x,y:3.5,z:B.boardZ-.15};ball.vel={x:0,y:0,z:10};stepBasketball(c,[],2,STEP);assert.ok(ball.vel.z<0);
 ball.pos={x:B.maxX-.15,y:.5,z:10};ball.vel={x:15,y:0,z:0};stepBasketball(c,[],3,STEP);assert.ok(ball.vel.x<0);assert.ok(ball.pos.x<=B.maxX-B.ballRadius);
 ball.owner='departed';stepBasketball(c,[],4,STEP);assert.equal(ball.owner,null);assert.ok(validateCourtyard(c));
});
test('real charged ballistic shot can score from beyond the arc and preserves soccer scores',()=>{
 const c=createCourtyard(1),b=c.basketball!,p=player();p.player.pos={x:B.x,y:1.7,z:B.hoopZ-7};
 const ball=b.balls[0];ball.owner='host';b.hands.host={held:false,charge:-1,armed:true};
 // At 45 degrees solve speed for the height difference and release point.
 p.input.pitch=Math.PI/3;const distance=7-.65,height=B.hoopY-(1.7-.32+Math.sin(p.input.pitch)*.3),speed=Math.sqrt(B.gravity*distance*distance/(2*Math.cos(p.input.pitch)**2*(distance*Math.tan(p.input.pitch)-height))),ticks=Math.round((speed-5.5)/9.5*B.chargeTicks);
 p.input.fire=true;stepBasketball(c,[p],1,STEP);p.input.fire=false;stepBasketball(c,[p],1+ticks,STEP);
 for(let t=2+ticks;t<500;t++)stepBasketball(c,[p],t,STEP);
 assert.equal(b.scores.host.points,3);assert.equal(b.scores.host.attempts,1);assert.deepEqual(c.skull.goals,[0,0]);
});
test('basketball survives network encoding and malformed ownership/coordinates are rejected',()=>{
 const h=new FriendsSession('host');try{h.enterPrelobby();const c=h.courtyard!;c.basketball!.scores.host={points:3,made:1,attempts:2};const snapshot=h.snapshot()!;const decoded=decodeState(encodeState(snapshot,1,0),new Map());assert.deepEqual(JSON.parse(JSON.stringify(decoded?.snapshot.courtyard?.basketball)),c.basketball);
 const invalid=structuredClone(c);invalid.basketball!.balls[0].pos.x=NaN;assert.equal(validateCourtyard(invalid),false);
 const malformed=structuredClone(c);(malformed.basketball!.balls as unknown[])[0]=null;assert.equal(validateCourtyard(malformed),false);
 const duplicate=structuredClone(c);duplicate.basketball!.balls[0].owner='host';duplicate.basketball!.balls[1].owner='host';assert.equal(validateCourtyard(duplicate),false);
 }finally{h.close();}
});

test('proportionate hoop accepts off-center shots in every direction with backboard clearance',()=>{
 for(const [dx,dz] of [[.2,0],[-.2,0],[0,.2],[0,-.2],[.14,.14]]){
  const c=createCourtyard(1),ball=c.basketball!.balls[0];
  ball.pos={x:B.x+dx,y:B.hoopY+.02,z:B.hoopZ+dz};ball.vel={x:0,y:-4,z:0};ball.shooter='host';
  stepBasketball(c,[],1,STEP);
  assert.equal(c.basketball!.scores.host?.points,2,`offset ${dx}, ${dz}`);
 }
 assert.ok(B.hoopZ+B.rim+B.rimTube<B.boardZ,'the opening clears the board');
});


test('shot preview matches the released ball through its first collision without mutating the world',()=>{
 const cases=[{yaw:Math.PI,pitch:.75,power:.45,x:B.x+.14,z:B.hoopZ-7},{yaw:Math.PI/2,pitch:.1,power:.8,x:7,z:10},{yaw:Math.PI,pitch:-.5,power:.5,x:10,z:12},{yaw:Math.PI,pitch:.55,power:.3,x:B.x+.14,z:B.boardZ-2}];
 const impacts=new Set<string>();
 for(const setup of cases){
  const p=player();p.player.pos={x:setup.x,y:1.7,z:setup.z};p.input={yaw:setup.yaw,pitch:setup.pitch,fire:false};
  const ticks=Math.round(setup.power*B.chargeTicks),power=ticks/B.chargeTicks,before=structuredClone(p),prediction=predictBasketball(p,power);assert.deepEqual(p,before);assert.ok(prediction.points.length>1);
  const c=createCourtyard(1),ball=c.basketball!.balls[0];ball.owner=p.id;c.basketball!.hands[p.id]={held:true,charge:0,armed:true};
  stepBasketball(c,[p],ticks,STEP);
  for(let t=1;t<prediction.ticks;t++)stepBasketball(c,[p],ticks+t,STEP);
  if(prediction.impact==='basket')assert.equal(c.basketball!.scores.host.made,1);
  else for(const axis of ['x','y','z'] as const)assert.ok(Math.abs(ball.pos[axis]-prediction.end[axis])<1e-8,`${prediction.impact} ${axis}`);
  impacts.add(prediction.impact??'none');assert.ok(validateCourtyard(c));
 }
 assert.ok(impacts.has('wall'));assert.ok(impacts.has('floor'));
});
test('set shot raises the ball, keeps release at the hands and transmits follow-through timing',()=>{
 const c=createCourtyard(1),b=c.basketball!,p=player();assert.ok(basketballAction(b,p,0));
 const ready=basketballHeldPoint(p,0),set=basketballHeldPoint(p,1);assert.ok(set.y-ready.y>.6);assert.ok(Math.hypot(set.x-p.player.pos.x,set.z-p.player.pos.z)>.5);
 p.input.fire=true;stepBasketball(c,[p],1,STEP);stepBasketball(c,[p],40,STEP);const held=basketballPose(b,p.id,40)!;assert.equal(held.holding,true);assert.equal(held.gather,1);
 p.input.fire=false;const preview=basketballLaunch(p,40/B.chargeTicks);stepBasketball(c,[p],41,STEP);const released=basketballPose(b,p.id,41)!;assert.equal(released.holding,false);assert.equal(released.age,0);assert.ok(b.balls[0].pos.y>preview.pos.y);assert.ok(validateCourtyard(c));
 assert.equal(basketballPose(b,p.id,121),undefined);
});


test('secondary press dunks only while carrying near and facing the hoop; one physical finish and score',()=>{
 const c=createCourtyard(1),b=c.basketball!,p=player();basketballAction(b,p,0);p.player.pos={x:B.x,y:1.7,z:B.hoopZ-1.2};p.input.yaw=Math.PI;
 assert.ok(canBasketballDunk(p));p.input.homing=true;stepBasketball(c,[p],1,STEP);assert.equal(b.hands.host.dunk?.started,1);assert.equal(b.hands.host.charge,-1);assert.ok(p.player.vel.y>7);
 const pose=basketballPose(b,p.id,15,p)!;assert.ok(pose.dunkAge!>0);assert.ok(pose.dunkTarget);assert.equal(basketballAction(b,p,15),false,'cannot drop during dunk');
 for(let t=2;t<160;t++)stepBasketball(c,[p],t,STEP);
 assert.equal(b.scores.host.points,2);assert.equal(b.scores.host.made,1);assert.equal(b.scores.host.attempts,1);assert.equal(b.balls[0].owner,null);assert.equal(b.balls[0].scored,true);assert.ok(validateCourtyard(c));
 for(let t=160;t<300;t++)stepBasketball(c,[p],t,STEP);assert.equal(b.scores.host.points,2,'held secondary cannot repeat the dunk');
});
test('RMB cannot pick up a ball, throw a remote dunk, or steal another player ball',()=>{
 const c=createCourtyard(1),b=c.basketball!,p=player();p.input.homing=true;stepBasketball(c,[p],1,STEP);assert.ok(b.balls.every(ball=>!ball.owner));
 p.input.homing=false;stepBasketball(c,[p],2,STEP);basketballAction(b,p,3);p.input.homing=true;stepBasketball(c,[p],4,STEP);assert.equal(b.hands.host.dunk,undefined);assert.equal(b.balls[0].owner,p.id);assert.equal(b.scores.host,undefined);
 p.input.homing=false;stepBasketball(c,[p],5,STEP);p.player.pos={x:B.x,y:1.7,z:B.hoopZ-1};p.input.yaw=0;p.input.homing=true;stepBasketball(c,[p],6,STEP);assert.equal(b.hands.host.dunk,undefined,'must face the hoop');
});


test('host dunk movement and guest prediction share the approach without football kick poses',()=>{
 const host=new FriendsSession('host');try{
 host.enterPrelobby();const w=host.world!,p=w.crew[0],b=w.courtyard!.basketball!;p.player.pos={x:B.x,y:1.7,z:B.hoopZ-1.4};p.input={...idleInput(),yaw:Math.PI};b.balls[0].owner='host';b.balls[0].pos=basketballHeldPoint(p,0);b.hands.host={held:false,charge:-1,armed:true};
 host.step({...idleInput(),yaw:Math.PI,homing:true});assert.ok(b.hands.host.dunk);const clone=new World(1,{schedule:false});clone.addCrew('host');clone.selectCrew('host');clone.courtyard=structuredClone(w.courtyard);clone.tick=w.tick;Object.assign(clone.crew[0].player,structuredClone(p.player));
 const fromZ=p.player.pos.z;for(let i=0;i<25;i++){host.step({...idleInput(),yaw:Math.PI});clone.predictCrew('host',{...idleInput(),yaw:Math.PI},STEP,true);assert.ok(Math.abs(p.player.pos.z-clone.player.pos.z)<1e-8);}
 assert.ok(p.player.pos.z>fromZ+.3);assert.ok(p.player.pos.y>2);assert.equal(w.courtyard!.kicks.host,undefined);assert.ok(validateCourtyard(w.courtyard));
 const packet=decodeState(encodeState(host.snapshot()!,1,0),new Map());assert.ok(packet?.snapshot.courtyard?.basketball?.hands.host.dunk?.approach);
 }finally{host.close();}
});
