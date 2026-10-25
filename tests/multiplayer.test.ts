import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v} from '../src/simulation';
import {cleanInput,applySnapshot,FriendsSession} from '../src/multiplayer';

test('crew shares one clock, caps at six and moves/fires independently',()=>{
 const w=new World(24,{schedule:false});for(const id of ['host','a','b','c','d','e','extra'])w.addCrew(id);assert.equal(w.crew.length,6);
 const inputs=new Map([['host',{...idleInput(),forward:1,fire:true}],['a',{...idleInput(),strafe:1,fire:true}],['b',idleInput()],['c',idleInput()]]);
 for(let i=0;i<120;i++)w.stepCrew(inputs);
 assert.ok(Math.abs(w.time-1)<1e-8);assert.ok(w.crew[0].player.pos.z<4);assert.ok(w.crew[1].player.pos.x>5);assert.equal(w.crew[2].player.pos.x,-2);assert.equal(w.stats.shots,28);
 assert.notEqual(w.crew[0].primary,w.crew[1].primary);
});
test('individual fall deaths leave surviving crew in play, then end on team wipe',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');w.addCrew('guest');w.crew[0].player.pos=v(60,-10,60);w.stepCrew(new Map());assert.equal(w.crew[0].alive,false);assert.equal(w.state,'playing');w.crew[1].player.pos=v(60,-10,60);w.stepCrew(new Map());assert.equal(w.state,'dead');
});
test('enemies attack the nearest living crew member and gems collect once',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');w.addCrew('guest');const e=w.spawn('skull',{...w.crew[1].player.pos});e.age=2;w.stepCrew(new Map());assert.equal(w.crew[1].alive,false);assert.equal(w.crew[0].alive,true);
 w.enemies=[];w.dropGems({...w.crew[0].player.pos},1);w.stepCrew(new Map());assert.equal(w.stats.collected,1);assert.equal(w.gems.length,0);
});
test('remote inputs reject non-finite values and clamp movement',()=>{assert.equal(cleanInput({...idleInput(),yaw:Infinity}),null);assert.equal(cleanInput(null),null);assert.deepEqual(cleanInput({...idleInput(),forward:100,strafe:-100,pitch:3,fire:1}),{...idleInput(),forward:1,strafe:-1,pitch:1.5});});
test('host restart resets clock and deaths and guest snapshot chooses its own camera',()=>{
 const host=new FriendsSession('host');host.start();host.world!.addCrew('guest');host.world!.stepCrew(new Map([['guest',{...idleInput(),forward:1}]]));const snapshot=host.snapshot()!;const guest=new World(1);applySnapshot(guest,JSON.parse(JSON.stringify(snapshot)),'guest');assert.equal(guest.player,guest.crew[1].player);assert.equal(guest.time,host.world!.time);assert.equal(guest.level,host.world!.level);
 host.world!.crew.forEach(p=>p.alive=false);host.world!.stepCrew(new Map());assert.equal(host.world!.state,'dead');const epoch=host.epoch;host.start();assert.equal(host.epoch,epoch+1);assert.equal(host.world!.time,0);assert.equal(host.world!.state,'playing');assert.equal(host.world!.crew[0].alive,true);host.close();
});
test('one gem credits every player and homing spending stays personal',()=>{
 const w=new World(1,{schedule:false});for(const id of ['host','a','b','c'])w.addCrew(id);w.collect();assert.equal(w.stats.collected,1);for(const p of w.crew){w.selectCrew(p.id);assert.equal(w.stats.collected,1);}
 for(let i=1;i<100;i++)w.collect();assert.ok(w.crew.every(p=>p.level===3&&p.reserve===90));const inputs=new Map([['a',{...idleInput(),homing:true}]]);for(let i=0;i<20;i++)w.stepCrew(inputs);assert.ok(w.crew[1].reserve<90);assert.equal(w.crew[0].reserve,90);assert.equal(w.crew[2].reserve,90);assert.equal(w.stats.collected,100);
});

