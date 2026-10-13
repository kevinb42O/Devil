import {type Enemy, type Vec} from './simulation';
import {isSpider,isSkull} from './enemy-kinds';
const v=(x:number,y:number,z:number):Vec=>({x,y,z});
/** Coordinate mapping shared by the mesh rig and damage targets. Placement is prototype tuning. */
export const CREATURE_SCALE=.62;
// Spin around the tower's own axis independently of its slow perimeter movement.
export const TOWER_SPIN_SPEED=.28;
export function enemyYaw(enemy:Enemy,player:Vec){return isSpider(enemy.kind)?enemy.facingYaw:enemy.kind==='leviathan'?enemy.phase:enemy.kind==='ghostpede'?enemy.phase+Math.PI:enemy.kind.startsWith('squid')?enemy.facingYaw+(enemy.towerSpinDirection??-1)*enemy.age*TOWER_SPIN_SPEED:isSkull(enemy.kind)&&Math.hypot(enemy.vel.x,enemy.vel.z)>.01?Math.atan2(enemy.vel.x,enemy.vel.z):Math.atan2(player.x-enemy.pos.x,player.z-enemy.pos.z);}
export function localToEnemy(enemy:Enemy,player:Vec,local:Vec):Vec {const yaw=enemyYaw(enemy,player);return v(enemy.pos.x+local.x*Math.cos(yaw)+local.z*Math.sin(yaw),enemy.pos.y+local.y,enemy.pos.z-local.x*Math.sin(yaw)+local.z*Math.cos(yaw));}
export const SQUID_I_GEM=v(0,-.04*CREATURE_SCALE,-.51*CREATURE_SCALE);
export const SQUID_II_GEMS=[v(1.35*CREATURE_SCALE,-.04*CREATURE_SCALE,0),v(-1.35*CREATURE_SCALE,-.04*CREATURE_SCALE,0)];
export const SPIDER_GEM=v(0,.25*CREATURE_SCALE,2.45*CREATURE_SCALE);

export const SPIDER_HEAD=v(0,.9*CREATURE_SCALE,1.95*CREATURE_SCALE);
export function spiderLocalPoint(enemy:Enemy,player:Vec,local:Vec):Vec {
 local=v(local.x*enemy.size,local.y*enemy.size,local.z*enemy.size);
 const pivot=v(0,.2*CREATURE_SCALE*enemy.size,1*CREATURE_SCALE*enemy.size),angle=(1-enemy.headExposure)*.9;
 const y=local.y-pivot.y,z=local.z-pivot.z;
 return localToEnemy(enemy,player,v(local.x,pivot.y+y*Math.cos(angle)-z*Math.sin(angle),pivot.z+y*Math.sin(angle)+z*Math.cos(angle)));
}

export const SQUID_III_GEMS=Array.from({length:3},(_,i)=>{const angle=i*Math.PI*2/3;return v(Math.sin(angle)*2.34*CREATURE_SCALE,.38*CREATURE_SCALE,Math.cos(angle)*2.34*CREATURE_SCALE);});
export const LEVIATHAN_GEMS=Array.from({length:6},(_,i)=>{const angle=i*Math.PI/3;return v(Math.sin(angle)*8.35*CREATURE_SCALE,-2.9*CREATURE_SCALE,Math.cos(angle)*8.35*CREATURE_SCALE);});
