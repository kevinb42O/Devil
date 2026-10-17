import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v,type Projectile} from '../src/simulation';
import {FriendsSession} from '../src/multiplayer';
import {encodeContacts,decodeContacts,type ProjectileContact} from '../src/network-contacts';
import {CrewRunRecorder,CrewReplayPlayer,packCrewReplay,unpackCrewReplay,crewCheckpointDigest} from '../src/crew-replay';
import {SHOTGUN_TUNING} from '../src/weapon-tuning';

function fixture(invulnerable=true){const w=new World(42,{schedule:false,invulnerable});w.addCrew('host');w.addCrew('guest');w.contactOwners=['guest'];const e=w.spawn('skull4',v(0,5,0));e.pos=v(0,5,0);e.age=10;e.activeAt=0;e.hp=10;w.effects=[];return {w,e};}
function shot(w:World,changes:Partial<Projectile>={}){const p:Projectile={id:900,shotKey:'guest:1:0',pos:v(0,5,0),vel:v(),age:0,homing:false,level:1,...changes};w.projectiles.push(p);return p;}
function claim(enemyId:number,changes:Partial<ProjectileContact>={}):ProjectileContact{return {shotKey:'guest:1:0',enemyId,segment:-1,weak:false,kind:'hit',pos:v(0,5,0),direction:v(0,0,-1),...changes};}

