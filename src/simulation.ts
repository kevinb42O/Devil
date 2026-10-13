import {armorBounds,sweepArmor} from './projectile-collision';
import {SQUID_I_GEM,SQUID_II_GEMS,SQUID_III_GEMS,LEVIATHAN_GEMS,SPIDER_GEM,SPIDER_HEAD,spiderLocalPoint,localToEnemy} from './enemy-presentation';
import {arenaRadius,floorHeight} from './arena';
import {ENEMY_STATS,isSquid,isSpider,isEgg,isPede,isSkull,skullTier,type EnemyKind} from './enemy-kinds';
import {survivalSchedule,TIMELINE,type ScheduledSpawn} from './survival';
import {WEAPON_PRESENTATION} from './weapon-tuning';
import {HAND_MUZZLES,weaponMuzzle} from './weapon-origin';
export {TIMELINE};export type {EnemyKind};
/** Fixed-step combat. Reference counts/timers are separated from unmeasured movement/AI tuning. */
export const STEP=1/120;
export const TUNING={radius:arenaRadius(0),eyeHeight:1.7,speed:11,acceleration:100,airAcceleration:17,friction:8,gravity:26,jump:9,maxSpeed:18,projectileSpeed:70,gemLifetime:10,towerDriftSpeed:.5};
export type Vec={x:number;y:number;z:number};
export const v=(x=0,y=0,z=0):Vec=>({x,y,z});
export const distance=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function direction(a:Vec,b:Vec):Vec{const d=Math.max(distance(a,b),.001);return v((b.x-a.x)/d,(b.y-a.y)/d,(b.z-a.z)/d);}
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
export type Enemy={id:number;kind:EnemyKind;pos:Vec;hp:number;age:number;phase:number;nextSpawn:number;radius:number;gems:number;eaten:number;segments:{pos:Vec;hp:number}[];weakpoints:{local:Vec;hp:number}[];vel:Vec;headExposure:number;lastHit:number;duckUntil:number;pendingDuck:boolean;nextMove:number;orbitSpeed:number;radialOffset:number;facingYaw:number;towerSpinDirection?:number;eggCooldown:number;target:Vec;status:'emerging'|'idle'|'hunting'|'burrowing';statusUntil:number;activeAt:number;nextBeckon:number;size:number};
export type Projectile={id:number;pos:Vec;previous?:Vec;vel:Vec;age:number;homing:boolean;level?:number;energy?:number;floorBounces?:number;path?:{pos:Vec;t:number}[]};
export type Gem={id:number;pos:Vec;vel:Vec;age:number};
export type Ring={id:number;owner:number;pos:Vec;radius:number;previous:number;age:number};
export type Effect={shooterId?:string;kind:'shot'|'burst'|'hit'|'kill'|'pickup'|'upgrade'|'spawn'|'jump'|'death'|'egg'|'beckon'|'transmute'|'explosion'|'land'|'impact'|'ricochet'|'pierce'|'eat'|'bounce'|'hatch'|'burrow'|'emerge';pos:Vec;amount?:number;enemy?:EnemyKind;enemyId?:number;level?:number;direction?:Vec;muzzles?:Vec[]};
export type Input={forward:number;strafe:number;yaw:number;pitch:number;jump:boolean;fire:boolean;homing:boolean};
export const idleInput=():Input=>({forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false});
export type WorldOptions={schedule?:boolean;invulnerable?:boolean;cameraProjectiles?:boolean;legacyTowerOrbit?:boolean};
type FireChannel={held:number;wasHeld:boolean;streaming:boolean;nextShot:number;recoverUntil:number;lastBurst:number};
const channel=():FireChannel=>({held:0,wasHeld:false,streaming:false,nextShot:0,recoverUntil:0,lastBurst:-1000});
export type CrewPlayer={id:string;player:World['player'];input:Input;alive:boolean;cause:string;primary:FireChannel;secondary:FireChannel;wasJump:boolean;lastShotTick:number;level:number;reserve:number};
export class World {
 crew:CrewPlayer[]=[];private activeCrew:CrewPlayer|null=null;
 addCrew(id:string){if(this.crew.some(p=>p.id===id)||this.crew.length>=4)return;const i=this.crew.length;this.crew.push({id,player:{pos:v((i%2)*4-2,TUNING.eyeHeight,10-Math.floor(i/2)*4),vel:v(),grounded:true,landedAt:-1000,hopPulse:0},input:idleInput(),alive:true,cause:'',primary:channel(),secondary:channel(),wasJump:false,lastShotTick:-1,level:1,reserve:0});}
 selectCrew(id:string){const p=this.crew.find(p=>p.id===id);if(p)this.useCrew(p);this.activeCrew=null;}
 private useCrew(p:CrewPlayer){this.activeCrew=p;this.player=p.player;this.primary=p.primary;this.secondary=p.secondary;this.wasJump=p.wasJump;this.lastShotTick=p.lastShotTick;this.level=p.level;this.reserve=p.reserve;}
 stepCrew(inputs:Map<string,Input>,dt=STEP){
  if(this.state!=='playing')return;this.tick++;this.time+=dt;this.radius=arenaRadius(this.time);
  for(const p of this.crew){if(!p.alive)continue;p.input=inputs.get(p.id)??idleInput();this.useCrew(p);this.move(p.input,dt);p.wasJump=this.wasJump;if(p.alive)this.weapon(p.input);p.lastShotTick=this.lastShotTick;p.level=this.level;p.reserve=this.reserve;}
  const alive=this.crew.filter(p=>p.alive);if(!alive.length){this.state='dead';this.cause='CREW LOST';return;}this.useCrew(alive[0]);
  this.advanceWorld(dt);this.updateGems(idleInput(),dt);this.selectCrew(this.crew[0].id);
  if(!this.crew.some(p=>p.alive)){this.state='dead';this.cause='CREW LOST';}
 }

