import type {Effect,Vec,EnemyKind} from './simulation';
import {CAMERA_FEEDBACK as T,feedbackIntensity} from './camera-feedback-tuning';
type Channel='burst'|'land'|'upgrade'|'impact'|'death';
type Pulse={age:number;strength:number;x:number;y:number;z:number};
const channels:Channel[]=['burst','land','upgrade','impact','death'];
const largeKills=new Set<EnemyKind>(['squid','squid2','squid3','spider','spider2','centipede','gigapede','ghostpede','leviathan','orb']);
/** Fixed storage, analytic envelopes, no random sampling or simulation writes. */
export class CameraFeedback{
 private intensity=T.defaultIntensity/100;
 private pulses:Record<Channel,Pulse>=Object.fromEntries(channels.map(k=>[k,{age:Infinity,strength:0,x:0,y:0,z:0}])) as Record<Channel,Pulse>;
 private seen=new Set<string>();
 readonly offset:Vec={x:0,y:0,z:0};
 configure(value:unknown){this.intensity=feedbackIntensity(value)/100;if(!this.intensity)this.clear();}
 clear(){for(const k of channels){this.pulses[k].age=Infinity;this.pulses[k].strength=0;}this.seen.clear();this.offset.x=this.offset.y=this.offset.z=0;}
 private trigger(kind:Channel,strength:number,x:number,y:number,z:number){
  const p=this.pulses[kind];
  // One bounded voice per category: a chain reaction cannot accumulate pulses.
  // A weaker arrival never restarts a stronger active impact.
  const remaining=p.age<T[kind].duration?p.strength*(1-p.age/T[kind].duration):0;
  if(strength<remaining)return;
  p.age=0;p.strength=strength;p.x=x;p.y=y;p.z=z;
 }
 event(e:Effect,local:boolean,listener:Vec,yaw=0,deathContact?:Vec){
  if(!this.intensity)return;
  const key=e.shotKey?`s:${e.shotKey}`:e.networkId!==undefined?`n:${e.networkId}`:null;
  if(key){if(this.seen.has(key))return;this.seen.add(key);if(this.seen.size>128)this.seen.delete(this.seen.values().next().value!);}
  if(local&&e.kind==='burst')this.trigger('burst',1,0,0,1);
  else if(local&&e.kind==='land')this.trigger('land',e.amount===2?1:.55,0,-1,0);
  else if(local&&e.kind==='upgrade')this.trigger('upgrade',.75+Math.min(4,e.level??e.amount??1)*.0625,0,1,0);
  else if(local&&e.kind==='death'&&deathContact){
   const x=listener.x-deathContact.x,z=listener.z-deathContact.z,length=Math.hypot(x,z);
   if(length>1e-6)this.trigger('death',1,(x*Math.cos(yaw)-z*Math.sin(yaw))/length,0,(x*Math.sin(yaw)+z*Math.cos(yaw))/length);
  }else if(e.kind==='explosion'||e.kind==='emerge'&&e.enemy==='centipede'||e.kind==='kill'&&!!e.enemy&&largeKills.has(e.enemy)){
   const distance=Math.hypot(e.pos.x-listener.x,e.pos.y-listener.y,e.pos.z-listener.z);
   const falloff=Math.max(0,1-distance/T.impact.range)**2;
   if(falloff>0)this.trigger('impact',falloff*(e.kind==='kill'?.65:1),.25,1,0);
  }
 }
 /** Advance the presentation clock. dt=0 freezes exactly, including pause. */
 advance(dt:number){
  if(!Number.isFinite(dt)||dt<=0)return;
  for(const k of channels)this.pulses[k].age+=dt;
 }
 sample():Vec{
  const out=this.offset;out.x=out.y=out.z=0;
  for(const k of channels){
   const p=this.pulses[k],t=p.age/T[k].duration;if(t>=1)continue;
   // Land/upgrade start at rest; a shot starts with an immediate kick.
   const wave=k==='burst'||k==='death'?Math.cos(t*Math.PI*1.5):Math.sin(t*Math.PI*(k==='impact'?4:2));
   const amount=T[k].strength*p.strength*wave*(1-t)**2*this.intensity;
   out.x+=p.x*amount;out.y+=p.y*amount;out.z+=p.z*amount;
  }
  const length=Math.hypot(out.x,out.y,out.z),limit=T.maxOffset*this.intensity;
  if(length>limit){const scale=limit/length;out.x*=scale;out.y*=scale;out.z*=scale;}
  return out;
 }
 get diagnostics(){return {intensity:this.intensity*100,offset:{...this.offset},active:channels.filter(k=>this.pulses[k].age<T[k].duration)};}
}