test('reliable input queues a complete tap before a simulation tick and preserves latest movement',async()=>{
 const {CrewInputBuffer}=await import('../src/multiplayer');const buffer=new CrewInputBuffer();
 buffer.push({...idleInput(),fire:true});buffer.push({...idleInput(),fire:false,forward:1});
 const w=new World(1,{schedule:false});w.addCrew('host');w.addCrew('guest');
 w.stepCrew(new Map([['guest',buffer.next()]]));assert.equal(w.crew[1].input.fire,true);
 w.stepCrew(new Map([['guest',buffer.next()]]));assert.equal(w.crew[1].input.fire,false);
 assert.equal(w.stats.shots,10);assert.equal(buffer.next().forward,1);assert.equal(buffer.next().fire,false);
 assert.ok(w.effects.filter(e=>e.kind==='burst').every(e=>e.shooterId==='guest'));
});

test('multiple quick primary and homing transitions retain their order',async()=>{
 const {CrewInputBuffer}=await import('../src/multiplayer');const buffer=new CrewInputBuffer();
 const states=[{fire:true,homing:false},{fire:false,homing:false},{fire:false,homing:true},{fire:false,homing:false},{fire:true,homing:false},{fire:false,homing:false}];
 for(const state of states)buffer.push({...idleInput(),...state});
 for(const state of states){const input=buffer.next();assert.deepEqual({fire:input.fire,homing:input.homing},state);}
});

test('remote demon aim and firing survive encoded snapshots and presentation interpolation',async()=>{
 const {encodeState,decodeState}=await import('../src/network-state');const {SnapshotTimeline}=await import('../src/network-presentation');
 const host=new FriendsSession('host');try{
  host.start();host.world!.addCrew('friend');host.world!.crew[1].input={...idleInput(),yaw:.4,pitch:-.6,fire:true};
  host.world!.stepCrew(new Map([['friend',host.world!.crew[1].input]]));host.world!.time=0;const first=structuredClone(host.snapshot()!);const decoded=decodeState(encodeState(first,1,0),new Map())!.snapshot;
  const guest=new World(1,{schedule:false});applySnapshot(guest,decoded,'host');assert.equal(guest.crew[1].input.pitch,-.6);assert.equal(guest.crew[1].input.fire,true);
  host.world!.time=.1;host.world!.crew[1].input.pitch=.6;host.world!.crew[1].input.homing=true;
  host.world!.stepCrew(new Map([['friend',host.world!.crew[1].input]]));host.world!.time=.1;const second=structuredClone(host.snapshot()!);applySnapshot(guest,second,'host');const timeline=new SnapshotTimeline();timeline.push(first,0);timeline.push(second,100);
  const view=timeline.view(guest,'host',100,v());assert.ok(view.crew[1].input.pitch>-.6&&view.crew[1].input.pitch<.6);assert.equal(view.crew[1].input.fire,true);assert.equal(view.crew[1].input.homing,true);
  const legacy=structuredClone(first);delete legacy.crew[1].pitch;applySnapshot(guest,legacy,'host');assert.equal(guest.crew[1].input.pitch,0);assert.equal(guest.crew[1].input.fire,true);
 }finally{host.close();}
});

 test('arena start preserves courtyard roster order when guests connect out of order',()=>{
 const host=new FriendsSession('host');try{
 for(const id of ['first','second','third','fourth','fifth'])host.links.set(id,{pc:{close(){}},state:{readyState:'open',bufferedAmount:0,send(){}},timer:0} as any);
 for(const id of ['fifth','third','first','fourth','second'])(host as any).addLobbyCrew(id);
 const roster=host.world!.crew.map(p=>p.id);host.broadcast=()=>{};host.beforeArenaStart=()=>true;host.start(true);
 assert.deepEqual(host.world!.crew.map(p=>p.id),roster);
 }finally{host.close();}
 });

 test('replacement lobby guest uses the empty spawn instead of overlapping another player',()=>{
 const host=new FriendsSession('host');try{
 for(const id of ['a','b','c','d','e'])(host as any).addLobbyCrew(id);
 const vacated={...host.world!.crew.find(p=>p.id==='b')!.player.pos};host.world!.crew=host.world!.crew.filter(p=>p.id!=='b');
 (host as any).addLobbyCrew('replacement');assert.deepEqual(host.world!.crew.at(-1)!.player.pos,vacated);
 const positions=host.world!.crew.map(p=>({...p.player.pos}));(host as any).addLobbyCrew('seventh');assert.deepEqual(host.world!.crew.map(p=>p.player.pos),positions);
 }finally{host.close();}
 });
