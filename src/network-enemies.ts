import {ENEMY_KINDS,ENEMY_STATS} from './enemy-kinds';
import {type Enemy} from './simulation';
export type EnemyRow=[number,number,Float32Array,number,number,Float32Array,Float32Array];
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
