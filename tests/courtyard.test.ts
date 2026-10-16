import test from 'node:test';
import assert from 'node:assert/strict';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {World,idleInput} from '../src/simulation';
import {encodeState,decodeState,StateAssembler} from '../src/network-state';
import {SnapshotTimeline} from '../src/network-presentation';
import {createCourtyard,PIT,SPAWNS,FOOTBALL,insidePit,courtyardCanOccupy,constrainCourtyard,COURTYARD_BOUNDS,COURTYARD_FLOOR_TILES,COURTYARD_SOLIDS,courtyardFloor,validateCourtyard} from '../src/courtyard-state';
import {stepSkull,stepHighFives} from '../src/courtyard-physics';

function setup(){
 const h=new FriendsSession('host');
 h.links.set('guest',{pc:{close(){}},state:{readyState:'open',bufferedAmount:0,send(){}},timer:0,events:[],baselines:new Map(),ackFrame:0,sentEpoch:-1,tokens:262144,tokenAt:performance.now(),lastSend:0,sendInterval:50,assembler:new StateAssembler()} as any);
 h.members.push({id:'guest',name:'Guest',host:false,ready:false});h.enterPrelobby();return h;
}
function ready(h:FriendsSession){for(const m of h.members){m.loaded=h.epoch;m.ready=true;}}
function open(h:FriendsSession){ready(h);assert.equal(h.openPit(),true);for(let i=0;i<PIT.openingTicks;i++)h.step(idleInput());assert.equal(h.courtyard!.phase,'open');}
function drop(h:FriendsSession,id:string){const p=h.world!.crew.find(p=>p.id===id)!;p.player.pos={x:0,y:PIT.depth-.1,z:PIT.z};p.player.vel={x:0,y:-1,z:0};h.step(idleInput());}

