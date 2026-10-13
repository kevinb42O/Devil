import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Fall replay',automatic:false,configured:true}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies);await page.click('#start');await page.keyboard.down('KeyW');await page.waitForFunction(()=>!window.abyss.entrance);await page.keyboard.up('KeyW');await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.abyss.deathAnalysis?.active);await page.keyboard.up('KeyW');
 assert.equal(await page.locator('#analysis-killer').textContent(),'THE ABYSS');assert.equal(await page.evaluate(()=>window.abyss.deathSource),null);
 const finalTime=await page.evaluate(()=>window.abyss.time);
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));const hiddenRemaining=await page.evaluate(()=>window.abyss.deathAnalysis.remaining);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.abyss.deathAnalysis.remaining),hiddenRemaining,'hidden replay remains paused');await page.evaluate(()=>{delete document.hidden;});
 // Releasing pointer lock / embedding can leave a visible page without document focus.
 // This must not silently freeze a cosmetic replay that has not been paused.
 await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'));});
 const remaining=await page.evaluate(()=>window.abyss.deathAnalysis.remaining);await page.waitForTimeout(400);const later=await page.evaluate(()=>window.abyss.deathAnalysis.remaining);
 assert.ok(later<remaining-.15,`visible unfocused replay should progress: ${remaining} -> ${later}`);
 await page.waitForFunction(()=>window.abyss.deathAnalysis.impact,{},{timeout:8000});await page.screenshot({path:'artifacts/death-analysis-fall-final.png'});assert.equal(await page.locator('#analysis-countdown').textContent(),'IMPACT');assert.equal(await page.evaluate(()=>window.abyss.time),finalTime);await page.waitForFunction(()=>!window.abyss.deathAnalysis.active,{},{timeout:3000});assert.equal(await page.locator('#death').isVisible(),true);
 await page.evaluate(()=>{delete document.hasFocus;});await page.click('#watch-death');await page.click('#analysis-pause');const paused=await page.evaluate(()=>window.abyss.deathAnalysis.remaining);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.abyss.deathAnalysis.remaining),paused);await page.click('#analysis-retry');await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.entrance);assert.deepEqual(errors,[]);
 console.log('Fall replay passed: hidden-page pause, visible focus loss, countdown, full descent, impact hold, results, explicit pause and retry.');
}finally{await browser.close();}
