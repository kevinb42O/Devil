import {SURVIVAL_HEADER, SURVIVAL_HEIGHTS} from './survival-data';
/** All original coordinates are uniformly scaled to the existing .62 asset scale. */
export const WORLD_SCALE = .62;
export const TILE_SIZE = 4 * WORLD_SCALE;
export const ARENA_DIMENSION = SURVIVAL_HEADER.arenaDimension;
export const arenaRadius = (time:number) => Math.max(SURVIVAL_HEADER.shrinkEnd, SURVIVAL_HEADER.shrinkStart - time * SURVIVAL_HEADER.shrinkRate) * WORLD_SCALE;
export function tileHeight(x:number,z:number,time:number):number {
  if(x<0||z<0||x>=ARENA_DIMENSION||z>=ARENA_DIMENSION)return -1000;
  const dist=Math.hypot(x-25,z-25)*4;
  const threshold=dist<=SURVIVAL_HEADER.shrinkEnd?Infinity:Math.max(0,(SURVIVAL_HEADER.shrinkStart-dist)/SURVIVAL_HEADER.shrinkRate);
  // Source parser stores x as the fast coordinate: x = index % dimension.
  return (SURVIVAL_HEIGHTS[z*ARENA_DIMENSION+x]-Math.max(0,time-threshold)/4)*WORLD_SCALE;
}
export function floorHeight(x:number,z:number,time:number,footprint=.18):number {
  let height=-1000;
  for(const dx of [-footprint,footprint])for(const dz of [-footprint,footprint]){
    const ix=Math.floor((x+dx)/TILE_SIZE+25.5),iz=Math.floor((z+dz)/TILE_SIZE+25.5);
    height=Math.max(height,tileHeight(ix,iz,time));
  }
  return height;
}
/** Earliest downward contact with the tiled floor, including height changes
 * along the path. Sample each tile interval, never the endpoint's height alone. */
export function sweepFloor(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},time:number,clearance=.08):{t:number;y:number}|null {
  if(b.y>=a.y)return null;
  const cuts=[0,1];
  for(const axis of ['x','z'] as const){
    const from=a[axis]/TILE_SIZE+25.5,to=b[axis]/TILE_SIZE+25.5;
    if(from===to)continue;
    for(let boundary=Math.floor(Math.min(from,to))+1;boundary<Math.max(from,to);boundary++)cuts.push((boundary-from)/(to-from));
  }
  cuts.sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){
    const lo=cuts[i-1],hi=cuts[i];if(hi<=lo)continue;
    const mid=(lo+hi)/2,ground=floorHeight(a.x+(b.x-a.x)*mid,a.z+(b.z-a.z)*mid,time,0);
    if(ground<=-1000)continue;
    const floor=ground+clearance,fromY=a.y+(b.y-a.y)*lo,toY=a.y+(b.y-a.y)*hi;
    if(toY>=floor)continue;
    const t=fromY<=floor?lo:(floor-a.y)/(b.y-a.y);
    return {t:Math.max(lo,Math.min(hi,t)),y:floor};
  }
  return null;
}
export const ARENA_TILES = Array.from({length:ARENA_DIMENSION**2},(_,index)=>({x:Math.floor(index/ARENA_DIMENSION),z:index%ARENA_DIMENSION}))
  .filter(({x,z})=>tileHeight(x,z,0)>-20);