test('courtyard movement never changes spawn templates; repeated post-death returns stay outside the pit',()=>{
 const spawns=structuredClone(SPAWNS),h=setup();
 try{
  for(let cycle=0;cycle<3;cycle++){
   assert.deepEqual(h.world!.crew[0].player.pos,spawns[0]);
   for(const player of h.world!.crew){player.player.pos.x=0;player.player.pos.z=PIT.z;player.player.pos.y=-4;}
   assert.deepEqual(SPAWNS,spawns,'moving a player must not move a shared spawn template');
   h.world!.state='dead';h.running=true;h.prelobby=false;
   h.returnToLobby();
   assert.deepEqual(h.world!.crew.map(player=>player.player.pos),spawns.slice(0,2));
   assert.ok(h.world!.crew.every(player=>player.alive&&player.player.grounded&&!insidePit(player.player.pos,.4)));
   assert.equal(h.courtyard!.phase,'gathering');
  }
 }finally{h.close();}
});
test('gathering accepts unready players; loading, ready and clear cover gate host opening',()=>{
 const h=setup(),g=new FriendsSession('guest');try{
  assert.equal(h.prelobby,true);assert.ok(h.members.every(m=>!m.ready));assert.match(h.pitBlockedReason,/load/);assert.equal(h.openPit(),false);
  h.setReady(true);assert.equal(h.members[0].ready,false);h.markLoaded(h.epoch);h.setReady(true);h.members[1].loaded=h.epoch;
  assert.equal(h.openPit(),false);assert.equal(g.openPit(),false);h.members[1].ready=true;assert.equal(h.pitBlockedReason,'');
  h.world!.crew[1].player.pos={x:0,y:1.7,z:PIT.z};assert.match(h.pitBlockedReason,/Clear/);assert.equal(h.openPit(),false);
  h.world!.crew[1].player.pos={...SPAWNS[1]};h.start(true);assert.equal(h.running,false,'closed cover cannot be bypassed');
  const s=decodeState(encodeState(h.snapshot()!,1,0),new Map())!.snapshot;assert.equal(s.courtyard!.phase,'gathering');assert.equal(s.crew.length,2);
  for(let i=0;i<120;i++)h.step({...idleInput(),fire:true,homing:true});assert.equal(h.world!.time,0);assert.equal(h.world!.stats.shots,0);
 }finally{h.close();g.close();}
});
for(const first of ['host','guest'])test(`${first} drops first; all players must drop before one shared arena starts`,()=>{
 const h=setup();try{
  const epoch=h.epoch;open(h);assert.equal(courtyardFloor(0,PIT.z,h.courtyard!),-1000);drop(h,first);
  assert.equal(h.running,false);assert.deepEqual(h.courtyard!.committed,[first]);for(let i=0;i<120;i++)h.step(idleInput());assert.equal(h.running,false);
  assert.equal(h.world!.crew.find(p=>p.id===first)!.alive,true);drop(h,first==='host'?'guest':'host');assert.equal(h.running,true);assert.equal(h.epoch,epoch+1);
  assert.equal(h.world!.time,0);assert.equal(h.world!.stats.shots,0);assert.equal(h.world!.enemies.length,0);assert.ok(h.startAt>Date.now());assert.equal(h.world!.courtyard,undefined);
  h.start(true);assert.equal(h.epoch,epoch+1);h.returnToLobby();assert.equal(h.prelobby,true);assert.ok(h.members.every(p=>!p.ready&&p.loaded===undefined));assert.equal(h.courtyard!.phase,'gathering');
 }finally{h.close();}
});
test('opening stays solid; cancellation and unready restore dropped players before closing',()=>{
 const h=setup();try{
  ready(h);h.openPit();assert.equal(courtyardFloor(0,PIT.z,h.courtyard!),0);h.cancelDescent();assert.equal(h.courtyard!.phase,'gathering');
  open(h);drop(h,'host');const life=h.world!.crew[0].life;h.cancelDescent();assert.equal(h.courtyard!.committed.length,0);assert.equal(h.courtyard!.phase,'gathering');assert.equal(courtyardFloor(0,PIT.z,h.courtyard!),0);
  assert.ok(h.world!.crew[0].player.pos.y>0);assert.equal(h.world!.crew[0].life,life+1);open(h);drop(h,'guest');h.setReady(false);assert.equal(h.courtyard!.phase,'gathering');assert.ok(h.world!.crew[1].player.pos.y>0);
 }finally{h.close();}
});
test('connection loss cancels descent; a skull or old seal crossing cannot start a run',()=>{
 const h=setup();try{
  open(h);drop(h,'guest');(h.links.get('guest')!.pc as any).connectionState='disconnected';h.step(idleInput());assert.equal(h.courtyard!.phase,'gathering');assert.equal(h.running,false);
  h.courtyard!.skull.pos={x:0,y:-4,z:PIT.z};h.step(idleInput());assert.equal(h.running,false);h.world!.crew[0].player.pos={x:0,y:1.7,z:-6.3};h.step({...idleInput(),forward:1});assert.equal(h.running,false);
 }finally{h.close();}
});
test('closing an open-pit room only advertises closure, never a fresh gathering room',()=>{
 const h=setup(),announcements:{closed?:boolean}[]=[];try{
  open(h);(h as any).publicLobby=true;(h as any).mqtt.publish=(_topic:string,raw:string)=>announcements.push(JSON.parse(raw));
  h.close();assert.equal(announcements.length,1);assert.equal(announcements[0].closed,true);assert.equal(h.openPit(),false);
 }finally{if(!h.closed)h.close();}
});
test('prediction uses the same cover and open-pit floor without killing the player',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');w.selectCrew('host');w.courtyard=createCourtyard(1);w.player.pos={x:0,y:1.7,z:PIT.z};w.predictCrew('host',idleInput(),1/120,true);assert.equal(w.player.pos.y,1.7);
 w.courtyard.phase='open';for(let i=0;i<60;i++)w.predictCrew('host',idleInput(),1/120,true);assert.ok(w.player.pos.y<0);assert.equal(w.state,'playing');assert.equal(w.crew[0].alive,true);assert.equal(w.time,0);
});
test('shared skull interpolates on courtyard ticks; resets are discrete',()=>{
 const h=setup();try{
  const a=structuredClone(h.snapshot()!);a.tick=0;const b=structuredClone(a);b.tick=12;b.courtyard!.skull.pos.x+=2;
  const w=new World(1);applySnapshot(w,b,'host');const timeline=new SnapshotTimeline();timeline.push(a,0);timeline.push(b,100);const view=timeline.view(w,'host',100,{x:0,y:0,z:0});
  assert.equal(view.time,0);assert.ok(view.courtyard!.skull.pos.x>a.courtyard!.skull.pos.x&&view.courtyard!.skull.pos.x<b.courtyard!.skull.pos.x);
  b.courtyard!.skull.reset++;timeline.reset();timeline.push(a,0);timeline.push(b,100);assert.equal(timeline.view(w,'host',100,{x:0,y:0,z:0}).courtyard!.skull.pos.x,b.courtyard!.skull.pos.x);
 }finally{h.close();}
});
test('skull kicks are bounded, goals count once, pit entry resets, and valid snapshots stay bounded',()=>{
 const c=createCourtyard(1),body={id:'host',player:{pos:{x:FOOTBALL.x,y:1.7,z:FOOTBALL.z+.7},vel:{x:0,y:0,z:-100}},input:{yaw:0}};
 stepSkull(c,[body],1,1/120);assert.ok(c.skull.vel.z<0);assert.ok(Math.hypot(c.skull.vel.x,c.skull.vel.z)<=14);assert.equal(c.events[0].kind,'kick');
 c.skull.pos={x:FOOTBALL.x,y:.5,z:FOOTBALL.goalZ[0]-.49};c.skull.vel={x:0,y:0,z:-5};stepSkull(c,[],40,1/120);assert.equal(c.skull.goals[0],1);for(let i=41;i<100;i++)stepSkull(c,[],i,1/120);assert.equal(c.skull.goals[0],1);
 stepSkull(c,[],200,1/120);assert.equal(c.skull.resetAt,0);c.phase='open';c.skull.pos={x:0,y:-1,z:PIT.z};stepSkull(c,[],201,1/120);assert.deepEqual(c.skull.pos,{x:FOOTBALL.x,y:.5,z:FOOTBALL.z});assert.equal(c.skull.resetAt,0);assert.equal(validateCourtyard(c),true);
 c.events.push(...Array(25).fill(c.events[0]));assert.equal(validateCourtyard(c),false);
});
test('high-fives need raised facing hands and release to rearm; held poses cannot spam',()=>{
 const c=createCourtyard(1),contacts=new Set<string>();const a={id:'host',player:{pos:{x:0,y:1.7,z:0},vel:{x:0,y:0,z:0}},input:{yaw:0,leftArm:true}},b={id:'guest',player:{pos:{x:0,y:1.7,z:-1.5},vel:{x:0,y:0,z:0}},input:{yaw:Math.PI,rightArm:true}};
 stepHighFives(c,[a,b],1,contacts);assert.equal(c.events.length,1);for(let i=2;i<120;i++)stepHighFives(c,[a,b],i,contacts);assert.equal(c.events.length,1);
 a.input.leftArm=false;stepHighFives(c,[a,b],121,contacts);a.input.leftArm=true;stepHighFives(c,[a,b],122,contacts);assert.equal(c.events.length,2);a.input.yaw=Math.PI;stepHighFives(c,[a,b],300,contacts);assert.equal(c.events.length,2);
});

