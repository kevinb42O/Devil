import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();await page.route('**/cutoff-audit',r=>r.fulfill({contentType:'text/html',body:'<title>Spatial cutoff regression</title>'}));await page.goto('http://127.0.0.1:5173/cutoff-audit');
 const result=await page.evaluate(async()=>{
  const [{Sound,SOUND_NAMES},{hearingProfile},{REMAKE_AUDIO},{World,v}]=await Promise.all([import('/src/audio.ts'),import('/src/spatial-audio.ts'),import('/src/remake-audio.ts'),import('/src/simulation.ts')]);
  const sound=new Sound();await sound.start();const live=sound.context,liveMaster=sound.master,liveReverb=sound.reverb;
  const {ArenaReverb}=await import('/src/arena-reverb.ts');
  const check=(value,message)=>{if(!value)throw Error(message);};let checked=0;
  for(const name of SOUND_NAMES){
   const range=hearingProfile(name,REMAKE_AUDIO[name].role).maxDistance;
   sound.listener(v(),0,0);sound.clear();
   sound.oneShot(name,v(range,0,0));check(sound.shots.size===0,name+' distant shot rejected');
   sound.loop('test',name,v(0,range,0));check(!sound.loops.has('test'),name+' distant loop rejected');
   checked++;
  }
  await sound.load('chatterskull');
  sound.listener(v(),0,0);sound.oneShot('chatterskull',v(5,0,0));const voice=[...sound.shots][0];
  check(voice.panner.panningModel==='HRTF','HRTF graph');check(voice.spatialGain.gain.value===1,'near voice audible');
  sound.listener(v(100,0,0),0,0);await new Promise(r=>setTimeout(r,40));check(voice.spatialGain.gain.value===0,'playing shot muted on listener movement');
  sound.listener(v(),0,0);await new Promise(r=>setTimeout(r,40));check(voice.spatialGain.gain.value===1,'playing shot audible on return');sound.clear();
  // Render the actual playback graph, including its distance envelope, offline.
  async function render(distance){
   const c=new OfflineAudioContext(2,24000,48000);Object.defineProperty(c,'state',{value:'running'});sound.context=c;sound.master=c.createGain();sound.master.connect(c.destination);sound.reverb=new ArenaReverb(c,sound.master);sound.listener(v(),0,0);
   sound.oneShot('chatterskull',v(distance,0,0));const out=await c.startRendering();sound.clear();
   return Math.sqrt(out.getChannelData(0).reduce((sum,x)=>sum+x*x,0)/out.length);
  }
  const near=await render(5),edge=await render(27.9),far=await render(28),beyond=await render(200);
  check(near>0,'near render has audio');check(edge<near*.001,'boundary fades smoothly');check(far===0&&beyond===0,'rendered cutoff is digital silence');
  sound.context=live;sound.master=liveMaster;sound.reverb=liveReverb;sound.listener(v(100,2,0),0,0);
  const world=new World(1,{schedule:false}),enemy=world.spawn('skull',v(103,2,0));enemy.age=20;
  sound.update(world);check(sound.loops.has(enemy.id),'spectator selects near camera enemy');
  sound.listener(v(),0,0);sound.update(world);check(!sound.loops.has(enemy.id),'spectator excludes enemy near old camera');sound.clear();
  // Remote sources outside hearing range cannot duck nearby effects.
  world.addCrew('host');world.addCrew('guest');world.selectCrew('host');world.crew[1].player.pos=v(200,0,0);
  const original=world.weaponAudioFor.bind(world);world.weaponAudioFor=crew=>crew.id==='guest'?{primary:true,homing:false}:original(crew);
  check(!sound.sustainedFire(world),'inaudible remote weapon does not duck mix');
  sound.clear();sound.listener(v(),0,0);await sound.load('daggerhit1');
  sound.oneShot('daggerhit1',v(8,0,0),1,0,.08);sound.oneShot('daggerhit1',v(-8,0,0),1,0,.08);
  check(sound.shots.size===2,'different impact areas keep separate cooldowns');
  sound.oneShot('daggerhit1',v(8,0,0),1,0,.08);check(sound.shots.size===2,'same impact area remains throttled');sound.clear();
  await sound.load('shot1');sound.play({kind:'burst',shooterId:'departed-guest',level:1,amount:0,pos:v(200,0,0)},world);
  check(sound.shots.size===0,'late departed-player event cannot become direct local audio');
  await live.close();return {cues:checked,near,edge,far,beyond};
 });
 assert(result.cues>200);console.log('Spatial cutoff, active voice movement, spectator and remote mix checks passed:',result);
}finally{await browser.close();}
