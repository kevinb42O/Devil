/** Parallel sends preserve the attack and HRTF bearing of the direct sound.
 * Continuous layers get less room than isolated, expressive events. */
export function arenaReverbSend(role:string):{body:number;tail:number}{
 switch(role){
  case 'movement':return {body:.2,tail:.025};
  case 'armor-impact':case 'enemy-damage':case 'ricochet':return {body:.16,tail:.055};
  case 'crystal-hit':return {body:.07,tail:.015};
  case 'weapon-stream':case 'weapon-homing-stream':return {body:.055,tail:.012};
  case 'weapon-start':return {body:.1,tail:.025};
  case 'weapon-release':case 'weapon-burst':case 'homing-launch':return {body:.18,tail:.12};
  case 'enemy-chatter':case 'enemy-feed':return {body:.12,tail:.095};
  case 'enemy-spawn':case 'enemy-burrow':return {body:.2,tail:.24};
  case 'enemy-death':return {body:.15,tail:.13};
  case 'explosion':case 'player-death':case 'upgrade':return {body:.18,tail:.25};
  case 'pickup':return {body:.09,tail:.09};
  case 'crystal-break':return {body:.09,tail:.055};
  case 'entrance-pickup':case 'arrival-laugh':return {body:.16,tail:.2};
  case 'gem-chatter':case 'homing-flight':case 'ambience':return {body:.045,tail:.035};
  default:return {body:0,tail:0};
 }
}

/** Fixed stereo diffuse response with staggered early reflections. A smooth
 * onset avoids a second attack; filtered returns remove rumble and brittle air.
 * RT60 is the time to -60dB, rather than an abruptly cut exponential. */
export function arenaImpulse(context:BaseAudioContext,seconds:number,preDelay:number,seed:number){
 const buffer=context.createBuffer(2,Math.ceil((seconds+preDelay)*context.sampleRate),context.sampleRate);
 for(let channel=0;channel<2;channel++){
  const samples=buffer.getChannelData(channel);let state=(seed+channel*7919)>>>0,smoothed=0;
  const offset=Math.floor(preDelay*context.sampleRate);
  for(let i=offset;i<samples.length;i++){
   state=(Math.imul(state,1664525)+1013904223)>>>0;
   smoothed+=(state/4294967296*2-1-smoothed)*.34;
   const t=(i-offset)/context.sampleRate;
   samples[i]=smoothed*Math.min(1,t/.025)*Math.exp(-6.9078*t/seconds);
  }
  for(const [delay,level] of [[.007,.6],[.019,.4],[.037,.25]]){
   const i=offset+Math.floor((delay+channel*.003)*context.sampleRate);
   if(i<samples.length)samples[i]+=level*(channel?-1:1);
  }
 }
 return buffer;
}

/** Two convolvers per Sound instance, shared by every voice. */
export class ArenaReverb{
 private responses:AudioBuffer[];
 private inputs:GainNode[];
 private returns:{convolver:ConvolverNode;high:BiquadFilterNode;low:BiquadFilterNode;gain:GainNode}[]=[];
 constructor(private context:BaseAudioContext,private destination:AudioNode){
  this.responses=[arenaImpulse(context,.48,.009,1729),arenaImpulse(context,1.75,.027,4271)];
  this.inputs=[context.createGain(),context.createGain()];this.reset();
 }
 connect(output:AudioNode,role:string){
  const profile=arenaReverbSend(role),sends:GainNode[]=[];
  for(const [index,amount] of [profile.body,profile.tail].entries()){
   if(!amount)continue;
   const send=this.context.createGain();send.gain.value=amount;
   output.connect(send);send.connect(this.inputs[index]);sends.push(send);
  }
  return sends;
 }
 reset(){
  for(const input of this.inputs)input.disconnect();
  for(const r of this.returns){r.convolver.disconnect();r.high.disconnect();r.low.disconnect();r.gain.disconnect();}
  this.returns=this.responses.map((response,index)=>{
   const convolver=this.context.createConvolver();convolver.buffer=response;
   const high=this.context.createBiquadFilter();high.type='highpass';high.frequency.value=index?280:180;high.Q.value=.7;
   const low=this.context.createBiquadFilter();low.type='lowpass';low.frequency.value=index?3900:6200;low.Q.value=.7;
   const gain=this.context.createGain();gain.gain.value=index?.72:.85;
   this.inputs[index].connect(convolver);convolver.connect(high);high.connect(low);low.connect(gain);gain.connect(this.destination);
   return {convolver,high,low,gain};
  });
 }
}
