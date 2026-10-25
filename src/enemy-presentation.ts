import {ORB_CORE_RADIUS,ORB_REVEAL_SECONDS} from './orb-scale';
import {type Enemy, type Vec} from './simulation';
import {isSpider,isSkull,isPede} from './enemy-kinds';
import {towerEmissionTick} from './tower-spawn';
const v=(x:number,y:number,z:number):Vec=>({x,y,z});
/** Coordinate mapping shared by the mesh rig and damage targets. Placement is prototype tuning. */
export const CREATURE_SCALE=1;
/** Conversion from the prototype's baked collision and movement measurements. */
export const CREATURE_SCALE_RATIO=CREATURE_SCALE/.62;
// Preserve the Leviathan's 2.23-unit underside clearance as its rig grows.
export const LEVIATHAN_HOVER_HEIGHT=8+5.77*(CREATURE_SCALE_RATIO-1);
export const SPIDER_SIZE=1.65;
// Compact mouth-held weak point; shared by the mesh and damage target.
export const SPIDER_CRYSTAL_SCALE=.9;
export const SPIDER_CRYSTAL_RADIUS=CREATURE_SCALE*SPIDER_CRYSTAL_SCALE*.5;
export const SPIDER_HIT_FLASH_DURATION=.18;
// Spin around the tower's own axis independently of its slow perimeter movement.
export const TOWER_SPIN_SPEED=.28;
export const TOWER_DEATH_DURATION=2;
/** Integrate a steadily accelerating spin; ease the descent into the floor. */
export function towerDeathPose(elapsed:number,sinkDepth:number){
 const time=Math.max(0,Math.min(TOWER_DEATH_DURATION,elapsed)),progress=time/TOWER_DEATH_DURATION;
 return {spin:TOWER_SPIN_SPEED*time+.5*18*time*time,sink:sinkDepth*progress*progress,done:elapsed>=TOWER_DEATH_DURATION};
}
export const TOWER_EJECTION_DURATION=.5;
/** Distinct creature heights, shared by visible anatomy and emission mouths. */
export function towerOutletHeight(kind:Enemy['kind'],legacy=false){return legacy?(kind==='squid3'?5:kind==='squid2'?2.5:1.1)*CREATURE_SCALE_RATIO:kind==='squid3'?18:kind==='squid2'?13:8;}
export function towerRadius(kind:Enemy['kind']){return kind==='squid3'?3.2:kind==='squid2'?2.5:1.8;}
/** Every emitted child uses the same exhaust center as the visible chimney. */
export function towerOutlets(kind:Enemy['kind']){
 const count=kind==='squid3'?3:kind==='squid2'?2:1,offset=count===1?0:towerRadius(kind)*.48;
 return Array.from({length:count},(_,i)=>{const angle=i*Math.PI*2/count;return {x:Math.sin(angle)*offset,y:towerOutletHeight(kind),z:Math.cos(angle)*offset,angle,radius:count===1?1.05:count===2?1.0:1.12};});
}
/** Relative foundation transform shared by rendering and shot collision. */
export function towerFoundationPose(bottom:number){return {footY:Math.min(0,bottom),footScale:Math.max(.001,-bottom),plinthY:bottom+.3};}

