import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Replay test',automatic:false,configured:true}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalEnemies&&window.abyss.originalAssets);
 await page.click('#start');await page.waitForFunction(()=>window.abyss.entrance);await page.keyboard.down('KeyW');await page.waitForFunction(()=>!window.abyss.entrance);await page.keyboard.up('KeyW');
 await page.waitForFunction(()=>{if(!window.abyss.deathAnalysis?.active)return false;document.querySelector('#analysis-pause').click();return true;},{},{timeout:30000});
 assert.equal(await page.locator('#death-analysis').isVisible(),true);assert.equal(await page.locator('#death').isVisible(),false);assert.equal(await page.locator('#hud').isVisible(),false);
 const initial=await page.evaluate(()=>window.abyss);assert.ok(initial.deathSource);assert.equal(initial.deathAnalysis.duration,5);assert.equal(initial.mode,'dead');assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);
 const survivalTime=()=>page.locator('.analysis-survival-value').innerText().then(text=>text.replace(/\s/g,''));
 assert.equal(await survivalTime(),initial.time.toFixed(3),'killcam immediately shows the final survival time');
 assert.equal(await page.locator('#analysis-personal-best').isVisible(),!(await page.locator('#new-best').evaluate(el=>el.hidden)),'killcam preserves the personal-best result');
 await page.waitForTimeout(120);const paused=await page.evaluate(()=>window.abyss.deathAnalysis.remaining);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.abyss.deathAnalysis.remaining),paused);
 await page.screenshot({path:'artifacts/death-analysis-enemy.png'});
 await page.setViewportSize({width:844,height:390});
 const layout=await page.evaluate(()=>{
  const bounds=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
  return {heading:bounds('.analysis-heading'),score:bounds('.analysis-survival'),countdown:bounds('.analysis-countdown'),footer:bounds('.analysis-footer')};
 });
 assert.ok(layout.score.left>layout.heading.right&&layout.score.right<layout.countdown.left,'mobile survival time clears the replay headings');
 assert.ok(layout.score.bottom<layout.footer.top,'mobile survival time clears replay controls');
 await page.screenshot({path:'artifacts/death-analysis-survival-mobile.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.click('#analysis-pause');await page.waitForFunction(()=>window.abyss.deathAnalysis?.impact,{},{timeout:8000});assert.equal(await page.locator('#analysis-countdown').textContent(),'IMPACT');
 assert.equal(await survivalTime(),initial.time.toFixed(3),'survival time stays fixed through impact');
 await page.screenshot({path:'artifacts/death-analysis-impact.png'});
 assert.equal(await page.evaluate(()=>window.abyss.time),initial.time,'replay never mutates final gameplay time');assert.deepEqual(await page.evaluate(()=>window.abyss.stats),initial.stats,'stats stay final');
 await page.waitForFunction(()=>!window.abyss.deathAnalysis?.active);assert.equal(await page.locator('#death').isVisible(),true);
 await page.click('#watch-death');await page.waitForFunction(()=>window.abyss.deathAnalysis?.active);await page.keyboard.press('Escape');assert.equal(await page.locator('#death').isVisible(),true);
 assert.equal(await survivalTime(),initial.time.toFixed(3),'rewatching keeps the completed run time');
 await page.click('#watch-death');await page.click('#analysis-retry');await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.entrance);assert.equal(await page.locator('#death-analysis').isVisible(),false);
 await page.keyboard.down('KeyW');await page.waitForFunction(()=>!window.abyss.entrance);await page.keyboard.up('KeyW');await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.abyss.deathAnalysis?.active,{},{timeout:15000});await page.keyboard.up('KeyW');assert.equal(await page.evaluate(()=>window.abyss.deathSource),null);assert.equal(await page.locator('#analysis-killer').textContent(),'THE ABYSS');
 await page.click('#analysis-pause');await page.screenshot({path:'artifacts/death-analysis-fall.png'});await page.keyboard.press('KeyR');await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.entrance);
 // Measure the real numeric recorder separately from rendering and simulation.
 const performanceReport=await page.evaluate(async()=>{
  const [{World,v},{DeathHistory}]=await Promise.all([import('/src/simulation.ts'),import('/src/death-analysis.ts')]);
  const scenes=[];
  for(const count of [300,1000]){
   const w=new World(9,{schedule:false});for(let n=0;n<count;n++){const e=w.spawn('skull',v(Math.sin(n)*20,2,Math.cos(n)*20));e.age=2;}
   for(let n=0;n<280;n++)w.projectiles.push({id:2000+n,pos:v(n%20-10,3,-n%25),vel:v(0,0,-70),age:.2,homing:false,level:4});
   for(let n=0;n<3;n++)w.spawn('gigapede',v(n*8,3,-10));
   const h=new DeathHistory(),times=[];for(let n=0;n<400;n++){w.tick=n*4;w.time=n/30;const start=performance.now();h.capture(w,0,0);times.push(performance.now()-start);}
   times.sort((a,b)=>a-b);const clipStart=performance.now(),clip=h.clip(null),startupMs=performance.now()-clipStart;
   scenes.push({count,captureMedianMs:times[200],captureP95Ms:times[380],startupMs,...h.diagnostics,available:!!clip});
  }return scenes;
 });
 for(const r of performanceReport){assert.ok(r.available);assert.ok(r.bytes<=r.budget);}
 await writeFile('artifacts/death-analysis-performance.json',JSON.stringify(performanceReport,null,2));assert.deepEqual(errors,[]);console.log('Death analysis browser passed:',JSON.stringify({killer:initial.deathSource,performanceReport}));
}finally{await browser.close();}
