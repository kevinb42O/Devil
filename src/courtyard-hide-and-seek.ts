/** Static west-wing layout shared by authoritative movement, prediction and art. */
export type HideBlock={x:number;z:number;w:number;d:number;h:number};
export const HIDE_ROOM={minX:-82,maxX:-18,minZ:-26,maxZ:30};
export const HIDE_PASSAGE={minX:-18,maxX:-6.3,minZ:-2,maxZ:6};
export function inHideRoom(x:number,z:number){return x>=HIDE_ROOM.minX&&x<=HIDE_ROOM.maxX&&z>=HIDE_ROOM.minZ&&z<=HIDE_ROOM.maxZ;}
export function inHideWing(x:number,z:number){return inHideRoom(x,z)||x>=HIDE_PASSAGE.minX&&x<=HIDE_PASSAGE.maxX&&z>=HIDE_PASSAGE.minZ&&z<=HIDE_PASSAGE.maxZ;}
const box=(x:number,z:number,w:number,d:number,h=4.8):HideBlock=>({x,z,w,d,h});
export const HIDE_ZONES=[
 {id:'crypt',title:'THE SILENT TOMBS',subtitle:'Some secrets are better buried.',x:-65,z:-18,color:0x99b9be},
 {id:'stores',title:'THE SMUGGLER’S HOLD',subtitle:'Lose yourself between the stacks.',x:-33,z:-18,color:0xd6aa70},
 {id:'monuments',title:'THE WATCHERS',subtitle:'They have seen nothing. Probably.',x:-65,z:2,color:0x9bb7a2},
 {id:'arrival',title:'FORGOTTEN REPOSITORY',subtitle:'One seeker. Count to 25. No peeking.',x:-29,z:2,color:0xd8bd86},
 {id:'shrine',title:'THE LAST LIGHT',subtitle:'Even a devil needs a quiet corner.',x:-65,z:22,color:0xbb9ac7},
 {id:'service',title:'THE CROOKED WAY',subtitle:'The long way round is sometimes safer.',x:-33,z:22,color:0x8caebc},
] as const;
export type HideZone=typeof HIDE_ZONES[number]['id'];
export type HideIsland={id:string;zone:HideZone;x:number;z:number;turn:0|1};
export const HIDE_ISLANDS:HideIsland[]=[
 ...[-75,-64,-53].map((x,i)=>({id:`crypt-${i}`,zone:'crypt' as const,x,z:-18,turn:0 as const})),
 ...[-42,-32,-22.5].map((x,i)=>({id:`stores-${i}`,zone:'stores' as const,x,z:-18,turn:1 as const})),
 ...[-75,-64,-53].map((x,i)=>({id:`monuments-${i}`,zone:'monuments' as const,x,z:2,turn:(i%2) as 0|1})),
 {id:'arrival',zone:'arrival',x:-27,z:2,turn:1},
 ...[-75,-64,-53].map((x,i)=>({id:`shrine-${i}`,zone:'shrine' as const,x,z:22,turn:0 as const})),
 ...[-42,-29].map((x,i)=>({id:`service-${i}`,zone:'service' as const,x,z:22,turn:1 as const})),
];
export function hideLocal(island:HideIsland,x:number,z:number){return {x:island.x+(island.turn?-z:x),z:island.z+(island.turn?x:z)};}
function islandBox(i:HideIsland,x:number,z:number,w:number,d:number,h=4.8){return {...hideLocal(i,x,z),w:i.turn?d:w,d:i.turn?w:d,h};}
/** Opposing L-shaped pockets: each has a different entrance and inspection angle. */
export const HIDE_COVER=HIDE_ISLANDS.flatMap(i=>[
 islandBox(i,0,0,5.4,.65),islandBox(i,-2.4,-1.4,.6,3.4),islandBox(i,2.4,1.4,.6,3.4),
]);
export const HIDE_SPOTS=HIDE_ISLANDS.flatMap(i=>[-1,1].map(side=>({
 id:`${i.id}-${side<0?'a':'b'}`,zone:i.zone,...hideLocal(i,-side*1.25,side*1.4),
 concealedFrom:{...hideLocal(i,0,-side*3.6),y:1.7},
 inspectFrom:{...hideLocal(i,-side*1.25,side*3.6),y:1.7},
})));
/** Tall broken partitions define loops, with broad staggered gaps between zones. */
export const HIDE_PARTITIONS=[
 box(-77,-8,10,.7),box(-60,-8,12,.7),box(-42,-8,12,.7),box(-23,-8,10,.7),
 box(-77,12,10,.7),box(-60,12,12,.7),box(-42,12,12,.7),box(-23,12,10,.7),
 box(-47.5,-21,.7,10),box(-47.5,2,.7,9),box(-47.5,25,.7,10),
 box(-10,-.5,.65,3,5.2),box(-14,4.5,.65,3,5.2),
];
export const HIDE_WALLS=[
 box(-82.35,2,.7,56.7,8),box(-50,-26.35,64,.7,8),box(-50,30.35,64,.7,8),
 box(-17.65,-14,.7,24,8),box(-17.65,18,.7,24,8),
 box(-12.15,-2.35,12.4,.7,8),box(-12.15,6.35,12.4,.7,8),
 // Split the original west courtyard wall around the new opening.
 box(-6.6,-4.175,.6,4.35,7),box(-6.6,8.25,.6,4.5,7),
];
export const HIDE_PROPS:({model:string;rotation?:number}&HideBlock)[]=[
 ...[-75,-64,-53].map((x,i)=>({...box(x,-23.8,5.2,3.6,4.4),model:i%2?'crypt-b':'crypt-a'})),
 ...[-42,-32,-22.5].map((x,i)=>({...box(x,-23.8,5,3.2,3.8),model:i%2?'hay-bale-bundled':'hay-bale'})),
 ...[-75,-64,-53].map(x=>({...box(x,28.1,4,2.4,1.25),model:'altar-stone'})),
 ...[-79.5,-50.5].map(x=>({...box(x,2,1.5,1.5,5.8),model:'pillar-obelisk'})),
 ...[-42,-29].map(x=>({...box(x,28,4,2.6,3.8),model:'rocks-tall'})),
];
export const HIDE_GATEPOSTS=[-8,12].flatMap(z=>[-69,-51,-32].flatMap(x=>[-1,1].map(side=>box(x+side*2.85,z,.45,.8))));
export const HIDE_PILLARS=HIDE_ISLANDS.flatMap(i=>[-1,1].map(side=>({...hideLocal(i,side*2.4,side*2.8),w:.85,d:.85,h:5.05})));
export const HIDE_SOLIDS=[...HIDE_WALLS,...HIDE_PARTITIONS,...HIDE_COVER,...HIDE_PROPS,...HIDE_GATEPOSTS,...HIDE_PILLARS];

/** Swept, axis-separated collision with sliding, also used after camera feedback. */
export function constrainHideSolids(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number},radius=.22){
 let x=to.x,z=to.z;
 const feet=Math.min(from.y,to.y)-1.7;
 for(const s of HIDE_SOLIDS){
  if(feet>=s.h-.15||Math.abs(from.z-s.z)>=s.d/2+radius)continue;
  const lo=s.x-s.w/2-radius,hi=s.x+s.w/2+radius;
  if(from.x<=lo&&x>lo)x=lo;else if(from.x>=hi&&x<hi)x=hi;
 }
 for(const s of HIDE_SOLIDS){
  if(feet>=s.h-.15||Math.abs(x-s.x)>=s.w/2+radius-.00001)continue;
  const lo=s.z-s.d/2-radius,hi=s.z+s.d/2+radius;
  if(from.z<=lo&&z>lo)z=lo;else if(from.z>=hi&&z<hi)z=hi;
 }
 return {x,z};
}
