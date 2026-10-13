import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const localChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:existsSync(localChrome)?{executablePath:localChrome}:{})});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  const url=process.env.GAME_URL||'http://127.0.0.1:5173';await page.goto(url);await page.locator('#start').waitFor();
  await page.waitForFunction(()=>window.abyss?.mode==='menu');
  await page.click('#settings-open');await page.locator('#volume').fill('0');await page.click('#settings-close');
  await page.click('#start');await page.waitForFunction(()=>window.abyss?.time>.3);
  assert.equal(await page.evaluate(()=>!!document.pointerLockElement),true,'mouse must be captured');
  const before=await page.evaluate(()=>window.abyss.position.z);
  await page.keyboard.down('KeyW');await page.waitForTimeout(550);await page.keyboard.up('KeyW');
  assert.ok(await page.evaluate(()=>window.abyss.position.z)<before-2,'W moves the player forward');
  await page.keyboard.down('Space');await page.waitForTimeout(140);assert.ok(await page.evaluate(()=>window.abyss.position.y)>1.8,'jump leaves the ground');await page.keyboard.up('Space');
  await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up();assert.ok(await page.evaluate(()=>window.abyss.stats.shots)>0,'stream launches physical projectiles');
  await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.abyss.mode==='paused');
  const time=await page.evaluate(()=>window.abyss.time);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.abyss.time),time,'pause freezes simulation');
  await page.click('#pause-settings');await page.locator('#fov').fill('105');await page.click('#settings-close');await page.click('#resume');await page.waitForFunction(()=>window.abyss.mode==='playing');
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.abyss.mode==='dead',{},{timeout:15000});await page.keyboard.up('KeyW');
  assert.equal(await page.locator('#death').isVisible(),true,'death summary appears');
  await page.keyboard.press('KeyR');try{await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.time<1,{},{timeout:5000});}catch(error){console.log('Retry diagnostic',await page.evaluate(()=>({state:window.abyss,pointerLock:!!document.pointerLockElement,notice:document.querySelector('#notice')?.textContent})));throw error;}
  assert.equal(await page.evaluate(()=>window.abyss.stats.shots),0,'retry resets the run');
  await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>window.abyss.mode==='paused');await page.click('#quit');
  await page.reload();await page.click('#settings-open');assert.equal(await page.locator('#fov').inputValue(),'105','settings survive reload');assert.equal(await page.locator('#volume').inputValue(),'0');
  assert.deepEqual(errors,[],'no browser or asset-loading errors');
  console.log('Browser smoke passed: assets, capture, movement, jump, firing, pause, settings, death, retry, persistence.');
} finally {await browser.close();}
