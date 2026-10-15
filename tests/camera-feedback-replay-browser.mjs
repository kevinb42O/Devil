import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',screenShake:100,volume:0,musicVolume:0,skyMotion:'reduced'}));localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Feedback replay',automatic:false,configured:true}));});
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies);
 console.log('Replay feedback: assets ready.');
 const run=await page.evaluate(async()=>{
  const [{createRun,RunRecorder},{idleInput}]=await Promise.all([import('/src/replay.ts'),import('/src/simulation.ts')]);
  const world=createRun(736),recorder=new RunRecorder(736);
  for(let i=0;i<600;i++){const input={...idleInput(),fire:i%90<3,jump:i%120===0};recorder.record(input);world.step(input);world.effects=[];}
  return recorder.finish(world);
 });
 await page.click('#history-open');await page.setInputFiles('#replay-import-file',{name:'feedback.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(run))});await page.waitForFunction(()=>window.abyss.mode==='replay');
 console.log('Replay feedback: recording imported.');
 // Pause synchronously at an actual rendered kick, without polling past its lifetime.
 const paused=await page.evaluate(()=>new Promise((resolve,reject)=>{
  let frames=0;function inspect(){const a=window.abyss;if(a.cameraFeedback.active.includes('burst')&&Math.abs(a.cameraFeedback.offset.z)>0){document.querySelector('#replay-pause').click();resolve({time:a.time,offset:a.cameraFeedback.offset,recoil:a.handFeedback.recoil});}else if(frames++>600)reject(Error('No replay burst was rendered'));else requestAnimationFrame(inspect);}inspect();
 }));
 assert.ok(paused.recoil>0);await page.waitForTimeout(80);const frozen=await page.evaluate(()=>({time:window.abyss.time,offset:window.abyss.cameraFeedback.offset,camera:window.abyss.cameraPosition,hand:window.abyss.handFeedback}));
 await page.waitForTimeout(180);assert.deepEqual(await page.evaluate(()=>({time:window.abyss.time,offset:window.abyss.cameraFeedback.offset,camera:window.abyss.cameraPosition,hand:window.abyss.handFeedback})),frozen,'real solo replay pause freezes camera and hand feedback');
 // Both directions must discard transient feedback from the previous timestamp.
 for(const target of [360,60]){
  await page.mouse.move(20+target/60,20);await page.locator('#replay-seek').fill(String(target));await page.waitForFunction(t=>Math.abs(window.abyss.time-t/120)<1e-8,target);
  const state=await page.evaluate(()=>({camera:window.abyss.cameraFeedback,hand:window.abyss.handFeedback}));
  assert.deepEqual(state.camera.active,[],'seek discards camera impulses');assert.deepEqual(state.camera.offset,{x:0,y:0,z:0});
  assert.equal(state.hand.recoil,0,'seek discards the previous timestamp’s recoil');assert.equal(state.hand.flashTime,0,'seek discards old muzzle flashes');assert.equal(state.hand.particles,0,'seek discards particles from the previous timestamp');assert.equal(state.hand.upgradeTime,0,'seek discards old hand upgrade flashes');assert.deepEqual(state.hand.motion,{x:0,y:0,z:0});
 }
 await page.mouse.move(30,30);await page.click('#replay-pause');await page.waitForFunction(()=>window.abyss.cameraFeedback.active.includes('burst'));await page.mouse.move(31,30);await page.click('#replay-exit');await page.waitForFunction(()=>window.abyss.mode==='menu');assert.deepEqual(await page.evaluate(()=>window.abyss.cameraFeedback.active),[]);
 assert.deepEqual(errors,[]);console.log('Real replay feedback passed: pause, forward/backward seek, resumed impulses and menu cleanup.');
}finally{await browser.close();}
