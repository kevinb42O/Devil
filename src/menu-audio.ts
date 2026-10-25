import {ORIGINAL_EFFECTS_HEADROOM} from './audio-mix';
import {remakeAudioAsset,remakeAudioUrl} from './remake-audio';
const MENU_ORIGINAL={uihover:'uihover',uiclick:'uiclick',uislider:'uislider',uiback:'uiclick',uitoggle:'uiclick',uicrown:'uiclick'} as const;
const RECORDINGS=['uihover','uiclick','uislider','uiback','uitoggle','uicrown'] as const;
type Recording=typeof RECORDINGS[number];
export type MenuCue='focus'|'confirm'|'back'|'slider'|'toggle'|'crown';
const CUES:Record<MenuCue,{name:Recording;gain:number;rate:number}>={
 focus:{name:'uihover',gain:1,rate:1},
 confirm:{name:'uiclick',gain:1,rate:1},
 back:{name:'uiback',gain:1,rate:1},
 slider:{name:'uislider',gain:1,rate:1},
 toggle:{name:'uitoggle',gain:1,rate:1},
 crown:{name:'uicrown',gain:1,rate:1},
};

/** UI has its own context: opening settings must never resume suspended arena voices. */
export class MenuAudio{
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private buffers=new Map<Recording,AudioBuffer>();
 private pending=new Map<Recording,Promise<AudioBuffer|undefined>>();
 private voices=new Map<AudioBufferSourceNode,GainNode>();
 private cooldowns=new Map<string,number>();
 private volume=.55;
 private hidden=false;
 private epoch=0;
 private recent:Recording[]=[];
 private lastPlayback:{name:Recording;duration:number;gain:number}|null=null;
 get diagnostics(){return {unlocked:this.context?.state==='running',reverb:false,loaded:[...this.buffers.keys()],voices:this.voices.size,recent:[...this.recent],lastPlayback:this.lastPlayback,volume:this.volume};}
 setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));if(this.master&&this.context)this.master.gain.setTargetAtTime(this.volume*ORIGINAL_EFFECTS_HEADROOM,this.context.currentTime,.015);}
 unlock(){
  if(this.hidden)return;
  if(!this.context){
   this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.volume*ORIGINAL_EFFECTS_HEADROOM;this.master.connect(this.context.destination);

  }
  void this.context.resume().catch(()=>{});
  // The entire compact bank is warm before subsequent navigation gestures.
  for(const name of RECORDINGS)void this.load(name);
 }
 private load(name:Recording):Promise<AudioBuffer|undefined>{
  if(this.buffers.has(name))return Promise.resolve(this.buffers.get(name));
  if(this.pending.has(name))return this.pending.get(name)!;
  const context=this.context;if(!context)return Promise.resolve(undefined);
  const pending=(async()=>{try{
   const response=await fetch(remakeAudioUrl(MENU_ORIGINAL[name]));if(!response.ok)return;
   const buffer=await context.decodeAudioData(await response.arrayBuffer());this.buffers.set(name,buffer);return buffer;
  }catch{return undefined;}finally{this.pending.delete(name);}})();
  this.pending.set(name,pending);return pending;
 }
 cue(kind:MenuCue){
  const context=this.context;if(!context||this.hidden||this.volume===0)return;
  const now=performance.now(),key=kind;
  if(now-(this.cooldowns.get(key)??-Infinity)<(kind==='slider'?120:kind==='focus'?140:65))return;
  // A new panel can appear under the pointer immediately after activation.
  // Keep that incidental hover from adding a second sound to the gesture.
  if(kind==='focus'&&['confirm','back','toggle','crown'].some(key=>now-(this.cooldowns.get(key)??-Infinity)<160))return;
  this.cooldowns.set(key,now);
  const setting=CUES[kind],cue={...setting,gain:setting.gain*remakeAudioAsset(MENU_ORIGINAL[setting.name]).gain},epoch=this.epoch;
  void Promise.all([this.load(cue.name),context.resume().catch(()=>{})]).then(([buffer])=>{
   // Never replay stale navigation after a slow request, mute, or tab switch.
   if(!buffer||epoch!==this.epoch||this.hidden||!this.volume||context.state!=='running'||performance.now()-now>(kind==='focus'||kind==='slider'?180:500))return;
   // A first-click decode must not play its earlier hover on top of confirmation.
   if(kind==='focus'&&['confirm','back','toggle','crown'].some(key=>(this.cooldowns.get(key)??-Infinity)>=now))return;
   if(this.voices.size>=2)return;
   const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=cue.rate;
   const duration=buffer.duration/cue.rate,t=context.currentTime;
   gain.gain.value=cue.gain;
   source.connect(gain);gain.connect(this.master!);this.voices.set(source,gain);
   this.lastPlayback={name:cue.name,duration,gain:cue.gain};
   this.recent.push(cue.name);if(this.recent.length>16)this.recent.shift();
   source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};
   source.start(t);
  });
 }
 setHidden(hidden:boolean){
  this.hidden=hidden;this.epoch++;
  if(hidden){for(const [source,gain] of this.voices){source.stop();source.disconnect();gain.disconnect();}this.voices.clear();void this.context?.suspend();}
  else if(this.context)void this.context.resume().catch(()=>{});
 }
}

/** Delegation also covers dynamically generated lobby and replay controls. */
export function setupMenuAudio(audio:MenuAudio,getVolume:()=>number){
 const panels='#menu,#settings,#player-profile,#leaderboard,#friends,#history,#pause,#death,#death-analysis,#replay-controls,#install-dialog';
 const target=(event:Event)=>{
  const element=event.target instanceof Element?event.target.closest<HTMLElement>('button,summary,select,input[type="range"],input[type="checkbox"]'):null;
  return element?.closest(panels)&&element.getClientRects().length&&!element.matches(':disabled')?element:null;
 };
 let pointerAt=-Infinity;
 const unlock=()=>{audio.setVolume(getVolume());audio.unlock();};
 document.addEventListener('pointerdown',()=>{pointerAt=performance.now();unlock();},{capture:true});
 document.addEventListener('keydown',event=>{unlock();if(event.code==='Escape'&&!event.repeat&&Array.from(document.querySelectorAll<HTMLElement>(panels.replace('#menu,',''))).some(el=>el.getClientRects().length))audio.cue('back');},{capture:true});
 document.addEventListener('pointerover',event=>{const el=target(event);if(event.pointerType!=='touch'&&el&&!el.contains(event.relatedTarget as Node|null)){unlock();audio.cue('focus');}});
 document.addEventListener('focusin',event=>{if(target(event)&&performance.now()-pointerAt>180)audio.cue('focus');});
 document.addEventListener('click',event=>{
  const el=target(event);if(!el||el.matches('input,select'))return;
  unlock();audio.cue(['champion-shrine','leaderboard-open','death-leaderboard'].includes(el.id)?'crown':/close|cancel|leave|quit|home|exit/.test(el.id)?'back':'confirm');
 },{capture:true});
 document.addEventListener('input',event=>{const el=target(event);if(el?.matches('input[type="range"]'))queueMicrotask(()=>{unlock();audio.cue('slider');});},{capture:true});
 document.addEventListener('change',event=>{const el=target(event);if(el?.matches('select,input[type="checkbox"]'))queueMicrotask(()=>{unlock();audio.cue(el.matches('input[type="checkbox"]')?'toggle':'confirm');});},{capture:true});
 document.addEventListener('visibilitychange',()=>audio.setHidden(document.hidden));
}
