import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v} from '../src/simulation';
import {cleanInput,applySnapshot,FriendsSession} from '../src/multiplayer';

test('crew shares one clock, caps at four and moves/fires independently',()=>{
 const w=new World(24,{schedule:false});for(const id of ['host','a','b','c','extra'])w.addCrew(id);assert.equal(w.crew.length,4);
 const inputs=new Map([['host',{...idleInput(),forward:1,fire:true}],['a',{...idleInput(),strafe:1,fire:true}],['b',idleInput()],['c',idleInput()]]);
 for(let i=0;i<120;i++)w.stepCrew(inputs);
 assert.ok(Math.abs(w.time-1)<1e-8);assert.ok(w.crew[0].player.pos.z<4);assert.ok(w.crew[1].player.pos.x>5);assert.equal(w.crew[2].player.pos.x,-2);assert.ok(w.stats.shots>=30);
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
 for(let i=1;i<100;i++)w.collect();assert.ok(w.crew.every(p=>p.level===3&&p.reserve===30));const inputs=new Map([['a',{...idleInput(),homing:true}]]);for(let i=0;i<20;i++)w.stepCrew(inputs);assert.ok(w.crew[1].reserve<30);assert.equal(w.crew[0].reserve,30);assert.equal(w.crew[2].reserve,30);assert.equal(w.stats.collected,100);
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
