import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:5173/music-test',r=>r.fulfill({contentType:'text/html',body:'<button id="unlock">Play</button>'}));
 await page.goto('http://127.0.0.1:5173/music-test');
 await page.evaluate(async()=>{const {Music}=await import('/src/music.ts');window.music=new Music();document.querySelector('button').onclick=()=>music.unlock();window.tick=setInterval(()=>music.update(.02),20);});
 assert.equal(await page.evaluate(()=>music.diagnostics.tracks.length),0,'no download before gesture');
 await page.click('#unlock');
 await page.waitForFunction(()=>music.diagnostics.tracks.some(t=>t.name==='menutheme'&&t.time>.1&&t.volume>0));
 await page.evaluate(()=>music.setScene('entrance'));
 await page.waitForFunction(()=>music.diagnostics.tracks.some(t=>t.name==='menuatmos'&&t.time>.1&&t.volume>0)&&music.diagnostics.tracks.find(t=>t.name==='menutheme').playing===false);
 await page.evaluate(()=>music.setHidden(true));assert.ok(await page.evaluate(()=>music.diagnostics.tracks.every(t=>!t.playing)));
 await page.evaluate(()=>music.setHidden(false));await page.waitForFunction(()=>music.diagnostics.tracks.find(t=>t.name==='menuatmos').playing);
 await page.evaluate(()=>music.setScene('silent'));await page.waitForFunction(()=>music.diagnostics.tracks.every(t=>!t.playing&&t.volume===0));
 await page.evaluate(()=>{music.setVolume(0);music.setScene('menu');});
 await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>music.diagnostics.tracks.every(t=>!t.playing)));
 await page.evaluate(()=>music.setVolume(1));await page.waitForFunction(()=>music.diagnostics.tracks.find(t=>t.name==='menutheme').volume>.6);
 // Confirm the complete recording loops, rather than a short preview clip.
 assert.ok(await page.evaluate(()=>music.tracks.get('menutheme').duration>107),'the complete menu recording is available');
 await page.evaluate(()=>{const a=music.tracks.get('menutheme');a.currentTime=a.duration-.15;});
 await page.waitForFunction(()=>music.diagnostics.tracks.find(t=>t.name==='menutheme').time<2);
 // Recover if a media backend ends a WAV despite its loop setting.
 await page.evaluate(()=>{const a=music.tracks.get('menutheme');a.loop=false;a.currentTime=a.duration-.05;});
 await page.waitForFunction(()=>{const track=music.diagnostics.tracks.find(t=>t.name==='menutheme');return track.playing&&track.time<2;});
 assert.deepEqual(await page.evaluate(()=>music.diagnostics.failed),[]);
 assert.deepEqual(errors,[]);
 console.log('Original music: gesture unlock, both recordings, crossfade, hidden/resume, mute, arena silence and loop wrap passed.');
 await page.goto('http://127.0.0.1:5173');
 await page.click('#settings-open');await page.waitForFunction(()=>window.abyss.music.tracks.some(t=>t.name==='menutheme'&&t.time>.1));
 await page.locator('#musicVolume').evaluate(el=>{el.value='30';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('abyss-settings')).musicVolume),30);
 await page.click('#settings-close');await page.waitForFunction(()=>!document.querySelector('#start').disabled);await page.click('#start');if(await page.locator('#player-profile').isVisible())await page.click('#profile-local');
 await page.waitForFunction(()=>window.abyss.entrance&&window.abyss.music.tracks.some(t=>t.name==='menuatmos'&&t.time>.1));
 await page.waitForFunction(()=>window.abyss.audio.loops.includes('daggercall'));
 await page.keyboard.down('KeyW');await page.waitForFunction(()=>!window.abyss.entrance);await page.keyboard.up('KeyW');
 await page.waitForFunction(()=>window.abyss.audio.oneShotNames.includes('daggercollect'));
 assert.ok(await page.evaluate(()=>!window.abyss.audio.loops.some(n=>n.startsWith('daggercall'))));
 await page.waitForFunction(()=>window.abyss.music.scene==='silent'&&window.abyss.music.tracks.every(t=>!t.playing));
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.abyss.music.scene==='menu'&&window.abyss.music.tracks.some(t=>t.name==='menutheme'&&t.playing));await page.click('#quit');
 await page.waitForFunction(()=>window.abyss.mode==='menu'&&window.abyss.music.tracks.some(t=>t.name==='menutheme'&&t.playing&&t.volume>0));
 await page.reload();await page.click('#settings-open');assert.equal(await page.locator('#musicVolume').inputValue(),'30');
 assert.deepEqual(errors,[]);console.log('Game integration: menu, entrance, return home and saved music volume passed.');
 // Reproduce iOS: element volume writes do nothing and reads always return 1.
 // Measure actual samples after the music mixer, rather than trusting diagnostics.
 const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await mobile.addInitScript(()=>{
  Object.defineProperty(HTMLMediaElement.prototype,'volume',{get:()=>1,set:()=>{},configurable:true});
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Music audit',automatic:false,configured:true}));
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:100}));
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
   if(destination===this.context.destination){
    const analyser=this.context.createAnalyser();analyser.fftSize=2048;
    connect.call(this,analyser);window.audioOutputs??=[];window.audioOutputs.push(analyser);
   }
   return connect.call(this,destination,...args);
  };
  window.outputPeak=()=>Math.max(0,...(window.audioOutputs??[]).map(analyser=>{
   const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);
   return Math.max(...samples.map(Math.abs));
  }));
 });
 const touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(e.message));
 await touch.goto('http://127.0.0.1:5173');await touch.locator('#settings-open').tap();
 await touch.waitForFunction(()=>window.outputPeak()>.001);
 await touch.locator('#musicVolume').fill('20');
 assert.equal(await touch.evaluate(()=>JSON.parse(localStorage.getItem('abyss-settings')).musicVolume),20);
 await touch.waitForFunction(()=>window.abyss.music.tracks.some(t=>t.playing&&Math.abs(t.volume-.13)<.001));
 await touch.locator('#musicVolume').fill('0');
 await touch.waitForFunction(()=>window.outputPeak()===0&&window.abyss.music.tracks.every(t=>!t.playing));
 await touch.locator('#musicVolume').fill('100');await touch.waitForFunction(()=>window.outputPeak()>.001);
 await touch.locator('#settings-close').tap();await touch.waitForFunction(()=>!document.querySelector('#start').disabled);await touch.locator('#start').tap();
 await touch.waitForFunction(()=>window.abyss.entrance&&window.abyss.music.tracks.some(t=>t.name==='menuatmos'&&t.playing));
 const cdp=await mobile.newCDPSession(touch);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:150,y:270}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:150,y:180}]});
 await touch.waitForFunction(()=>!window.abyss.entrance);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await touch.waitForFunction(()=>window.abyss.music.scene==='silent'&&window.abyss.music.tracks.every(t=>!t.playing)&&window.outputPeak()===0);
 assert.deepEqual(errors,[]);await mobile.close();
 console.log('Mobile regression: ignored element volume, streamed audio output, slider mute/unmute, entrance transition and arena silence passed.');

}finally{await browser.close();}
