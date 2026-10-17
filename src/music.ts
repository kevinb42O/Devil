import {remakeAudioUrl} from './remake-audio';
import menuTheme from './menu-theme.json';
export type MusicScene='menu'|'entrance'|'silent';
/** Stream the licensed stereo soundscapes without decoding them on the game thread. */
export class Music {
 private tracks=new Map<string,HTMLAudioElement>();
 private gains=new Map<string,GainNode>();
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private scene:MusicScene='menu';
 private unlocked=false;
 private hidden=false;
 private volume=.55;
 private failed=new Set<string>();
 private starting=new Set<string>();
 get diagnostics(){return {scene:this.scene,unlocked:this.unlocked,contextState:this.context?.state,hidden:this.hidden,failed:[...this.failed],tracks:[...this.tracks].map(([name,a])=>({name,playing:!a.paused,time:a.currentTime,volume:(this.gains.get(name)?.gain.value??0)*this.volume,ready:a.readyState}))};}
 setVolume(value:number){
  this.volume=Math.max(0,Math.min(1,value));
  if(this.master)this.master.gain.value=this.volume;
  if(this.volume===0)for(const a of this.tracks.values())a.pause();
 }
 setScene(scene:MusicScene){this.scene=scene;}
 setHidden(hidden:boolean){
  this.hidden=hidden;
  if(hidden)for(const [name,a] of this.tracks){a.pause();this.gains.get(name)!.gain.value=0;}
  else if(this.unlocked)void this.context?.resume().catch(()=>{});
 }
 unlock(){
  if(this.hidden)return;
  if(!this.context){
   this.context=new AudioContext();this.master=this.context.createGain();
   this.master.gain.value=this.volume;this.master.connect(this.context.destination);
  }
  void this.context.resume().catch(()=>{});
  this.unlocked=true;this.failed.clear();this.update(0);
 }
 private track(name:string){
  let a=this.tracks.get(name);if(a)return a;
  // Do not delegate track looping to the media backend: some browsers can honor a
  // short embedded loop region instead of the complete recording. Restart only
  // after the media element reaches the actual end of the file.
  a=new Audio();a.loop=false;a.preload='auto';a.src=name==='menutheme'?'/assets/audio/menu/'+menuTheme.file:remakeAudioUrl(name);
  // iOS ignores HTMLMediaElement.volume. Route every stream through Web Audio
  // before playback so neither a new track nor a scene fade bypasses the mixer.
  const gain=this.context!.createGain();gain.gain.value=0;
  this.context!.createMediaElementSource(a).connect(gain);gain.connect(this.master!);
  this.gains.set(name,gain);
  a.addEventListener('error',()=>this.failed.add(name));
  // This is the sole loop path, so a menu cycle always spans the entire source.
  a.addEventListener('ended',()=>this.start(name,a!));
  this.tracks.set(name,a);return a;
 }
 private start(name:string,a:HTMLAudioElement){
  const desired=this.scene==='menu'?'menutheme':this.scene==='entrance'?'menuatmos':null;
  if(name!==desired||this.hidden||this.volume===0||this.starting.has(name)||this.failed.has(name))return;
  if(a.ended)a.currentTime=0;
  this.starting.add(name);void a.play().then(()=>{
   if(this.hidden||this.volume===0||this.scene==='silent')a.pause();
  }).catch(()=>this.failed.add(name)).finally(()=>this.starting.delete(name));
 }
 update(dt:number){
  if(!this.unlocked||this.hidden)return;
  const desired=this.scene==='menu'?'menutheme':this.scene==='entrance'?'menuatmos':null;
  if(desired&&this.volume>0)this.track(desired);
  for(const [name,a] of this.tracks){
   const gain=this.gains.get(name)!.gain;
   const target=name===desired&&this.volume>0?.65:0;
   // Linear fades reach silence, allowing inactive streams to stop completely.
   const step=Math.max(0,dt)*1.3;
   gain.value=target>gain.value?Math.min(target,gain.value+step):Math.max(target,gain.value-step);
   if(name===desired&&this.volume>0&&a.paused)this.start(name,a);
   if(gain.value===0&&(name!==desired||this.volume===0))a.pause();
  }
 }
}
