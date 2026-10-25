import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,TUNING} from '../src/simulation';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {CommandBuffer,InputHistory,MAX_PENDING_INPUTS,inputRuns} from '../src/network-input';
import {encodePacket,decodePacket} from '../src/network-codec';
import {encodeState,decodeState,snapshotBaseline,fragmentState,StateAssembler,type StateBaseline} from '../src/network-state';
import {SnapshotTimeline} from '../src/network-presentation';

const setup=()=>{const host=new FriendsSession('host');host.world=new World(42,{schedule:false});host.world.addCrew('host');host.world.addCrew('guest');host.world.selectCrew('host');return host;};
test('binary codec preserves controller precision and rejects corrupt/truncated data',()=>{
 const source={time:Math.PI,position:{x:1.234567891,y:-.001,z:32},names:['guest','guest'],flags:[true,false,null],ints:[-12345,12345]};
 assert.deepEqual(JSON.parse(JSON.stringify(decodePacket(encodePacket(source)))),source);
 assert.throws(()=>decodePacket(encodePacket(source).slice(0,-1)));assert.throws(()=>decodePacket(new Uint8Array([7,0])));assert.throws(()=>decodePacket(new Uint8Array([8,255,255,255,255,15])));
});
test('numbered inputs repair loss/reordering without compressing holds or repeating actions',()=>{
 const history=new InputHistory(),queue=new CommandBuffer();
 for(let i=0;i<30;i++)history.record({...idleInput(),fire:i<22,jump:i===4||i===5});
 for(const command of history.commands.filter(c=>c.seq%3).reverse())queue.push(command);
 assert.equal(queue.next()?.seq,1);assert.equal(queue.next()?.seq,2);assert.equal(queue.next(),null);
 for(const command of history.commands)queue.push(command);const consumed=[];for(let c=queue.next();c;c=queue.next())consumed.push(c);
 assert.equal(consumed.length,28);assert.equal(consumed.filter(c=>c.input.fire).length,20);assert.equal(consumed.filter(c=>c.input.jump).length,2);assert.equal(queue.acknowledged,30);assert.equal(queue.push(history.commands[0]),false);
 history.acknowledge(30);assert.equal(history.commands.length,0);
 for(let i=0;i<MAX_PENDING_INPUTS;i++)assert.ok(history.record(idleInput()));assert.equal(history.record(idleInput()),null);assert.equal(queue.push({seq:100000,input:idleInput()}),false);
});
test('prediction immediately moves/jumps/fires, shares controller rules, and leaves world RNG and gems alone',()=>{
 const host=setup();try{
  const original=host.snapshot()!,guest=new World(999,{schedule:false});applySnapshot(guest,original,'guest');const rng=guest.random(),reference=new World(999);assert.equal(rng,reference.random());
  const before=guest.player.pos.z;guest.predictCrew('guest',{...idleInput(),forward:1,jump:true,fire:true});assert.ok(guest.player.pos.z<before);assert.ok(guest.player.vel.y>0);assert.equal(host.world!.tick,0);
  host.world!.stepCrew(new Map([['guest',{...idleInput(),forward:1,jump:true,fire:true}]]));assert.deepEqual(guest.player,host.world!.crew[1].player);
  guest.gems=[{id:99,pos:{...guest.player.pos},vel:{x:0,y:0,z:0},age:0}];const gems=structuredClone(guest.gems);
  guest.predictCrew('guest',{...idleInput(),fire:false,pitch:-1.4});host.world!.stepCrew(new Map([['guest',{...idleInput(),fire:false,pitch:-1.4}]]));assert.equal(guest.projectiles.length,10);assert.deepEqual(guest.projectiles.map(p=>p.vel),host.world!.projectiles.map(p=>p.vel));assert.deepEqual(guest.projectiles.map(p=>p.shotKey),host.world!.projectiles.map(p=>p.shotKey));assert.deepEqual(guest.gems,gems);assert.equal(guest.random(),reference.random());assert.ok(guest.player.vel.y>=10.8);
 }finally{host.close();}
});
test('replaying outstanding commands from an acknowledged snapshot preserves landing/cooldowns/dagger jumps',()=>{
 const host=setup();try{
  const guest=new World(1,{schedule:false});applySnapshot(guest,host.snapshot()!,'guest');
  const commands=Array.from({length:55},(_,i)=>({...idleInput(),forward:1,fire:i<4,jump:i===20,pitch:i===4?-1.4:0}));
  for(const input of commands)guest.predictCrew('guest',input);
  for(const input of commands.slice(0,30))host.world!.stepCrew(new Map([['guest',input]]));
  const reconciled=new World(1);applySnapshot(reconciled,host.snapshot()!,'guest');for(const input of commands.slice(30))reconciled.predictCrew('guest',input);
  assert.deepEqual(reconciled.player,guest.player);assert.deepEqual(reconciled.crew[1].primary,guest.crew[1].primary);assert.equal(reconciled.crew[1].wasJump,guest.crew[1].wasJump);assert.equal(reconciled.crew[1].shotSequence,guest.crew[1].shotSequence);
 }finally{host.close();}
});
test('a pending jump tap survives binary snapshots and prediction replay without leaking to teammates',()=>{
 const host=setup();try{
  const w=host.world!,p=w.crew[1].player;
  p.pos={x:0,y:TUNING.eyeHeight+.025,z:0};p.vel.y=-1;p.grounded=false;
  const guest=new World(1,{schedule:false});applySnapshot(guest,host.snapshot()!,'guest');
  const press={...idleInput(),jump:true};guest.predictCrew('guest',press);w.stepCrew(new Map([['guest',press]]));
  assert.ok(p.jumpBuffer>0);assert.equal(p.grounded,false);assert.equal(w.crew[0].player.jumpBuffer,0);
  const packet=encodeState(host.snapshot()!,1,0),snapshot=decodeState(packet,new Map())!.snapshot;
  const repaired=new World(1,{schedule:false});applySnapshot(repaired,snapshot,'guest');
  assert.equal(repaired.player.jumpBuffer,p.jumpBuffer);
  for(let i=0;i<8;i++){
   guest.predictCrew('guest',idleInput());repaired.predictCrew('guest',idleInput());w.stepCrew(new Map());
   assert.deepEqual(guest.player,p);assert.deepEqual(repaired.player,p);
  }
  assert.ok(p.vel.y>0);assert.equal(w.crew[0].player.grounded,true);
 }finally{host.close();}
});
test('projectile deltas recover spawns/removals and gravity against acknowledged baselines',()=>{
 const host=setup();try{
  host.world!.projectiles=[{id:1,pos:{x:1,y:8,z:2},vel:{x:1,y:4,z:3},age:.2,homing:false,floorBounces:1,shotKey:'guest:1:0'}];
  const first=host.snapshot()!,decodedFirst=decodeState(encodeState(first,1,0),new Map())!;const baseline=snapshotBaseline(first),receiver=snapshotBaseline(decodedFirst.snapshot);
  const dt=STEP*6,p=host.world!.projectiles[0];host.world!.time+=dt;p.age+=dt;p.pos={x:1+dt,y:8+4*dt-TUNING.gravity*dt*(dt+STEP)/2,z:2+3*dt};p.vel.y-=TUNING.gravity*dt;
  const second=encodeState(host.snapshot()!,2,1,baseline);assert.equal(decodeState(second,new Map()),null);const result=decodeState(second,new Map([[1,receiver]]))!;assert.ok(Math.abs(result.snapshot.projectiles[0].pos.y-p.pos.y)<.00001);assert.equal(result.snapshot.projectiles[0].shotKey,'guest:1:0');
  host.world!.projectiles=[];const removed=decodeState(encodeState(host.snapshot()!,3,1,baseline),new Map([[1,receiver]]))!;assert.equal(removed.snapshot.projectiles.length,0);
  // Missing baseline is repaired by a self-contained recovery packet.
  assert.equal(decodeState(encodeState(host.snapshot()!,4,0),new Map())!.frame,4);
 }finally{host.close();}
});
test('unordered fragmented state repairs packet loss, expires incomplete frames and ignores stale completions',()=>{
 const bytes=Uint8Array.from({length:35000},(_,i)=>i%251),packets=fragmentState(bytes,1),assembler=new StateAssembler();let restored:Uint8Array|null=null;
 // Lose one data packet in every repair group, and reorder everything.
 for(const packet of packets.filter(p=>{const h=new DataView(p);return h.getUint32(8)>=h.getUint32(12)||h.getUint32(8)%8!==2;}).reverse())restored=assembler.push(packet,10)??restored;
 assert.deepEqual(restored,bytes);assembler.accept(1);assert.equal(assembler.push(packets[0],11),null);
 for(const packet of fragmentState(bytes,2).slice(0,2))assembler.push(packet,20);for(const packet of fragmentState(bytes,3).slice(0,2))assembler.push(packet,400);assert.equal(assembler.pending,1);
 const smaller=fragmentState(new Uint8Array([1,2,3]),4)[0];assert.deepEqual(assembler.push(smaller,401),new Uint8Array([1,2,3]));assembler.accept(4);assert.equal(assembler.push(fragmentState(bytes,3)[2],402),null);
});
test('remote interpolation never changes authoritative state or delays the local predicted player',()=>{
 const host=setup();try{const timeline=new SnapshotTimeline(),a=structuredClone(host.snapshot()!);a.time=1;a.crew[0].player.pos.x=0;const b=structuredClone(a);b.time=1.1;b.crew[0].player.pos.x=10;timeline.push(a,1000);timeline.push(b,1100);const world=new World(1);applySnapshot(world,b,'guest');world.player.pos.z=5;const before=structuredClone(world.crew);const view=timeline.view(world,'guest',1100,{x:0,y:0,z:0});assert.ok(view.crew[0].player.pos.x>0&&view.crew[0].player.pos.x<10);assert.equal(view.player.pos.z,5);assert.deepEqual(world.crew,before);
 }finally{host.close();}
});
test('four level-IV shooters use substantially less bandwidth without dropping projectiles',()=>{
 const host=setup();try{
  host.world!.addCrew('b');host.world!.addCrew('c');for(const p of host.world!.crew)p.level=4;
  let base:ReturnType<typeof snapshotBaseline>|undefined,receiver:ReturnType<typeof snapshotBaseline>|undefined,frame=0,binary=0,json=0;for(let tick=0;tick<240;tick++){
   host.world!.stepCrew(new Map(host.world!.crew.map(p=>[p.id,{...idleInput(),fire:true}])));host.world!.effects=[];
   if(tick%6!==5)continue;const snapshot=host.snapshot()!,encoded=encodeState(snapshot,frame+1,frame,base),decoded=decodeState(encoded,new Map(receiver?[[frame,receiver]]:[]))!;assert.equal(decoded.snapshot.projectiles.length,snapshot.projectiles.length);for(let i=0;i<snapshot.projectiles.length;i++)assert.ok(Math.hypot(decoded.snapshot.projectiles[i].pos.x-snapshot.projectiles[i].pos.x,decoded.snapshot.projectiles[i].pos.y-snapshot.projectiles[i].pos.y,decoded.snapshot.projectiles[i].pos.z-snapshot.projectiles[i].pos.z)<.001);
   binary+=fragmentState(encoded,frame+1).reduce((n,p)=>n+p.byteLength,0);const {serverNow,...legacyFields}=snapshot;const legacy={...legacyFields,projectiles:snapshot.projectiles.map(({shotKey,launch,...p})=>p),crew:snapshot.crew.map(({ack,shotSequence,shotSeed,wasJump,lastShotTick,...p})=>p)};json+=new TextEncoder().encode(JSON.stringify(JSON.stringify(legacy))).length;base=snapshotBaseline(snapshot);receiver=snapshotBaseline(decoded.snapshot);frame++;
  }
  // Primary salvos now carry three times as many real daggers at hand IV.
  assert.ok(json/binary>20,`Only ${(json/binary).toFixed(1)}x reduction`);assert.ok(binary/2<150000,`State exceeds 150 KB/s dense-stream budget: ${binary/2}`);
  console.log(`Level IV: ${(binary/2000).toFixed(1)} KB/s per guest including repair packets, ${(json/binary).toFixed(1)}x smaller than JSON.`);
 }finally{host.close();}
});

