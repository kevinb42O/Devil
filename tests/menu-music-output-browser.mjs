import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{
  Object.defineProperty(HTMLMediaElement.prototype,'volume',{get:()=>1,set:()=>{},configurable:true});
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:40}));
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
   if(destination===this.context.destination){const a=this.context.createAnalyser();a.fftSize=2048;connect.call(this,a);(window.outputs??=[]).push(a);}
   return connect.call(this,destination,...args);
  };
  window.peak=()=>Math.max(0,...(window.outputs??[]).map(a=>{const x=new Float32Array(a.fftSize);a.getFloatTimeDomainData(x);return Math.max(...x.map(Math.abs));}));
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.abyss);
 await page.locator('#settings-open').tap();
 await page.waitForFunction(()=>window.peak()>.003&&window.abyss.music.contextState==='running');
 assert.ok(await page.evaluate(()=>window.abyss.music.tracks.some(t=>t.name==='menutheme'&&t.playing&&t.time>.1)));
 await page.locator('#musicVolume').fill('0');await page.waitForFunction(()=>window.peak()===0);
 await page.locator('#musicVolume').fill('40');await page.waitForFunction(()=>window.peak()>.003);
 await page.locator('#settings-close').tap();await page.locator('#leaderboard-open').tap();
 await page.waitForFunction(()=>window.abyss.music.tracks.some(t=>t.name==='menutheme'&&t.playing));
 await page.locator('#leaderboard-close').tap();
 assert.deepEqual(await page.evaluate(()=>window.abyss.music.failed),[]);assert.deepEqual(errors,[]);
 console.log('Actual menu theme output at 40%, mobile mixer, mute/unmute and continued leaderboard playback passed.');
}finally{await browser.close();}
