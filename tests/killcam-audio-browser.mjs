import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Killcam audio',automatic:false,configured:true}));
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:55,musicVolume:55}));
 });
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.abyss?.originalEnemies&&window.abyss.originalAssets);
 await page.click('#start');await page.waitForFunction(()=>window.abyss.entrance);
 await page.keyboard.down('KeyW');await page.waitForFunction(()=>!window.abyss.entrance);await page.keyboard.up('KeyW');
 await page.waitForFunction(()=>window.abyss.deathAnalysis?.active,{},{timeout:30000});
 const final=await page.evaluate(()=>({time:abyss.time,stats:abyss.stats}));
 await page.waitForFunction(()=>abyss.audio.loops.length>0&&abyss.music.scene==='menu'&&abyss.music.tracks.some(t=>t.name==='menutheme'&&t.playing&&t.volume>0));
 await page.click('#analysis-pause');await page.waitForFunction(()=>abyss.audio.loops.length===0);
 assert.ok(await page.evaluate(()=>abyss.music.tracks.some(t=>t.name==='menutheme'&&t.playing&&t.volume>0)),'music continues while killcam is paused');
 await page.click('#analysis-pause');await page.waitForFunction(()=>abyss.audio.loops.length>0);
 await page.waitForFunction(()=>abyss.deathAnalysis?.impact,{},{timeout:8000});
 await page.waitForFunction(()=>abyss.audio.loops.length===0);
 await page.waitForFunction(()=>!abyss.deathAnalysis?.active);
 assert.ok(await page.evaluate(()=>abyss.music.tracks.some(t=>t.name==='menutheme'&&t.playing&&t.volume>0)),'music continues on results');
 assert.deepEqual(await page.evaluate(()=>({time:abyss.time,stats:abyss.stats})),final,'audio playback leaves the completed run untouched');
 await page.click('#watch-death');await page.waitForFunction(()=>abyss.audio.loops.length>0);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!abyss.deathAnalysis.active&&abyss.audio.loops.length===0);
 // Reproduce the reported regression: die while the trigger is still held.
 await page.click('#retry');await page.waitForFunction(()=>abyss.entrance);
 await page.keyboard.down('KeyW');await page.waitForFunction(()=>!abyss.entrance);await page.keyboard.up('KeyW');
 await page.mouse.down();await page.waitForFunction(()=>abyss.audio.loops.includes('rapid1'));
 await page.keyboard.down('KeyW');
 await page.waitForFunction(()=>abyss.deathAnalysis?.active,null,{timeout:20000});await page.keyboard.up('KeyW');
 await page.mouse.up();
 const weapon=name=>/^(?:seekrapid|rapid|weapon|shot|daggerdrone|magentadrone)/.test(name);
 for(let i=0;i<8;i++){
  const audio=await page.evaluate(()=>abyss.audio);
  assert.ok(!audio.loops.some(weapon),'death must not restart the held shooting loop');
  assert.ok(!audio.oneShotNames.some(weapon),'killcam must not trigger weapon onsets or release tails');
  await page.waitForTimeout(100);
 }
 await page.click('#analysis-pause');await page.waitForFunction(()=>abyss.audio.loops.length===0);
 await page.click('#analysis-pause');await page.waitForFunction(()=>abyss.audio.loops.length>0);
 assert.ok(!(await page.evaluate(()=>abyss.audio.loops)).some(weapon),'resume must not restart recorded firing');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!abyss.deathAnalysis.active&&abyss.audio.loops.length===0);
 await page.click('#watch-death');await page.waitForFunction(()=>abyss.audio.loops.length>0);
 assert.ok(!(await page.evaluate(()=>abyss.audio.loops)).some(weapon),'rewatch must not restart recorded firing');
 assert.deepEqual(errors,[]);
 console.log('Killcam audio passed: held-trigger death, no ghost firing, scene sounds, music, pause/resume, impact, results and rewatch/exit.');
}finally{await browser.close();}