test('compact enemy state preserves all rigs, weakpoints and fields used by local aiming',()=>{
 const host=setup();try{
  for(const kind of ['skull','skull2','skull3','skull4','transmuted1','transmuted2','transmuted3','transmuted4','squid','squid2','squid3','spider','spider2','egg','egg2','spiderling','centipede','gigapede','ghostpede','leviathan','orb','thorn'] as const){const e=host.world!.spawn(kind,{x:1.125,y:4.5,z:8.25});e.age=10;e.headExposure=.5;e.lastHit=3.125;}
  const snapshot=host.snapshot()!,decoded=decodeState(encodeState(snapshot,1,0),new Map())!.snapshot;assert.equal(decoded.enemies.length,22);
  for(let i=0;i<22;i++){const a=snapshot.enemies[i],b=decoded.enemies[i];assert.equal(b.kind,a.kind);assert.ok(Math.hypot(b.pos.x-a.pos.x,b.pos.y-a.pos.y,b.pos.z-a.pos.z)<=Math.sqrt(3)/1024);assert.equal(b.hp,a.hp);assert.equal(b.headExposure,a.headExposure);assert.equal(b.lastHit,a.lastHit);assert.equal(b.status,a.status);assert.equal(b.segments.length,a.segments.length);assert.equal(b.weakpoints.length,a.weakpoints.length);assert.ok(Math.abs(b.activeAt-a.activeAt)<.00001);}
 }finally{host.close();}
});
test('congested peers receive current recovery state rather than a backlog of queued snapshots',()=>{
 const host=setup();try{
  host.running=true;host.startAt=0;const sent:ArrayBuffer[]=[],control:string[]=[];
  const link={pc:{close(){}},state:{readyState:'open',bufferedAmount:0,send(data:string){control.push(data);}},updates:{readyState:'open',bufferedAmount:9000,send(data:ArrayBuffer){sent.push(data);}},baselines:new Map(),ackFrame:0,sentEpoch:host.epoch,tokens:0,tokenAt:performance.now(),lastSend:0,sendInterval:50,events:[],timer:0,assembler:new StateAssembler()};
  host.links.set('guest',link as any);host.broadcast();assert.equal(sent.length,0);
  host.world!.player.pos.x=7;host.world!.tick=12;host.world!.time=.1;link.updates.bufferedAmount=0;link.tokens=10000;host.broadcast();assert.ok(sent.length>0);const receiver=new StateAssembler();let bytes:Uint8Array|null=null;for(const p of sent)bytes=receiver.push(p,performance.now())??bytes;assert.ok(bytes);assert.equal(decodeState(bytes!,new Map())!.snapshot.crew[0].player.pos.x,7);assert.ok(link.tokens<10000);
 }finally{host.close();}
});