test('centered aperture, rendered tiles and shaft collision agree; former hearth is clear',()=>{
 assert.equal(PIT.x,0);assert.equal(PIT.z,(COURTYARD_BOUNDS.frontZ+COURTYARD_BOUNDS.backZ)/2);
 const c=createCourtyard(1);c.phase='open';
 for(let x=-6;x<=6;x+=.25)for(let z=-6;z<=10;z+=.25){
  if(Math.abs(Math.abs(x-PIT.x)-PIT.half)<.01||Math.abs(Math.abs(z-PIT.z)-PIT.half)<.01)continue;
  const drawn=COURTYARD_FLOOR_TILES.some(t=>Math.abs(t.x-x)<=1&&Math.abs(t.z-z)<=1);
  assert.equal(drawn,!(Math.abs(x-PIT.x)<PIT.half&&Math.abs(z-PIT.z)<PIT.half),`floor at ${x},${z}`);
 }
 assert.equal(COURTYARD_SOLIDS.some(s=>Math.abs(s.x+.2)<.5&&Math.abs(s.z-5)<.5),false);
 const w=new World(1,{schedule:false});w.addCrew('host');w.selectCrew('host');w.courtyard=c;
 w.player.pos={x:0,y:.8,z:PIT.z};w.player.vel={x:0,y:-1,z:0};
 for(let i=0;i<40;i++)w.predictCrew('host',{...idleInput(),forward:-1},1/120,true);
 assert.ok(Math.abs(w.player.pos.z-PIT.z)<PIT.half);assert.ok(w.player.pos.y<0);
});

