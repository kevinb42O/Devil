import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/environment-audio-test',r=>r.fulfill({contentType:'text/html',body:'<button>Listen</button>'}));
 await page.goto(base+'/environment-audio-test');
 await page.evaluate(async()=>{
  const {EnvironmentAudio}=await import('/src/environment-audio.ts');
  window.c=new AudioContext();window.master=c.createGain();master.gain.value=.55;
  window.analyser=c.createAnalyser();analyser.fftSize=4096;master.connect(analyser);analyser.connect(c.destination);
  window.bedOutputs=new Map();const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
   if(this instanceof MediaElementAudioSourceNode&&this.mediaElement.src.includes('/audio/environment/')){
    const meter=this.context.createAnalyser();meter.fftSize=4096;connect.call(destination,meter);
    const name=this.mediaElement.src.split('/').pop().replace(/(?:-v2|-[a-f0-9]{10})?\.m4a$/,'');
    if(!bedOutputs.has(name))bedOutputs.set(name,[]);bedOutputs.get(name).push(meter);
   }
   return connect.call(this,destination,...args);
  };
  window.bedRms=name=>Math.max(0,...(bedOutputs.get(name)||[]).map(a=>{const x=new Float32Array(4096);a.getFloatTimeDomainData(x);return Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);}));
  window.ambience=new EnvironmentAudio(c,master);window.time=null;window.advance=0;
  window.peak=()=>{const x=new Float32Array(4096);analyser.getFloatTimeDomainData(x);return Math.max(...x.map(Math.abs));};
  document.querySelector('button').onclick=()=>c.resume();
  window.timer=setInterval(()=>{if(window.time!==null)window.time+=window.advance;ambience.update(window.time,.02);},20);
 });
 await page.click('button');const results=[];
 for(const [name,time] of [['space',0],['ash',35],['storm',80],['veil',150],['furnace',270],['cathedral',390],['depth',480],['heaven',504]]){
  await page.evaluate(t=>window.time=t,time);
  await page.waitForFunction(name=>ambience.diagnostics.beds.some(b=>b.name===name&&b.streams.some(s=>s.playing&&s.ready>=3&&s.gain>.07))&&peak()>.001,name);
  results.push(await page.evaluate(()=>({time,peak:peak(),...ambience.diagnostics})));
 }
 // Force a long-bed wrap; both sources must play during the four-second overlap.
 await page.evaluate(()=>window.time=480);
 await page.waitForFunction(()=>{const b=ambience.beds.get('depth'),s=b?.streams[b.current];return b.target>.1&&s&&!s.starting&&!s.audio.paused&&s.gain.gain.value>.1&&s.audio.currentTime>25&&s.audio.currentTime<40;});
 await page.evaluate(()=>{const b=ambience.beds.get('depth');b.streams[b.current].audio.currentTime=117;});
 await page.waitForFunction(()=>ambience.diagnostics.beds.find(b=>b.name==='depth').streams.every(s=>s.playing&&s.gain>.02));
 await page.waitForFunction(()=>{const b=ambience.beds.get('depth');return b.streams[b.current].audio.currentTime<8;},null,{timeout:10000});
 assert.ok(await page.evaluate(()=>peak()>.001));
 // Traverse every handover with small continuous clock steps, never a direct seek.
 const transitions=[];
 for(const [start,end,outgoing,incoming] of [[21,30,'space','ash'],[51,69,'ash','storm'],[126,144,'storm','veil'],[241,259,'veil','furnace'],[362,380,'furnace','cathedral'],[454,472,'cathedral','depth'],[492,498,'space','heaven'],[510,528,'heaven','space']]){
  await page.evaluate(t=>{window.advance=0;window.time=t;},start-1);
  await page.waitForFunction(name=>bedRms(name)>.001,outgoing);
  await page.evaluate(()=>window.advance=.1);
  await page.waitForFunction(({start,end,incoming})=>time>(start+end)/2&&bedRms(incoming)>.001,{start,end,incoming});
  const middle=await page.evaluate(({outgoing,incoming})=>({time,peak:peak(),outgoingRms:bedRms(outgoing),incomingRms:bedRms(incoming)}),{outgoing,incoming});
  assert.ok(middle.peak<.065,'ambience stays below the lowered mix ceiling');
  await page.waitForFunction(({end,incoming})=>time>end+1&&bedRms(incoming)>.005,{end,incoming});
  await page.evaluate(()=>window.advance=0);await page.waitForTimeout(650);
  assert.ok(await page.evaluate(name=>ambience.diagnostics.beds.find(b=>b.name===name).streams.every(s=>!s.playing&&s.gain===0),outgoing),'outgoing bed stops after handover');
  transitions.push({outgoing,incoming,middle,after:await page.evaluate(name=>({time,rms:bedRms(name),peak:peak()}),incoming)});
 }
 results.push({continuousTransitions:transitions});
 // Pause, restart, backwards seek and hidden tab must release every stream.
 await page.evaluate(()=>window.time=null);await page.waitForFunction(()=>ambience.diagnostics.beds.every(b=>b.streams.every(s=>!s.playing&&s.gain===0)));
 await page.evaluate(()=>window.time=25.5);await page.waitForFunction(()=>ambience.diagnostics.beds.filter(b=>b.weight>0).length===2&&peak()>.001);
 await page.evaluate(()=>master.gain.value=0);await page.waitForFunction(()=>peak()===0);
 await page.evaluate(()=>{master.gain.value=.55;Object.defineProperty(document,'hidden',{configurable:true,value:true});});
 await page.waitForFunction(()=>ambience.diagnostics.beds.every(b=>b.streams.every(s=>!s.playing)));
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:false}));await page.waitForFunction(()=>peak()>.001);
 assert.deepEqual(await page.evaluate(()=>ambience.diagnostics.failed),[]);assert.deepEqual(errors,[]);
 mkdirSync('artifacts/environment-audio',{recursive:true});writeFileSync('artifacts/environment-audio/browser-report.json',JSON.stringify(results,null,2));
 // Use the normal entrance and countdown: previews skip the retained start timestamp.
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Environment audit',automatic:false,configured:true}));
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:55,musicVolume:0}));
  window.environmentOutputs=[];const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
   if(this instanceof MediaElementAudioSourceNode&&this.mediaElement.src.includes('/audio/environment/')){
    const analyser=this.context.createAnalyser();analyser.fftSize=4096;connect.call(destination,analyser);window.environmentOutputs.push(analyser);
   }
   return connect.call(this,destination,...args);
  };
  window.environmentPeak=()=>Math.max(0,...environmentOutputs.map(a=>{const x=new Float32Array(4096);a.getFloatTimeDomainData(x);return Math.max(...x.map(Math.abs));}));
 });
 await page.goto(base);await page.waitForFunction(()=>window.abyss?.originalAssets&&!document.querySelector('#start').disabled);
 await page.click('#start');await page.waitForFunction(()=>window.abyss.entrance);
 assert.equal(await page.evaluate(()=>window.abyss.audio.environment?.active),false,'entrance has its own atmosphere');
 await page.keyboard.down('KeyW');await page.waitForFunction(()=>!window.abyss.entrance);await page.keyboard.up('KeyW');
 await page.waitForFunction(()=>window.abyss.time>.1&&window.abyss.audio.environment?.beds.some(b=>b.name==='space'&&b.streams.some(s=>s.playing&&s.gain>.1)));
 await page.waitForFunction(()=>window.environmentPeak()>.001);
 assert.ok(await page.evaluate(()=>window.abyss.music.tracks.every(t=>!t.playing)),'environment plays with music muted');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.abyss.mode==='paused'&&!window.abyss.audio.environment.active);
 await page.click('#resume');await page.waitForFunction(()=>window.abyss.audio.environment.active);
 await page.keyboard.press('Escape');await page.click('#quit');await page.waitForFunction(()=>window.abyss.mode==='menu'&&!window.abyss.audio.environment.active);
 assert.deepEqual(errors,[]);
 console.log('Eight long stereo beds produce real samples; transitions, overlapping loop, seek, pause, hidden, mute and game lifecycle passed.');
}finally{await browser.close();}
