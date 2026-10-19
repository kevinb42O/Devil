/** Reproducible, headless balance probes. No production state or tuning changes.
 * Run: npx tsx tools/audit-combat-balance.ts > artifacts/balance-audit/measurements.json
 */
import {World,STEP,idleInput,v,segmentSphere,TUNING,type Vec} from '../src/simulation';
import {crystalToEnemy,towerCrystalRadius,SPIDER_CRYSTAL_RADIUS,enemyEmergenceScale} from '../src/enemy-presentation';
import {sweepArmor,armorBounds,armorBottom} from '../src/projectile-collision';
import {towerGameplayEntrancePose} from '../src/tower-spawn';
import {survivalSchedule} from '../src/survival';
import {WEAPON_PRESENTATION} from '../src/weapon-tuning';
import {STREAM_COUNTS} from '../src/weapon-levels';
import {weaponMuzzle} from '../src/weapon-origin';
import {daggerLaunch} from '../src/projectile-launch';

const tiers=['squid','squid2','squid3'] as const;
const round=(n:number)=>Number(n.toFixed(4));
const geometry=[];
const upgradePulseDamage=[];
for(const legacy of [true,false])for(const kind of tiers){
 const w=new World(71,{schedule:false,invulnerable:true,legacyBalance:legacy,legacyTowerArchitecture:legacy}),e=w.spawnAt(kind,0);
 e.nextSpawn=Infinity;
 for(let i=0;i<10/STEP;i++){w.step(idleInput());w.effects=[];}
 const r=legacy?TUNING.towerCrystalRadius:towerCrystalRadius(kind,true)*enemyEmergenceScale(e);
 const visibility=[];
 for(const range of [5,10,20,30]){
  let visible=0,anyVisible=0,total=0;
  for(let degree=0;degree<360;degree+=2){
   const a=degree*Math.PI/180,player=v(e.pos.x+Math.sin(a)*range,1.7,e.pos.z+Math.cos(a)*range);
   let any=false;
   for(const point of e.weakpoints){
    const p=crystalToEnemy(e,player,point.local),contact=segmentSphere(player,p,p,r)!;
    const armor=sweepArmor(e,player,player,p,contact,w.time);
    total++;if(!armor){visible++;any=true;}
   }
   if(any)anyVisible++;
  }
  visibility.push({range,visibleCrystalsFraction:round(visible/total),anglesWithAnyCrystal:round(anyVisible/180)});
 }
 geometry.push({legacy,kind,rootY:round(e.pos.y),crystalY:round(crystalToEnemy(e,w.player.pos,e.weakpoints[0].local).y),crystalRadius:round(r),armorBound:round(armorBounds(e)!),legacyArmorBottom:round(armorBottom(e)),visibility});
 // Put this naturally elevated tower inside the pulse's horizontal radius.
 e.pos.x=8;e.pos.z=0;w.player.pos=v(0,1.7,0);const before=e.hp;
 w.level=2;w.emit('upgrade',w.player.pos,2);
 for(let tick=0;tick<180;tick++){w.time+=STEP;(w as any).updateUpgradePulses();}
 upgradePulseDamage.push({legacy,kind,damage:before-e.hp});
}

// Actual scheduled placement versus position after entrance and crowding.
const spawnDisplacement=[];
for(const legacy of [true,false]){
 const w=new World(71,{invulnerable:true,legacyBalance:legacy,legacyTowerArchitecture:legacy});
 const origins=new Map<number,Vec>();let worst=0,changed=0,maxOutwardStep=0,maxRayDeviation=0;
 const spawnAt=w.spawnAt.bind(w);
 w.spawnAt=(kind,a,r)=>{const e=spawnAt(kind,a,r);if(kind.startsWith('squid'))origins.set(e.id,{...e.pos});return e;};
 for(let i=0;i<300/STEP;i++){
  const before=new Map(w.enemies.map(e=>[e.id,Math.hypot(e.pos.x,e.pos.z)]));
  w.step(idleInput());w.effects=[];
  // Keep only towers so this measures tower solver pressure, not combat.
  w.enemies=w.enemies.filter(e=>e.kind.startsWith('squid'));w.projectiles=[];w.gems=[];
  for(const e of w.enemies){
   const origin=origins.get(e.id)!;maxRayDeviation=Math.max(maxRayDeviation,Math.abs(e.pos.x*origin.z-e.pos.z*origin.x)/Math.hypot(origin.x,origin.z));maxOutwardStep=Math.max(maxOutwardStep,Math.hypot(e.pos.x,e.pos.z)-(before.get(e.id)??Math.hypot(origin.x,origin.z)));
   const expected=towerGameplayEntrancePose(e.kind,Math.max(0,w.time-e.towerEntrance!.born)).radius;
   const radius=Math.hypot(origin.x,origin.z),ideal=v(origin.x*expected/radius,e.pos.y,origin.z*expected/radius);
   const delta=Math.hypot(ideal.x-e.pos.x,ideal.z-e.pos.z);
   if(delta>.05)changed++;worst=Math.max(worst,delta);
  }
 }
 spawnDisplacement.push({legacy,towers:w.enemies.length,maxDeviationFromUnobstructedPath:round(worst),displacedTowerTicks:changed,maxOutwardStep:round(maxOutwardStep),maxRayDeviation:round(maxRayDeviation)});
}

