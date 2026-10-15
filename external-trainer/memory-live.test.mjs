import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {attachMemory} from './memory-bridge.mjs';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage({viewport:{width:1200,height:760}});
  page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?enemy-preview=skull',{waitUntil:'domcontentloaded'});
  await attachMemory(page);
  await attachMemory(page); // Reconnect must replace, rather than nest, the frame adapter.
  await page.waitForFunction(()=>window.abyss.originalAssets&&window.abyss.originalEnemies);
  await page.click('#start',{noWaitAfter:true});
  await page.waitForFunction(()=>!!document.pointerLockElement);
  await page.evaluate(()=>window.__abyssMemoryAim.control({enabled:true,prediction:true}));
  await page.mouse.down();
  let result;
  for(let i=0;i<50;i++){
    result=await page.evaluate(()=>({aim:window.__abyssMemoryAim.control({enabled:true,prediction:true}),stats:window.abyss.stats}));
    if(result.stats.kills>0)break;
    await page.waitForTimeout(100);
  }
  await page.mouse.up();
  assert(result.aim.aimApplications>0,'must apply actual live aim while shooting without a modifier');
  assert(result.stats.hits>0,'real projectiles must hit');
  assert(result.stats.kills>0,'must kill the actual preview enemy');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({memoryAttached:true,aimUpdates:result.aim.aimApplications,hits:result.stats.hits,kills:result.stats.kills,aimMs:result.aim.costMs}));
  await page.evaluate(()=>window.__abyssMemoryAim.stop());
  assert.equal(await page.evaluate(()=>window.requestAnimationFrame.name),'requestAnimationFrame');
  await page.reload({waitUntil:'domcontentloaded'});
  await attachMemory(page);
  assert.equal(await page.evaluate(()=>window.__abyssMemoryAim.control({enabled:false}).active),false);
  console.log('Memory reattachment, page reload and clean uninstallation passed.');
}finally{await browser.close();}
