import {MAX_CREW_PLAYERS} from './crew-config';
import {type ArenaSnapshot} from './multiplayer';
import {STEP,TUNING,type Projectile,type Vec} from './simulation';
import {encodePacket,decodePacket,presentationPrecision,NETWORK_PROTOCOL_VERSION} from './network-codec';
import {packEnemy,unpackEnemy,sameEnemyState,enemyDelta,applyEnemyDelta,type EnemyRow,type EnemyDelta} from './network-enemies';
import {canonicalPosition,packIds,unpackIds,packPositions,unpackPositions,packPositionDeltas,unpackPositionDeltas} from './network-packed';
import {shotLaunches} from './projectile-launch';
import {packShotLaunch,unpackShotLaunch} from './network-shots';
type WireCrew=Omit<ArenaSnapshot['crew'][number],'life'|'respawnAt'|'protectedUntil'>&{life?:number;respawnAt?:number;protectedUntil?:number};
export type StateBaseline={time:number;projectiles:Map<number,Projectile>;enemies:Map<number,EnemyRow>};
type ShotRow=[owner:number,sequence:number,flags:number,energy:number,age:number,launch:number[],entries:number[]];
export type WireState={version:typeof NETWORK_PROTOCOL_VERSION;frame:number;epoch:number;body:Omit<ArenaSnapshot,'projectiles'|'enemies'|'effects'|'crew'>&{enemies:(EnemyRow|EnemyDelta)[];crew:WireCrew[]};creatures:{ids:Uint8Array;positions:Uint8Array;relative:boolean};flight:{base:number;ids:Uint8Array;updates:unknown[][];shots:ShotRow[]}};
export function snapshotBaseline(s:ArenaSnapshot):StateBaseline{return {time:s.time,projectiles:new Map(s.projectiles.map(p=>[p.id,structuredClone((({launch,...flight})=>flight)(p))])),enemies:new Map(s.enemies.map(e=>{const row=packEnemy(e),pos=canonicalPosition(e.pos);row[2].set([pos.x,pos.y,pos.z]);return [e.id,row];}))};}
export function flightPosition(p:Projectile,dt:number):Vec{
 const gravity=p.floorBounces&&!p.homing?TUNING.gravity:0;
 return {x:p.pos.x+p.vel.x*dt,y:p.pos.y+p.vel.y*dt-gravity*dt*(dt+STEP)/2,z:p.pos.z+p.vel.z*dt};
}
const row=(p:Projectile,crew:ArenaSnapshot['crew'])=>{
 const key=p.shotKey?.split(':'),owner=key?crew.findIndex(c=>c.id===key[0]):-1;
 return [p.id,new Float32Array([p.pos.x,p.pos.y,p.pos.z,p.vel.x,p.vel.y,p.vel.z,p.age]),(p.homing?1:0)|(((p.level??1)-1)<<1),p.energy??1,p.floorBounces??0,owner,owner>=0?Number(key![1]):0,owner>=0?Number(key![2]):0];
};
export function encodeState(s:ArenaSnapshot,frame:number,base:number,baseline?:StateBaseline){
 const {projectiles,effects,...body}=s;const updates:unknown[][]=[],shots:ShotRow[]=[],enemies:(EnemyRow|EnemyDelta)[]=[];
 for(const enemy of s.enemies){const packed=packEnemy(enemy),old=baseline?.enemies.get(enemy.id);if(!old)enemies.push(packed);else if(!sameEnemyState(packed,old,s.time-baseline!.time)){const delta=enemyDelta(packed,old,s.time-baseline!.time);if(delta[1]||delta[3]||delta[4])enemies.push(delta);}}
 const groups=new Map<string,Projectile[]>();
 for(const p of projectiles){const old=baseline?.projectiles.get(p.id),elapsed=s.time-(baseline?.time??s.time),gravity=old?.floorBounces&&!p.homing?TUNING.gravity:0;
  if(old&&elapsed<.5&&!p.homing&&p.floorBounces===old.floorBounces&&Math.abs(p.vel.x-old.vel.x)<=.0001&&Math.abs(p.vel.y-old.vel.y+gravity*elapsed)<=.0001&&Math.abs(p.vel.z-old.vel.z)<=.0001&&Math.abs(p.age-old.age-elapsed)<=.02)continue;
  if(p.launch&&!p.homing&&!p.floorBounces&&p.shotKey){const key=p.shotKey.slice(0,p.shotKey.lastIndexOf(':')),group=groups.get(key);if(group)group.push(p);else groups.set(key,[p]);}else updates.push(row(p,s.crew));
 }
 for(const [key,group]of groups){
  const [ownerId,sequence]=key.split(':'),owner=s.crew.findIndex(c=>c.id===ownerId),spec=group[0].launch!,age=group[0].age,energy=group[0].energy??1,flags=((group[0].level??1)-1)<<1;
  const indices=group.map(p=>Number(p.shotKey!.split(':')[2])),count=Math.max(...indices)+1;
  if(group.length<4||owner<0||count>60||indices.some(i=>!Number.isInteger(i)||i<0)){for(const p of group)updates.push(row(p,s.crew));continue;}
  const description=packShotLaunch(spec,1+(flags>>1));if(!description){for(const p of group)updates.push(row(p,s.crew));continue;}
  const launches=shotLaunches(spec,count,TUNING.projectileSpeed),entries:number[]=[];
  for(let i=0;i<group.length;i++){
   const p=group[i],launch=launches[indices[i]],expected={x:launch.pos.x+launch.vel.x*age,y:launch.pos.y+launch.vel.y*age,z:launch.pos.z+launch.vel.z*age};
   // Pierces, externally modified projectiles or any non-ballistic motion use
   // explicit corrections. A seed must never hide a real host trajectory.
   if(p.age!==age||(p.energy??1)!==energy||(((p.level??1)-1)<<1)!==flags||Math.hypot(p.pos.x-expected.x,p.pos.y-expected.y,p.pos.z-expected.z)>.00001||Math.hypot(p.vel.x-launch.vel.x,p.vel.y-launch.vel.y,p.vel.z-launch.vel.z)>.00001)updates.push(row(p,s.crew));
   else entries.push(p.id,indices[i]);
  }
  if(entries.length)shots.push([owner,Number(sequence),flags,energy,age,description,entries]);
 }
 const oldPositions=s.enemies.map(e=>{const old=baseline?.enemies.get(e.id)?.[2];return old?{x:old[0],y:old[1],z:old[2]}:undefined;});
 const relative=baseline?packPositionDeltas(s.enemies.map(e=>e.pos),oldPositions):null;
 return encodePacket({version:NETWORK_PROTOCOL_VERSION,frame,epoch:s.epoch,body:{...body,crew:s.crew.map(({life,respawnAt,protectedUntil,...p})=>({...p,life:life||undefined,respawnAt:respawnAt??undefined,protectedUntil:protectedUntil>s.time?protectedUntil:undefined})),enemies,gems:presentationPrecision(s.gems),rings:presentationPrecision(s.rings)},creatures:{ids:packIds(s.enemies.map(e=>e.id)),positions:relative??packPositions(s.enemies.map(e=>e.pos)),relative:!!relative},flight:{base:baseline?base:0,ids:packIds(projectiles.map(p=>p.id)),updates,shots}} satisfies WireState);
}
export function decodeState(data:Uint8Array,baselines:Map<number,StateBaseline>):{frame:number;snapshot:ArenaSnapshot}|null{
 const w=decodePacket(data) as WireState;
 if(w?.version!==NETWORK_PROTOCOL_VERSION||!Number.isInteger(w.frame)||w.frame<1||!w.body||w.body.epoch!==w.epoch||!Array.isArray(w.body.crew)||w.body.crew.length>MAX_CREW_PLAYERS||!Array.isArray(w.body.enemies)||!Array.isArray(w.body.gems)||!Array.isArray(w.body.rings)||!Number.isFinite(w.body.serverNow)||!Number.isFinite(w.body.time)||!Number.isInteger(w.body.tick)||!w.flight||!Array.isArray(w.flight.updates)||!Array.isArray(w.flight.shots)||!w.creatures)throw Error('Invalid state');
 const ids=unpackIds(w.creatures.ids),projectileIds=unpackIds(w.flight.ids);
 const baseline=w.flight.base?baselines.get(w.flight.base):undefined;if(w.flight.base&&!baseline)return null;
 if(typeof w.creatures.relative!=='boolean'||w.creatures.relative&&!baseline)throw Error('Invalid relative poses');
 const oldPositions=ids.map(id=>{const old=baseline?.enemies.get(id)?.[2];return old?{x:old[0],y:old[1],z:old[2]}:undefined;});
 const positions=w.creatures.relative?unpackPositionDeltas(w.creatures.positions,oldPositions):unpackPositions(w.creatures.positions,ids.length);
 const elapsed=w.body.time-(baseline?.time??w.body.time);if(elapsed<0||elapsed>2)return null;
 const enemyUpdates=new Map(w.body.enemies.map(row=>[row[0],row])),enemies:ArenaSnapshot['enemies']=[];
 for(let i=0;i<ids.length;i++){
  const id=ids[i],update=enemyUpdates.get(id),old=baseline?.enemies.get(id);let packed:EnemyRow;
  if(update?.length===7)packed=update;
  else {if(!old)return null;packed=update?applyEnemyDelta(update,old,elapsed):[old[0],old[1],old[2].slice(),old[3],old[4],old[5],old[6]];if(!update)packed[2][4]+=elapsed;}
  packed[2][0]=positions[i].x;packed[2][1]=positions[i].y;packed[2][2]=positions[i].z;enemies.push(unpackEnemy(packed));
 }
 const updates=new Map<number,Projectile>();for(const r of w.flight.updates){
  if(!Array.isArray(r)||r.length!==8||!Number.isInteger(r[0])||!(r[1] instanceof Float32Array)||r[1].length!==7||r.slice(2).some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Invalid flight');
  const [id,values,flags,energy,floorBounces,owner,shot,index]=r as [number,Float32Array,number,number,number,number,number,number];const [x,y,z,vx,vy,vz,age]=values;
  updates.set(id,{id,pos:{x,y,z},previous:{x,y,z},vel:{x:vx,y:vy,z:vz},age,homing:!!(flags&1),level:1+((flags>>1)&3),energy,floorBounces,shotKey:owner>=0&&w.body.crew[owner]?`${w.body.crew[owner].id}:${shot}:${index}`:undefined});
 }
 for(const r of w.flight.shots){
  if(!Array.isArray(r)||r.length!==7)throw Error('Invalid shot');const [owner,sequence,flags,energy,age,description,entries]=r;
  if(!Number.isInteger(owner)||!w.body.crew[owner]||!Number.isSafeInteger(sequence)||sequence<1||!Number.isInteger(flags)||flags<0||flags>6||flags%2||!Number.isFinite(energy)||!Number.isFinite(age)||age<0||age>3||!Array.isArray(entries)||entries.length>120||entries.length%2)throw Error('Invalid shot launch');
  let count=0;for(let i=0;i<entries.length;i+=2){if(!Number.isSafeInteger(entries[i])||entries[i]<0||!Number.isInteger(entries[i+1])||entries[i+1]<0||entries[i+1]>=60)throw Error('Invalid shot identity');count=Math.max(count,entries[i+1]+1);}
  const spec=unpackShotLaunch(description,1+(flags>>1)),launches=shotLaunches(spec,count,TUNING.projectileSpeed);
  for(let i=0;i<entries.length;i+=2){const id=entries[i],index=entries[i+1],{pos:origin,vel}=launches[index],pos={x:origin.x+vel.x*age,y:origin.y+vel.y*age,z:origin.z+vel.z*age};if(updates.has(id))throw Error('Duplicate shot identity');updates.set(id,{id,pos,previous:{...pos},vel,age,homing:false,level:1+(flags>>1),energy,floorBounces:0,shotKey:`${w.body.crew[owner].id}:${sequence}:${index}`});}
 }
 const projectiles:Projectile[]=[];for(const id of projectileIds){let p=updates.get(id);if(!p){const old=baseline?.projectiles.get(id);if(!old)return null;p={...old,age:old.age+elapsed,pos:flightPosition(old,elapsed),vel:{...old.vel,y:old.vel.y-(old.floorBounces&&!old.homing?TUNING.gravity*elapsed:0)}};p.previous={...p.pos};}projectiles.push(p);}
 return {frame:w.frame,snapshot:{...w.body,crew:w.body.crew.map(p=>({...p,life:p.life??0,respawnAt:p.respawnAt??null,protectedUntil:p.protectedUntil??0})),effects:[],enemies,projectiles}};
}
/** Normal frames expire quickly; paced large frames get a bounded transfer
 * window at 32 KB/s, below the sender budget, including startup/jitter slack. */
export const stateAssemblyTimeout=(size:number)=>size<=64*1024?300:Math.min(10000,1000+size/32);
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
  for(const [id,p]of this.frames)if(now-p.at>stateAssemblyTimeout(p.size)||id<=this.last)this.frames.delete(id);
  let p=this.frames.get(f);if(!p){if(this.frames.size>=MAX_FRAMES)this.frames.delete(this.frames.keys().next().value!);p={at:now,count:n,size,parts:new Map(),parity:new Map()};this.frames.set(f,p);}if(p.count!==n||p.size!==size)return null;
  if(i<n)p.parts.set(i,payload);else p.parity.set(i-n,payload);
  const group=i<n?Math.floor(i/GROUP):i-n,parity=p.parity.get(group);if(parity){const missing:number[]=[];for(let part=group*GROUP;part<Math.min(n,(group+1)*GROUP);part++)if(!p.parts.has(part))missing.push(part);if(missing.length===1){const repaired=parity.slice();for(let part=group*GROUP;part<Math.min(n,(group+1)*GROUP);part++){const known=p.parts.get(part);if(known)for(let j=0;j<known.length;j++)repaired[j]^=known[j];}const part=missing[0];p.parts.set(part,repaired.subarray(0,Math.min(CHUNK,size-part*CHUNK)));}}
  if(p.parts.size!==n)return null;const out=new Uint8Array(size);for(let part=0;part<n;part++)out.set(p.parts.get(part)!,part*CHUNK);this.frames.delete(f);return out;
 }
 accept(frame:number){this.last=frame;for(const id of this.frames.keys())if(id<=frame)this.frames.delete(id);}
 get pending(){return this.frames.size;}
}
export const mixPosition=(a:Vec,b:Vec,t:number):Vec=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
