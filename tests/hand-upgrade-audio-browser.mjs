import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/hand-upgrade-audio-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Upgrade sound regression</title>'}));await page.goto(base+'/hand-upgrade-audio-test');
 const report=await page.evaluate(async()=>{
  const [{Sound},{World,v}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts')]);
  const check=(v,m)=>{if(!v)throw Error(m);},sound=new Sound();await sound.start();
  const world=new World(71,{schedule:false}),rendered=[];
  for(let level=2;level<=7;level++)await sound.load('levelup'+level);
  for(let level=2;level<=7;level++){
   sound.clear();world.level=level;sound.play({kind:'upgrade',level,amount:level,pos:world.player.pos},world);
   const voice=[...sound.shots][0];check(voice.name==='levelup'+level&&voice.rate===1,'hand '+level+' has its own native recording');check(!voice.panner,'local transformation is centered');
   const buffer=voice.source.buffer;check(buffer.numberOfChannels===2,'stereo body/room');check(buffer.duration>=2.69,'long transformation');
   const offline=new OfflineAudioContext(2,Math.ceil((buffer.duration+.1)*48000),48000),source=offline.createBufferSource(),gain=offline.createGain();
   source.buffer=buffer;gain.gain.value=voice.gain.gain.value*.55;source.connect(gain);gain.connect(offline.destination);source.start();
   const output=await offline.startRendering();let peak=0,energy=0,late=0,width=0;
   const a=output.getChannelData(0),b=output.getChannelData(1);
   for(let i=0;i<a.length;i++){peak=Math.max(peak,Math.abs(a[i]),Math.abs(b[i]));energy+=a[i]**2;width+=(a[i]-b[i])**2;if(i>48000*1.2&&i<48000*2.2)late+=a[i]**2;}
   const rms=Math.sqrt(energy/a.length);check(rms>.018,'powerful hand '+level+' output');check(peak<.4,'hand '+level+' retains headroom');check(late>1,'hand '+level+' has sustained body after attack');check(width>.01,'dark stereo room');rendered.push({level,name:voice.name,duration:buffer.duration,rms,peak,late,width});
  }
  // Newer cold upgrades cancel older loads; stale audio cannot play after restart.
  sound.clear();const originalFetch=window.fetch;window.fetch=async(...args)=>{if(/\/levelup[23]\.wav$/.test(String(args[0])))await new Promise(r=>setTimeout(r,180));return originalFetch(...args);};
  try{
   sound.buffers.delete('levelup2');sound.buffers.delete('levelup3');
   sound.play({kind:'upgrade',amount:2,pos:v()},world);sound.play({kind:'upgrade',amount:3,pos:v()},world);
   await Promise.all([...sound.pending.values()]);check(sound.diagnostics.oneShotNames.join(',')==='levelup3','latest cold upgrade wins');
   sound.clear();sound.buffers.delete('levelup2');sound.play({kind:'upgrade',amount:2,pos:v()},world);const pending=sound.pending.get('levelup2');sound.clear();await pending;check(sound.shots.size===0,'restart cancels cold cue');
  }finally{window.fetch=originalFetch;}
  // A teammate's transformation must not fade the local transformation.
  const crew=new World(3,{schedule:false});crew.addCrew('host');crew.addCrew('guest');crew.selectCrew('host');
  sound.play({kind:'upgrade',amount:5,shooterId:'host',pos:crew.player.pos},crew);const local=[...sound.shots][0];
  sound.play({kind:'upgrade',amount:7,shooterId:'guest',pos:v(12,2,0)},crew);await new Promise(r=>setTimeout(r,100));
  check(sound.shots.has(local)&&!local.ended,'remote upgrade preserves local roar');check([...sound.shots].some(v=>v.name==='levelup7'&&v.panner),'remote upgrade is spatial');
  sound.play({kind:'upgrade',amount:6,shooterId:'host',pos:crew.player.pos},crew);await new Promise(r=>setTimeout(r,100));
  check(!sound.shots.has(local),'new local hand fades previous transformation');check(sound.diagnostics.oneShotNames.includes('levelup6')&&sound.diagnostics.oneShotNames.includes('levelup7'),'local and remote transformations remain independent');
  sound.clear();for(let i=0;i<6;i++){world.level=i+1;sound.update(world);await Promise.all([...sound.pending.values()]);check(sound.buffers.has('levelup'+(i+2)),'next hand prewarms '+(i+2));}
  sound.clear();return {rendered,coldSupersession:true,restartCancellation:true,independentCrewVoices:true,nextHandPrewarm:true};
 });
 assert.deepEqual(errors,[]);mkdirSync('artifacts/hand-upgrade-audio',{recursive:true});writeFileSync('artifacts/hand-upgrade-audio/audit.json',JSON.stringify(report,null,2)+'\n');console.log('Six distinct hand upgrades passed: full-length stereo rendering, sustained body/headroom, native tier routing, delayed loading/supersession/restart, crew isolation and prewarming.');
}finally{await browser.close();}
