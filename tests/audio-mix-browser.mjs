import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/mix-audit',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Combat mix regression</title>'}));
 await page.goto(base+'/mix-audit');
 const report=await page.evaluate(async()=>{
  const [{Sound},{World,idleInput,v},{ArenaReverb}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts'),import('/src/arena-reverb.ts')]);
  const check=(value,message)=>{if(!value)throw Error(message);};
  const sound=new Sound();await sound.start();
  const {ALL_FOOTSTEP_SOUNDS}=await import('/src/footstep-audio.ts');
  const gemNames=['gibcollect','gibcollect2','gibcollect3','gibcollectmagic','gibcollectmagic2','gibcollectmagic3','crystalhit1','crystalhit2','crystalhit3','crystalbreak1','crystalbreak2','crystalbreak3','gemchatter'];
  await Promise.all([...Array.from({length:7},(_,i)=>[`rapid${i+1}`,`shot${i+1}`,i?'levelup'+(i+1):'leveldown']).flat(),'killskull1','magentadetonate1','daggerdrone',...ALL_FOOTSTEP_SOUNDS,...gemNames].map(name=>sound.load(name)));
  const render=async(name,seconds,begin=0,end=seconds,scale=1)=>{
   const c=new OfflineAudioContext(2,Math.ceil(seconds*48000),48000),source=c.createBufferSource(),gain=c.createGain();
   source.buffer=sound.buffers.get(name);gain.gain.value=sound.volumeFor(name)*.55*scale;source.connect(gain);gain.connect(c.destination);source.start();
   const out=await c.startRendering();let energy=0,peak=0,count=0;
   for(let ch=0;ch<2;ch++){const data=out.getChannelData(ch);for(let i=Math.floor(begin*48000);i<Math.min(data.length,end*48000);i++){energy+=data[i]**2;peak=Math.max(peak,Math.abs(data[i]));count++;}}
   return {rms:Math.sqrt(energy/count),peak};
  };
  const tiers=[];
  for(let level=1;level<=7;level++){
   const stream=await render('rapid'+level,2,.25,1.75),burst=await render('shot'+level,1,0,.5);
   const burstDb=20*Math.log10(burst.rms/stream.rms);
   check(burstDb>0&&burstDb<9,'shotgun stays expressive without a large volume jump at hand '+level+': '+burstDb);
   const upgrade=await render(level===1?'leveldown':'levelup'+level,6);
   const upgradeDb=20*Math.log10(upgrade.rms/stream.rms);
   check(upgradeDb<9,'upgrade cannot bury sustained fire at hand '+level+': '+upgradeDb);
   check(Math.max(stream.peak,burst.peak,upgrade.peak)<.25,'individual cues retain mix headroom');
   tiers.push({level,stream,burst,upgrade,burstDb,upgradeDb});
  }
  const feedback=[];
  for(const name of [...ALL_FOOTSTEP_SOUNDS,...gemNames]){
   const footstep=name.startsWith('footstep-'),duration=sound.buffers.get(name).duration;
   const output=await render(name,duration,0,footstep?Math.min(.15,duration):duration,footstep?.9:1),relativeDb=20*Math.log10(output.rms/tiers[0].stream.rms);
   check(relativeDb>(footstep?-20:-12),name+' must remain audible alongside sustained fire: '+relativeDb);
   check(relativeDb<(footstep?-7:3),name+' stays a supporting cue: '+relativeDb);
   feedback.push({name,...output,relativeDb});
  }
  // Render real live-mixer routing, HRTF, reverb and overlapping enemy deaths.
  // Each run uses an offline context so the same attack timing is repeatable.
  const crowd=async(count)=>{
   const c=new OfflineAudioContext(2,48000,48000),s=new Sound();s.context=c;s.buffers=sound.buffers;s.master=c.createGain();s.master.gain.value=.55;s.master.connect(c.destination);s.reverb=new ArenaReverb(c,s.master);
   // Offline contexts are suspended until rendering, so play while scheduling
   // through the same mixer with the running-state check supplied by this proxy.
   s.context=new Proxy(c,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
   const w=new World(1,{schedule:false});s.listener(v(),0,0);
   for(let i=0;i<count;i++)s.play({kind:'kill',enemy:'skull',pos:v(0,0,-4)},w);
   const out=await c.startRendering();let peak=0,energy=0;
   for(let ch=0;ch<2;ch++)for(const sample of out.getChannelData(ch)){energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
   return {peak,rms:Math.sqrt(energy/(out.length*2))};
  };
  const one=crowd(1),many=crowd(24),[single,dense]=await Promise.all([one,many]);
  check(dense.rms/single.rms<9,'dense kills do not add at full gain');check(dense.peak<.65,'dense deaths retain headroom before limiting');
  sound.clear();const w=new World(1,{schedule:false,invulnerable:true});sound.listener(w.player.pos,0,0);
  for(let i=0;i<35;i++)w.step({...idleInput(),fire:true});sound.update(w);
  await new Promise(r=>setTimeout(r,400));const fighting=sound.environmentGain.gain.value;
  w.step(idleInput());sound.update(w);await new Promise(r=>setTimeout(r,1300));const quiet=sound.environmentGain.gain.value;
  check(fighting<.42&&quiet>.68,'environment steps back during fire and recovers after release');
  sound.clear();
  const flightGain=async(count)=>{
   w.projectiles=[];for(let i=0;i<count;i++)w.projectiles.push({id:100+i,pos:{...w.player.pos},vel:v(),age:0,homing:true,level:2});
   sound.update(w);await new Promise(r=>setTimeout(r,100));
   const voices=[...sound.loops.values()].filter(voice=>voice.name==='daggerdrone');
   return voices.reduce((sum,voice)=>sum+voice.gain.gain.value**2,0);
  };
  const flightOne=await flightGain(1);sound.clear();const flightEight=await flightGain(8);
  check(Math.abs(flightEight/flightOne-1)<.02,'eight homing flights share one power budget');
  sound.clear();await sound.context.close();return {tiers,feedback,single,dense,environment:{fighting,quiet},flight:{one:flightOne,eight:flightEight}};
 });
 assert.deepEqual(errors,[]);mkdirSync('artifacts/audio-mix',{recursive:true});writeFileSync('artifacts/audio-mix/audit.json',JSON.stringify(report,null,2)+'\n');
 console.log('Combat mix passed: seven rendered hand balances, dense positional kills with reverb, environment duck/recovery and homing crowd power.');
}finally{await browser.close();}
