import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
 await page.route('https://**/*',r=>r.abort());
 await page.addInitScript(()=>{localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',skyMotion:'reduced',volume:0,musicVolume:0}));localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Mouse test',automatic:false,configured:true}));});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/?hand-preview=5',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies);
 await page.getByText('PRACTICE AN ENCOUNTER',{exact:true}).click();await page.locator('#practice-time').fill('0');await page.locator('#practice-level').selectOption('5');await page.locator('#practice-start').click();
 await page.keyboard.down('w');await page.waitForFunction(()=>!window.abyss.entrance);await page.keyboard.up('w');
 await page.waitForFunction(()=>!!document.pointerLockElement);await page.waitForTimeout(2500);
 const tapStart=await page.evaluate(()=>window.abyss.stats.shots);
 await page.mouse.click(400,300,{button:'left'});await page.waitForFunction(before=>window.abyss.stats.shots===before+108,tapStart);
 await page.mouse.click(400,300,{button:'right'});await page.waitForFunction(before=>window.abyss.stats.shots===before+216,tapStart);
 await page.waitForTimeout(600);
 for(const [button,field]of [['left','fireLeft'],['right','fireRight']]){
  const before=await page.evaluate(()=>window.abyss.stats.shots);await page.mouse.down({button});
  await page.waitForFunction(field=>window.abyss.input[field]&&!window.abyss.input.homing,field);
  await page.waitForTimeout(350);await page.mouse.up({button});await page.waitForFunction(field=>!window.abyss.input[field],field);
  assert.ok(await page.evaluate(()=>window.abyss.stats.shots)>before,`${button} fires primary daggers`);
 }
 await page.mouse.down({button:'left'});await page.mouse.down({button:'right'});await page.waitForFunction(()=>window.abyss.input.fireLeft&&window.abyss.input.fireRight);
 await page.mouse.up({button:'left'});await page.waitForFunction(()=>!window.abyss.input.fireLeft&&window.abyss.input.fireRight&&window.abyss.input.fire);await page.mouse.up({button:'right'});
 const before=await page.evaluate(()=>window.abyss.stats.homingFired);await page.mouse.down({button:'middle'});await page.waitForFunction(()=>window.abyss.input.homing);await page.waitForTimeout(350);await page.mouse.up({button:'middle'});await page.waitForFunction(()=>!window.abyss.input.homing);assert.ok(await page.evaluate(()=>window.abyss.stats.homingFired)>before);
 await page.keyboard.press('Escape');await page.click('#pause-settings');assert.match(await page.locator('#control-bindings').textContent(),/MMB.*Homing/);assert.deepEqual(errors,[]);
 console.log('Mouse bindings passed: left/right independent fire, simultaneous holds, independent release, middle-click homing and controls copy.');
}finally{await browser.close();}