test('restarting clears old reliable effects and projectile baselines before sending the new epoch',()=>{
 const host=setup();try{
  host.running=true;host.startAt=0;const messages:unknown[]=[];
  const channel={readyState:'open',bufferedAmount:0,send(data:unknown){messages.push(data);}};
  const link={pc:{close(){}},state:channel,updates:channel,baselines:new Map([[99,snapshotBaseline(host.snapshot()!)]]),ackFrame:99,sentEpoch:0,tokens:10000,tokenAt:performance.now(),lastSend:0,sendInterval:50,events:[{kind:'death',pos:{x:0,y:0,z:0},networkId:9}],timer:0,assembler:new StateAssembler()};
  host.links.set('guest',link as any);host.epoch=1;host.broadcast();assert.equal(link.ackFrame,0);assert.equal(link.baselines.has(99),false);assert.equal(link.events.length,0);assert.equal(messages.filter(m=>typeof m==='string'&&JSON.parse(m).type==='effects').length,0);
 }finally{host.close();}
});
test('critical releases are reliable under a busy control channel and do not repeat endlessly',()=>{
 const guest=new FriendsSession('guest');try{
  const sent:string[]=[];const channel={readyState:'open',bufferedAmount:50000,send(data:string){sent.push(data);}};
  guest.links.set('host',{pc:{close(){}},state:channel,timer:0} as any);guest.releaseControls();guest.releaseControls();assert.equal(sent.length,1);assert.equal(JSON.parse(sent[0]).type,'release');
 }finally{guest.close();}
});
test('mixed game builds fail explicitly before creating an incompatible peer connection',async()=>{
 const guest=new FriendsSession('guest');try{await assert.rejects(()=>guest.answer(JSON.stringify({version:1,room:'ABC123',id:'guest',description:{type:'offer',sdp:'old'}})),/different game build/);assert.equal(guest.links.size,0);}finally{guest.close();}
});

