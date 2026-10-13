import {tileHeight,TILE_SIZE} from './arena';
import {isEgg,isSkull} from './enemy-kinds';
import type {Enemy} from './simulation';

/** Mobile enemies never follow the sinking perimeter/void beneath the arena.
 * Include the body footprint so crossing a raised tile cannot bury its edge. */
export function enemyFloorHeight(e:Enemy,time:number){
 let height=0;
 for(const dx of [-e.radius,0,e.radius])for(const dz of [-e.radius,0,e.radius])height=Math.max(height,tileHeight(Math.floor((e.pos.x+dx)/TILE_SIZE+25.5),Math.floor((e.pos.z+dz)/TILE_SIZE+25.5),time));
 return height;
}
export function constrainEnemyFloor(e:Enemy,time:number){
 // Pedes, thorns and perimeter spider entrances have intentional emergence.
 if(!isSkull(e.kind)&&!isEgg(e.kind)&&e.kind!=='spiderling')return;
 const minimum=enemyFloorHeight(e,time)+e.radius+.02;
 if(e.pos.y<minimum){e.pos.y=minimum;e.vel.y=Math.max(0,e.vel.y);}
}
