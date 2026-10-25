import {createHeavenState,heavenAt} from './heaven-state';
import {createDescentState,ENVIRONMENT_CYCLE} from './descent';

/** A restrained threshold bell and low support beneath the sourced ethereal choir. */
export class HeavenAudio {
 private state=createHeavenState();private sky=createDescentState();
 private voices:OscillatorNode[]=[];private bells:{osc:OscillatorNode;gain:GainNode}[]=[];
 private gain:GainNode;private lastTime:number|null=null;
 constructor(private context:AudioContext,private output:AudioNode){this.gain=context.createGain();this.gain.gain.value=0;this.gain.connect(output);}
 update(time:number){
  const s=heavenAt(time,this.state,this.sky),now=this.context.currentTime;
  if(s.gate>.001&&this.voices.length===0){
   for(const frequency of [92.4986,138.5913,184.9972])for(const detune of [-3,3]){
    const osc=this.context.createOscillator();osc.type='sine';osc.frequency.value=frequency;osc.detune.value=detune;osc.connect(this.gain);osc.start();this.voices.push(osc);
   }
  }
  this.gain.gain.setTargetAtTime(s.presence*.004,now,.22);
  const threshold=Math.floor(time/ENVIRONMENT_CYCLE)*ENVIRONMENT_CYCLE+496;
  if(this.lastTime!==null&&time>=threshold&&this.lastTime<threshold&&time-this.lastTime<1)this.bell();
  this.lastTime=time;
  if(s.gate<.001&&this.voices.length){for(const osc of this.voices){osc.stop();osc.disconnect();}this.voices=[];}
 }
 private bell(){
  const now=this.context.currentTime;
  for(const [ratio,volume] of [[1,.13],[2.76,.045],[5.4,.018]]){
   const osc=this.context.createOscillator(),gain=this.context.createGain();osc.frequency.value=92.4986*ratio;
   gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+5);
   osc.connect(gain);gain.connect(this.output);osc.start(now);osc.stop(now+5.1);
   const voice={osc,gain};this.bells.push(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();this.bells=this.bells.filter(b=>b!==voice);};
  }
 }
 stop(){
  this.lastTime=null;this.gain.gain.cancelScheduledValues(this.context.currentTime);this.gain.gain.value=0;
  for(const osc of this.voices){osc.stop();osc.disconnect();}this.voices=[];
  for(const bell of this.bells){bell.osc.onended=null;bell.osc.stop();bell.osc.disconnect();bell.gain.disconnect();}this.bells=[];
 }
}
