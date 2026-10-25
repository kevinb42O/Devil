import {AscentAudio} from './ascent-audio';
import {ascentAt,createAscentState} from './ascent-state';
import {HeavenAudio} from './heaven-audio';
import {COSMIC_INTRO_DURATION,DESCENT_CHAPTERS,descentAt,ENVIRONMENT_CYCLE,environmentClock} from './descent';
import manifest from './environment-audio-manifest.json';

export type EnvironmentBed=keyof typeof manifest;
export const ENVIRONMENT_BEDS:readonly EnvironmentBed[]=['space','ash','storm','veil','furnace','cathedral','depth','heaven'];
const LOOP_OVERLAP=4;
/** Exactly the sky's chapter weights, including its nine-second cosmic handover. */
export function environmentMix(time:number):{name:EnvironmentBed;weight:number;origin:number}[]{
 const state=descentAt(time),space=state.cosmic,air=1-space-state.beyond;
 const cycleStart=state.cycle*ENVIRONMENT_CYCLE;
 const beds=[{name:'space' as EnvironmentBed,weight:space,origin:cycleStart+(state.phaseTime>=482?482:0)}];
 beds.push({name:'heaven',weight:state.beyond,origin:cycleStart+(state.phaseTime>=492?492:-18)});
 const origin=(chapter:number)=>cycleStart+COSMIC_INTRO_DURATION+DESCENT_CHAPTERS[chapter].time-18;
 beds.push({name:ENVIRONMENT_BEDS[state.chapter+1],weight:air*(1-state.blend),origin:state.chapter===0?cycleStart+21:origin(state.chapter)});
 if(state.blend>0)beds.push({name:ENVIRONMENT_BEDS[state.chapter+2],weight:air*state.blend,origin:origin(state.chapter+1)});
 return beds.filter(b=>b.weight>.00001);
}
type Stream={audio:HTMLAudioElement;gain:GainNode;node:MediaElementAudioSourceNode;starting:boolean;retryAt:number};
type Bed={streams:[Stream,Stream];current:number;target:number};
/** Long stereo recordings stream off the game thread. Two voices overlap loop tails. */
export class EnvironmentAudio {
 private beds=new Map<EnvironmentBed,Bed>();
 private failed=new Set<string>();
 private lastTime:number|null=null;
 private active=false;
 private heavenly:HeavenAudio;
 private ascent:AscentAudio;private rushState=createAscentState();
 constructor(private context:AudioContext,private output:AudioNode){this.heavenly=new HeavenAudio(context,output);this.ascent=new AscentAudio(context,output);}
 get diagnostics(){return {ascent:this.ascent.diagnostics,active:this.active,failed:[...this.failed],beds:[...this.beds].map(([name,b])=>({name,weight:b.target,duration:manifest[name].duration,streams:b.streams.map(s=>({playing:!s.audio.paused,time:s.audio.currentTime,gain:s.gain.gain.value,ready:s.audio.readyState}))}))};}
 private bed(name:EnvironmentBed){
  let bed=this.beds.get(name);if(bed)return bed;
  const stream=():Stream=>{
   const audio=new Audio();audio.preload='auto';audio.loop=false;audio.src='/assets/audio/environment/'+manifest[name].file;
   const gain=this.context.createGain();gain.gain.value=0;
   const node=this.context.createMediaElementSource(audio);node.connect(gain);gain.connect(this.output);
   audio.addEventListener('error',()=>this.failed.add(name));
   return {audio,gain,node,starting:false,retryAt:0};
  };
  bed={streams:[stream(),stream()],current:0,target:0};this.beds.set(name,bed);return bed;
 }
 private start(name:EnvironmentBed,s:Stream,offset:number){
  if(s.starting||!s.audio.paused||performance.now()<s.retryAt)return;
  if(s.audio.readyState<1)return;
  s.audio.currentTime=Math.max(0,Math.min(offset,s.audio.duration-LOOP_OVERLAP));
  s.starting=true;
  void s.audio.play().then(()=>{
   this.failed.delete(name);
   if(!this.active||this.context.state!=='running'||this.beds.get(name)?.target===0){s.audio.pause();s.gain.gain.value=0;}
  }).catch(()=>{this.failed.add(name);s.retryAt=performance.now()+3000;}).finally(()=>{s.starting=false;});
 }
 update(time:number|null,dt:number){
  if(time===null||document.hidden||this.context.state!=='running'){this.stop();return;}
  const jumped=this.lastTime===null||time<this.lastTime-.1||time-this.lastTime>1;
  this.lastTime=time;this.active=true;this.heavenly.update(time);this.ascent.update(time);
  const rush=ascentAt(time,this.rushState);const bedGain=1-rush.amount*.5-rush.charge*.25;
  const mix=environmentMix(time),wanted=new Map(mix.map(b=>[b.name,b]));
  for(const layer of mix)this.bed(layer.name);
  // Warm only the next chapter, shortly before its visual crossfade begins.
  const phase=environmentClock(time);
  if(phase>=480&&phase<498)this.bed('heaven');
  const next=[{name:'ash' as EnvironmentBed,start:21},...DESCENT_CHAPTERS.slice(1).map((c,i)=>({name:ENVIRONMENT_BEDS[i+2],start:COSMIC_INTRO_DURATION+c.time-18}))].find(b=>b.start>phase);
  if(next&&next.start-phase<12)this.bed(next.name);
  for(const [name,b] of this.beds){
   const layer=wanted.get(name);b.target=layer?Math.sqrt(layer.weight)*manifest[name].gain*bedGain:0;
   if(!layer){for(const s of b.streams){s.gain.gain.setTargetAtTime(0,this.context.currentTime,.08);if(s.gain.gain.value<.001){s.gain.gain.value=0;s.audio.pause();}}continue;}
   if(jumped){for(const s of b.streams){s.audio.pause();s.gain.gain.value=0;}b.current=0;}
   if(b.streams[b.current].audio.ended){
    b.streams[b.current].gain.gain.value=0;b.current=1-b.current;
   }
   const current=b.streams[b.current],other=b.streams[1-b.current];
   const phase=Math.max(0,time-layer.origin)%(manifest[name].duration-LOOP_OVERLAP);
   this.start(name,current,other.audio.ended?0:phase);
   const remaining=current.audio.duration-current.audio.currentTime;
   let blend=0;
   if(Number.isFinite(remaining)&&remaining<=LOOP_OVERLAP&&!current.audio.paused){
    this.start(name,other,0);
    // Keep the outgoing bed audible if the second stream is still buffering.
    if(!other.audio.paused&&other.audio.readyState>=3)blend=Math.max(0,Math.min(1,(LOOP_OVERLAP-remaining)/LOOP_OVERLAP));
   }
   const smoothing=Math.max(.015,Math.min(.08,dt*2));
   current.gain.gain.setTargetAtTime(b.target*Math.cos(blend*Math.PI/2),this.context.currentTime,smoothing);
   other.gain.gain.setTargetAtTime(b.target*Math.sin(blend*Math.PI/2),this.context.currentTime,smoothing);
  }
 }
 stop(){this.ascent.stop();this.heavenly.stop();this.active=false;this.lastTime=null;for(const b of this.beds.values()){b.target=0;for(const s of b.streams){s.audio.pause();s.gain.gain.cancelScheduledValues(this.context.currentTime);s.gain.gain.value=0;}}}
}
