import {towerHoverOffset} from './tower-anatomy-motion';
import {tileHeight,TILE_SIZE} from './arena';
import {isEgg,isSkull,isSquid} from './enemy-kinds';
import {legacyTowerGeometry,enemyRigScale} from './enemy-presentation';
import {armorBottom,armorBounds} from './projectile-collision';
import type {Enemy} from './simulation';

/** Mobile enemies never follow the sinking perimeter/void beneath the arena.
 * Include the body footprint so crossing a raised tile cannot bury its edge. */
export function enemyFloorHeight(e:Enemy,time:number){
 let height=0;
 for(const dx of [-e.radius,0,e.radius])for(const dz of [-e.radius,0,e.radius])height=Math.max(height,tileHeight(Math.floor((e.pos.x+dx)/TILE_SIZE+25.5),Math.floor((e.pos.z+dz)/TILE_SIZE+25.5),time));
 return height;
}
export function constrainEnemyFloor(e:Enemy,time:number){
 if(isSquid(e.kind)){
  const floating=e.balance&&!legacyTowerGeometry(e);
  const minimum=towerFloorHeight(e,time)-armorBottom(e)+TOWER_FLOOR_CLEARANCE+(floating?towerHoverOffset(e.age,e.kind):0);
  if(e.balance&&!legacyTowerGeometry(e)||e.pos.y<minimum){e.pos.y=minimum;e.vel.y=Math.max(0,e.vel.y);}return;
 }
 // Pedes, thorns and perimeter spider entrances have intentional emergence.
 if(!isSkull(e.kind)&&!isEgg(e.kind)&&e.kind!=='spiderling')return;
 const minimum=enemyFloorHeight(e,time)+e.radius+.02;
 if(e.pos.y<minimum){e.pos.y=minimum;e.vel.y=Math.max(0,e.vel.y);}
}
export const TOWER_FLOOR_CLEARANCE=.28;
/** Inspect every tile under the enlarged armor, including interior raised tiles.
 * Retain nominal ground height over the sinking perimeter instead of diving. */
export function towerFloorHeight(e:Enemy,time:number){
 const radius=(armorBounds(e)??e.radius)*enemyRigScale(e);let height=0;
 const minX=Math.max(0,Math.floor((e.pos.x-radius)/TILE_SIZE+25.5)),maxX=Math.min(50,Math.floor((e.pos.x+radius)/TILE_SIZE+25.5));
 const minZ=Math.max(0,Math.floor((e.pos.z-radius)/TILE_SIZE+25.5)),maxZ=Math.min(50,Math.floor((e.pos.z+radius)/TILE_SIZE+25.5));
 for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
  const dx=Math.max(0,Math.abs((x-25)*TILE_SIZE-e.pos.x)-TILE_SIZE*.5),dz=Math.max(0,Math.abs((z-25)*TILE_SIZE-e.pos.z)-TILE_SIZE*.5);
  if(dx*dx+dz*dz<=radius*radius)height=Math.max(height,tileHeight(x,z,time));
 }
 return height;
}