test('football room is connected through a wide passage; old obstacle course is clear',()=>{
 const c=createCourtyard(1);assert.equal(courtyardFloor(4.9,4.2,c),0);assert.equal(courtyardFloor(4.9,7,c),0);
 for(let x=0;x<=56;x+=.2)assert.equal(courtyardCanOccupy(x,PIT.z),true,`passage ${x}`);
 assert.equal(courtyardCanOccupy(10,8),false);assert.equal(courtyardCanOccupy(60,2),true);assert.equal(courtyardCanOccupy(60,8),false);assert.equal(courtyardCanOccupy(14,-10),false);
 const w=new World(1,{schedule:false});w.addCrew('host');w.selectCrew('host');w.courtyard=c;w.player.pos={x:5,y:1.7,z:PIT.z};
 for(let i=0;i<360;i++)w.predictCrew('host',{...idleInput(),strafe:1},1/120,true);
 assert.ok(w.player.pos.x>20,'real predicted movement crosses both doorways');assert.equal(w.player.pos.y,1.7);assert.equal(w.state,'playing');
 for(let i=0;i<600;i++)w.predictCrew('host',{...idleInput(),forward:1},1/120,true);
 assert.ok(w.player.pos.z>=-27.8);assert.equal(w.player.pos.y,1.7);
 assert.equal(constrainCourtyard({x:5,y:1.7,z:8},{x:10,y:1.7,z:8}).x,5);
});
test('football goals reject backwards crossings, wide shots and shots above the crossbar',()=>{
 for(const [pos,vel] of [[{x:FOOTBALL.x,y:.36,z:FOOTBALL.goalZ[0]-.4},{x:0,y:0,z:5}], [{x:FOOTBALL.x+6,y:.36,z:FOOTBALL.goalZ[0]-.35},{x:0,y:0,z:-5}], [{x:FOOTBALL.x,y:4,z:FOOTBALL.goalZ[0]-.35},{x:0,y:0,z:-5}]] as const){const c=createCourtyard(1);c.skull.pos={...pos};c.skull.vel={...vel};stepSkull(c,[],1,1/120);assert.deepEqual(c.skull.goals,[0,0]);}
 const c=createCourtyard(1);c.skull.pos={x:FOOTBALL.x+4.38,y:.36,z:FOOTBALL.goalZ[1]-.6};c.skull.vel={x:0,y:0,z:14};for(let i=0;i<15;i++)stepSkull(c,[],i,1/120);assert.equal(c.skull.goals[1],0);assert.ok(c.skull.pos.z<FOOTBALL.goalZ[1]);
});

test('football crossbars rebound the skull while the mouth remains open',()=>{
 const c=createCourtyard(1);c.skull.pos={x:FOOTBALL.x,y:3.3,z:FOOTBALL.goalZ[1]-.55};c.skull.vel={x:0,y:0,z:14};stepSkull(c,[],1,1/120);assert.ok(c.skull.vel.z<0);assert.deepEqual(c.skull.goals,[0,0]);
});
