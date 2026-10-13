import {ARENA_DIMENSION,TILE_SIZE,floorHeight} from './arena';
import type {Effect,Vec} from './simulation';

export const BLOOD_CAPACITY=768;
export const BLOOD_SPAN=ARENA_DIMENSION*TILE_SIZE;
const GRAVITY=18,STEP=1/60,MASK_SIZE=32;
export type BloodDrop={origin:Vec;velocity:Vec;pos:Vec;born:number;age:number;size:number;angle:number;stretch:number;seed:number};
export function bloodRandom(seed:number){let value=seed>>>0||1;return ()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;};}

/** Cosmetic only: fixed storage, independent of World.random and render frame rate. */
export class BloodField {
 readonly pixels:Uint8Array;
 readonly drops:BloodDrop[]=[];
 readonly capacity=BLOOD_CAPACITY;
 mask=new Uint8Array(MASK_SIZE*MASK_SIZE);
 revision=0;landings=0;discarded=0;
 readonly dirtyMin:Int32Array;
 readonly dirtyMax:Int32Array;
 fullUpload=true;
 private cursor=0;
 private identities=new Set<number>();
 private identityQueue:number[]=[];
 constructor(readonly size=1024){
  this.pixels=new Uint8Array(size*size*4);
  this.dirtyMin=new Int32Array(size).fill(size);this.dirtyMax=new Int32Array(size).fill(-1);
  // A deterministic jagged fallback also works before the external sprite loads.
  const random=bloodRandom(71),radii=Array.from({length:16},()=>.55+random()*.4);
  for(let y=0;y<MASK_SIZE;y++)for(let x=0;x<MASK_SIZE;x++){
   const dx=(x+.5)/MASK_SIZE*2-1,dz=(y+.5)/MASK_SIZE*2-1;
   const angle=(Math.atan2(dz,dx)+Math.PI)/(Math.PI*2)*16;
   const radius=radii[Math.floor(angle)%16];
   this.mask[y*MASK_SIZE+x]=Math.hypot(dx,dz)<radius?220:0;
  }
 }
 emit(effect:Effect,time:number){
  if(effect.kind!=='hit'&&effect.kind!=='kill')return;
  const id=effect.bloodId;
  if(id!==undefined){
   if(this.identities.has(id))return;
   this.identities.add(id);this.identityQueue.push(id);
   if(this.identityQueue.length>4096)this.identities.delete(this.identityQueue.shift()!);
  }
  const seed=id??Math.imul(effect.enemyId??1,733)^Math.round(time*120)^(effect.kind==='kill'?0x5ab:0);
  const random=bloodRandom(seed),sources=effect.bloodSources?.slice(0,8)??[effect.pos];
  const large=Math.min(2.5,Math.max(1,(effect.amount??1)*.3));
  const count=effect.kind==='kill'?Math.round(24*large):effect.bloodSegment?10:3;
  const born=effect.bloodTime??time;
  for(let i=0;i<count;i++){
   const origin=sources[i%sources.length];if(!origin)continue;
   const ground=floorHeight(origin.x,origin.z,born,0);
   if(origin.y<ground-.2){this.discarded++;continue;}
   const angle=random()*Math.PI*2,speed=(1+random()*4)*Math.sqrt(large),direction=effect.direction;
   const drop:BloodDrop={origin:{...origin},pos:{...origin},velocity:{x:Math.cos(angle)*speed+(direction?.x??0)*2,y:1+random()*5+Math.max(-1,direction?.y??0)*2,z:Math.sin(angle)*speed+(direction?.z??0)*2},born,age:0,size:(effect.kind==='kill'?.18:.09)*(1+random()*1.8)*Math.sqrt(large),angle,stretch:1+random()*1.2,seed:Math.floor(random()*4294967296)};
   if(this.drops.length<this.capacity)this.drops.push(drop);
   else {this.drops[this.cursor]=drop;this.cursor=(this.cursor+1)%this.capacity;this.discarded++;}
  }
 }
 advance(time:number){
  let alive=0;
  for(const drop of this.drops){
   const target=Math.min(5,Math.max(0,time-drop.born));let landed=false;
   while(drop.age+STEP<=target+1e-8){
    const old={...drop.pos};drop.age+=STEP;
    drop.pos.x=drop.origin.x+drop.velocity.x*drop.age;
    drop.pos.z=drop.origin.z+drop.velocity.z*drop.age;
    drop.pos.y=drop.origin.y+drop.velocity.y*drop.age-GRAVITY*drop.age*drop.age*.5;
    // Divide at tile boundaries, including ascending entry into a higher tile.
    const cuts=[0,1];
    for(const axis of ['x','z'] as const){
     const from=old[axis]/TILE_SIZE+25.5,to=drop.pos[axis]/TILE_SIZE+25.5;
     if(from===to)continue;
     for(let boundary=Math.floor(Math.min(from,to))+1;boundary<=Math.floor(Math.max(from,to));boundary++)cuts.push((boundary-from)/(to-from));
    }
    cuts.sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++){
     const a=cuts[j-1],b=cuts[j],mid=(a+b)*.5;
     const ground=floorHeight(old.x+(drop.pos.x-old.x)*mid,old.z+(drop.pos.z-old.z)*mid,drop.born+drop.age,0);
     if(ground<-20)continue;
     const ya=old.y+(drop.pos.y-old.y)*a,yb=old.y+(drop.pos.y-old.y)*b;
     if(Math.min(ya,yb)>ground+.015)continue;
     const t=ya<=ground+.015?a:a+(b-a)*(ya-ground-.015)/Math.max(1e-9,ya-yb);
     const x=old.x+(drop.pos.x-old.x)*t,z=old.z+(drop.pos.z-old.z)*t;
     // Stamp inside the contacted tile when the collision is exactly on an edge.
     this.stamp(x+(drop.pos.x-old.x)*1e-6,z+(drop.pos.z-old.z)*1e-6,drop,drop.born+drop.age);
     this.landings++;landed=true;break;
    }
    if(landed)break;
   }
   if(!landed&&target<5&&drop.pos.y>-30)this.drops[alive++]=drop;
  }
  this.drops.length=alive;
 }
 private stamp(x:number,z:number,drop:BloodDrop,time:number){
  const scale=this.size/BLOOD_SPAN,cx=(x/BLOOD_SPAN+.5)*this.size,cy=(z/BLOOD_SPAN+.5)*this.size;
  const radius=Math.max(1.5,drop.size*scale*1.6),stretch=drop.stretch;
  const extent=Math.ceil(radius*stretch),cos=Math.cos(drop.angle),sin=Math.sin(drop.angle);
  const timestamp=Math.min(65535,Math.round(time*4));
  for(let py=Math.max(0,Math.floor(cy-extent));py<Math.min(this.size,Math.ceil(cy+extent));py++)for(let px=Math.max(0,Math.floor(cx-extent));px<Math.min(this.size,Math.ceil(cx+extent));px++){
   const dx=px+.5-cx,dy=py+.5-cy;
   const u=(dx*cos+dy*sin)/(radius*stretch)*.5+.5,v=(-dx*sin+dy*cos)/radius*.5+.5;
   if(u<0||v<0||u>=1||v>=1)continue;
   const alpha=this.mask[Math.floor(v*MASK_SIZE)*MASK_SIZE+Math.floor(u*MASK_SIZE)]*.7;
   if(alpha<2)continue;
   this.dirtyMin[py]=Math.min(this.dirtyMin[py],px);this.dirtyMax[py]=Math.max(this.dirtyMax[py],px);
   const index=(py*this.size+px)*4,coverage=this.pixels[index];
   this.pixels[index]=Math.min(245,coverage+Math.round(alpha*.8));
   const newest=Math.max(timestamp,this.pixels[index+1]+this.pixels[index+2]*256);
   this.pixels[index+1]=newest&255;this.pixels[index+2]=newest>>>8;
  }
  this.revision++;
 }
 clearDirty(){this.dirtyMin.fill(this.size);this.dirtyMax.fill(-1);this.fullUpload=false;}
 clear(){this.pixels.fill(0);this.drops.length=0;this.identities.clear();this.identityQueue.length=0;this.cursor=0;this.landings=this.discarded=0;this.revision++;this.fullUpload=true;}
}
