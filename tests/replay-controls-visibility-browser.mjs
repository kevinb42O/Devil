import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const errors=[];
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext(mobile?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:800}});
  await context.addInitScript(mobile=>{
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:mobile?'mobile':'qwerty'}));
   localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Replay idle test',configured:true}));
  },mobile);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
  await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
  const run=await page.evaluate(async()=>{
   const {RunRecorder,createRun}=await import('/src/replay.ts');const {idleInput}=await import('/src/simulation.ts');
   const world=createRun(473),recorder=new RunRecorder(473);
   for(let i=0;i<120;i++){recorder.record(idleInput());world.step(idleInput());world.effects=[];}
   return recorder.finish(world);
  });
  for(const team of [false,true]){
   if(team){
    await page.evaluate(async()=>{
     const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
     const [{World,idleInput},{CrewRunRecorder},{watchCrewRun}]=await Promise.all([import(moduleUrl('simulation')),import(moduleUrl('crew-replay')),import(moduleUrl('main'))]);
     const w=new World(47,{schedule:false});w.addCrew('host');w.selectCrew('host');
     const recorder=new CrewRunRecorder(47,w,[{id:'host',name:'Captain',host:true}],'idle-fixture',1);
     for(let i=0;i<120;i++){if(i===119){w.crew[0].alive=false;w.crew[0].cause='DISCONNECTED';w.crew[0].respawnAt=null;}w.effects=[];const inputs=new Map([['host',idleInput()]]),before=w.crew.map(p=>({...p}));w.stepCrew(inputs);recorder.record(w,inputs,new Set(),before);}
     watchCrewRun(recorder.finish(w));
    });
   }else{
    await page.click('#history-open');
    await page.setInputFiles('#replay-import-file',{name:'idle-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(run))});
   }
   const mode=team?'crew-replay':'replay',selector=team?'#crew-replay-controls':'#replay-controls';
   await page.waitForFunction(mode=>window.abyss.mode===mode,mode);
   assert.equal(await page.locator(selector).isVisible(),true,'controls start visible');
   if(team&&mobile){await page.selectOption('#crew-replay-camera','free');assert.equal(await page.locator('#crew-replay-height').isVisible(),true);}
   await page.waitForTimeout(4100);
   assert.equal(await page.evaluate(()=>document.body.dataset.replayIdle),'false','controls stay visible before five seconds');
   await page.waitForFunction(()=>document.body.dataset.replayIdle==='true');
   const fading=await page.locator(selector).evaluate(e=>getComputedStyle(e).transitionDuration);
   assert.ok(fading.includes('0.35s'),'fade uses a smooth transition');
   await page.waitForTimeout(400);
   assert.equal(await page.locator(selector).isVisible(),false,'all controls disappear after idle');
   assert.equal(await page.locator(selector).evaluate(e=>e.inert),true,'hidden controls cannot receive focus or clicks');
   if(!team)assert.equal(await page.locator('#hud').isVisible(),false,'solo replay HUD clears too');
   if(team&&mobile)assert.equal(await page.locator('#crew-replay-height').isVisible(),false,'free-flight buttons clear too');
   if(mobile){
    await page.mouse.move(200,100);
    assert.equal(await page.evaluate(()=>document.body.dataset.replayIdle),'true','mouse events do not reveal mobile controls');
    await page.touchscreen.tap(200,100);
   }else await page.mouse.move(210,100);
   await page.waitForTimeout(400);
   assert.equal(await page.locator(selector).isVisible(),true,'tap or mouse movement reveals controls');
   await page.waitForTimeout(3000);
   if(mobile)await page.touchscreen.tap(240,100);else await page.mouse.move(240,100);
   await page.waitForTimeout(2300);
   assert.equal(await page.evaluate(()=>document.body.dataset.replayIdle),'false','new activity resets the five-second deadline');
   await page.waitForFunction(()=>document.body.dataset.replayIdle==='true');await page.waitForTimeout(400);
   assert.equal(await page.locator(selector).isVisible(),false,'controls disappear again, even when playback has ended');
   if(mobile)await page.touchscreen.tap(200,100);else await page.keyboard.press('Tab');
   await page.locator(team?'#crew-replay-exit':'#replay-exit').click();
   await page.waitForFunction(()=>window.abyss.mode==='menu');
   assert.equal(await page.evaluate(()=>document.body.dataset.replayIdle),'false','leaving replay clears idle state');
   assert.equal(await page.locator('#start').isVisible(),true);
   console.log(`${mobile?'Mobile':'Desktop'} ${team?'team':'single-player'} replay fade and wake passed.`);
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