/** Visible gem sizes; balanced damage spheres keep their existing tolerance. */
export function towerCrystalRadius(kind:Enemy['kind'],balanced=false){if(balanced)return .63*CREATURE_SCALE_RATIO/.62;return kind==='squid3'?.66:kind==='squid2'?.60:.52;}
export function legacyTowerGeometry(enemy:Enemy){return enemy.kind.startsWith('squid')&&(enemy.weakpoints[0]?.local.y??0)<1;}
/** Anticipation, held opening through the stream, then a soft closing motion. */
export function towerSpitPulse(age:number,kind:Enemy['kind']='squid',originalCadence=false){
 if(originalCadence){
  const start=towerEmissionTick(kind,0,0)/60,period=(towerEmissionTick(kind,1,0)-towerEmissionTick(kind,0,0))/60;
  const cycle=((age-start)%period+period)%period,held=(kind==='squid3'?27:18)/60+.05;
  if(cycle>period-.35)return (cycle-period+.35)/.35;
  if(cycle<=held)return 1;
  if(cycle<held+.4)return 1-(cycle-held)/.4;
  return 0;
 }
 const cycle=((age-3)%20+20)%20;
 if(cycle>19.65)return (cycle-19.65)/.35;
 if(cycle<.7)return 1;
 if(cycle<1.1)return (1.1-cycle)/.4;
 return 0;
}
export function swarmEmergenceScale(enemy:Enemy){return Math.max(0,Math.min(1,enemy.age/(enemy.statusUntil>0&&isSkull(enemy.kind)?.12:1.1)));}
/** Spawner creatures use a larger authored scale; targeting, armor, outlets and spacing share it. */
export function enemyRigScale(enemy:Enemy){
 if(enemy.kind==='orb')return enemy.radius/ORB_CORE_RADIUS;
 if(enemy.balance&&enemy.kind.startsWith('squid')&&!legacyTowerGeometry(enemy))return .62*(enemy.kind==='squid3'?1.5:enemy.kind==='squid2'?1.45:1.4);
 return enemy.balance&&(isSpider(enemy.kind)||isPede(enemy.kind)) ? .62 : 1;
}
/** Crystal radius in rig coordinates; current spiders recover the pre-remake hit tolerance. */
export function spiderCrystalRadius(enemy:Enemy){return SPIDER_CRYSTAL_RADIUS*enemy.size*(enemy.balance?2/.62:1);}
/** Visual size follows the feeding face, independently of forgiving hit tolerance. */
export function spiderCrystalVisualRadius(enemy:Pick<Enemy,'kind'|'size'>){return SPIDER_CRYSTAL_RADIUS*enemy.size*(enemy.kind==='spider2'?1.25:1);}
export function enemyEmergenceScale(enemy:Enemy){
 if(enemy.kind==='orb'&&enemy.radius>ORB_CORE_RADIUS+.01){const t=Math.max(0,Math.min(1,enemy.age/ORB_REVEAL_SECONDS));return enemyRigScale(enemy)*t*t*(3-2*t);}
 if(isPede(enemy.kind))return 1; // Pede rigs scale individually; segment positions are world-space.
 const growth=isSkull(enemy.kind)||enemy.kind==='spiderling'?swarmEmergenceScale(enemy):Math.max(0,Math.min(1,enemy.age/(enemy.kind==='spider2'?9:enemy.kind==='leviathan'?8.533333:1.1)));
 return enemyRigScale(enemy)*growth;
}
export function towerPartOffset(enemy:Enemy,name:string,originalCadence=true){
 if(!enemy.kind.startsWith('squid')||!/crest|jaw|teeth/.test(name))return 0;
 const lift=legacyTowerGeometry(enemy)?.4:enemy.kind==='squid3'?1.05:enemy.kind==='squid2'?.85:.65;
 return towerSpitPulse(enemy.age,enemy.kind,originalCadence)*(name.includes('crest')?lift:-.18);
}
/** Attached damage targets share the render root's emergence transform. */
export function crystalToEnemy(enemy:Enemy,player:Vec,local:Vec){const scale=enemyEmergenceScale(enemy);return localToEnemy(enemy,player,v(local.x*scale,local.y*scale,local.z*scale));}
export function enemyYaw(enemy:Enemy,player:Vec){return isSpider(enemy.kind)?enemy.facingYaw:enemy.kind==='leviathan'?enemy.phase:isPede(enemy.kind)?(Math.hypot(enemy.vel.x,enemy.vel.z)>.01?Math.atan2(enemy.vel.x,enemy.vel.z):enemy.facingYaw):enemy.kind.startsWith('squid')?enemy.facingYaw+(enemy.towerSpinDirection??-1)*enemy.age*TOWER_SPIN_SPEED:isSkull(enemy.kind)&&Math.hypot(enemy.vel.x,enemy.vel.z)>.01?Math.atan2(enemy.vel.x,enemy.vel.z):Math.atan2(player.x-enemy.pos.x,player.z-enemy.pos.z);}
export function localToEnemy(enemy:Enemy,player:Vec,local:Vec):Vec {const yaw=enemyYaw(enemy,player);return v(enemy.pos.x+local.x*Math.cos(yaw)+local.z*Math.sin(yaw),enemy.pos.y+local.y,enemy.pos.z-local.x*Math.sin(yaw)+local.z*Math.cos(yaw));}
export const LEGACY_SQUID_I_GEM=v(0,-.04*CREATURE_SCALE,-.51*CREATURE_SCALE);
export const SQUID_I_GEM=v(0,towerOutletHeight('squid')-.4,-2.1);
export const LEGACY_SQUID_II_GEMS=[v(1.35*CREATURE_SCALE,-.04*CREATURE_SCALE,0),v(-1.35*CREATURE_SCALE,-.04*CREATURE_SCALE,0)];
export const SQUID_II_GEMS=[v(2.85,towerOutletHeight('squid2')-.4,0),v(-2.85,towerOutletHeight('squid2')-.4,0)];
export const SPIDER_GEM=v(0,.25*CREATURE_SCALE,2.45*CREATURE_SCALE);

export const SPIDER_HEAD=v(0,.9*CREATURE_SCALE,1.95*CREATURE_SCALE);
export function spiderLocalPoint(enemy:Enemy,player:Vec,local:Vec):Vec {
 local=v(local.x*enemy.size,local.y*enemy.size,local.z*enemy.size);
 const pivot=v(0,.2*CREATURE_SCALE*enemy.size,1*CREATURE_SCALE*enemy.size),angle=(1-enemy.headExposure)*.9;
 const y=local.y-pivot.y,z=local.z-pivot.z;
 return crystalToEnemy(enemy,player,v(local.x,pivot.y+y*Math.cos(angle)-z*Math.sin(angle),pivot.z+y*Math.sin(angle)+z*Math.cos(angle)));
}

export const LEGACY_SQUID_III_GEMS=Array.from({length:3},(_,i)=>{const angle=i*Math.PI*2/3;return v(Math.sin(angle)*2.34*CREATURE_SCALE,.38*CREATURE_SCALE,Math.cos(angle)*2.34*CREATURE_SCALE);});
export const SQUID_III_GEMS=Array.from({length:3},(_,i)=>{const angle=i*Math.PI*2/3;return v(Math.sin(angle)*4.0,towerOutletHeight('squid3')-.4,Math.cos(angle)*4.0);});
export const LEVIATHAN_GEMS=Array.from({length:6},(_,i)=>{const angle=i*Math.PI/3;return v(Math.sin(angle)*8.35*CREATURE_SCALE,-2.9*CREATURE_SCALE,Math.cos(angle)*8.35*CREATURE_SCALE);});