// Isolate launch/pursuit changes with identical tower, player and seed.
const pursuit=[];
for(const legacy of [true,false])for(const kind of tiers){
 const w=new World(71,{schedule:false,invulnerable:true,legacyBalance:legacy,legacyTowerArchitecture:legacy});
 w.player.pos=v(0,1.7,0);const tower=w.spawn(kind,v(20,5,0));tower.age=12;tower.nextSpawn=Infinity;
 const index=kind==='squid3'?15:10;(w as any).ejectSkull(tower,index,0,false);
 const child=w.enemies.at(-1)!;
 const distances=[];
 for(let i=0;i<10/STEP;i++){
  w.step(idleInput());w.effects=[];
  if((i+1)%120===0)distances.push({second:(i+1)/120,distance:round(Math.hypot(child.pos.x,child.pos.z)),height:round(child.pos.y)});
 }
 pursuit.push({legacy,kind,child:child.kind,distances});
}

// Distribution-only probe using the real launcher and a frozen target.
// Compare the pre-898f7ae cone against current cone; no inference about human aim.
const streamAccuracy=[];
for(const radius of [.45,.9,1.016129])for(const range of [10,20,30])for(const level of [2,3,4]){
 const counts=[];
 for(const oldSpread of [true,false]){
  const spread=oldSpread?([.045,.07,.11,.155][level-1]):WEAPON_PRESENTATION[level-1].streamSpread;
  const count=oldSpread?[1,2,4,8][level-1]:STREAM_COUNTS[level-1];
  let hit=0;const player=v(0,20,0),target=v(0,20,-range),muzzles=Array.from({length:level===4?6:level===3?4:2},(_,i)=>weaponMuzzle(player,0,0,level,i));
  let seed=71;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  for(let shot=0;shot<1000;shot++)for(let i=0;i<count;i++){
   const {pos,vel}=daggerLaunch({pos:player,muzzles,yaw:0,pitch:0,spread,aimDistance:range,radius:.01,camera:false,cone:true,focused:true,seed:71},i,random(),random(),70);
   if(segmentSphere(pos,v(pos.x+vel.x*2.8,pos.y+vel.y*2.8,pos.z+vel.z*2.8),target,radius)!==null)hit++;
  }
  counts.push({oldSpread,pelletsPerSalvo:count,hitFraction:round(hit/(1000*count)),hitsPerSecond:round(hit/1000*120/(level>=4?9:6))});
 }
 streamAccuracy.push({radius,range,level,counts});
}

const schedule=[];
for(const e of survivalSchedule()){if(e.time>360)break;schedule.push(e);}
console.log(JSON.stringify({note:'Controlled probes, not human survival predictions. Legacy comparison uses pre-fix tower rules and proportions. New towers may stop before an occupied center, so deviation from the unobstructed path alone is not displacement; use maxRayDeviation and maxOutwardStep. Visibility means an unobstructed ray aimed at a crystal center, stopped at the hit sphere. Old spread includes the smaller historical salvo counts. Spawn crowding keeps every tower alive for 300s.',geometry,upgradePulseDamage,spawnDisplacement,pursuit,streamAccuracy,spiderRadius:{beforeRemake:.9,unfixedRemake:SPIDER_CRYSTAL_RADIUS,current:SPIDER_CRYSTAL_RADIUS*2,enemyEmergenceScale},schedule},null,2));