test('a guest hit counts at the seen position after the target has moved far away on the host',()=>{
 const {w,e}=fixture();shot(w);e.pos.x=20;w.queueContacts([claim(e.id)]);w.stepCrew(new Map());assert.equal(e.hp,9);assert.equal(w.stats.hits,1);assert.equal(w.projectiles.length,0);
});
test('host trajectory cannot prematurely hit an enemy the shooter missed',()=>{
 const {w,e}=fixture();shot(w);w.stepCrew(new Map());assert.equal(e.hp,10);assert.equal(w.stats.hits,0);assert.equal(w.projectiles.length,1);
});
test('a hit already received by the host resolves before the same enemy can kill a player that tick',()=>{
 for(const received of [false,true]){
  const {w,e}=fixture(false);w.crew[0].player.pos=v(0,1.7,0);w.crew[1].player.pos=v(20,1.7,20);e.pos=v(0,1.7,0);e.hp=1;shot(w);
  if(received)w.queueContacts([claim(e.id)]);w.stepCrew(new Map());assert.equal(w.crew[0].alive,received);
 }
});
test('reports arriving before fire input wait for the matching shot and apply once',()=>{
 const {w,e}=fixture();const c=claim(e.id);w.queueContacts([c,c]);w.stepCrew(new Map());assert.equal(e.hp,10);
 shot(w);w.stepCrew(new Map());assert.equal(e.hp,9);assert.equal(w.stats.hits,1);
 w.queueContacts([c]);for(let i=0;i<4;i++)w.stepCrew(new Map());assert.equal(e.hp,9);assert.equal(w.stats.hits,1);
});
test('two guest reports add damage, but simultaneous lethal hits produce one kill and one gem drop',()=>{
 const {w,e}=fixture();w.addCrew('other');w.contactOwners.push('other');e.hp=1;shot(w);shot(w,{id:901,shotKey:'other:1:0'});
 w.queueContacts([claim(e.id),claim(e.id,{shotKey:'other:1:0'})]);w.stepCrew(new Map());assert.equal(w.stats.kills,1);assert.equal(w.stats.hits,1);assert.equal(w.effects.filter(e=>e.kind==='kill').length,1);assert.equal(w.gems.length,e.gems);
 const durable=fixture();durable.w.addCrew('other');durable.w.contactOwners.push('other');shot(durable.w);shot(durable.w,{id:901,shotKey:'other:1:0'});durable.w.queueContacts([claim(durable.e.id),claim(durable.e.id,{shotKey:'other:1:0'})]);durable.w.stepCrew(new Map());assert.equal(durable.e.hp,8);
});
test('a delayed report still counts after the host visual projectile lifetime expired',()=>{
 const {w,e}=fixture();shot(w,{age:2.8-STEP/2,pos:v(30,5,0)});w.stepCrew(new Map());assert.equal(w.projectiles.length,0);w.queueContacts([claim(e.id)]);w.stepCrew(new Map());assert.equal(e.hp,9);assert.equal(w.stats.hits,1);
 w.queueContacts([claim(e.id)]);w.stepCrew(new Map());assert.equal(e.hp,9);
});
test('reported shotgun/homing damage uses the fired dagger, including delayed homing explosions',()=>{
 for(const homing of [false,true]){
  const {w,e}=fixture();e.hp=100;shot(w,{homing,energy:10,level:4,kind:homing?undefined:'shotgun'});w.queueContacts([claim(e.id)]);w.stepCrew(new Map());
  assert.equal(e.hp,100-(homing?10:SHOTGUN_TUNING.damage));assert.equal(w.captureCrewCheckpoint().detonations.length,homing?1:0);
  if(homing){const secondary=w.spawn('skull4',v(0,5,0));secondary.pos=v(0,5,0);secondary.age=10;secondary.activeAt=0;secondary.hp=100;w.stepCrew(new Map());w.stepCrew(new Map());assert.equal(secondary.hp,90);assert.equal(e.hp,90);}
 }
});
test('reports for armor and crystals already broken by a teammate never damage the remaining crystal or duplicate its gem',()=>{
 for(const armor of [false,true]){
  const {w}=fixture();w.enemies=[];const e=w.spawn('squid2',v(0,8,0));e.age=10;e.activeAt=0;const point=w.weakPoint(e);w.damageEnemy(e,1000,point,0,true);const hp=e.hp,gems=w.gems.length;shot(w);
  w.queueContacts([claim(e.id,{weak:true,segment:0,kind:armor?'impact':'hit',pos:point})]);w.stepCrew(new Map());
  assert.equal(e.hp,hp);assert.equal(w.stats.hits,0);assert.equal(w.gems.length,gems);assert.equal(w.projectiles.length,0);
 }
});
test('unsent contacts stay queued during control-channel congestion and retry after it drains',()=>{
 const host=new FriendsSession('host'),guest=new FriendsSession('guest');const {w,e}=fixture();host.world=w;host.running=true;shot(w);guest.localId='guest';guest.running=true;
 const channel={readyState:'open',bufferedAmount:16000,send(_s:string){sent++;}},sentMessages:string[]=[];let sent=0;channel.send=s=>{sent++;sentMessages.push(s);};guest.links.set('guest',{pc:{close(){}},timer:0,state:channel} as any);
 try{const local=new World(1);guest.reconcile(local,host.snapshot()!);(guest as any).contactOutbox.set('guest:1:0',claim(e.id,{serial:1}));(guest as any).flushContacts();assert.equal(sent,0);assert.equal((guest as any).contactOutbox.size,1);channel.bufferedAmount=0;(guest as any).flushContacts();assert.equal(sent,1);assert.equal((guest as any).contactOutbox.size,1,'sent reports stay recoverable until the host acknowledges them');assert.equal(decodeContacts(JSON.parse(sentMessages[0]),'guest').length,1);const acknowledged=host.snapshot()!;acknowledged.crew[1].contactAck=1;guest.reconcile(local,acknowledged);assert.equal((guest as any).contactOutbox.size,0);}finally{host.close();guest.close();}
});
test('local health and lethal feedback are immediate; stale snapshots never resurrect enemies or subtract damage twice',()=>{
 for(const hp of [1,10]){
  const host=new FriendsSession('host'),guest=new FriendsSession('guest'),{w,e}=fixture();e.hp=hp;shot(w);host.world=w;host.running=true;guest.running=true;guest.localId='guest';const local=new World(1),sent:string[]=[],effects:any[]=[];
  guest.links.set('guest',{pc:{close(){}},timer:0,state:{readyState:'open',bufferedAmount:0,send(m:string){sent.push(m);}}} as any);guest.onEffects=batch=>effects.push(...batch);
  try{
   const stale=structuredClone(host.snapshot()!);guest.reconcile(local,stale);guest.presentation(local,1000);let view=guest.presentation(local,1009);
   assert.equal(local.enemies[0].hp,hp,'predicted health never overwrites the shared snapshot');assert.equal(view.enemies[0]?.hp,hp===1?undefined:hp-1);
   for(let i=0;i<3;i++){guest.reconcile(local,stale);view=guest.presentation(local,1020+i*10);assert.equal(view.enemies[0]?.hp,hp===1?undefined:hp-1);}
   w.queueContacts(sent.flatMap(message=>decodeContacts(JSON.parse(message),'guest')));w.stepCrew(new Map());const confirmed=host.snapshot()!;assert.equal(confirmed.crew[1].contactAck,1);
   guest.reconcile(local,confirmed);view=guest.presentation(local,1100);assert.equal(view.enemies[0]?.hp,hp===1?undefined:hp-1);assert.equal((guest as any).pendingDamage.size,0);
   (guest as any).receiveEffects({type:'effects',epoch:0,events:w.effects.map((effect,i)=>({...effect,networkId:i+1}))});assert.equal(effects.filter(e=>e.kind==='kill').length,hp===1?1:0);assert.equal(effects.filter(e=>e.kind==='hit').length,1);
  }finally{host.close();guest.close();}
 }
});
test('contact acknowledgements cannot advance shared health past a report still waiting for its fire input',()=>{
 const {w,e}=fixture();shot(w,{shotKey:'guest:1:0'});w.crew[1].shotSequence=1;
 w.queueContacts([claim(e.id,{shotKey:'guest:2:0',serial:1}),claim(e.id,{shotKey:'guest:1:0',serial:2})]);w.stepCrew(new Map());assert.equal(e.hp,10);assert.equal(w.contactAcknowledged('guest'),0);
 shot(w,{shotKey:'guest:2:0',id:901});w.crew[1].shotSequence=2;w.stepCrew(new Map());assert.equal(e.hp,8);assert.equal(w.contactAcknowledged('guest'),2);
 w.queueContacts([claim(e.id,{shotKey:'guest:1:0',serial:2})]);w.stepCrew(new Map());assert.equal(e.hp,8);
});
test('unmatched reports expire, and another peer cannot apply a report for an unowned shot',()=>{
 const {w,e}=fixture();w.queueContacts([claim(e.id,{shotKey:'host:1:0'})]);assert.equal(w.captureCrewCheckpoint().contacts!.incoming.length,0);
 w.queueContacts([claim(e.id)]);for(let i=0;i<602;i++)w.stepCrew(new Map());assert.equal(w.captureCrewCheckpoint().contacts!.pending.length,0);assert.equal(w.stats.hits,0);
});
test('respawning cannot reuse unacknowledged shot identities, while old in-flight daggers remain valid',()=>{
 const {w,e}=fixture();const player=w.crew[1];player.shotSequence=10;player.alive=false;player.cause='THE ABYSS';player.respawnAt=STEP;
 const old=shot(w,{shotKey:'guest:10:0',pos:v(30,5,0)});w.stepCrew(new Map());assert.equal(player.life,1);assert.ok(player.shotSequence>10+480);assert.ok(w.projectiles.includes(old));
 w.queueContacts([claim(e.id,{shotKey:'guest:10:0'})]);w.stepCrew(new Map());assert.equal(e.hp,9);
 w.stepCrew(new Map([['guest',{...idleInput(),fire:true}]]));w.stepCrew(new Map([['guest',idleInput()]]));assert.ok(w.projectiles.some(p=>Number(p.shotKey?.split(':')[1])>1034));
});
test('contact wire format preserves target/segment/mode and takes shooter identity from the connection',()=>{
 const c=claim(42,{shotKey:'guest:800:7',weak:true,segment:3});const message=JSON.parse(encodeContacts(1,[c]));const decoded=decodeContacts(message,'other');assert.deepEqual(decoded,[{...c,shotKey:'other:800:7'}]);assert.throws(()=>decodeContacts({packed:'!'},'guest'));
});
test('guest flight survives host corrections, reports moving-target contact, and never resurrects consumed daggers',()=>{
 const host=new FriendsSession('host'),guest=new FriendsSession('guest');const {w,e}=fixture();host.world=w;host.running=true;shot(w,{pos:v(-4,5,0),vel:v(120,0,0)});
 guest.running=true;guest.localId='guest';const local=new World(1,{schedule:false});const sent:string[]=[];guest.links.set('guest',{pc:{close(){}},timer:0,state:{readyState:'open',bufferedAmount:0,send(m:string){sent.push(m);}}} as any);
 try{
  const snapshot=structuredClone(host.snapshot()!);guest.reconcile(local,snapshot);guest.presentation(local,1000);guest.presentation(local,1009);const before=local.projectiles[0].pos.x;
  guest.reconcile(local,snapshot);assert.equal(local.projectiles[0].pos.x,before,'old host snapshot cannot pull the dagger back');
  guest.presentation(local,1018);guest.presentation(local,1027);guest.presentation(local,1036);assert.equal(local.projectiles.length,0);assert.ok(sent.some(m=>JSON.parse(m).type==='contacts'));
  guest.reconcile(local,snapshot);assert.equal(local.projectiles.length,0,'consumed source cannot reappear from a stale snapshot');assert.equal(e.hp,10);
  const contacts=sent.flatMap(m=>{const message=JSON.parse(m);return message.type==='contacts'?decodeContacts(message,'guest'):[];});e.pos.x=20;w.queueContacts(contacts);w.stepCrew(new Map());assert.equal(e.hp,9);
 }finally{host.close();guest.close();}
});
test('projectiles continue making contact while the guest is dead or not sending controller inputs',()=>{
 const host=new FriendsSession('host'),guest=new FriendsSession('guest');const {w,e}=fixture();host.world=w;host.running=true;shot(w,{pos:v(-2,5,0),vel:v(120,0,0)});w.crew[1].alive=false;
 guest.running=true;guest.localId='guest';const local=new World(1,{schedule:false});const received:any[]=[];guest.onEffects=effects=>received.push(...effects);
 try{guest.reconcile(local,host.snapshot()!);guest.presentation(local,1000);guest.presentation(local,1040);assert.equal(local.projectiles.length,0);assert.ok(received.some(e=>e.kind==='hit'));assert.equal(e.hp,10);}finally{host.close();guest.close();}
});
test('client target sweeps catch enemies crossing a stationary dagger between rendered samples',()=>{
 const {w,e}=fixture();w.selectCrew('guest');e.radius=.3;e.pos=v(-2,5,0);shot(w,{id:-900});w.predictProjectiles('guest');e.pos.x=2;w.predictProjectiles('guest');assert.ok(w.predictedContacts.some(c=>c.enemyId===e.id));assert.equal(e.hp,10);
});
test('replay records external contacts and restores pending reports and expired sources exactly',()=>{
 const {w,e}=fixture();shot(w);const recorder=new CrewRunRecorder(42,w,[],'contacts',1);const states=new Map<number,string>();
 for(let i=0;i<35;i++){
  if(i===2)w.queueContacts([claim(e.id,{serial:1})]);
  if(i===34)for(const p of w.crew){p.alive=false;p.cause='DISCONNECTED';}const before=w.crew.map(p=>({...p}));
  w.effects=[];w.stepCrew(new Map());recorder.record(w,new Map(),new Set(),before);states.set(i+1,crewCheckpointDigest(w.captureCrewCheckpoint()));
 }
 const run=recorder.finish(w)!;assert.ok(run);assert.equal(run.contacts!.length,1);const decoded=unpackCrewReplay(packCrewReplay(run)),player=new CrewReplayPlayer(decoded);
 while(!player.done){player.step();assert.equal(crewCheckpointDigest(player.world.captureCrewCheckpoint()),states.get(player.tick));}
 for(const tick of [2,3,20,0,35]){player.seek(tick);if(tick)assert.equal(crewCheckpointDigest(player.world.captureCrewCheckpoint()),states.get(tick));}
 const pending=fixture();pending.w.queueContacts([claim(pending.e.id)]);pending.w.stepCrew(new Map());assert.deepEqual(World.restoreCrewCheckpoint(pending.w.captureCrewCheckpoint()).captureCrewCheckpoint(),pending.w.captureCrewCheckpoint());
});
