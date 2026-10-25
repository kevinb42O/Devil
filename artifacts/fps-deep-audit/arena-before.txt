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
export function sweepFloorLegacy(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},time:number,clearance=.08):{t:number;y:number}|null {
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
/** Sweep top surfaces and raised tile sides. Side contacts stay at the
 * dagger's actual height and carry an outward normal for reflection. */
export function sweepFloor(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},time:number,clearance=.08):{t:number;y:number;normal?:{x:number;y:number;z:number}}|null {
  const cuts=[0,1];
  for(const axis of ['x','z'] as const){
    const from=a[axis]/TILE_SIZE+25.5,to=b[axis]/TILE_SIZE+25.5;
    if(from===to)continue;
    for(let boundary=Math.floor(Math.min(from,to))+1;boundary<Math.max(from,to);boundary++)cuts.push((boundary-from)/(to-from));
  }
  cuts.sort((a,b)=>a-b);
  const epsilon=1e-7/Math.max(1,Math.hypot(b.x-a.x,b.z-a.z));
  const sideNormal=(before:number,after:number)=>{
    const normal={x:0,y:0,z:0};
    for(const axis of ['x','z'] as const)if(Math.floor((a[axis]+(b[axis]-a[axis])*before)/TILE_SIZE+25.5)!==Math.floor((a[axis]+(b[axis]-a[axis])*after)/TILE_SIZE+25.5))normal[axis]=-Math.sign(b[axis]-a[axis]);
    const length=Math.hypot(normal.x,normal.z);if(!length)return null;
    normal.x/=length;normal.z/=length;return normal;
  };
  let previousGround=floorHeight(a.x-(b.x-a.x)*epsilon,a.z-(b.z-a.z)*epsilon,time,0);
  for(let i=1;i<cuts.length;i++){
    const lo=cuts[i-1],hi=cuts[i];if(hi<=lo)continue;
    const mid=(lo+hi)/2,ground=floorHeight(a.x+(b.x-a.x)*mid,a.z+(b.z-a.z)*mid,time,0);
    const floor=ground+clearance,fromY=a.y+(b.y-a.y)*lo,toY=a.y+(b.y-a.y)*hi;
    if(ground>-1000&&ground>previousGround&&fromY<floor){
      const normal=sideNormal(lo===0?-epsilon:(cuts[i-2]+lo)/2,mid);
      if(normal)return {t:lo,y:fromY,normal};
    }
    if(ground>-1000&&b.y<a.y&&toY<=floor){
      const t=fromY<=floor?lo:(floor-a.y)/(b.y-a.y);
      return {t:Math.max(lo,Math.min(hi,t)),y:floor,normal:{x:0,y:1,z:0}};
    }
    previousGround=ground;
  }
  const endGround=floorHeight(b.x,b.z,time,0);
  if(endGround>-1000&&endGround>previousGround&&b.y<endGround+clearance){
    const normal=sideNormal((cuts[cuts.length-2]+1)/2,1);
    if(normal)return {t:1,y:b.y,normal};
  }
  return null;
}
export const ARENA_TILES = Array.from({length:ARENA_DIMENSION**2},(_,index)=>({x:Math.floor(index/ARENA_DIMENSION),z:index%ARENA_DIMENSION}))
  .filter(({x,z})=>tileHeight(x,z,0)>-20);
