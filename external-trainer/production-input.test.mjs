import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {attachMemory} from './memory-bridge.mjs';
import {paintPageOverlay} from './page-overlay.mjs';

const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage();
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__abyssTrainerAccess);
  await attachMemory(page);
  await attachMemory(page);
  const options={enabled:true,esp_enabled:true,hud_enabled:true};
  const state=await page.evaluate(options=>window.__abyssMemoryAim.control(options),options);
  assert.equal(state.error,undefined);
  await page.evaluate(paintPageOverlay,{state,options,rect:{left:0,top:0,width:1280,height:720}});
  await page.locator('#settings-open').click();
  await page.waitForSelector('#settings:visible');
  await page.locator('#settings-close').click();
  await page.locator('#settings').waitFor({state:'hidden'});
  await page.evaluate(()=>window.__abyssMemoryAim.stop());
  console.log('PASS: production attachment, reconnect, settings open/close with page overlay active.');
}finally{await browser.close();}
