import {SURVIVAL_HEADER} from './survival-data';
import {WORLD_SCALE,TILE_SIZE} from './arena';
import {isSpider,isSquid,type EnemyKind} from './enemy-kinds';

// Repeated float32 subtraction matches spider radii in original Survival replays.
// Tick zero already applies a shrink step before its spawn events are recorded.
const shrinkStep=Math.fround(Math.fround(SURVIVAL_HEADER.shrinkRate)/60);
const radii=[Math.fround(SURVIVAL_HEADER.shrinkStart)];
export function originalSpawnArenaRadius(tick:number){
 const count=Math.max(0,Math.floor(tick))+1;
 while(radii.length<=count&&radii.at(-1)!>SURVIVAL_HEADER.shrinkEnd)radii.push(Math.max(SURVIVAL_HEADER.shrinkEnd,Math.fround(radii.at(-1)!-shrinkStep)));
 return radii[count]??SURVIVAL_HEADER.shrinkEnd;
}
export function originalSpawnRadius(kind:EnemyKind,tick:number){
 if(isSquid(kind))return 62*WORLD_SCALE;
 if(isSpider(kind))return Math.min(48,originalSpawnArenaRadius(tick)+2)*WORLD_SCALE;
 return undefined;
}
export function originalTowerSpawnHeight(kind:EnemyKind){return (kind==='squid'?6.5:kind==='squid2'?8.5:13.5)*WORLD_SCALE;}
/** Captured pedes start inside a 25-unit disk, not at the shrinking perimeter.
 * The radial distribution is inferred; their recorded depth is exact. */
export function pedeSpawnPosition(kind:EnemyKind,angle:number,radialSample:number){
 const radius=25*WORLD_SCALE*radialSample;
 return {x:Math.sin(angle)*radius,y:(kind==='ghostpede'?-15:-4)*WORLD_SCALE,z:Math.cos(angle)*radius};
}
export const THORN_SPAWN_DEPTH=Math.fround(-15.7)*WORLD_SCALE;
/** Original thorns occupy tile centers. Selection/exclusion probabilities
 * remain unmeasured; retain the existing radial range while snapping to tiles. */
export function thornSpawnPosition(arenaRadius:number,angle:number,radialSample:number){
 const radius=arenaRadius*(.3+radialSample*.5);
 return {x:Math.round(Math.sin(angle)*radius/TILE_SIZE)*TILE_SIZE,y:THORN_SPAWN_DEPTH,z:Math.round(Math.cos(angle)*radius/TILE_SIZE)*TILE_SIZE};
}
/** Both captured runs put consecutive tower/spider angles 90–270 degrees apart.
 * Uniform sampling within that interval is an inference; original RNG is unknown. */
export function nextPerimeterSpawnAngle(previous:number,sample:number){return previous+Math.PI/2+sample*Math.PI;}
