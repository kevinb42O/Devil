import {type ArenaSnapshot} from './multiplayer';
import {STEP,TUNING,type Projectile,type Vec} from './simulation';
import {encodePacket,decodePacket,presentationPrecision,NETWORK_PROTOCOL_VERSION} from './network-codec';
import {packEnemy,unpackEnemy,sameEnemyState,type EnemyRow} from './network-enemies';
type WorldEnemies=ArenaSnapshot['enemies'];
type WireCrew=Omit<ArenaSnapshot['crew'][number],'life'|'respawnAt'|'protectedUntil'>&{life?:number;respawnAt?:number;protectedUntil?:number};
export type StateBaseline={time:number;projectiles:Map<number,Projectile>;enemies:Map<number,EnemyRow>};
export type WireState={version:typeof NETWORK_PROTOCOL_VERSION;frame:number;epoch:number;body:Omit<ArenaSnapshot,'projectiles'|'enemies'|'effects'|'crew'>&{enemies:EnemyRow[];crew:WireCrew[]};creatures:{ids:number[];positions:Float32Array};flight:{base:number;ids:number[];updates:unknown[][]}};
export function snapshotBaseline(s:ArenaSnapshot):StateBaseline{return {time:s.time,projectiles:new Map(s.projectiles.map(p=>[p.id,structuredClone(p)])),enemies:new Map(s.enemies.map(e=>[e.id,packEnemy(e)]))};}
export function flightPosition(p:Projectile,dt:number):Vec{
 const gravity=p.floorBounces&&!p.homing?TUNING.gravity:0;
 return {x:p.pos.x+p.vel.x*dt,y:p.pos.y+p.vel.y*dt-gravity*dt*(dt+STEP)/2,z:p.pos.z+p.vel.z*dt};
}
const row=(p:Projectile,crew:ArenaSnapshot['crew'])=>{
 const key=p.shotKey?.split(':'),owner=key?crew.findIndex(c=>c.id===key[0]):-1;
 return [p.id,new Float32Array([p.pos.x,p.pos.y,p.pos.z,p.vel.x,p.vel.y,p.vel.z,p.age]),(p.homing?1:0)|(((p.level??1)-1)<<1),p.energy??1,p.floorBounces??0,owner,owner>=0?Number(key![1]):0,owner>=0?Number(key![2]):0];
};
export function encodeState(s:ArenaSnapshot,frame:number,base:number,baseline?:StateBaseline){
 // Effects use the reliable event channel; omit the redundant empty field here.
 const {projectiles,effects,...body}=s;const updates:unknown[][]=[];const enemies:EnemyRow[]=[],positions=new Float32Array(s.enemies.length*3);
 for(let i=0;i<s.enemies.length;i++){const enemy=s.enemies[i],packed=packEnemy(enemy),old=baseline?.enemies.get(enemy.id);positions.set([enemy.pos.x,enemy.pos.y,enemy.pos.z],i*3);if(!old||!sameEnemyState(packed,old,s.time-baseline!.time))enemies.push(packed);}
 for(const p of projectiles){const old=baseline?.projectiles.get(p.id);const elapsed=s.time-(baseline?.time??s.time);
  // Straight flight and gravity after a bounce are reconstructed. Homing,
  // new bounces, velocity changes and periodic refreshes are explicit.
  const gravity=old?.floorBounces&&!p.homing?TUNING.gravity:0;
  if(!old||elapsed>=.5||p.homing||p.floorBounces!==old.floorBounces||Math.abs(p.vel.x-old.vel.x)>.0001||Math.abs(p.vel.y-old.vel.y+gravity*elapsed)>.0001||Math.abs(p.vel.z-old.vel.z)>.0001||Math.abs(p.age-old.age-elapsed)>.02)updates.push(row(p,s.crew));
 }
 return encodePacket({version:NETWORK_PROTOCOL_VERSION,frame,epoch:s.epoch,body:{...body,crew:s.crew.map(({life,respawnAt,protectedUntil,...p})=>({...p,life:life||undefined,respawnAt:respawnAt??undefined,protectedUntil:protectedUntil>s.time?protectedUntil:undefined})),enemies,gems:presentationPrecision(s.gems),rings:presentationPrecision(s.rings)},creatures:{ids:s.enemies.map((e,i)=>e.id-(i?s.enemies[i-1].id:0)),positions},flight:{base:baseline?base:0,ids:projectiles.map((p,i)=>p.id-(i?projectiles[i-1].id:0)),updates}} satisfies WireState);
}
export function decodeState(data:Uint8Array,baselines:Map<number,StateBaseline>):{frame:number;snapshot:ArenaSnapshot}|null{
 const w=decodePacket(data) as WireState;
 if(w?.version!==NETWORK_PROTOCOL_VERSION||!Number.isInteger(w.frame)||w.frame<1||!w.body||w.body.epoch!==w.epoch||!Array.isArray(w.body.crew)||w.body.crew.length>4||!Array.isArray(w.body.enemies)||!Array.isArray(w.body.gems)||!Array.isArray(w.body.rings)||!Number.isFinite(w.body.serverNow)||!Number.isFinite(w.body.time)||!Number.isInteger(w.body.tick)||!w.flight||!Array.isArray(w.flight.ids)||w.flight.ids.length>20000||!Array.isArray(w.flight.updates)||!w.creatures||!Array.isArray(w.creatures.ids)||w.creatures.ids.length>20000||!(w.creatures.positions instanceof Float32Array)||w.creatures.positions.length!==w.creatures.ids.length*3)throw Error('Invalid state');
 const baseline=w.flight.base?baselines.get(w.flight.base):undefined;if(w.flight.base&&!baseline)return null;
 const enemyUpdates=new Map(w.body.enemies.map(row=>[row[0],row])),enemies:WorldEnemies=[];const seenEnemies=new Set<number>();let enemyId=0;
 for(let i=0;i<w.creatures.ids.length;i++){
  const delta=w.creatures.ids[i];if(!Number.isInteger(delta))throw Error('Invalid enemy delta');enemyId+=delta;if(!Number.isSafeInteger(enemyId)||enemyId<0||seenEnemies.has(enemyId))throw Error('Invalid enemy identity');seenEnemies.add(enemyId);
  let row=enemyUpdates.get(enemyId);if(!row){const old=baseline?.enemies.get(enemyId);if(!old)return null;const elapsed=w.body.time-baseline!.time;if(elapsed<0||elapsed>2)return null;const data=old[2].slice();data[4]+=elapsed;row=[old[0],old[1],data,old[3],old[4],old[5],old[6]];}
  row[2][0]=w.creatures.positions[i*3];row[2][1]=w.creatures.positions[i*3+1];row[2][2]=w.creatures.positions[i*3+2];enemies.push(unpackEnemy(row));
 }
 const updates=new Map<number,Projectile>();for(const r of w.flight.updates){
  if(!Array.isArray(r)||r.length!==8||!Number.isInteger(r[0])||!(r[1] instanceof Float32Array)||r[1].length!==7||r.slice(2).some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Invalid flight');
  const [id,values,flags,energy,floorBounces,owner,shot,index]=r as [number,Float32Array,number,number,number,number,number,number];const [x,y,z,vx,vy,vz,age]=values;
  updates.set(id,{id,pos:{x,y,z},previous:{x,y,z},vel:{x:vx,y:vy,z:vz},age,homing:!!(flags&1),level:1+((flags>>1)&3),energy,floorBounces,shotKey:owner>=0&&w.body.crew[owner]?`${w.body.crew[owner].id}:${shot}:${index}`:undefined});
 }
 const projectiles:Projectile[]=[];const seen=new Set<number>();let id=0;for(const delta of w.flight.ids){if(!Number.isInteger(delta))throw Error('Invalid projectile delta');id+=delta;if(!Number.isInteger(id)||id<0||seen.has(id))throw Error('Invalid projectile identity');seen.add(id);let p=updates.get(id);if(!p){const old=baseline?.projectiles.get(id);if(!old)return null;const dt=w.body.time-baseline!.time;if(dt<0||dt>2)return null;p={...old,age:old.age+dt,pos:flightPosition(old,dt),vel:{...old.vel,y:old.vel.y-(old.floorBounces&&!old.homing?TUNING.gravity*dt:0)}};p.previous={...p.pos};}projectiles.push(p);}
 return {frame:w.frame,snapshot:{...w.body,crew:w.body.crew.map(p=>({...p,life:p.life??0,respawnAt:p.respawnAt??null,protectedUntil:p.protectedUntil??0})),effects:[],enemies,projectiles}};
}
const MAGIC=0x41425933,CHUNK=1100,HEADER=20,GROUP=8,MAX_FRAMES=4;
/** One XOR repair packet per eight chunks recovers isolated packet loss without
 * waiting for retransmission or retaining a stale reliable world stream. */
export function fragmentState(bytes:Uint8Array,frame:number):ArrayBuffer[]{
 const count=Math.ceil(bytes.length/CHUNK);if(count>1024)throw Error('State too large');
 const packet=(i:number,payload:Uint8Array)=>{const out=new Uint8Array(HEADER+payload.length),h=new DataView(out.buffer);h.setUint32(0,MAGIC);h.setUint32(4,frame);h.setUint32(8,i);h.setUint32(12,count);h.setUint32(16,bytes.length);out.set(payload,HEADER);return out.buffer;};
 const packets:ArrayBuffer[]=[];for(let group=0;group<Math.ceil(count/GROUP);group++){const parity=new Uint8Array(CHUNK);for(let i=group*GROUP;i<Math.min(count,(group+1)*GROUP);i++){const part=bytes.subarray(i*CHUNK,(i+1)*CHUNK);packets.push(packet(i,part));for(let j=0;j<part.length;j++)parity[j]^=part[j];}if(count>1)packets.push(packet(count+group,parity));}return packets;
}
/** Multiple in-flight frames may overlap on an unordered channel. A partial
 * newer frame must never prevent a complete older frame from being delivered. */
export class StateAssembler{
 private frames=new Map<number,{at:number;count:number;size:number;parts:Map<number,Uint8Array>;parity:Map<number,Uint8Array>}>();last=0;
 push(data:ArrayBuffer,now:number):Uint8Array|null{
  if(data.byteLength<HEADER+1||data.byteLength>CHUNK+HEADER)return null;const h=new DataView(data);if(h.getUint32(0)!==MAGIC)return null;const f=h.getUint32(4),i=h.getUint32(8),n=h.getUint32(12),size=h.getUint32(16);if(f<=this.last||n<1||n>1024||i>=n+Math.ceil(n/GROUP)||size<1||size>1024*1024||Math.ceil(size/CHUNK)!==n)return null;
  const payload=new Uint8Array(data,HEADER);if(payload.length!==(i>=n?CHUNK:Math.min(CHUNK,size-i*CHUNK)))return null;
  for(const [id,p]of this.frames)if(now-p.at>300||id<=this.last)this.frames.delete(id);
  let p=this.frames.get(f);if(!p){if(this.frames.size>=MAX_FRAMES)this.frames.delete(this.frames.keys().next().value!);p={at:now,count:n,size,parts:new Map(),parity:new Map()};this.frames.set(f,p);}if(p.count!==n||p.size!==size)return null;
  if(i<n)p.parts.set(i,payload);else p.parity.set(i-n,payload);
  const group=i<n?Math.floor(i/GROUP):i-n,parity=p.parity.get(group);if(parity){const missing:number[]=[];for(let part=group*GROUP;part<Math.min(n,(group+1)*GROUP);part++)if(!p.parts.has(part))missing.push(part);if(missing.length===1){const repaired=parity.slice();for(let part=group*GROUP;part<Math.min(n,(group+1)*GROUP);part++){const known=p.parts.get(part);if(known)for(let j=0;j<known.length;j++)repaired[j]^=known[j];}const part=missing[0];p.parts.set(part,repaired.subarray(0,Math.min(CHUNK,size-part*CHUNK)));}}
  if(p.parts.size!==n)return null;const out=new Uint8Array(size);for(let part=0;part<n;part++)out.set(p.parts.get(part)!,part*CHUNK);this.frames.delete(f);return out;
 }
 accept(frame:number){this.last=frame;for(const id of this.frames.keys())if(id<=frame)this.frames.delete(id);}
 get pending(){return this.frames.size;}
}
export const mixPosition=(a:Vec,b:Vec,t:number):Vec=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