test('delayed releases cannot override controls that the host has already processed',()=>{
 const host=setup();try{
  host.running=true;host.startAt=0;const channel:any={label:'state',readyState:'open',bufferedAmount:0,send(){}};
  const link:any={pc:{close(){}},state:channel,timer:0};host.links.set('guest',link);(host as any).bind('guest',link,channel);
  const runs=[[1,5,1,0,0,0,2]];(host as any).receiveCommands('guest',encodePacket({epoch:host.epoch,runs}).buffer);
  for(let i=0;i<5;i++)host.step(idleInput());assert.equal(host.inputs.get('guest')?.fire,true);
  channel.onmessage({data:JSON.stringify({type:'release',epoch:host.epoch,seq:3})});assert.equal(host.inputs.get('guest')?.fire,true);
  channel.onmessage({data:JSON.stringify({type:'release',epoch:host.epoch,seq:5})});assert.equal(host.inputs.get('guest')?.fire,false);
 }finally{host.close();}
});
test('a thousand moving enemies send poses without repeating unchanged metadata or losing damage/removals',()=>{
 const host=setup();try{
  for(let i=0;i<1000;i++){const e=host.world!.spawn('skull',{x:i%32-16,y:2,z:Math.floor(i/32)-16});e.age=2;}
  const first=structuredClone(host.snapshot()!),received=decodeState(encodeState(first,1,0),new Map())!.snapshot,baseline=snapshotBaseline(first),receiver=snapshotBaseline(received);
  host.world!.time=.05;for(const e of host.world!.enemies){e.pos.z-=.1;e.age+=.05;}
  host.world!.enemies[0].hp=0;host.world!.enemies[1].hp=0;host.world!.enemies=host.world!.enemies.filter(e=>e.hp>0);const s=host.snapshot()!,encoded=encodeState(s,2,1,baseline),decoded=decodeState(encoded,new Map([[1,receiver]]))!.snapshot;
  assert.equal(decoded.enemies.length,998);for(let i=0;i<998;i++){const a=s.enemies[i],b=decoded.enemies[i];assert.equal(b.id,a.id);assert.ok(Math.abs(b.pos.z-a.pos.z)<.001);assert.ok(Math.abs(b.age-a.age)<.00001);}
  assert.ok(encoded.length<17000,`Dense state grew to ${encoded.length} bytes`);assert.equal(receiver.enemies.get(first.enemies[2].id)![2][2],Math.fround(first.enemies[2].pos.z),'Decoding must not mutate baseline data');
  console.log(`1,000-enemy poses: ${(encoded.length/1000).toFixed(1)} KB per update; unchanged enemy metadata is omitted.`);
 }finally{host.close();}
});