 time=0;tick=0;state:'playing'|'dead'='playing';cause='';radius=TUNING.radius;
 player={pos:v(0,TUNING.eyeHeight,10),vel:v(),grounded:true,landedAt:-1000,hopPulse:0};
 enemies:Enemy[]=[];projectiles:Projectile[]=[];gems:Gem[]=[];effects:Effect[]=[];rings:Ring[]=[];
 stats={kills:0,shots:0,hits:0,collected:0,expired:0,eaten:0,released:0,homingFired:0,homingEaten:0,transmuted:0,maxReserve:0,maxEnemies:0,upgradeTimes:[0,0,0,0],leviathanDown:0,orbDown:0,killed:{} as Partial<Record<EnemyKind,number>>};
 reserve=0;level=1;wave=-1;
 private rng:number;private nextId=1;private options:WorldOptions;private schedule=survivalSchedule();private nextEvent:IteratorResult<ScheduledSpawn>;
 private primary=channel();private secondary=channel();private wasJump=false;private lastShotTick=-1;
 private delayed:{time:number;kind:EnemyKind;pos:Vec;activeAt?:number}[]=[];
 private detonations:{tick:number;pos:Vec;exclude?:{entity:number;segment:number}}[]=[];
 constructor(seed=80421,options:WorldOptions={}){this.rng=seed>>>0||1;this.options=options;this.nextEvent=this.schedule.next();}
 random(){this.rng^=this.rng<<13;this.rng^=this.rng>>>17;this.rng^=this.rng<<5;return(this.rng>>>0)/4294967296;}
 emit(kind:Effect['kind'],pos:Vec,amount?:number,enemy?:EnemyKind,enemyId?:number){this.effects.push({kind,pos:{...pos},amount,enemy,enemyId,level:this.level});}
 spawn(kind:EnemyKind,pos:Vec):Enemy{
  const spec=ENEMY_STATS[kind];const size=kind==='spider2'?2:kind==='gigapede'?1.5:kind==='ghostpede'?2:1;
  const e:Enemy={id:this.nextId++,kind,pos:{...pos},hp:spec.hp,radius:spec.radius,gems:spec.gems,age:0,phase:isSquid(kind)||isSpider(kind)?Math.atan2(pos.x,pos.z):this.random()*Math.PI*2,nextSpawn:3,eaten:0,segments:[],weakpoints:[],vel:v(),headExposure:isSpider(kind)?0:1,lastHit:-99,duckUntil:0,pendingDuck:false,nextMove:3,orbitSpeed:0,radialOffset:3.8*size,facingYaw:Math.atan2(pos.x,pos.z)+Math.PI,eggCooldown:0,target:{...pos},status:'emerging',statusUntil:0,activeAt:kind==='leviathan'?8.533333333:kind==='orb'?6.683333333:isPede(kind)||kind==='thorn'?3:.6,nextBeckon:kind==='leviathan'?13.533333333:kind==='orb'?6.683333333:Infinity,size};
  const points=kind==='squid'?[SQUID_I_GEM]:kind==='squid2'?SQUID_II_GEMS:kind==='squid3'?SQUID_III_GEMS:kind==='leviathan'?LEVIATHAN_GEMS:[];
  if(this.options.legacyTowerOrbit)e.towerSpinDirection=1;
  e.weakpoints=points.map(local=>({local:{...local},hp:spec.hp/points.length}));
  if(isSpider(kind)){const r=this.radius+e.radialOffset;e.pos=v(Math.sin(e.phase)*r,-1,Math.cos(e.phase)*r);}
  if(isPede(kind))for(let i=0;i<spec.gems;i++)e.segments.push({pos:v(pos.x+i*1.3*size,pos.y,pos.z),hp:spec.hp/spec.gems});
  this.enemies.push(e);this.emit('spawn',e.pos,undefined,kind);return e;
 }
 spawnAt(kind:EnemyKind,angle:number){
  if(kind==='leviathan')return this.spawn(kind,v(0,15,0));
  const r=isSquid(kind)?this.radius-3:kind==='thorn'?this.radius*(.3+this.random()*.5):this.radius-5;
  const y=kind==='squid'?3.3:kind==='squid2'?5.2:kind==='squid3'?7:kind==='ghostpede'?9:isPede(kind)?3:1.5;
  return this.spawn(kind,v(Math.sin(angle)*r,y,Math.cos(angle)*r));
 }
 die(cause:string){if(this.activeCrew){if(this.activeCrew.alive){this.activeCrew.alive=false;this.activeCrew.cause=cause;this.emit('death',this.player.pos);}return;}if(this.state==='dead'||this.options.invulnerable)return;this.state='dead';this.cause=cause;this.emit('death',this.player.pos);}
 step(input:Input,dt=STEP){
  if(this.state!=='playing')return;this.tick++;this.time+=dt;this.radius=arenaRadius(this.time);
  this.move(input,dt);if(this.state!=='playing')return;this.weapon(input);
  this.advanceWorld(dt);this.updateGems(input,dt);
 }
 private advanceWorld(dt:number){
  if(this.options.schedule!==false)while(!this.nextEvent.done&&this.time+1e-7>=this.nextEvent.value.time){const event=this.nextEvent.value;this.wave=event.wave;this.spawnAt(event.kind,event.tick===180?Math.PI:this.random()*Math.PI*2);this.nextEvent=this.schedule.next();}
  for(const pending of this.delayed.filter(s=>s.time<=this.time+1e-7)){const e=this.spawn(pending.kind,pending.pos);if(pending.activeAt!==undefined){e.activeAt=pending.activeAt-this.time;e.nextBeckon=e.activeAt;}}
  this.delayed=this.delayed.filter(s=>s.time>this.time+1e-7);
  this.updateEnemies(dt);this.updateRings(dt);this.updateProjectiles(dt);
  this.stats.maxEnemies=Math.max(this.stats.maxEnemies,this.enemies.length);
 }
 startAt(time:number,level=1,reserve=0){
  this.time=Math.max(0,time);this.tick=Math.round(this.time/STEP);this.level=clamp(Math.round(level),1,4);this.reserve=this.level>=3?Math.max(0,Math.round(reserve)):0;
  this.stats.collected=this.level===1?0:this.level===2?10:70+this.reserve;this.stats.maxReserve=this.reserve;
  this.radius=arenaRadius(this.time);this.player.pos=v(0,floorHeight(0,0,this.time)+TUNING.eyeHeight,0);
  while(!this.nextEvent.done&&this.nextEvent.value.time<this.time-1e-7)this.nextEvent=this.schedule.next();
 }
 private move(input:Input,dt:number){
  const p=this.player,jump=input.jump&&!this.wasJump;this.wasJump=input.jump;p.hopPulse=Math.max(0,p.hopPulse-dt*4);
  if(p.grounded){const speed=Math.hypot(p.vel.x,p.vel.z),retained=Math.max(0,speed-Math.max(speed,3)*TUNING.friction*dt);if(speed>0&&!jump){p.vel.x*=retained/speed;p.vel.z*=retained/speed;}}
  const len=Math.max(1,Math.hypot(input.forward,input.strafe));
  const wx=(-Math.sin(input.yaw)*input.forward+Math.cos(input.yaw)*input.strafe)/len,wz=(-Math.cos(input.yaw)*input.forward-Math.sin(input.yaw)*input.strafe)/len;
  const add=Math.max(0,TUNING.speed-p.vel.x*wx-p.vel.z*wz),accel=Math.min(add,(p.grounded?TUNING.acceleration:TUNING.airAcceleration)*dt);
  p.vel.x+=wx*accel;p.vel.z+=wz*accel;
  if(jump&&p.grounded){if(this.tick-p.landedAt<=8){p.vel.x*=1.12;p.vel.z*=1.12;p.hopPulse=1;}p.vel.y=TUNING.jump;p.grounded=false;this.emit('jump',p.pos,p.hopPulse?3:1);}
  const speed=Math.hypot(p.vel.x,p.vel.z);if(speed>TUNING.maxSpeed){p.vel.x*=TUNING.maxSpeed/speed;p.vel.z*=TUNING.maxSpeed/speed;}
  const beforeY=p.pos.y;p.vel.y-=TUNING.gravity*dt;p.pos.x+=p.vel.x*dt;p.pos.y+=p.vel.y*dt;p.pos.z+=p.vel.z*dt;
  const floor=floorHeight(p.pos.x,p.pos.z,this.time)+TUNING.eyeHeight;
  if(p.pos.y<=floor&&beforeY>=floor-.2&&p.vel.y<=0){if(!p.grounded){p.landedAt=this.tick;this.emit('land',p.pos,p.vel.y<-10?2:1);}p.pos.y=floor;p.vel.y=0;p.grounded=true;}else p.grounded=false;
  if(p.pos.y<-8)this.die('FALLEN');
 }
 get weaponAudio(){
  if(this.crew.length&&!this.crew.find(p=>p.player===this.player)?.alive)return {primary:false,homing:false};
  const homing=this.secondary.wasHeld&&this.level>=3&&this.reserve>0;
  return {primary:this.state==='playing'&&this.primary.wasHeld&&this.primary.streaming&&!homing&&this.tick>=this.primary.recoverUntil,
   homing:this.state==='playing'&&homing&&this.secondary.streaming&&this.tick>=this.secondary.recoverUntil};
 }
 private weapon(input:Input){
  const homingAvailable=this.level>=3&&this.reserve>0;
  // Homing has input priority. Entering it while streaming inherits stream mode.
  if(input.homing&&!this.secondary.wasHeld&&(this.primary.streaming||this.primary.held>16)){this.secondary.held=17;this.secondary.streaming=true;}
  this.fireChannel(this.secondary,input.homing,homingAvailable,input,true);
  this.fireChannel(this.primary,input.fire,!input.homing||!homingAvailable,input,false);
 }
 private fireChannel(c:FireChannel,held:boolean,allowed:boolean,input:Input,homing:boolean){
  if(held){
   c.held++;if(c.wasHeld&&this.tick<c.recoverUntil)c.recoverUntil=Math.min(c.recoverUntil,Math.max(this.tick,c.lastBurst+45));
   if(c.held>16){c.streaming=true;if(allowed&&this.tick>=c.nextShot&&this.tick>=c.recoverUntil){this.shoot(input,false,homing);c.nextShot=this.tick+(homing?12:this.level===4?9:6);}}
  }else if(c.wasHeld){
   if(!c.streaming&&allowed&&this.tick>=c.recoverUntil){this.shoot(input,true,homing);c.lastBurst=this.tick;c.recoverUntil=this.tick+60;c.nextShot=c.recoverUntil;}
   c.held=0;c.streaming=false;
  }
  c.wasHeld=held;
 }
 shoot(input:Input,burst:boolean,homing:boolean){
  let count=burst?[10,20,40,60][this.level-1]:[1,2,4,8][this.level-1];
  if(homing){if(this.level<3)return;count=Math.min(this.reserve,burst?(this.level===4?30:20):4);this.reserve-=count;this.stats.homingFired+=count;}
  if(!count)return;this.lastShotTick=this.tick;
  const tuning=WEAPON_PRESENTATION[this.level-1],spread=burst?tuning.burstSpread:tuning.streamSpread;
  const forward=v(-Math.sin(input.yaw)*Math.cos(input.pitch),Math.sin(input.pitch),-Math.cos(input.yaw)*Math.cos(input.pitch));
  // Converge on the closest damageable target under the crosshair, otherwise a
  // distant point on the aim ray. Physical daggers still sweep their whole path.
  const end=v(this.player.pos.x+forward.x*80,this.player.pos.y+forward.y*80,this.player.pos.z+forward.z*80);
  let aimDistance=80;
  if(!this.options.cameraProjectiles)for(const e of this.enemies){
   if(e.hp<=0||!this.active(e)||(isSpider(e.kind)&&e.headExposure<.5))continue;
   const test=(point:Vec,radius:number)=>{const t=segmentSphere(this.player.pos,end,point,radius);if(t!==null)aimDistance=Math.min(aimDistance,Math.max(.6,t*80));};
   if(e.segments.length){for(const p of e.segments)if(p.hp>0)test(p.pos,.53*e.size);}
   else if(e.weakpoints.length){for(const p of e.weakpoints)if(p.hp>0)test(localToEnemy(e,this.player.pos,p.local),e.kind==='leviathan'?.6:.34);}
   else test(this.weakPoint(e),isSpider(e.kind)?.72*e.size:e.radius);
  }
  const muzzles=this.options.cameraProjectiles?[{...this.player.pos}]:HAND_MUZZLES[this.level-1].map((_,i)=>weaponMuzzle(this.player.pos,input.yaw,input.pitch,this.level,i));
  for(let i=0;i<count;i++){
   const yaw=input.yaw+(this.random()-.5)*spread*2,pitch=input.pitch+(this.random()-.5)*spread*2,speed=homing?42:TUNING.projectileSpeed;
   const origin=muzzles[i%muzzles.length],target=v(this.player.pos.x-Math.sin(yaw)*Math.cos(pitch)*aimDistance,this.player.pos.y+Math.sin(pitch)*aimDistance,this.player.pos.z-Math.cos(yaw)*Math.cos(pitch)*aimDistance);
   const dir=direction(origin,target);
   this.projectiles.push({id:this.nextId++,pos:{...origin},previous:{...origin},vel:this.options.cameraProjectiles?v(-Math.sin(yaw)*Math.cos(pitch)*speed,Math.sin(pitch)*speed,-Math.cos(yaw)*Math.cos(pitch)*speed):v(dir.x*speed,dir.y*speed,dir.z*speed),age:0,homing,level:this.level,energy:homing?10:1});
  }
  this.stats.shots+=count;this.emit(burst?'burst':'shot',muzzles[0],homing?1:0);
  const effect=this.effects[this.effects.length-1];effect.shooterId=this.activeCrew?.id;effect.direction=direction(muzzles[0],v(this.player.pos.x+forward.x*aimDistance,this.player.pos.y+forward.y*aimDistance,this.player.pos.z+forward.z*aimDistance));effect.muzzles=muzzles.slice(0,Math.min(count,muzzles.length));
  if(burst){for(const g of this.gems){const d=direction(this.player.pos,g.pos);g.vel.x+=d.x*8;g.vel.y+=d.y*8;g.vel.z+=d.z*8;}
   const floor=floorHeight(this.player.pos.x,this.player.pos.z,this.time);
   if(input.pitch<-.95&&this.player.pos.y-floor<3.8){this.player.vel.y=Math.max(this.player.vel.y,10.8);this.player.grounded=false;this.emit('jump',this.player.pos,2);}}
 }
 active(e:Enemy){return e.age+1e-7>=e.activeAt&&e.status!=='burrowing';}
 private updateEnemies(dt:number){
  const cells=new Map<string,Enemy[]>();for(const e of this.enemies){const key=`${Math.floor(e.pos.x/3)},${Math.floor(e.pos.z/3)}`;const cell=cells.get(key)||[];cell.push(e);cells.set(key,cell);}
  for(const e of [...this.enemies]){
   if(this.crew.length){const target=this.crew.filter(p=>p.alive).sort((a,b)=>distance(a.player.pos,e.pos)-distance(b.player.pos,e.pos))[0];if(target)this.useCrew(target);}
   e.age+=dt;if(e.hp<=0)continue;const d=direction(e.pos,this.player.pos);
   if(isSquid(e.kind)){
    if(this.options.legacyTowerOrbit){e.phase+=dt*.045;const radius=this.radius-3;e.pos.x=Math.sin(e.phase)*radius;e.pos.z=Math.cos(e.phase)*radius;}else{
    // Towers translate inward along their spawn radius, independently of axial spin.
    const radius=Math.hypot(e.pos.x,e.pos.z),travel=Math.min(radius,TUNING.towerDriftSpeed*dt);
    if(radius>0){e.vel.x=-e.pos.x/radius*TUNING.towerDriftSpeed;e.vel.z=-e.pos.z/radius*TUNING.towerDriftSpeed;const factor=(radius-travel)/radius;e.pos.x*=factor;e.pos.z*=factor;}else{e.vel.x=0;e.vel.z=0;}
    }
    if(e.age+1e-7>=e.nextSpawn){e.nextSpawn+=20;for(let i=0;i<(e.kind==='squid3'?15:10);i++)this.spawn('skull',v(e.pos.x+(this.random()-.5)*4,2+this.random()*3,e.pos.z+(this.random()-.5)*4));this.spawn(e.kind==='squid'?'skull2':e.kind==='squid2'?'skull3':'skull4',v(e.pos.x,3,e.pos.z));}
   }else if(isSpider(e.kind))this.updateSpider(e,dt);
   else if(isEgg(e.kind)){
    e.vel.y-=18*dt;e.pos.x+=e.vel.x*dt;e.pos.y+=e.vel.y*dt;e.pos.z+=e.vel.z*dt;const floor=floorHeight(e.pos.x,e.pos.z,this.time,0)+.55;
    if(e.pos.y<floor&&e.vel.y<0){e.pos.y=floor;if(e.vel.y<-1)this.emit('bounce',e.pos,undefined,e.kind);e.vel.y=Math.abs(e.vel.y)*.35;e.vel.x*=.95;e.vel.z*=.95;}
    if(e.age+1e-7>=10){this.emit('hatch',e.pos,undefined,e.kind);for(let i=0;i<5;i++)this.spawn('spiderling',v(e.pos.x+this.random()*2-1,e.pos.y,e.pos.z+this.random()*2-1));e.hp=0;}
    if(e.pos.y<-15)e.hp=0;
   }else if(isPede(e.kind))this.updatePede(e,dt);
   else if(e.kind==='leviathan'||e.kind==='orb'){
    if(e.kind==='leviathan')e.phase-=dt*.12;
    if(this.active(e)&&e.age+1e-7>=e.nextBeckon&&(e.kind!=='orb'||this.time-e.lastHit>.2)){
     this.rings.push({id:this.nextId++,owner:e.id,pos:{...e.pos},radius:0,previous:0,age:0});this.emit('beckon',e.pos,undefined,e.kind);e.nextBeckon=e.age+(e.kind==='leviathan'?20:2.533333333);}
   }else if(e.kind==='thorn')e.pos.y=this.active(e)?0:-8*(1-Math.min(1,e.age/3));
   else this.updateSwarm(e,dt,cells);
   if(this.active(e)){
    const growing=isSpider(e.kind)?Math.min(1,e.age/(e.kind==='spider2'?9:3)):1;
    const body=e.kind==='thorn'?v(e.pos.x,Math.max(e.pos.y,Math.min(7,this.player.pos.y)),e.pos.z):e.pos;
    if(this.crew.length){for(const p of this.crew)if(p.alive&&(distance(body,p.player.pos)<e.radius*growing+.35||e.segments.some(s=>distance(s.pos,p.player.pos)<e.size*.8))){this.useCrew(p);this.die(ENEMY_STATS[e.kind].death);}}else if(distance(body,this.player.pos)<e.radius*growing+.35||e.segments.some(s=>distance(s.pos,this.player.pos)<e.size*.8))this.die(ENEMY_STATS[e.kind].death);
   }
  }
  this.enemies=this.enemies.filter(e=>e.hp>0);
 }
 private updateSpider(e:Enemy,dt:number){
  const lift=e.kind==='spider2'?9:3;
  if(e.age>=lift&&e.age>=e.nextMove){e.nextMove=e.age+.3+this.random()*.7;e.orbitSpeed=(this.random()-.5)*.09/e.size;e.radialOffset=(3.8+(this.random()-.5)*.6)*e.size;}
  if(e.age>=lift)e.phase+=e.orbitSpeed*dt;const radius=this.radius+e.radialOffset;e.pos.x=Math.sin(e.phase)*radius;e.pos.z=Math.cos(e.phase)*radius;
  const rise=clamp(e.age/lift,0,1);e.pos.y=-1+(1+2.7*e.size)*rise*rise*(3-2*rise);
  if(e.age>=lift){const targetYaw=Math.atan2(this.player.pos.x-e.pos.x,this.player.pos.z-e.pos.z),delta=Math.atan2(Math.sin(targetYaw-e.facingYaw),Math.cos(targetYaw-e.facingYaw));e.facingYaw+=clamp(delta,-dt*3,dt*3);}
  if(e.pendingDuck&&this.time-e.lastHit>=1){e.pendingDuck=false;e.duckUntil=this.time+.9;}
  const expose=e.age<lift?rise:e.duckUntil>this.time?0:1;e.headExposure+=clamp(expose-e.headExposure,-dt*4,dt*4);e.eggCooldown=Math.max(0,e.eggCooldown-dt);
  if(e.age>=lift&&e.headExposure>.5){
   const mouth=spiderLocalPoint(e,this.player.pos,SPIDER_GEM);
   for(const g of this.gems){if(g.age>=99)continue;const dist=distance(g.pos,mouth);if(dist<.8*e.size){g.age=99;e.eaten++;this.stats.eaten++;this.emit('eat',mouth,undefined,e.kind);}else{const pull=direction(g.pos,mouth);g.vel.x+=pull.x*dt*25*e.size;g.vel.y+=pull.y*dt*25*e.size;g.vel.z+=pull.z*dt*25*e.size;}}
   if(e.eaten>0&&e.eggCooldown<=0){e.eaten--;e.eggCooldown=.65;const aim=direction(mouth,this.player.pos),egg=this.spawn(e.kind==='spider2'?'egg2':'egg',mouth);egg.vel=v(aim.x*12,3.5,aim.z*12);this.emit('egg',mouth);}
  }
 }
 private updatePede(e:Enemy,dt:number){
  if(e.age<3){e.pos.y=-5;for(const s of e.segments)s.pos.y=-5;return;}
  if(e.status==='emerging'){e.pos.y=e.kind==='ghostpede'?9:3;if(e.kind==='centipede')this.emit('emerge',e.pos,undefined,e.kind);e.status=e.kind==='centipede'?'idle':'hunting';e.statusUntil=e.age+15;}
  if(e.kind==='centipede'&&e.status!=='burrowing'&&(e.age>=e.statusUntil||distance(e.pos,this.player.pos)<2.5)){this.emit('burrow',e.pos,undefined,e.kind);e.status='burrowing';e.statusUntil=e.age+4;}
  if(e.status==='burrowing'){e.pos.y-=dt*8;if(e.age>=e.statusUntil){e.status='emerging';e.pos.y=-5;} }
  else if(e.kind==='ghostpede'){e.phase+=dt*.3;e.pos.x=Math.sin(e.phase)*(this.radius*.7);e.pos.z=Math.cos(e.phase)*(this.radius*.7);e.pos.y=9+Math.sin(e.age)*1.2;}
  else{
   if(e.status==='idle'&&e.age>=6)e.status='hunting';
   const goal=e.status==='idle'?v(-e.pos.z,3,e.pos.x):this.player.pos,dir=direction(e.pos,goal),speed=e.kind==='gigapede'?10:8,blend=Math.min(1,dt*1.8);
   e.vel.x+=(dir.x*speed-e.vel.x)*blend;e.vel.z+=(dir.z*speed-e.vel.z)*blend;e.pos.x+=e.vel.x*dt;e.pos.z+=e.vel.z*dt;
   e.pos.y=3.5+Math.sin(e.age*.7)*1.5;
  }
  let leader=e.pos;for(const s of e.segments){const dir=direction(leader,s.pos);s.pos=v(leader.x+dir.x*1.3*e.size,leader.y+dir.y*1.3*e.size,leader.z+dir.z*1.3*e.size);leader=s.pos;}
 }
 private updateSwarm(e:Enemy,dt:number,cells:Map<string,Enemy[]>){
  const tier=isSkull(e.kind)?skullTier(e.kind):0;
  if((tier===2||e.kind==='spiderling')&&e.age>=e.nextMove){e.nextMove=e.age+(tier===2?1.6+this.random()*.9:.3+this.random()*.45);e.target=tier===2?v((this.random()-.5)*this.radius*1.5,1+this.random()*5,(this.random()-.5)*this.radius*1.5):v(this.player.pos.x+(this.random()-.5)*3,.55,this.player.pos.z+(this.random()-.5)*3);}
  const goal=tier===2||e.kind==='spiderling'?e.target:this.player.pos,d=direction(e.pos,goal),speed=tier===1?3.1:tier===2?5.6:tier===3?8:tier===4?9:Math.sin(e.age*6)>0?7:1;
  const blend=Math.min(1,dt*(tier===2?3:tier>=3?5:4));e.vel.x+=(d.x*speed-e.vel.x)*blend;e.vel.y+=(d.y*speed-e.vel.y)*blend;e.vel.z+=(d.z*speed-e.vel.z)*blend;
  e.pos.x+=e.vel.x*dt;e.pos.z+=e.vel.z*dt;e.pos.y=e.kind==='spiderling'?floorHeight(e.pos.x,e.pos.z,this.time,0)+.55:e.pos.y+e.vel.y*dt;
  const cx=Math.floor(e.pos.x/3),cz=Math.floor(e.pos.z/3);
  for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const other of cells.get(`${x},${z}`)||[]){if(other.id===e.id)continue;const dist=distance(e.pos,other.pos);if(dist<1.5&&dist>.01){const sep=direction(other.pos,e.pos);e.pos.x+=sep.x*(1.5-dist)*dt*3;e.pos.z+=sep.z*(1.5-dist)*dt*3;}}
 }
 private updateRings(dt:number){
  for(const ring of this.rings){ring.previous=ring.radius;ring.radius+=dt*9;ring.age+=dt;
   for(const e of this.enemies){if(!isSkull(e.kind)||e.kind.startsWith('transmuted'))continue;const radius=Math.hypot(e.pos.x-ring.pos.x,e.pos.z-ring.pos.z);if(radius>=ring.previous-e.radius&&radius<=ring.radius+e.radius){const kind=`transmuted${skullTier(e.kind)}` as EnemyKind;e.kind=kind;e.hp=ENEMY_STATS[kind].hp;this.stats.transmuted++;const d=direction(ring.pos,e.pos);e.vel=v(d.x*12,3,d.z*12);this.emit('transmute',e.pos);}}
  }
  this.rings=this.rings.filter(r=>r.radius<this.radius+8);
 }
 damageEnemy(e:Enemy,damage:number,point:Vec=e.pos,segment=-1,weak=false){
  if(e.hp<=0)return 0;let applied=0;
  if(segment>=0){const s=weak?e.weakpoints[segment]:e.segments[segment];applied=Math.min(s.hp,damage);s.hp-=applied;e.hp-=applied;if(applied>0&&s.hp===0)this.dropGems(point,1);}
  else{applied=Math.min(e.hp,damage);e.hp-=applied;}
  if(applied<=0)return 0;e.lastHit=this.time;if(isSpider(e.kind))e.pendingDuck=true;this.emit('hit',point,undefined,e.kind,e.id);
  if(e.hp<=0){e.hp=0;this.stats.kills++;this.stats.killed[e.kind]=(this.stats.killed[e.kind]||0)+1;this.emit('kill',e.pos,e.radius,e.kind,e.id);if(!e.weakpoints.length&&!e.segments.length)this.dropGems(e.pos,e.gems);
   if(e.kind==='leviathan'){this.stats.leviathanDown=this.time;this.delayed.push({time:this.time+3.316666667,kind:'orb',pos:v(e.pos.x,5,e.pos.z),activeAt:this.time+10});}
   if(e.kind==='orb')this.stats.orbDown=this.time;
  }
  return applied;
 }
 private explode(pos:Vec,exclude?:{entity:number;segment:number}){
  this.emit('explosion',pos);for(const e of this.enemies){if(e.hp<=0||!this.active(e))continue;
   const points=e.weakpoints.length?e.weakpoints.map((s,i)=>({pos:localToEnemy(e,this.player.pos,s.local),hp:s.hp,index:i,weak:true})):e.segments.length?e.segments.map((s,i)=>({pos:s.pos,hp:s.hp,index:i,weak:false})):[{pos:this.weakPoint(e),hp:e.hp,index:-1,weak:false}];
   for(const p of points)if(p.hp>0&&!(exclude?.entity===e.id&&exclude.segment===p.index)&&distance(pos,p.pos)<1.9)this.damageEnemy(e,e.kind==='leviathan'||e.kind==='orb'?1:10,p.pos,p.index,p.weak);
  }
 }
 private updateProjectiles(dt:number){
  for(const explosion of this.detonations.filter(x=>x.tick<=this.tick))this.explode(explosion.pos,explosion.exclude);this.detonations=this.detonations.filter(x=>x.tick>this.tick);
  if(!this.projectiles.length){this.enemies=this.enemies.filter(e=>e.hp>0);return;}
  // Build damage targets once per tick; query only cells touched by each swept dagger.
  // Target health stays live because an earlier dagger can destroy a crystal this tick.
  type Target={e:Enemy;pos:Vec;r:number;i:number;weak:boolean;armor?:boolean;stamp?:number};
  const cells=new Map<string,Target[]>(),cellSize=4;
  for(const e of this.enemies){
   if(e.hp<=0||!this.active(e))continue;
   const targets:Target[]=e.segments.length?e.segments.map((s,i)=>({e,pos:s.pos,r:.53*e.size,i,weak:false})):e.weakpoints.length?e.weakpoints.map((s,i)=>({e,pos:localToEnemy(e,this.player.pos,s.local),r:e.kind==='leviathan'?.6:.34,i,weak:true})):[{e,pos:this.weakPoint(e),r:isSpider(e.kind)?.72*e.size:e.radius,i:-1,weak:false}];
   const radius=armorBounds(e);
   if(radius!==null)targets.push({e,pos:e.pos,r:radius,i:-1,weak:false,armor:true});
   if(isSpider(e.kind)&&e.headExposure<.5){targets.length=0;targets.push({e,pos:e.pos,r:e.radius,i:-1,weak:false,armor:true});}
   for(const target of targets)for(let x=Math.floor((target.pos.x-target.r)/cellSize);x<=Math.floor((target.pos.x+target.r)/cellSize);x++)for(let z=Math.floor((target.pos.z-target.r)/cellSize);z<=Math.floor((target.pos.z+target.r)/cellSize);z++){
    const key=x+','+z,cell=cells.get(key);if(cell)cell.push(target);else cells.set(key,[target]);
   }
  }
  const ghost=this.enemies.find(e=>e.kind==='ghostpede'&&e.hp>0&&this.active(e));
  const homingTargets=this.projectiles.some(p=>p.homing)?this.enemies.filter(e=>!isEgg(e.kind)&&e.kind!=='orb'&&e.hp>0&&this.active(e)):[];
  const old=v();let queryStamp=0;
  for(const p of this.projectiles){
   p.previous??={...p.pos};Object.assign(p.previous,p.pos);
   p.path=undefined;p.age+=dt;p.energy??=p.homing?10:1;
   if(p.floorBounces&&!p.homing)p.vel.y-=TUNING.gravity*dt;
   if(p.homing){let target:Vec|undefined,nearest=Infinity;
    if(ghost)target=ghost.pos;
    else for(const e of homingTargets){if(e.hp<=0)continue;const point=this.weakPoint(e),dist=(p.pos.x-point.x)**2+(p.pos.y-point.y)**2+(p.pos.z-point.z)**2;if(dist<nearest){nearest=dist;target=point;}}
    if(target){const dir=direction(p.pos,target),blend=Math.min(1,dt*7);p.vel.x+=(dir.x*42-p.vel.x)*blend;p.vel.y+=(dir.y*42-p.vel.y)*blend;p.vel.z+=(dir.z*42-p.vel.z)*blend;}
    if(ghost&&(distance(p.pos,ghost.pos)<1.5||ghost.segments.some(s=>distance(p.pos,s.pos)<1))){this.stats.homingEaten++;this.emit('eat',p.pos,undefined,'ghostpede');this.expireProjectile(p);continue;}
   }
   Object.assign(old,p.pos);p.pos.x+=p.vel.x*dt;p.pos.y+=p.vel.y*dt;p.pos.z+=p.vel.z*dt;
   let elapsed=0,remaining=dt;
   for(let pass=0;pass<4&&p.age<99;pass++){
    let best:{e:Enemy;segment:number;weak:boolean;t:number;pos:Vec;dead:boolean;armor:boolean;r:number;nx?:number;ny?:number;nz?:number}|undefined;
    const stamp=++queryStamp;
    for(let x=Math.floor(Math.min(old.x,p.pos.x)/cellSize);x<=Math.floor(Math.max(old.x,p.pos.x)/cellSize);x++)for(let z=Math.floor(Math.min(old.z,p.pos.z)/cellSize);z<=Math.floor(Math.max(old.z,p.pos.z)/cellSize);z++)for(const target of cells.get(x+','+z)??[]){
     if(target.stamp===stamp)continue;target.stamp=stamp;const e=target.e;
     if(e.hp<=0||(p.homing&&e.kind==='ghostpede'))continue;
     const hp=target.i<0?e.hp:target.weak?e.weakpoints[target.i].hp:e.segments[target.i].hp,dead=hp<=0;
     if(target.armor){
      const hit=armorBounds(e)!==null?sweepArmor(e,this.player.pos,old,p.pos,best?.t??1,this.time):null;
      const t=hit?.t??(armorBounds(e)===null?segmentSphere(old,p.pos,target.pos,target.r):null);
      if(t!==null&&(!best||t<best.t))best={e,segment:-1,weak:false,t,pos:target.pos,dead:false,armor:true,r:target.r,...(hit??{})};continue;
     }
     const t=segmentSphere(old,p.pos,target.pos,target.r);if(t!==null&&(!best||t<best.t||(t===best.t&&best.armor)))best={e,segment:target.i,weak:target.weak,t,pos:target.pos,dead,armor:false,r:target.r};
    }
    // Resolve the earliest floor crossing on the remaining swept path too.
    const floor=floorHeight(p.pos.x,p.pos.z,this.time,0)+.08;
    if(p.vel.y<0&&p.pos.y<floor){
     const t=clamp((old.y-floor)/Math.max(1e-9,old.y-p.pos.y),0,1);
     if(!best||t<best.t){
      const contact=v(old.x+(p.pos.x-old.x)*t,floor,old.z+(p.pos.z-old.z)*t);
      this.emit('ricochet',contact,p.homing?p.level:1);elapsed+=remaining*t;remaining*=1-t;
      (p.path??=[]).push({pos:contact,t:elapsed/dt});
      p.vel.y*=-.55;p.vel.x*=.65;p.vel.z*=.65;p.age+=.4;p.floorBounces=(p.floorBounces??0)+1;
      old.x=contact.x;old.y=floor+.002;old.z=contact.z;
      p.pos.x=old.x+p.vel.x*remaining;p.pos.y=old.y+p.vel.y*remaining;p.pos.z=old.z+p.vel.z*remaining;
      if(pass===3)Object.assign(p.pos,old);continue;
     }
    }
    if(!best)break;const {e,segment}=best;
    const contact=v(old.x+(p.pos.x-old.x)*best.t,old.y+(p.pos.y-old.y)*best.t,old.z+(p.pos.z-old.z)*best.t);
    if((best.armor&&e.kind!=='thorn')||best.dead){
     Object.assign(p.pos,contact);this.emit('impact',contact,p.level,e.kind);
     const effect=this.effects[this.effects.length-1];effect.direction=best.nx===undefined?direction(p.pos,old):v(best.nx,best.ny,best.nz);
     this.expireProjectile(p,{entity:e.id,segment});break;
    }
    Object.assign(p.pos,contact);
    const damage=p.homing?(e.kind==='leviathan'||e.kind==='orb'?1:e.kind==='squid3'&&p.level===3?30:p.energy):1;
    const effectStart=this.effects.length,applied=this.damageEnemy(e,damage,best.pos,segment,best.weak);
    if(applied>0){this.stats.hits++;Object.assign(this.effects[effectStart].pos,contact);}
    this.expireProjectile(p,{entity:e.id,segment});break;
   }
  }
  let surviving=0;for(let i=0;i<this.projectiles.length;i++){const p=this.projectiles[i];if(p.age<(p.homing?8:2.8)&&p.pos.x*p.pos.x+p.pos.z*p.pos.z<8100)this.projectiles[surviving++]=p;}this.projectiles.length=surviving;this.enemies=this.enemies.filter(e=>e.hp>0);
 }
 private expireProjectile(p:Projectile,exclude?:{entity:number;segment:number}){p.age=99;if(p.homing&&p.level===4)this.detonations.push({tick:this.tick+2,pos:{...p.pos},exclude});}
 weakPoint(e:Enemy){const point=e.weakpoints.find(s=>s.hp>0);if(point)return localToEnemy(e,this.player.pos,point.local);const segment=e.segments.find(s=>s.hp>0);return segment?.pos??(isSpider(e.kind)?spiderLocalPoint(e,this.player.pos,SPIDER_HEAD):e.kind==='thorn'?v(e.pos.x,3,e.pos.z):e.pos);}
 dropGems(pos:Vec,count:number){this.stats.released+=count;for(let i=0;i<count;i++)this.gems.push({id:this.nextId++,pos:{...pos},vel:v((this.random()-.5)*3,-2,(this.random()-.5)*3),age:0});}
 private updateGems(input:Input,dt:number){
  let attracting=!input.fire&&!input.homing&&this.lastShotTick!==this.tick;
  for(const g of this.gems){if(g.age>=99)continue;g.age+=dt;
   if(this.crew.length){const target=this.crew.filter(p=>p.alive&&!p.input.fire&&!p.input.homing&&p.lastShotTick!==this.tick).sort((a,b)=>distance(a.player.pos,g.pos)-distance(b.player.pos,g.pos))[0];attracting=!!target;if(target)this.useCrew(target);}
   if(attracting){const d=direction(g.pos,this.player.pos),speed=Math.min(17,distance(g.pos,this.player.pos)*12),steer=1-Math.exp(-12*dt);g.vel.x+=(d.x*speed-g.vel.x)*steer;g.vel.y+=(d.y*speed-g.vel.y)*steer;g.vel.z+=(d.z*speed-g.vel.z)*steer;}
   g.pos.x+=g.vel.x*dt;g.pos.y+=g.vel.y*dt;g.pos.z+=g.vel.z*dt;const floor=floorHeight(g.pos.x,g.pos.z,this.time,0)+.4;
   if(g.pos.y<floor){g.pos.y=floor;g.vel.y=Math.max(0,g.vel.y);}
   if((!this.crew.length||attracting)&&distance(g.pos,this.player.pos)<1.15){this.collect();g.age=99;this.emit('pickup',g.pos);}else if(g.age>=TUNING.gemLifetime)this.stats.expired++;
  }
  this.gems=this.gems.filter(g=>g.age<TUNING.gemLifetime);
 }
 collect(){if(this.crew.length){
  this.stats.collected++;for(const p of this.crew){if(this.stats.collected>70)p.reserve++;this.stats.maxReserve=Math.max(this.stats.maxReserve,p.reserve);const next=p.level>=3&&p.reserve>=150?4:this.stats.collected>=70?3:this.stats.collected>=10?2:1;if(next>p.level){p.level=next;this.stats.upgradeTimes[next-1]=this.time;this.effects.push({kind:'upgrade',pos:{...p.player.pos},amount:next,level:next});}}
  const local=this.crew.find(p=>p.player===this.player);if(local){this.level=local.level;this.reserve=local.reserve;}return;
 }this.stats.collected++;if(this.stats.collected>70)this.reserve++;this.stats.maxReserve=Math.max(this.stats.maxReserve,this.reserve);
  const next=this.level>=3&&this.reserve>=150?4:this.stats.collected>=70?3:this.stats.collected>=10?2:1;if(next>this.level){this.level=next;this.stats.upgradeTimes[next-1]=this.time;this.emit('upgrade',this.player.pos,next);}}
}
export function segmentSphere(a:Vec,b:Vec,c:Vec,r:number):number|null{const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=a.x-c.x,oy=a.y-c.y,oz=a.z-c.z,aa=dx*dx+dy*dy+dz*dz,bb=2*(ox*dx+oy*dy+oz*dz),cc=ox*ox+oy*oy+oz*oz-r*r;if(cc<=0)return 0;if(aa<1e-10)return null;const disc=bb*bb-4*aa*cc;if(disc<0)return null;const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:null;}
