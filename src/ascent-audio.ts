import {ascentAt,createAscentState} from './ascent-state';
import manifest from './ascent-audio-manifest.json';

/** One authored launch track, positioned by match phase for pause, seeks and loops. */
export class AscentAudio {
 private buffer:AudioBuffer|null=null;private loading=false;private failed=false;
 private voice:AudioBufferSourceNode|null=null;private gain:GainNode;
 private lastTime:number|null=null;private state=createAscentState();private offset=0;
 private retryAt=0;
 constructor(private context:AudioContext,output:AudioNode){this.gain=context.createGain();this.gain.gain.value=manifest.gain;this.gain.connect(output);}
 private load(){
  if(this.loading||this.buffer||performance.now()<this.retryAt)return;
  this.loading=true;
  void fetch('/assets/audio/environment/'+manifest.file).then(r=>{if(!r.ok)throw Error('Ascent audio '+r.status);return r.arrayBuffer();}).then(data=>this.context.decodeAudioData(data)).then(buffer=>{this.buffer=buffer;this.failed=false;}).catch(()=>{this.failed=true;this.retryAt=performance.now()+5000;}).finally(()=>{this.loading=false;});
 }
 update(time:number){
  const s=ascentAt(time,this.state),phase=s.phase;
  if(phase>=474&&phase<494)this.load();
  const jumped=this.lastTime===null||time<this.lastTime-.05||time-this.lastTime>.5;
  this.lastTime=time;
  if(!s.audio||this.context.state!=='running'){this.release();return;}
  if(jumped)this.release();
  if(!this.voice&&this.buffer){
   const voice=this.context.createBufferSource();voice.buffer=this.buffer;voice.connect(this.gain);
   this.offset=Math.max(0,phase-manifest.origin);voice.start(0,Math.min(this.offset,this.buffer.duration-.01));
   this.voice=voice;voice.onended=()=>{if(this.voice===voice)this.voice=null;voice.disconnect();};
  }
 }
 private release(){if(this.voice){this.voice.onended=null;this.voice.stop();this.voice.disconnect();this.voice=null;}}
 stop(){this.release();this.lastTime=null;}
 get diagnostics(){return {playing:!!this.voice,loaded:!!this.buffer,loading:this.loading,failed:this.failed,offset:this.offset,phase:this.state.phase};}
}
