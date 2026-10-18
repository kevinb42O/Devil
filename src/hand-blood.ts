import {bloodWashRetention} from './blood-weather';
import {rainAt} from './rain-state';
import type {Effect,World} from './simulation';
export type HandBloodState={amount:number;bodyAmount:number;freshness:number};
type Stain={amount:number;last:number;wet:number};
/** Cosmetic body accumulation per life; hands saturate before the rest of the body; never changes combat, recordings or gameplay RNG. */
export class HandBlood{
 private stains=new Map<string,Stain>();
 private seen=new Set<number>();
 private queue:number[]=[];
 private time=-Infinity;
 private key(world:World,player:World['player']){const member=world.crew.find(p=>p.player===player);return member?`${member.id}:${member.life}`:'solo';}
 private clock(time:number){
  // Guest rendering trails event delivery by up to 200 ms. That is not a replay seek.
  if(time<this.time-.25)this.clear();this.time=Math.max(this.time,time);
 }
 effect(effect:Effect,world:World){
  this.clock(world.time);
  if(world.courtyard||effect.bloodless||(effect.kind!=='hit'&&effect.kind!=='kill'))return;
  if(effect.bloodId!==undefined){
   if(this.seen.has(effect.bloodId))return;
   this.seen.add(effect.bloodId);this.queue.push(effect.bloodId);
   if(this.queue.length>4096)this.seen.delete(this.queue.shift()!);
  }
  const actors=world.crew.length?world.crew.filter(p=>p.alive).map(p=>p.player):[world.player];
  for(const player of actors){
   const distance=Math.min(...(effect.bloodSources?.length?effect.bloodSources:[effect.pos]).map(pos=>Math.hypot(pos.x-player.pos.x,pos.y-player.pos.y,pos.z-player.pos.z)));
   const proximity=Math.max(0,1-distance/7);if(proximity===0)continue;
   const amount=(effect.kind==='kill'?.19:.035)*proximity*proximity*Math.min(1.6,Math.sqrt(Math.max(.3,effect.amount??1)));
   const key=this.key(world,player),old=this.stains.get(key);
   this.stains.set(key,{amount:Math.min(3,(old?old.amount*bloodWashRetention(old.last,world.time,.08):0)+amount),wet:Math.min(1,(old?old.wet*Math.exp(-Math.max(0,world.time-old.last)/28)*bloodWashRetention(old.last,world.time,.08):0)+amount),last:world.time});
  }
 }
 sample(world:World,player=world.player):HandBloodState{
  this.clock(world.time);
  const live=new Set(world.crew.map(p=>`${p.id}:${p.life}`));if(!world.crew.length)live.add('solo');
  for(const id of this.stains.keys())if(!live.has(id))this.stains.delete(id);
  if(world.courtyard)return {amount:0,bodyAmount:0,freshness:0};
  const stain=this.stains.get(this.key(world,player));
  if(!stain)return {amount:0,bodyAmount:0,freshness:0};
  const retention=bloodWashRetention(stain.last,world.time,.08),amount=stain.amount*retention;
  const fresh=Math.min(1,stain.wet/Math.min(1,stain.amount))*Math.exp(-Math.max(0,world.time-stain.last)/28);
  return {amount:Math.min(1,amount),bodyAmount:Math.min(1,Math.max(0,(amount-.12)/2.3)),freshness:amount>.001?Math.max(fresh,rainAt(world.time).rain*.8):0};
 }
 clear(){this.stains.clear();this.seen.clear();this.queue.length=0;this.time=-Infinity;}
}
