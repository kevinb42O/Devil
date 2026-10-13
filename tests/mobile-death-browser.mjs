import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 for(const viewport of [{width:844,height:390},{width:390,height:844}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.addInitScript(()=>{
   localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Mobile death audit',automatic:false,configured:true}));
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0}));
   // Mobile Safari and other touch browsers can lack the Pointer Lock API.
   Document.prototype.exitPointerLock=undefined;
   Element.prototype.requestPointerLock=undefined;
   Element.prototype.requestFullscreen=undefined;
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/?hand-preview=1');
  await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
  await page.locator('#start').tap();await page.waitForFunction(()=>window.abyss.mode==='playing');
  const cdp=await context.newCDPSession(page);
  const rotated=viewport.height>viewport.width;
  const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x:rotated?390-y:x,y:rotated?x:y,radiusX:2,radiusY:2,force:1}))});};
  const summary=async()=>{
   // A death replay may precede the summary in the shared game's death flow.
   if(await page.locator('#analysis-skip').isVisible())await page.locator('#analysis-skip').tap();
   await page.locator('#death').waitFor({state:'visible'});
  };
  // Keep both thumbs held while walking off the arena to exercise death cleanup.
  await touch('touchStart',[[1,150,270],[2,680,260]]);
  await touch('touchMove',[[1,150,190],[2,680,260]]);
  await page.waitForFunction(()=>window.abyss.mode==='dead',{},{timeout:15000});
  await touch('touchEnd',[]);await summary();
  assert.ok(Number(await page.locator('#death-time').textContent())>0,'death menu includes the completed run');
  assert.equal(await page.evaluate(()=>window.abyss.input.fire),false,'death releases fire');
  assert.equal(await page.evaluate(()=>window.abyss.input.forward),0,'death releases movement');
  await page.locator('#retry').tap();await page.waitForFunction(()=>window.abyss.mode==='playing');
  assert.equal(await page.locator('#death').isVisible(),false,'retry dismisses the death menu');
  assert.equal(await page.evaluate(()=>window.abyss.input.fire),false,'retry starts with no held fire');
  await touch('touchStart',[[1,150,270]]);await touch('touchMove',[[1,150,190]]);
  await page.waitForFunction(()=>window.abyss.mode==='dead',{},{timeout:15000});
  await touch('touchEnd',[]);await summary();await page.locator('#home').tap();
  await page.waitForFunction(()=>window.abyss.mode==='menu');assert.equal(await page.locator('#menu').isVisible(),true);
  // Pause/resume also needs to work without a mouse API.
  await page.locator('#start').tap();await page.waitForFunction(()=>window.abyss.mode==='playing');
  await page.locator('#timer').tap();await page.locator('#pause').waitFor({state:'visible'});
  await page.locator('#resume').tap();await page.waitForFunction(()=>window.abyss.mode==='playing');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.locator('#pause').waitFor({state:'visible'});
  await page.locator('#quit').tap();await page.waitForFunction(()=>window.abyss.mode==='menu');
  assert.deepEqual(errors,[],`no errors at ${viewport.width}×${viewport.height}`);
  await context.close();
 }
 console.log('Mobile death passed: missing Pointer Lock API, landscape and rotated portrait, held-touch cleanup, death menu, retry, home, pause/resume and blur.');
}finally{await browser.close();}
