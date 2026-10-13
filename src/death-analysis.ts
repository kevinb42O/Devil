import {World,v,type Enemy,type Vec,type DeathSource} from './simulation';
import {ENEMY_KINDS,isPede,isSpider,isSquid,type EnemyKind} from './enemy-kinds';
import {floorHeight} from './arena';

export const DEATH_WINDOW=5,DEATH_SAMPLE_TICKS=4,DEATH_HISTORY_BUDGET=16*1024*1024;
const SLOTS=154,HEADER=10,ENEMY_HEADER=23;
const statuses=['emerging','idle','hunting','burrowing'] as const;
const kinds=new Map(ENEMY_KINDS.map((kind,index)=>[kind,index]));
type Sample={time:number;tick:number;data:Float32Array;used:number;enemies:number;projectiles:number;gems:number;rings:number};
function slot():Sample{return {time:0,tick:0,data:new Float32Array(0),used:0,enemies:0,projectiles:0,gems:0,rings:0};}
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const angle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
function set(out:Vec,data:Float32Array,i:number){out.x=data[i];out.y=data[i+1];out.z=data[i+2];}
function blend(out:Vec,a:Float32Array,i:number,b:Float32Array,j:number,t:number){out.x=mix(a[i],b[j],t);out.y=mix(a[i+1],b[j+1],t);out.z=mix(a[i+2],b[j+2],t);}

/** Owned presentation values only. No World clones, effects, AI, video or GPU resources. */
export class DeathHistory {
 private slots=Array.from({length:SLOTS},slot);private cursor=0;private count=0;private bytes=0;private lastTick=-1;
 private stride=DEATH_SAMPLE_TICKS;
 disabled=false;
 reset(){this.cursor=0;this.count=0;this.lastTick=-1;this.disabled=false;this.stride=DEATH_SAMPLE_TICKS;}
 release(){this.reset();for(const s of this.slots)s.data=new Float32Array(0);this.bytes=0;}
 get diagnostics(){return {samples:this.count,bytes:this.bytes,budget:DEATH_HISTORY_BUDGET,sampleHz:120/this.stride,disabled:this.disabled};}
 capture(w:World,yaw:number,pitch:number,force=false){
  if(this.disabled||w.crew.length||w.tick===this.lastTick)return;
  if(!force&&w.state!=='dead'&&w.tick%this.stride!==0)return;
  const enemies=w.state==='dead'&&w.deathEnemy?[...w.enemies.filter(e=>e.id!==w.deathEnemy!.id),w.deathEnemy]:w.enemies;
  let size=HEADER+w.projectiles.length*10+w.gems.length*8+w.rings.length*8;
  for(const e of enemies)size+=ENEMY_HEADER+(e.segments.length+e.weakpoints.length)*4;
  let s=this.slots[this.cursor];
  if(s.data.length<size){
   const capacity=Math.ceil(size*1.1);
   while(this.bytes-s.data.byteLength+capacity*4>DEATH_HISTORY_BUDGET&&this.stride<16){this.thin();s=this.slots[this.cursor];}
   const bytes=this.bytes-s.data.byteLength+capacity*4;if(bytes>DEATH_HISTORY_BUDGET){this.disabled=true;this.count=0;return;}s.data=new Float32Array(capacity);this.bytes=bytes;
  }
  const d=s.data;let i=0;
  d[i++]=w.player.pos.x;d[i++]=w.player.pos.y;d[i++]=w.player.pos.z;d[i++]=w.player.vel.x;d[i++]=w.player.vel.y;d[i++]=w.player.vel.z;d[i++]=yaw;d[i++]=pitch;d[i++]=w.level;d[i++]=w.radius;
  for(const e of enemies){
   d[i++]=e.id;d[i++]=kinds.get(e.kind)!;d[i++]=e.pos.x;d[i++]=e.pos.y;d[i++]=e.pos.z;d[i++]=e.vel.x;d[i++]=e.vel.y;d[i++]=e.vel.z;
   d[i++]=e.hp;d[i++]=e.age;d[i++]=e.phase;d[i++]=e.radius;d[i++]=e.headExposure;d[i++]=e.lastHit;d[i++]=e.activeAt;d[i++]=e.size;d[i++]=e.facingYaw;d[i++]=statuses.indexOf(e.status);d[i++]=e.statusUntil;d[i++]=e.towerSpinDirection??-1;
   d[i++]=e.segments.length;d[i++]=e.weakpoints.length;d[i++]=ENEMY_HEADER+(e.segments.length+e.weakpoints.length)*4;
   for(const s of e.segments){d[i++]=s.pos.x;d[i++]=s.pos.y;d[i++]=s.pos.z;d[i++]=s.hp;}
   for(const p of e.weakpoints){d[i++]=p.local.x;d[i++]=p.local.y;d[i++]=p.local.z;d[i++]=p.hp;}
  }
  for(const p of w.projectiles){d[i++]=p.id;d[i++]=p.pos.x;d[i++]=p.pos.y;d[i++]=p.pos.z;d[i++]=p.vel.x;d[i++]=p.vel.y;d[i++]=p.vel.z;d[i++]=p.age;d[i++]=p.homing?1:0;d[i++]=p.level??w.level;}
  for(const g of w.gems){d[i++]=g.id;d[i++]=g.pos.x;d[i++]=g.pos.y;d[i++]=g.pos.z;d[i++]=g.vel.x;d[i++]=g.vel.y;d[i++]=g.vel.z;d[i++]=g.age;}
  for(const r of w.rings){d[i++]=r.id;d[i++]=r.owner;d[i++]=r.pos.x;d[i++]=r.pos.y;d[i++]=r.pos.z;d[i++]=r.radius;d[i++]=r.previous;d[i++]=r.age;}
  s.time=w.time;s.tick=w.tick;s.used=i;s.enemies=enemies.length;s.projectiles=w.projectiles.length;s.gems=w.gems.length;s.rings=w.rings.length;
  this.lastTick=w.tick;const limit=Math.ceil(DEATH_WINDOW*120/this.stride)+4;this.cursor=(this.cursor+1)%limit;this.count=Math.min(limit,this.count+1);
 }
 private thin(){
  const limit=Math.ceil(DEATH_WINDOW*120/this.stride)+4,kept:Sample[]=[];
  // Preserve oldest boundary and newest sample, halving density without shortening time coverage.
  for(let i=0;i<this.count;i++)if(i%2===0||i===this.count-1)kept.push(this.slots[(this.cursor-this.count+i+limit)%limit]);
  this.stride*=2;this.slots=[...kept,...Array.from({length:SLOTS-kept.length},slot)];this.count=kept.length;this.cursor=kept.length;this.bytes=kept.reduce((sum,s)=>sum+s.data.byteLength,0);
 }
 clip(source:DeathSource|null):DeathAnalysis|null{
  if(this.disabled||!this.count)return null;
  const limit=Math.ceil(DEATH_WINDOW*120/this.stride)+4;
  const samples=Array.from({length:this.count},(_,i)=>this.slots[(this.cursor-this.count+i+limit)%limit]);
  return new DeathAnalysis(samples,source);
 }
}
function visualEnemy(id:number,kind:EnemyKind):Enemy{
 return {id,kind,pos:v(),vel:v(),hp:1,age:0,phase:0,nextSpawn:Infinity,radius:1,gems:0,eaten:0,segments:[],weakpoints:[],headExposure:1,lastHit:-99,duckUntil:0,pendingDuck:false,nextMove:0,orbitSpeed:0,radialOffset:0,facingYaw:0,eggCooldown:0,target:v(),status:'idle',statusUntil:0,activeAt:0,nextBeckon:Infinity,size:1};
}

