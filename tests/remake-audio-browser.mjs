import {webkit,chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
await mkdir('artifacts/remake-audio',{recursive:true});
const browser=await webkit.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[],oldRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/original/devil-daggers/audio/'))oldRequests.push(r.url());});
 await page.route('**/remake-audio-compat',r=>r.fulfill({contentType:'text/html',body:'<button id="decode">Decode effects</button><button id="music">Play music</button>'}));
 await page.goto(base+'/remake-audio-compat');
 await page.evaluate(async()=>{
  const [{Sound,SOUND_NAMES},{REMAKE_AUDIO,remakeAudioUrl}]=await Promise.all([import('/src/audio.ts'),import('/src/remake-audio.ts')]);
  window.sound=new Sound();window.audioCatalog=REMAKE_AUDIO;window.music=new Audio(remakeAudioUrl('menutheme'));
  document.querySelector('#decode').onclick=async()=>{
   try{await sound.start();for(const name of Object.keys(REMAKE_AUDIO))await sound.load(name);window.decoded=sound.diagnostics;}catch(error){window.decodeError=String(error);}
  };
  document.querySelector('#music').onclick=()=>{music.play().catch(e=>window.playError=String(e));};
 });
 await page.click('#decode');await page.waitForFunction(()=>window.decoded||window.decodeError,null,{timeout:60000});
 const decoded=await page.evaluate(()=>window.decoded);assert.ok(decoded);assert.deepEqual(decoded.failed,[]);assert.equal(decoded.loaded,await page.evaluate(()=>Object.keys(window.audioCatalog).length));assert.equal(decoded.source,'studio-horror');
 await page.click('#music');await page.waitForFunction(()=>music.currentTime>.1||window.playError);assert.equal(await page.evaluate(()=>window.playError),undefined);
 const music=await page.evaluate(()=>({duration:window.music.duration,playing:!window.music.paused}));assert.ok(music.duration>50&&music.playing);assert.deepEqual(errors,[]);assert.deepEqual(oldRequests,[]);
 await writeFile('artifacts/remake-audio/webkit-report.json',JSON.stringify({decoded,music,errors,oldRequests},null,2));console.log(`WebKit audio: all ${decoded.loaded} replacement files decode; AAC menu music plays after a gesture; zero extracted-audio requests.`);
}finally{await browser.close();}
const chrome=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await chrome.newPage({viewport:{width:1280,height:800}});await page.goto(base+'/artifacts/remake-audio/index.html');
 assert.equal(await page.locator('video').count(),1);assert.equal(await page.locator('audio').count(),0,'studio material is previewed inside game footage');
 await page.screenshot({path:'artifacts/remake-audio/catalog.png'});
 console.log('Studio preview: synchronized game-footage presentation renders without a standalone sample catalog.');
}finally{await chrome.close();}
