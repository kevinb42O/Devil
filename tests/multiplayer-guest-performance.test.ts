import test from 'node:test';
import assert from 'node:assert/strict';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {World,idleInput,STEP,type Projectile} from '../src/simulation';
import {encodeState,decodeState,snapshotBaseline,decodedSnapshotBaseline} from '../src/network-state';
import {SnapshotTimeline} from '../src/network-presentation';
const freeze=(value:any):any=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
function host(){const s=new FriendsSession('host',[]);s.world!.addCrew('guest');s.world!.contactOwners=['guest'];s.running=true;return s;}

test('live client-hit flight owns local daggers while decoded state/history/baselines remain immutable',()=>{
 const h=host(),guest=new FriendsSession('guest',[]);try{
  const w=new World(1,{schedule:false});guest.localId='guest';guest.running=true;const source=h.world!;source.crew[1].level=7;
  for(const kind of ['skull4','squid3','gigapede'] as const){const e=source.spawn(kind,{x:0,y:3,z:0},false);e.age=10;e.hp=1000;}
  source.projectiles=[{id:10000,shotKey:'guest:1:0',pos:{x:0,y:3,z:1},vel:{x:0,y:0,z:-70},age:0,homing:false},{id:10001,shotKey:'host:1:0',pos:{x:1,y:6,z:2},vel:{x:0,y:0,z:-70},age:0,homing:false}];
  let previous=snapshotBaseline(h.snapshot()!),decoded=decodeState(encodeState(h.snapshot()!,1,0),new Map())!;
  for(let frame=2;frame<=80;frame++){
   const s=freeze(decoded.snapshot),saved=structuredClone(s),base=decodedSnapshotBaseline(s)!,savedBase=structuredClone(base);guest.reconcile(w,s);
   assert.notEqual(w.projectiles.find(p=>p.id===10000),s.projectiles[0]);assert.equal(w.projectiles.find(p=>p.id===10001),s.projectiles[1]);assert.equal(w.enemies,s.enemies);
   guest.presentation(w,frame*50);for(let i=0;i<6;i++)guest.predict(w,{...idleInput(),fire:true,jump:i===0});guest.presentation(w,frame*50+25);
   assert.deepEqual(structuredClone(s),saved);assert.deepEqual(base,savedBase);
   const timeline=(guest as any).timeline as SnapshotTimeline;timeline.push(s,frame*50);assert.ok(!(timeline as any).samples.at(-1).s.projectiles);assert.ok((timeline as any).samples.length<=12);
   source.time+=.05;source.tick+=6;source.enemies[0].pos.x+=.01;source.projectiles[1].pos.z-=3.5;source.projectiles[1].age+=.05;
   const next=h.snapshot()!,wire=encodeState(next,frame,frame-1,previous);decoded=decodeState(wire,new Map([[frame-1,base]]))!;assert.ok(decoded);assert.ok(Math.abs(decoded.snapshot.enemies[0].pos.x-source.enemies[0].pos.x)<.002);previous=snapshotBaseline(next);
  }
 }finally{h.close();guest.close();}
});

test('cached owner flight avoids rescanning remote shots and invalidates for appends/replacements',()=>{
 const w=new World(42,{schedule:false});w.addCrew('guest');w.selectCrew('guest');let reads=0;
 w.projectiles=Array.from({length:6000},(_,i)=>({id:i+1,get shotKey(){reads++;return `host:1:${i}`;},pos:{x:0,y:5,z:0},vel:{x:0,y:0,z:-70},age:0,homing:false}));
 assert.equal(w.localProjectiles('guest').length,0);const first=reads;for(let i=0;i<30;i++)w.predictCrew('guest',idleInput());assert.equal(reads,first);
 const own:Projectile={id:8000,shotKey:'guest:1:0',pos:{x:0,y:5,z:0},vel:{x:0,y:0,z:-70},age:0,homing:false};w.projectiles.push(own);w.predictProjectiles('guest');assert.ok(own.pos.z<0);const after=reads;w.predictProjectiles('guest');assert.equal(reads,after);assert.equal(w.projectiles.length,6001);
 w.projectiles=[];assert.equal(w.localProjectiles('guest').length,0);
 w.projectiles=[own];assert.equal(w.localProjectiles('guest')[0],own);
});

test('600 seconds of player replacement and prediction retain one pose, including snapshots with no subsequent movement',()=>{
 const h=host(),guest=new FriendsSession('guest',[]);try{
  guest.localId='guest';const s=h.snapshot()!,w=new World(1,{schedule:false});
  for(let frame=0;frame<12000;frame++){guest.reconcile(w,s);for(let tick=0;tick<6;tick++)w.predictCrew('guest',idleInput(),STEP);}
  assert.equal((w as any).playerStarts.size,1);applySnapshot(w,s,'guest');assert.equal((w as any).playerStarts.size,0);
 }finally{h.close();guest.close();}
});

test('receive baselines retain decoded drawing ink across relative board updates',()=>{
 const h=host();try{
  h.running=false;h.enterPrelobby();const c=h.world!.courtyard!;c.drawing!.ink=[[1,10,20,30,40]];
  const first=h.snapshot()!,sender=snapshotBaseline(first),decoded=decodeState(encodeState(first,1,0),new Map())!,receiver=decodedSnapshotBaseline(decoded.snapshot)!;
  c.drawing!.ink.push([2,20,30,40,50]);c.drawing!.sequence++;
  const next=decodeState(encodeState(h.snapshot()!,2,1,sender),new Map([[1,receiver]]))!;
  assert.deepEqual(next.snapshot.courtyard!.drawing!.ink,c.drawing!.ink);assert.equal(receiver.drawing!.ink.length,1);
 }finally{h.close();}
});

test('cached frame grids match uncached swept hits, homing, health and consumed bullets over changing poses',()=>{
 const original=new World(42,{schedule:false});original.addCrew('guest');original.selectCrew('guest');
 for(let i=0;i<8;i++){const e=original.spawn('skull4',{x:(i%4)*3-5,y:5,z:Math.floor(i/4)*4},false);e.age=10;e.hp=5;}
 const fast=World.restoreCrewCheckpoint(original.captureCrewCheckpoint()),reference=World.restoreCrewCheckpoint(original.captureCrewCheckpoint());
 for(let frame=0;frame<25;frame++){
  const fastTargets=structuredClone(original.enemies),slowTargets=structuredClone(original.enemies),batch={frame};
  for(const targets of [fastTargets,slowTargets])for(let i=0;i<targets.length;i++)targets[i].pos.x+=Math.sin(frame*.4+i)*2;
  for(let i=0;i<12;i++)for(const w of [fast,reference])w.projectiles.push({id:-1-frame*12-i,shotKey:`guest:${frame+1}:${i}`,pos:{x:i%4*3-5,y:5,z:10},vel:{x:0,y:0,z:-70},age:0,level:7,homing:i%5===0,energy:1});
  for(let tick=0;tick<6;tick++){fast.predictProjectiles('guest',STEP,fastTargets,true,batch);reference.predictProjectiles('guest',STEP,slowTargets,true);assert.deepEqual(fast.projectiles,reference.projectiles);assert.deepEqual(fast.predictedContacts,reference.predictedContacts);assert.deepEqual(fastTargets,slowTargets);assert.deepEqual(fast.effects,reference.effects);}
 }
});