test('unchanged held inputs compress into runs while the host retains exact tap/stream timing',()=>{
 const history=new InputHistory();for(let i=0;i<120;i++)history.record({...idleInput(),fire:i<40});const runs=inputRuns(history.commands);assert.equal(runs.length,2);assert.deepEqual(runs.map(r=>[r[0],r[1],r[6]]),[[1,40,2],[41,80,0]]);
 const host=setup();try{host.running=true;host.startAt=0;host.links.set('guest',{pc:{close(){}},timer:0} as any);(host as any).receiveCommands('guest',encodePacket({epoch:host.epoch,runs}).buffer);for(let i=0;i<120;i++)host.step(idleInput());assert.equal(host.world!.stats.shots,1);assert.equal(host.snapshot()!.crew[1].ack,120);assert.equal(host.world!.crew[1].primary.streaming,false);}finally{host.close();}
});

test('guest countdown uses the host clock even when browser clocks differ by a minute',()=>{
 const host=setup(),guest=new FriendsSession('guest'),clock=Date.now;try{
  const snapshot=structuredClone(host.snapshot()!),serverNow=clock();snapshot.running=true;snapshot.serverNow=serverNow;snapshot.startAt=serverNow+3000;
  const link:any={assembler:new StateAssembler(),baselines:new Map()};Date.now=()=>serverNow-60000;
  for(const packet of fragmentState(encodeState(snapshot,1,0),1))(guest as any).receiveState(link,packet);
  assert.equal(guest.startAt-Date.now(),3000);snapshot.time=1;snapshot.tick=120;
  for(const packet of fragmentState(encodeState(snapshot,2,0),2))(guest as any).receiveState(link,packet);
  assert.equal(guest.startAt,0,'Authoritative gameplay must never remain blocked by a stale countdown');
 }finally{Date.now=clock;host.close();guest.close();}
});

test('ready toggles preserve local intent until the matching host revision arrives',()=>{
 const host=setup(),guest=new FriendsSession('guest');try{
  guest.localId='guest';host.links.set('guest',{pc:{close(){}},state:{readyState:'open'},timer:0} as any);host.members.push({id:'guest',name:'Guest',ready:false,host:false});guest.members=structuredClone(host.members);const link:any={pc:{close(){}},state:{readyState:'open',bufferedAmount:0,send(){}},timer:0,assembler:new StateAssembler(),baselines:new Map()};guest.links.set('host',link);
  guest.setReady(true);assert.equal(guest.members[1].ready,true);
  const deliver=(frame:number,ready:boolean,revision:number)=>{host.members[1].ready=ready;host.members[1].readyRevision=revision;for(const packet of fragmentState(encodeState(host.snapshot()!,frame,0),frame))(guest as any).receiveState(link,packet);};
  deliver(1,false,0);assert.equal(guest.members[1].ready,true,'Stale roster must not undo the first click');
  guest.setReady(false);deliver(2,true,1);assert.equal(guest.members[1].ready,false,'First confirmation must not undo the second click');
  deliver(3,false,2);guest.setReady(true);deliver(4,false,2);assert.equal(guest.members[1].ready,true);deliver(5,true,3);assert.equal(guest.members[1].ready,true);
 }finally{host.close();guest.close();}
});
