import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const localChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:existsSync(localChrome)?{executablePath:localChrome}:{})});
try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5180');
  await page.waitForFunction(()=>document.querySelector('#start')?.disabled===false);
  assert.equal(await page.locator('#error').isVisible(),false,'production assets must load');
  await page.click('#start');
  await page.waitForFunction(()=>document.querySelector('#menu')?.hidden&&document.querySelector('#hud')?.hidden===false);
  assert.equal(await page.evaluate(()=>!!document.pointerLockElement),true,'production game must start');
  await page.waitForTimeout(1000);
  assert.deepEqual(errors,[],'production startup must have no asset or browser errors');
  console.log('Production smoke passed: original assets load and gameplay starts.');
} finally {
  await browser.close();
}