/** Scratch World is a renderer adapter only: never stepped, never used for scoring. */
export class DeathAnalysis {
 readonly view=new World(1,{schedule:false});readonly camera={position:v(),yaw:0,pitch:0};readonly target=v();readonly killerPosition=v();
 readonly start:number;readonly end:number;readonly duration:number;elapsed=0;victimYaw=0;killerVisible=false;
 private index=0;private offsets=new Map<number,number>();private enemyCache=new Map<number,Enemy>();private activeIds=new Set<number>();private heading=0;private initialized=false;private aim=v();
 constructor(private samples:Sample[],readonly source:DeathSource|null){this.end=samples.at(-1)!.time;this.start=Math.max(samples[0].time,this.end-DEATH_WINDOW);this.duration=this.end-this.start;this.sample(0);}
 get remaining(){return Math.max(0,this.duration-this.elapsed);}
 get impact(){return this.elapsed>=this.duration;}
 get done(){return this.elapsed>=this.duration+1.25;}
 advance(dt:number){this.elapsed=Math.min(this.duration+1.25,this.elapsed+Math.max(0,Math.min(.05,dt)));this.sample(this.elapsed);}
 sample(elapsed:number){
  const time=Math.min(this.end,this.start+Math.max(0,elapsed));
  if(time<this.samples[this.index].time)this.index=0;
  while(this.index+1<this.samples.length&&this.samples[this.index+1].time<=time+1e-8)this.index++;
  const a=this.samples[this.index],b=this.samples[Math.min(this.index+1,this.samples.length-1)],d=a.data,q=b.data,t=b.time>a.time?Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time))):0;
  const w=this.view;w.time=time;w.tick=a.tick;w.level=d[8];w.radius=mix(d[9],q[9],t);blend(w.player.pos,d,0,q,0,t);blend(w.player.vel,d,3,q,3,t);w.player.hopPulse=0;this.victimYaw=angle(d[6],q[6],t);
  this.offsets.clear();let j=HEADER;for(let n=0;n<b.enemies;n++){this.offsets.set(q[j],j);j+=q[j+22];}
  let i=HEADER;w.enemies.length=0;this.activeIds.clear();
  for(let n=0;n<a.enemies;n++){
   const id=d[i],kind=ENEMY_KINDS[d[i+1]];let e=this.enemyCache.get(id);if(!e){e=visualEnemy(id,kind);this.enemyCache.set(id,e);}this.activeIds.add(id);w.enemies.push(e);e.kind=kind;
   const next=this.offsets.get(id),valid=next!==undefined&&q[next+1]===d[i+1],k=valid?next!:i,other=valid?q:d,f=valid?t:0;
   blend(e.pos,d,i+2,other,k+2,f);blend(e.vel,d,i+5,other,k+5,f);e.hp=d[i+8];e.age=mix(d[i+9],other[k+9],f);e.phase=angle(d[i+10],other[k+10],f);e.radius=d[i+11];e.headExposure=mix(d[i+12],other[k+12],f);e.lastHit=d[i+13];e.activeAt=d[i+14];e.size=d[i+15];e.facingYaw=angle(d[i+16],other[k+16],f);e.status=statuses[d[i+17]];e.statusUntil=d[i+18];e.towerSpinDirection=d[i+19];
   const segments=d[i+20],weak=d[i+21];while(e.segments.length<segments)e.segments.push({pos:v(),hp:1});e.segments.length=segments;while(e.weakpoints.length<weak)e.weakpoints.push({local:v(),hp:1});e.weakpoints.length=weak;
   for(let n=0;n<segments;n++){const at=i+ENEMY_HEADER+n*4,to=k+ENEMY_HEADER+n*4;if(valid&&other[k+20]>n)blend(e.segments[n].pos,d,at,other,to,f);else set(e.segments[n].pos,d,at);e.segments[n].hp=d[at+3];}
   for(let n=0;n<weak;n++){const at=i+ENEMY_HEADER+segments*4+n*4;set(e.weakpoints[n].local,d,at);e.weakpoints[n].hp=d[at+3];}
   i+=d[i+22];
  }
  for(const id of this.enemyCache.keys())if(!this.activeIds.has(id))this.enemyCache.delete(id);
  // Reuse projectile/gem/ring objects; match by ID rather than array index.
  this.offsets.clear();for(let n=0;n<b.projectiles;n++){this.offsets.set(q[j],j);j+=10;}
  while(w.projectiles.length<a.projectiles)w.projectiles.push({id:0,pos:v(),vel:v(),age:0,homing:false});w.projectiles.length=a.projectiles;
  for(let n=0;n<a.projectiles;n++,i+=10){const p=w.projectiles[n],next=this.offsets.get(d[i]),k=next??i,other=next===undefined?d:q,f=next===undefined?0:t;p.id=d[i];blend(p.pos,d,i+1,other,k+1,f);blend(p.vel,d,i+4,other,k+4,f);p.age=mix(d[i+7],other[k+7],f);p.homing=!!d[i+8];p.level=d[i+9];}
  this.offsets.clear();for(let n=0;n<b.gems;n++){this.offsets.set(q[j],j);j+=8;}
  while(w.gems.length<a.gems)w.gems.push({id:0,pos:v(),vel:v(),age:0});w.gems.length=a.gems;
  for(let n=0;n<a.gems;n++,i+=8){const g=w.gems[n],next=this.offsets.get(d[i]),k=next??i,other=next===undefined?d:q,f=next===undefined?0:t;g.id=d[i];blend(g.pos,d,i+1,other,k+1,f);blend(g.vel,d,i+4,other,k+4,f);g.age=mix(d[i+7],other[k+7],f);}
  this.offsets.clear();for(let n=0;n<b.rings;n++){this.offsets.set(q[j],j);j+=8;}
  while(w.rings.length<a.rings)w.rings.push({id:0,owner:0,pos:v(),radius:0,previous:0,age:0});w.rings.length=a.rings;
  for(let n=0;n<a.rings;n++,i+=8){const r=w.rings[n],next=this.offsets.get(d[i]),k=next??i,other=next===undefined?d:q,f=next===undefined?0:t;r.id=d[i];r.owner=d[i+1];blend(r.pos,d,i+2,other,k+2,f);r.radius=mix(d[i+5],other[k+5],f);r.previous=r.radius;r.age=mix(d[i+7],other[k+7],f);}
  this.updateCamera(time);
 }
 private updateCamera(time:number){
  const w=this.view,p=w.player.pos,e=this.source?w.enemies.find(e=>e.id===this.source!.enemyId):undefined;
  this.killerVisible=!!e;
  const body=e&&this.source!.segment>=0?e.segments[this.source!.segment]?.pos:e?.pos;
  const k=body??p;this.killerPosition.x=k.x;this.killerPosition.y=k.y;this.killerPosition.z=k.z;
  // Towers' origin is their crown; frame the lethal column closer to victim height.
  const ky=e&&isSquid(e.kind)?mix(k.y,p.y,.55):e?.kind==='thorn'?p.y:k.y;
  const vx=e?.vel.x??w.player.vel.x,vz=e?.vel.z??w.player.vel.z;
  const wanted=Math.hypot(vx,vz)>.4?Math.atan2(vx,vz):Math.hypot(p.x-k.x,p.z-k.z)>.5?Math.atan2(p.x-k.x,p.z-k.z):this.initialized?this.heading:this.victimYaw+Math.PI;
  const dt=this.initialized?Math.max(0,time-this.previousTime):0;this.previousTime=time;
  this.heading=this.initialized?angle(this.heading,wanted,1-Math.exp(-3.5*dt)):wanted;
  const size=e?Math.max(e.radius,e.size):1,large=e&&(isSquid(e.kind)||isSpider(e.kind)||e.kind==='leviathan'||e.kind==='orb');
  const separation=Math.hypot(p.x-k.x,p.z-k.z),distance=Math.min(22,Math.max(6,4+size*1.7,Math.min(12,separation*.5))),side=distance*(large?.85:.62);
  const s=Math.sin(this.heading),c=Math.cos(this.heading);
  const lookX=mix(k.x,p.x,.38),lookY=mix(ky,p.y,.4),lookZ=mix(k.z,p.z,.38);
  const x=k.x-s*distance+c*side,z=k.z-c*distance-s*side;
  let y=ky+Math.max(3.2,size*.75);
  // Lift the boom above intervening bodies. This is presentation-only and uses
  // recorded positions, so crowded swarms cannot put the camera inside a skull.
  const lineX=x-lookX,lineZ=z-lookZ,lineLength=lineX*lineX+lineZ*lineZ;
  for(const obstacle of w.enemies){
   if(obstacle===e||obstacle.age<obstacle.activeAt)continue;
   const ox=obstacle.pos.x-lookX,oz=obstacle.pos.z-lookZ,along=lineLength>0?(ox*lineX+oz*lineZ)/lineLength:0;
   if(along<.22||along>1.15)continue;
   const radius=Math.max(.8,obstacle.radius*1.5);
   if(Math.hypot(ox-lineX*along,oz-lineZ*along)<radius+.7){
    const top=obstacle.pos.y+radius+1;
    if(top>mix(lookY,y,Math.min(1,along)))y=Math.max(y,Math.min(ky+12,lookY+(top-lookY)/Math.min(1,along)));
   }
  }
  // Falling cameras stay above the lip so the descent is visible, not buried below the floor.
  if(!this.source)y=Math.max(2.8,y);
  y=Math.max(y,floorHeight(x,z,time,0)+1.4);
  const f=this.initialized?1-Math.exp(-7*dt):1,position=this.camera.position;
  position.x=mix(position.x,x,f);position.y=mix(position.y,y,f);position.z=mix(position.z,z,f);
  this.aim.x=mix(this.aim.x,lookX,f);this.aim.y=mix(this.aim.y,lookY,f);this.aim.z=mix(this.aim.z,lookZ,f);
  position.y=Math.max(position.y,floorHeight(position.x,position.z,time,0)+1.4);
  for(const obstacle of w.enemies){
   if(obstacle===e||obstacle.age<obstacle.activeAt)continue;
   const radius=Math.max(.8,obstacle.radius*1.5)+.55;
   if(Math.hypot(position.x-obstacle.pos.x,position.z-obstacle.pos.z)<radius&&position.y>obstacle.pos.y-radius&&position.y<obstacle.pos.y+radius)position.y=obstacle.pos.y+radius;
  }
  const dx=this.aim.x-position.x,dy=this.aim.y-position.y,dz=this.aim.z-position.z;
  this.camera.yaw=Math.atan2(-dx,-dz);this.camera.pitch=Math.atan2(dy,Math.hypot(dx,dz));this.target.x=this.aim.x;this.target.y=this.aim.y;this.target.z=this.aim.z;this.initialized=true;
 }
 private previousTime=0;
}

export function killerName(kind:EnemyKind){return kind.replace(/^transmuted(\d)$/,'Transmuted Skull $1').replace(/([a-z])(\d)/g,'$1 $2').replace(/^./,c=>c.toUpperCase()).replace(/ ([1-4])$/,(_,n)=>' '+['','I','II','III','IV'][Number(n)]);}
