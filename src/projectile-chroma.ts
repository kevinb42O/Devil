import {SHOTGUN_COLOR} from './weapon-tuning';
import {ALL_PROJECTILE_COLORS,projectileVisualIndex,projectileStyleIndex} from './projectile-presentation';
import type {World,Projectile} from './simulation';

type RGB=readonly [number,number,number];
type Source={heat:number;last:number};
type Launch={color:RGB;born:number};
/** Every shotgun uses the original game's warm regular dagger colour. */
export function shotgunPelletColor(_p?:Pick<Projectile,'id'|'shotKey'>):RGB{return SHOTGUN_COLOR;}
const STOPS:readonly (readonly [number,RGB])[]=[
 [0,[1,.07,.012]],[1,[1,.42,.025]],[2,[1,.88,.46]],
 [3.4,[.035,.82,1]],[4.6,[.10,.22,1]],[5.7,[.58,.055,1]],
 [6.9,[1,.035,.30]],[8.2,[1,.07,.012]],
];
const ease=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

/** Smooth, art-directed linear-light colours. Every salvo keeps its launch
 * colour in flight, leaving a visible history of the spray along its stream. */
export function sprayColor(heat:number,base:RGB):RGB{
 const phase=Math.max(0,heat)%8.2;
 let i=0;while(i<STOPS.length-2&&phase>STOPS[i+1][0])i++;
 const [start,a]=STOPS[i],[end,b]=STOPS[i+1],t=ease((phase-start)/(end-start)),mix=ease(heat/.85);
 const channel=(c:number)=>base[c]+(a[c]+(b[c]-a[c])*t-base[c])*mix;
 return [channel(0),channel(1),channel(2)];
}
const owner=(p:Projectile)=>p.shotKey?.split(':')[0]??'solo';
const key=(p:Projectile)=>p.shotKey??p.id;

/** Presentation history is per world and per shooter. No combat RNG, network
 * packets or projectile physics are changed. Short pauses retain some heat;
 * a longer pause cools it naturally before the next stream. */
export class ProjectileChroma{
 private sources=new Map<string,Source>();
 private launches=new Map<string|number,Launch>();
 private time=-Infinity;
 private shots:Projectile[]|null=null;
 private count=-1;
 update(world:World){
  if(world.time<this.time-.05)this.clear();
  if(world.time===this.time&&world.projectiles===this.shots&&this.count===world.projectiles.length)return;
  this.time=world.time;this.shots=world.projectiles;this.count=world.projectiles.length;
  const fresh:Projectile[]=[];
  for(const p of world.projectiles)if(!this.launches.has(key(p)))fresh.push(p);
  // Snapshot order need not be chronological (prediction and remote streams
  // can merge). Age reconstructs launch time independently of frame rate.
  fresh.sort((a,b)=>b.age-a.age);
  for(const p of fresh){
   const born=world.time-p.age,base=ALL_PROJECTILE_COLORS[projectileVisualIndex(p,world.level)];
   if(p.kind==='shotgun'){this.launches.set(key(p),{color:shotgunPelletColor(p),born});continue;}
   const id=owner(p);let source=this.sources.get(id);
   if(!source){source={heat:0,last:born};this.sources.set(id,source);}
   const gap=Math.max(0,born-source.last);
   // Cadence is 50–100ms; 240ms tolerates a missed snapshot without
   // mistaking a held stream for a release. Cooling takes about half as long.
   if(gap<=.24)source.heat+=gap;
   else source.heat=Math.max(0,source.heat-(gap-.24)*2.2);
   source.last=Math.max(source.last,born);
   this.launches.set(key(p),{color:sprayColor(source.heat,base),born});
  }
  // Seeking shots can remain in flight for eight seconds.
  for(const [id,launch] of this.launches)if(world.time-launch.born>10)this.launches.delete(id);
  for(const [id,source] of this.sources)if(world.time-source.last>15)this.sources.delete(id);
 }
 color(p:Projectile,fallbackLevel=1):RGB{return this.launches.get(key(p))?.color??(p.kind==='shotgun'?shotgunPelletColor(p):ALL_PROJECTILE_COLORS[projectileVisualIndex(p,fallbackLevel)]);}
 launchColor(id:string|undefined,level:number,homing:boolean):RGB{
  const source=this.sources.get(id??'solo'),base=ALL_PROJECTILE_COLORS[projectileStyleIndex(level,homing)];
  return source?sprayColor(source.heat,base):base;
 }
 clear(){this.sources.clear();this.launches.clear();this.shots=null;this.count=-1;this.time=-Infinity;}
}
const worlds=new WeakMap<World,ProjectileChroma>();
export function projectileChroma(world:World){
 let chroma=worlds.get(world);if(!chroma){chroma=new ProjectileChroma();worlds.set(world,chroma);}chroma.update(world);return chroma;
}
