import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await page.addInitScript(()=>{localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Arrival performance',configured:true}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'high',volume:0,musicVolume:0,controlScheme:'qwerty'}));});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
 await page.evaluate(async()=>{
  const url=name=>performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===`/src/${name}.ts`)?.name??`/src/${name}.ts`;
  const [{World},{CrewArrival}]=await Promise.all([import(url('simulation')),import(url('crew-arrival'))]);
  const step=World.prototype.stepEntrance;
  World.prototype.stepEntrance=function(...args){step.apply(this,args);if(window.crossSeal){this.player.pos={x:0,y:1.7,z:-7};window.crossSeal=false;}};
  // Keep the same empty arena and countdown on screen for repeated A/B samples.
  World.prototype.step=function(){};
  const update=CrewArrival.prototype.update;
  CrewArrival.prototype.update=function(epoch,startAt,now,players){update.call(this,epoch,now+3000+Math.sin(performance.now()/1000)*200,now,players);};
 });
 await page.click('#start');await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.entrance);
 await page.evaluate(()=>window.crossSeal=true);await page.waitForFunction(()=>!window.abyss.entrance);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const sample=async(hidden)=>{
  await page.evaluate(hidden=>{let style=document.querySelector('#performance-overlay-toggle');if(!style){style=document.createElement('style');style.id='performance-overlay-toggle';document.head.append(style);}style.textContent=hidden?'#crew-arrival{display:none!important}':'';},hidden);
  const before=await cdp.send('Performance.getMetrics');
  const frames=await page.evaluate(()=>new Promise(resolve=>{const values=[];let last=performance.now(),start=last;function frame(now){values.push(now-last);last=now;if(now-start<1800)requestAnimationFrame(frame);else {values.shift();values.sort((a,b)=>a-b);resolve({frames:values.length,medianMs:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)]});}}requestAnimationFrame(frame);}));
  const after=await cdp.send('Performance.getMetrics');const metrics={};for(const name of ['TaskDuration','LayoutDuration','RecalcStyleDuration','ScriptDuration'])metrics[name]=(after.metrics.find(m=>m.name===name)?.value??0)-(before.metrics.find(m=>m.name===name)?.value??0);
  return {...frames,...metrics};
 };
 const results=[];for(const hidden of [true,false,true,false])results.push({overlay:!hidden,...await sample(hidden)});
 console.log(JSON.stringify(results,null,2));
 assert.ok(results.every(r=>r.frames>0));
 const hiddenMedian=Math.max(...results.filter(r=>!r.overlay).map(r=>r.medianMs));
 assert.ok(results.filter(r=>r.overlay).every(r=>r.medianMs<=Math.max(25,hiddenMedian*1.25)),'countdown must retain the arena median frame budget');
 const hiddenStyle=results.filter(r=>!r.overlay).reduce((n,r)=>n+r.RecalcStyleDuration,0);
 const visibleStyle=results.filter(r=>r.overlay).reduce((n,r)=>n+r.RecalcStyleDuration,0);
 assert.ok(visibleStyle<Math.max(.04,hiddenStyle*2.5),'countdown must not multiply steady-state style recalculation');
 writeFileSync('artifacts/arrival-performance.json',JSON.stringify({viewport:{width:1440,height:900,dpr:2},results,hiddenStyle,visibleStyle},null,2)+'\n');
}finally{await browser.close();}
