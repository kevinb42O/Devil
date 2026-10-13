import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
 const errors=[],audioRequests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('.wav'))audioRequests.push(r.url());});
 // Give each independent asset a realistic round trip to detect serial loading.
 await page.route('**/assets/original/devil-daggers/**',async route=>{await new Promise(resolve=>setTimeout(resolve,60));await route.continue();});
 const began=Date.now();await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 const readyMs=Date.now()-began;
 assert.ok(readyMs<8000,'cold assets should load without a long serial request chain');
 await page.evaluate(()=>{window.firstPlayFrame=new Promise(resolve=>{document.querySelector('#start').addEventListener('click',()=>{const begin=performance.now();requestAnimationFrame(()=>resolve(performance.now()-begin));},{once:true});});});
 await page.click('#start');const clickToFrameMs=await page.evaluate(()=>window.firstPlayFrame);
 assert.ok(clickToFrameMs<500,'Start should reach a frame without expensive shader compilation');
 await page.waitForTimeout(1500);
 assert.ok(!audioRequests.some(u=>/leviathan|gigaspider|rapid4|ultrapede/.test(u)),'opening gameplay must not download late-game recordings');
 const stall=await page.evaluate(async()=>{const before=window.abyss.time;const until=performance.now()+600;while(performance.now()<until){}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return window.abyss.time-before;});
 assert.ok(stall<.25,'a long stall must not cause a 600 ms simulation catch-up');
 await page.evaluate(()=>document.exitPointerLock());
 // Isolate rendering so profiling does not render two games at once.
 await page.route(url+'/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Render budget fixture</title>'}));
 await page.goto(url+'/');
 const budget=await page.evaluate(async()=>{
  const {GameRenderer}=await import('/src/renderer.ts');const {World}=await import('/src/simulation.ts');
  const renderer=new GameRenderer(document.body.appendChild(document.createElement('canvas')),{quality:'high',fov:90});await renderer.prepare();
  const initial=renderer.renderer.domElement.width*renderer.renderer.domElement.height;
  renderer.trackFrame(.6);const afterStall=renderer.renderer.getPixelRatio();
  for(let i=0;i<30;i++)renderer.trackFrame(1/30);
  const reduced=renderer.renderer.domElement.width*renderer.renderer.domElement.height;
  for(let i=0;i<100;i++)renderer.trackFrame(1/30);
  for(let i=0;i<300;i++)renderer.trackFrame(1/60);
  const recovered=renderer.renderer.domElement.width*renderer.renderer.domElement.height;
  const world=new World(1,{schedule:false});renderer.render(world,0,0,1/60,false);
  return {initial,reduced,recovered,afterStall,drawCalls:renderer.renderer.info.render.calls};
 });
 assert.ok(budget.initial<=1600000);assert.ok(budget.reduced<budget.initial);assert.ok(budget.recovered>budget.reduced);assert.ok(budget.recovered<=budget.initial);
 assert.deepEqual(errors,[]);
 console.log('Startup/performance regression passed:',JSON.stringify({readyMs,clickToFrameMs,openingAudioRequests:audioRequests.length,stallSimulationSeconds:stall,...budget}));
}finally{await browser.close();}
