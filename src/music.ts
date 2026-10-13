export type MusicScene='menu'|'entrance'|'silent';
const ROOT='/assets/original/devil-daggers/audio/';
/** Stream the original long stereo recordings without decoding them on the game thread. */
export class Music {
 private tracks=new Map<string,HTMLAudioElement>();
 private scene:MusicScene='menu';
 private unlocked=false;
 private hidden=false;
 private volume=.55;
 private failed=new Set<string>();
 private starting=new Set<string>();
 get diagnostics(){return {scene:this.scene,unlocked:this.unlocked,hidden:this.hidden,failed:[...this.failed],tracks:[...this.tracks].map(([name,a])=>({name,playing:!a.paused,time:a.currentTime,volume:a.volume,ready:a.readyState}))};}
 setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));}
 setScene(scene:MusicScene){this.scene=scene;}
 setHidden(hidden:boolean){this.hidden=hidden;if(hidden)for(const a of this.tracks.values()){a.pause();a.volume=0;}}
 unlock(){this.unlocked=true;this.failed.clear();this.update(0);}
 private track(name:string){
  let a=this.tracks.get(name);if(a)return a;
  a=new Audio(ROOT+name+'.wav');a.loop=true;a.preload='none';a.volume=0;
  a.addEventListener('error',()=>this.failed.add(name));this.tracks.set(name,a);return a;
 }
 update(dt:number){
  if(!this.unlocked||this.hidden)return;
  const desired=this.scene==='menu'?'menutheme':this.scene==='entrance'?'menuatmos':null;
  if(desired&&this.volume>0)this.track(desired);
  for(const [name,a] of this.tracks){
   const target=name===desired?this.volume*.65:0;
   // Linear fades reach silence, allowing inactive streams to stop completely.
   const step=Math.max(0,dt)*1.3;
   a.volume=target>a.volume?Math.min(target,a.volume+step):Math.max(target,a.volume-step);
   if(name===desired&&this.volume>0&&a.paused&&!this.starting.has(name)&&!this.failed.has(name)){
    this.starting.add(name);void a.play().then(()=>{if(this.hidden)a.pause();}).catch(()=>this.failed.add(name)).finally(()=>this.starting.delete(name));
   }
   if(a.volume===0&&(name!==desired||this.volume===0))a.pause();
  }
 }
}
