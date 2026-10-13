import {type ArenaSnapshot} from './multiplayer';
import {World,type Vec} from './simulation';
import {mixPosition,flightPosition} from './network-state';
const angle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
/** Render a small adaptive distance behind the host; never delay the local
 * predicted controller. Samples are immutable and bounded by count and time. */
export class SnapshotTimeline{
 private samples:{s:ArenaSnapshot;at:number}[]=[];delay=.06;private interval=.05;private jitter=0;
 push(s:ArenaSnapshot,at:number){const last=this.samples.at(-1);if(last&&s.epoch!==last.s.epoch)this.reset();else if(last){const interval=(at-last.at)/1000;this.jitter=this.jitter*.9+Math.abs(interval-this.interval)*.1;this.interval=this.interval*.9+interval*.1;this.delay=Math.min(.2,Math.max(.05,this.interval+2*this.jitter));}this.samples.push({s:structuredClone(s),at});while(this.samples.length>12)this.samples.shift();}
 reset(){this.samples=[];this.delay=.06;this.interval=.05;this.jitter=0;}
 view(world:World,localId:string,now:number,offset:Vec):World{
 const latest=this.samples.at(-1);if(!latest)return world;
 const target=latest.s.time+Math.min(.12,Math.max(0,(now-latest.at)/1000))-this.delay;
 let a=this.samples[0].s,b=latest.s;for(const sample of this.samples){if(sample.s.time<=target)a=sample.s;if(sample.s.time>=target){b=sample.s;break;}}
 const fraction=b.time>a.time?Math.max(0,Math.min(1,(target-a.time)/(b.time-a.time))):1;
 const view=Object.create(world) as World;view.time=Math.max(a.time,Math.min(target,b.time));
 const olderEnemies=new Map(a.enemies.map(e=>[e.id,e]));view.enemies=b.enemies.map(e=>{const old=olderEnemies.get(e.id);return old?{...e,pos:mixPosition(old.pos,e.pos,fraction),age:old.age+(e.age-old.age)*fraction,segments:e.segments.map((part,i)=>({...part,pos:old.segments[i]?mixPosition(old.segments[i].pos,part.pos,fraction):part.pos}))}:e;});
 const olderGems=new Map(a.gems.map(g=>[g.id,g]));view.gems=b.gems.map(g=>({...g,pos:olderGems.has(g.id)?mixPosition(olderGems.get(g.id)!.pos,g.pos,fraction):g.pos}));
 const olderCrew=new Map(a.crew.map(p=>[p.id,p]));view.crew=world.crew.map(p=>{if(p.id===localId)return {...p,player:{...p.player,pos:{x:p.player.pos.x+offset.x,y:p.player.pos.y+offset.y,z:p.player.pos.z+offset.z}}};const old=olderCrew.get(p.id),next=b.crew.find(c=>c.id===p.id);return next&&old?{...p,player:{...p.player,pos:mixPosition(old.player.pos,next.player.pos,fraction)},input:{...p.input,yaw:angle(old.yaw,next.yaw,fraction),pitch:(old.pitch??0)+((next.pitch??0)-(old.pitch??0))*fraction,fire:next.primary.wasHeld,homing:next.secondary.wasHeld}}:p;});
 view.player=view.crew.find(p=>p.id===localId)?.player??world.player;
 // Full projectile positions are unnecessary between updates. Ordinary flight
 // is ballistic; homing/bounces have a shorter extrapolation horizon.
 view.projectiles=world.projectiles.map(p=>{if(p.id<0)return p;const local=p.shotKey?.startsWith(`${localId}:`);const sampleTime=local?world.time:target;const dt=Math.max(-Math.min(.2,p.age),Math.min(p.homing||p.floorBounces? .05:.15,sampleTime-latest.s.time));const pos=flightPosition(p,dt);return {...p,pos,previous:pos,path:undefined,age:Math.max(0,p.age+dt)};});
 return view;
 }
}
