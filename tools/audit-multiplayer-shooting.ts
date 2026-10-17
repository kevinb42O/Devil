import {mkdir,writeFile} from 'node:fs/promises';
import {FriendsSession} from '../src/multiplayer';
import {World,STEP,idleInput,v,type Effect} from '../src/simulation';
import {encodeEffects} from '../src/network-effects';
import {encodeContacts,type ProjectileContact} from '../src/network-contacts';
import {encodePacket,decodePacket} from '../src/network-codec';

// Compare only the changed wire paths, with identical controller samples,
// acknowledgements and combat on each side. No wall-clock timing assertions.
function inputs(immediate:boolean,tapping:boolean){
 const original=globalThis.performance;let now=2000;globalThis.performance={now:()=>now} as Performance;
 const s=new FriendsSession('guest'),w=new World(42,{schedule:false});w.addCrew('guest');s.localId='guest';s.running=true;
 let packets=0,bytes=0,duringPredict=false;const send=(data:ArrayBuffer)=>{packets++;bytes+=immediate?data.byteLength:encodePacket(decodePacket(new Uint8Array(data)),false).byteLength;};
 s.links.set('guest',{pc:{close(){}},timer:0,input:{readyState:'open',bufferedAmount:0,send}} as any);
 const flush=(s as any).flushInputs.bind(s);(s as any).flushInputs=()=>{if(!duringPredict||immediate)flush();};
 try{
  for(let tick=0;tick<600;tick++){
   now=2000+tick*STEP*1000;(s as any).lastState=now;
   if(tick%6===0)(s as any).history.acknowledge(Math.max(0,tick-15)); // ~125 ms RTT + 20 Hz snapshots.
   const fire=tapping?tick%30<12:tick<540;
   duringPredict=true;s.predict(w,{...idleInput(),fire,yaw:Math.sin(tick/120)*.3});duringPredict=false;w.effects=[];
   if(tick%3===0)flush(); // Existing 25 ms input pump.
  }
  return {packets,bytes,KBps:bytes/5000};
 }finally{s.close();globalThis.performance=original;}
}
function effects(level:number){
 const w=new World(42,{schedule:false,invulnerable:true});for(let i=0;i<4;i++){w.addCrew(`player_${String(i).padStart(17,'0')}`);w.crew[i].level=level;}
 const e=w.spawn('skull4',v(0,1.7,0));e.radius=3;e.hp=1e6;e.age=10;e.activeAt=0;w.effects=[];
 let previousBytes=0,currentBytes=0,contacts=0,eventId=0;const pending:Effect[]=[];
 const size=(events:Effect[])=>new TextEncoder().encode(JSON.stringify({type:'effects',epoch:1,events})).length;
 for(let tick=0;tick<240;tick++){
  e.pos=v(0,1.7,0);e.vel=v();
  w.stepCrew(new Map(w.crew.map(p=>[p.id,{...idleInput(),fire:true,yaw:Math.atan2(p.player.pos.x,p.player.pos.z)}])));
  pending.push(...w.effects.map(e=>({...e,networkId:++eventId})));w.effects=[];
  if(tick%6===5){
   while(pending.length){const events=pending.splice(0,24);contacts+=events.filter(e=>e.kind==='hit').length;
    currentBytes+=new TextEncoder().encode(encodeEffects(1,events)).length;previousBytes+=size(events.map(e=>{if(e.kind==='shot'||e.kind==='burst')return e;const {shotKey,...previous}=e;return previous;}));
   }
  }
 }
 return {level,players:4,seconds:2,contacts,previousEffectKBpsPerGuest:previousBytes/2000,currentEffectKBpsPerGuest:currentBytes/2000,addedKBpsPerGuest:(currentBytes-previousBytes)/2000};
}
function contactTraffic(){
 const contact:ProjectileContact={serial:12345,shotKey:'player_00000000000000001:12345:7',enemyId:12345,segment:-1,weak:false,kind:'hit',pos:v(1.25,1.7,6),direction:v(0,0,1)};
 const bytes=(count:number)=>new TextEncoder().encode(encodeContacts(1,Array.from({length:count},(_,i)=>({...contact,serial:12345+i,shotKey:`player_00000000000000001:12345:${i}`})))).length;
 return {singleContactBytes:bytes(1),batch24Bytes:bytes(24),singleContactKBpsAt100HitsPerSecond:bytes(1)*100/1000,note:'Additional guest-to-host payload, excluding headers, acknowledgements and retries. Includes armor impacts and absorption; misses send no contact. Batching depends on contacts produced together.'};
}
const report={note:'Synthetic application payload bytes; excludes transport headers. Effect workload is four players continuously hitting one durable enemy. Effects and inputs are isolated path comparisons, not total connection bandwidth. Snapshot body encoding is unchanged apart from contact ownership/acknowledgement metadata.',inputs:{held:{before:inputs(false,false),after:inputs(true,false)},fourTapsPerSecond:{before:inputs(false,true),after:inputs(true,true)}},effects:[1,4,7].map(effects),contacts:contactTraffic()};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/multiplayer-shooting-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
