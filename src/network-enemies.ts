import {ENEMY_KINDS,ENEMY_STATS} from './enemy-kinds';
import {type Enemy} from './simulation';
export type EnemyRow=[number,number,Float32Array,number,number,Float32Array,Float32Array];
export type EnemyDelta=[number,number,Uint8Array,Float32Array|null,Float32Array|null];
const statuses=['emerging','idle','hunting','burrowing'] as const;
/** Only presentation and predicted aiming fields cross the wire. AI schedules,
 * steering targets and spawn bookkeeping belong exclusively to the host. */
export function packEnemy(e:Enemy):EnemyRow{
 return [e.id,ENEMY_KINDS.indexOf(e.kind),new Float32Array([e.pos.x,e.pos.y,e.pos.z,e.hp,e.age,e.phase,e.radius,e.vel.x,e.vel.y,e.vel.z,e.headExposure,e.lastHit,e.activeAt,e.size,e.facingYaw,...(e.statusUntil?[e.statusUntil]:[])]),statuses.indexOf(e.status),e.towerSpinDirection??-1,new Float32Array(e.segments.flatMap(p=>[p.pos.x,p.pos.y,p.pos.z,p.hp])),new Float32Array(e.weakpoints.flatMap(p=>[p.local.x,p.local.y,p.local.z,p.hp]))];
}
export function unpackEnemy(row:EnemyRow):Enemy{
 if(!Array.isArray(row)||row.length!==7||!Number.isSafeInteger(row[0])||row[0]<0||!Number.isInteger(row[1])||!ENEMY_KINDS[row[1]]||!(row[2] instanceof Float32Array)||![15,16].includes(row[2].length)||!statuses[row[3]]||!Number.isFinite(row[4])||!(row[5] instanceof Float32Array)||row[5].length%4||row[5].length>1024||!(row[6] instanceof Float32Array)||row[6].length%4||row[6].length>1024)throw Error('Invalid enemy');
 const [id,kindIndex,data,status,towerSpinDirection,segments,weakpoints]=row,[x,y,z,hp,age,phase,radius,vx,vy,vz,headExposure,lastHit,activeAt,size,facingYaw,statusUntil=0]=data,kind=ENEMY_KINDS[kindIndex];
 return {id,kind,pos:{x,y,z},hp,age,phase,radius,vel:{x:vx,y:vy,z:vz},headExposure,lastHit,activeAt,size,facingYaw,status:statuses[status],towerSpinDirection,segments:Array.from({length:segments.length/4},(_,i)=>({pos:{x:segments[i*4],y:segments[i*4+1],z:segments[i*4+2]},hp:segments[i*4+3]})),weakpoints:Array.from({length:weakpoints.length/4},(_,i)=>({local:{x:weakpoints[i*4],y:weakpoints[i*4+1],z:weakpoints[i*4+2]},hp:weakpoints[i*4+3]})),gems:ENEMY_STATS[kind].gems,nextSpawn:Infinity,eaten:0,duckUntil:0,pendingDuck:false,nextMove:0,orbitSpeed:0,radialOffset:0,eggCooldown:0,target:{x,y,z},statusUntil,nextBeckon:Infinity};
}

/** Positions and continuously advancing age are sent separately. Everything
 * else must match the acknowledged baseline, including segment/weakpoint HP. */
export function sameEnemyState(current:EnemyRow,old:EnemyRow,elapsed:number){
 if(current[2].length!==old[2].length||current[1]!==old[1]||current[3]!==old[3]||current[4]!==old[4])return false;
 for(let i=3;i<current[2].length;i++){if(i===4){if(Math.abs(current[2][i]-old[2][i]-elapsed)>.002)return false;}else if(current[2][i]!==old[2][i])return false;}
 for(const index of [5,6] as const){const a=current[index],b=old[index];if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;}
 return true;
}

const sameArray=(a:Float32Array,b:Float32Array)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
/** Changed metadata only. Pose and age already have separate representations;
 * static segments/weakpoints must not be repeated for a velocity change. */
const fieldScale=(i:number)=>i>=7&&i<=9?512:i===5||i===14?1024:0;
export function enemyDelta(current:EnemyRow,old:EnemyRow,elapsed:number):EnemyDelta{
 let mask=0;const bytes:number[]=[];
 const float=(value:number)=>{const buffer=new ArrayBuffer(4);new DataView(buffer).setFloat32(0,value,true);bytes.push(...new Uint8Array(buffer));};
 for(let i=3;i<16;i++){
  const value=current[2][i]??0,previous=old[2][i]??0,scale=fieldScale(i);
  if(scale){const delta=Math.round(value*scale)-Math.round(previous*scale);if(!delta)continue;mask|=1<<i;let n=delta>=0?delta*2:-delta*2-1;do{const low=n%128;n=Math.floor(n/128);bytes.push(low|(n?128:0));}while(n);}
  else if(i===4?Math.abs(value-previous-elapsed)>.002:value!==previous){mask|=1<<i;float(value);}
 }
 for(const [bit,index]of [[16,1],[17,3],[18,4]] as const)if(current[index]!==old[index]){mask|=1<<bit;float(current[index]);}
 return [current[0],mask,Uint8Array.from(bytes),sameArray(current[5],old[5])?null:current[5],sameArray(current[6],old[6])?null:current[6]];
}
export function applyEnemyDelta(delta:EnemyDelta,old:EnemyRow,elapsed:number):EnemyRow{
 const [id,mask,values,segments,weakpoints]=delta;
 if(!Number.isSafeInteger(id)||id!==old[0]||!Number.isInteger(mask)||mask<0||mask&~0x7fff8||!(values instanceof Uint8Array)||(segments!==null&&!(segments instanceof Float32Array))||(weakpoints!==null&&!(weakpoints instanceof Float32Array)))throw Error('Invalid enemy delta');
 const data=new Float32Array(16);data.set(old[2]);data[4]+=elapsed;let at=0;const view=new DataView(values.buffer,values.byteOffset,values.byteLength);
 const float=()=>{if(at+4>values.length)throw Error('Truncated enemy value');const value=view.getFloat32(at,true);at+=4;if(!Number.isFinite(value))throw Error('Invalid enemy value');return value;};
 const integer=()=>{let n=0,mul=1;for(let i=0;i<5&&at<values.length;i++){const b=values[at++];n+=(b&127)*mul;if(!(b&128))return n%2?-(n+1)/2:n/2;mul*=128;}throw Error('Truncated enemy delta');};
 for(let i=3;i<16;i++)if(mask&(1<<i)){const scale=fieldScale(i);data[i]=scale?(Math.round((old[2][i]??0)*scale)+integer())/scale:float();}
 let kind=old[1],status=old[3],spin=old[4];if(mask&(1<<16))kind=float();if(mask&(1<<17))status=float();if(mask&(1<<18))spin=float();
 if(at!==values.length)throw Error('Invalid enemy delta values');
 return [id,kind,data,status,spin,segments??old[5],weakpoints??old[6]];
}
