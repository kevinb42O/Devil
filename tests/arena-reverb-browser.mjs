import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/reverb-audit',r=>r.fulfill({contentType:'text/html',body:'<title>Arena reverb audit</title>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/reverb-audit');
 const result=await page.evaluate(async()=>{
  const {ArenaReverb,arenaReverbSend}=await import('/src/arena-reverb.ts'),{Sound}=await import('/src/audio.ts');
  const check=(v,m)=>{if(!v)throw Error(m);};
  const rms=(buffer,start,end)=>{
   const data=buffer.getChannelData(0).subarray(Math.floor(start*buffer.sampleRate),Math.floor(end*buffer.sampleRate));
   return Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length);
  };
  async function impulse({reset=false,mute=false,role='enemy-spawn'}={}){
   const c=new OfflineAudioContext(2,48000*3,48000),master=c.createGain();master.gain.value=mute?0:1;master.connect(c.destination);
   const room=new ArenaReverb(c,master),source=c.createBufferSource();source.buffer=c.createBuffer(1,1,48000);source.buffer.getChannelData(0)[0]=1;
   room.connect(source,role);source.start();
   if(reset){const suspended=c.suspend(.25);const rendering=c.startRendering();await suspended;room.reset();await c.resume();return rendering;}
   return c.startRendering();
  }
  const tail=await impulse(),cleared=await impulse({reset:true}),muted=await impulse({mute:true}),ui=await impulse({role:'countdown'});
  check(rms(tail,.1,.3)>0,'reflections audible');check(rms(tail,.4,.8)>rms(tail,1.3,1.7)*3,'tail decays');
  check(rms(cleared,.3,2)===0,'clear removes existing convolution tails');check(rms(muted,0,3)===0,'master mute silences wet output');check(rms(ui,0,3)===0,'countdown stays dry');
  check(arenaReverbSend('weapon-stream').tail<arenaReverbSend('enemy-spawn').tail/10,'streams retain restrained tails');
  const live=new Sound();await live.start();const names=['shot1','spawnminisquid','land','gibcollect','levelup2'];for(const name of names)await live.load(name);
  async function sequence(wet){
   const c=new OfflineAudioContext(2,48000*9,48000);Object.defineProperty(c,'state',{value:'running'});
   const sound=new Sound();sound.context=c;sound.master=c.createGain();sound.master.gain.value=.55;sound.master.connect(c.destination);sound.buffers=live.buffers;
   if(wet)sound.reverb=new ArenaReverb(c,sound.master);
   // Schedule the real playback graph at suspended audio-clock boundaries.
   const rendering=c.suspend(0);const output=c.startRendering();await rendering;
   for(let i=0;i<names.length;i++){
    sound.oneShot(names[i]);
    if(i<names.length-1){const next=c.suspend((i+1)*1.4);await c.resume();await next;}
   }
   await c.resume();return output;
  }
  const dry=await sequence(false),wet=await sequence(true);
  let peak=0,difference=0;for(let ch=0;ch<2;ch++)for(let i=0;i<wet.length;i++){peak=Math.max(peak,Math.abs(wet.getChannelData(ch)[i]));difference+=Math.abs(wet.getChannelData(ch)[i]-dry.getChannelData(ch)[i]);}
  check(peak<.98,'authored cue sequence keeps headroom');check(difference>1,'live Sound routes through reverb');
  const channels=[[],[]];for(let ch=0;ch<2;ch++)channels[ch]=[...dry.getChannelData(ch),...new Float32Array(24000),...wet.getChannelData(ch)];
  live.clear();await live.context.close();return {peak,difference,tailRms:rms(tail,.4,.8),channels};
 });
 assert.deepEqual(errors,[]);const {channels,...report}=result;
 const frames=channels[0].length,wav=Buffer.alloc(44+frames*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(192000,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,channels[ch][i]))*32767),44+i*4+ch*2);
 mkdirSync('artifacts/arena-reverb',{recursive:true});writeFileSync('artifacts/arena-reverb/dry-then-reverb.wav',wav);writeFileSync('artifacts/arena-reverb/audit.json',JSON.stringify(report,null,2));console.log('Arena reverb routing, decay, clear, mute and headroom passed:',report);
}finally{await browser.close();}
