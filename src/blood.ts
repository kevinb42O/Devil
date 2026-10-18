import {ARENA_DIMENSION,TILE_SIZE,floorHeight,tileHeight} from './arena';
import type {Effect,Vec} from './simulation';

export const BLOOD_CAPACITY=768;
export const BLOOD_SPAN=ARENA_DIMENSION*TILE_SIZE;
const GRAVITY=18,STEP=1/60,MASK_SIZE=32;
export type BloodDrop={origin:Vec;velocity:Vec;pos:Vec;born:number;age:number;size:number;angle:number;stretch:number;seed:number;puddleSplash?:boolean;enemyBurst?:boolean;sprayDirection?:Vec;sprayScale?:number};
export const BLOOD_SPLASH_CAPACITY=32,BLOOD_SPLASH_SECONDS=.55;
export type BloodSplash={x:number;y:number;z:number;born:number;impact:number;coverage:number;seed:number};
/** Uncapped, render-only size rule: doubling enemy radius more than doubles the spray. */
export function enemySprayScale(radius:number){return Math.pow(Math.max(.1,Number.isFinite(radius)?radius:.65)/.65,1.15);}
export function bloodRandom(seed:number){let value=seed>>>0||1;return ()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;};}

/** Cosmetic only: fixed storage, independent of World.random and render frame rate. */
export class BloodField {
 readonly pixels:Uint8Array;
 readonly drops:BloodDrop[]=[];
 readonly splashes:BloodSplash[]=[];
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
  if(effect.bloodless||(effect.kind!=='hit'&&effect.kind!=='kill'))return;
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
   drop.enemyBurst=effect.kind==='kill'&&(effect.enemyId??0)>=0;
   if(drop.enemyBurst)drop.sprayScale=enemySprayScale(effect.amount??.65);
   // Render-only pressure direction; landing velocities and random draws stay unchanged.
   if(effect.direction)drop.sprayDirection={...effect.direction};
   if(this.drops.length<this.capacity)this.drops.push(drop);
   else {this.drops[this.cursor]=drop;this.cursor=(this.cursor+1)%this.capacity;this.discarded++;}
  }
 }
 /** Contact samples the real liquid map, never the footprint overlay. */
 coverageAt(x:number,z:number){
  const px=Math.floor((x/BLOOD_SPAN+.5)*this.size),py=Math.floor((z/BLOOD_SPAN+.5)*this.size);
  if(px<0||py<0||px>=this.size||py>=this.size)return 0;
  return Math.min(1,Math.max(0,(this.pixels[(py*this.size+px)*4]/255-.09)/.58));
 }
 splash(x:number,z:number,time:number,speed:number,motion:Vec,seed:number){
  const coverage=this.coverageAt(x,z),ground=floorHeight(x,z,time,0);
  if(coverage<.12||ground<-20||speed<.6)return;
  const impact=Math.min(1.5,speed/9),random=bloodRandom(seed),count=Math.round((18+impact*30)*coverage);
  if(this.splashes.length>=BLOOD_SPLASH_CAPACITY)this.splashes.shift();
  this.splashes.push({x,y:ground+.025,z,born:time,impact,coverage,seed:random()});
  // Displaced liquid forms a low radial crown; smaller faster beads leave its rim.
  for(let i=0;i<count;i++){
   const angle=(i+random()*.6)/count*Math.PI*2,radius=.14+random()*.12;
   const ox=x+Math.cos(angle)*radius,oz=z+Math.sin(angle)*radius;
   if(Math.abs(floorHeight(ox,oz,time,0)-ground)>.12)continue;
   const fine=i%3===0,radial=(2.2+random()*5.2)*Math.sqrt(impact),up=(2.5+random()*5.5)*Math.sqrt(impact)*(fine?1.2:.75);
   const origin={x:ox,y:ground+.055,z:oz};
   const drop:BloodDrop={origin,pos:{...origin},velocity:{x:Math.cos(angle)*radial+motion.x*.12,y:up,z:Math.sin(angle)*radial+motion.z*.12},born:time,age:0,size:(fine?.034:.08)*( .65+random()*.6)*Math.sqrt(coverage),angle,stretch:1,seed:Math.floor(random()*4294967296),puddleSplash:true};
   if(this.drops.length<this.capacity)this.drops.push(drop);
   else{this.drops[this.cursor]=drop;this.cursor=(this.cursor+1)%this.capacity;}
  }
 }
 advance(time:number){
  for(let i=this.splashes.length-1;i>=0;i--)if(time-this.splashes[i].born>BLOOD_SPLASH_SECONDS)this.splashes.splice(i,1);
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
     if(!drop.puddleSplash)this.stamp(x+(drop.pos.x-old.x)*1e-6,z+(drop.pos.z-old.z)*1e-6,drop,drop.born+drop.age);
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
  const radius=Math.max(1.6,drop.size*scale*2.55);
  const horizontal=Math.hypot(drop.velocity.x,drop.velocity.z),vertical=Math.abs(drop.velocity.y-GRAVITY*drop.age);
  const stretch=1.12+Math.min(1.25,horizontal/Math.max(2,vertical)*.8);
  const angle=horizontal>.1?Math.atan2(drop.velocity.z,drop.velocity.x):drop.angle;
  const cos=Math.cos(angle),sin=Math.sin(angle),random=bloodRandom(drop.seed^0x71ab);
  const phase=random()*Math.PI*2,ground=floorHeight(x,z,time,0);
  const timestamp=Math.min(65535,Math.round(time*4));
  // A connected pool plus two small secondary impacts, rather than a hollow decal.
  const marks=[{cx,cy,radius,stretch,weight:1}];
  for(let i=0;i<2;i++){
   const azimuth=angle+(random()-.5)*2.5,distance=radius*(.9+random()*.8);
   marks.push({cx:cx+Math.cos(azimuth)*distance*stretch,cy:cy+Math.sin(azimuth)*distance,radius:Math.max(.75,radius*(.1+random()*.16)),stretch:1.15+random()*.8,weight:.7});
  }
  for(const mark of marks){
   const extent=Math.ceil(mark.radius*mark.stretch+1);
   for(let py=Math.max(0,Math.floor(mark.cy-extent));py<Math.min(this.size,Math.ceil(mark.cy+extent));py++){
    const tileZ=Math.floor(((py+.5)/this.size-.5)*BLOOD_SPAN/TILE_SIZE+25.5);
    for(let px=Math.max(0,Math.floor(mark.cx-extent));px<Math.min(this.size,Math.ceil(mark.cx+extent));px++){
     const dx=px+.5-mark.cx,dy=py+.5-mark.cy;
     const u=(dx*cos+dy*sin)/(mark.radius*mark.stretch),v=(-dx*sin+dy*cos)/mark.radius;
     if(Math.abs(u)>=1||Math.abs(v)>=1)continue;
     const r=Math.hypot(u,v),theta=Math.atan2(v,u);
     const boundary=.69+.075*Math.sin(theta*3+phase)+.045*Math.sin(theta*7-phase*1.7);
     const core=Math.min(1,Math.max(0,(boundary-r)*mark.radius+.5));
     const mask=this.mask[Math.floor((v*.5+.5)*MASK_SIZE)*MASK_SIZE+Math.floor((u*.5+.5)*MASK_SIZE)]/255;
     const coverage=Math.max(core,mask*.64)*mark.weight;
     if(coverage<.025)continue;
     const tileX=Math.floor(((px+.5)/this.size-.5)*BLOOD_SPAN/TILE_SIZE+25.5);
     const height=tileHeight(tileX,tileZ,time);
     // Do not paint across raised stone or bridge a missing / fallen tile.
     if(height>ground+.08||height<ground-.35)continue;
     this.dirtyMin[py]=Math.min(this.dirtyMin[py],px);this.dirtyMax[py]=Math.max(this.dirtyMax[py],px);
     const index=(py*this.size+px)*4;
     this.pixels[index]=Math.min(255,this.pixels[index]+Math.round(coverage*205));
     const bulge=Math.sqrt(Math.max(0,1-r/Math.max(.1,boundary)));
     this.pixels[index+3]=Math.min(255,this.pixels[index+3]+Math.round(coverage*(35+bulge*100)));
     const newest=Math.max(timestamp,this.pixels[index+1]+this.pixels[index+2]*256);
     this.pixels[index+1]=newest&255;this.pixels[index+2]=newest>>>8;
    }
   }
  }
  this.revision++;
 }
 clearDirty(){this.dirtyMin.fill(this.size);this.dirtyMax.fill(-1);this.fullUpload=false;}
 clear(){this.splashes.length=0;this.pixels.fill(0);this.drops.length=0;this.identities.clear();this.identityQueue.length=0;this.cursor=0;this.landings=this.discarded=0;this.revision++;this.fullUpload=true;}
}
