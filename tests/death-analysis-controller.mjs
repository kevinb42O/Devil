import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-settings',JSON.stringify({controlScheme:'controller',quality:'low',volume:0,musicVolume:0}));
  window.testPad={id:'Death replay test',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});
 });
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/?enemy-preview=skull');await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies);await page.click('#start');await page.waitForFunction(()=>window.abyss.deathAnalysis?.active,{},{timeout:15000});
 const button=async(i)=>{await page.evaluate(i=>window.testPad.buttons[i].pressed=true,i);await page.waitForTimeout(100);await page.evaluate(i=>window.testPad.buttons[i].pressed=false,i);await page.waitForTimeout(100);};
 await page.locator('#analysis-pause').focus();await button(0);assert.equal(await page.evaluate(()=>window.abyss.deathAnalysis.suspended),true);await button(0);assert.equal(await page.evaluate(()=>window.abyss.deathAnalysis.suspended),false);
 await button(1);assert.equal(await page.locator('#death').isVisible(),true,'controller B returns to results');await page.click('#watch-death');await page.locator('#analysis-retry').focus();await button(0);await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.time<1);assert.equal(await page.locator('#death-analysis').isVisible(),false);assert.deepEqual(errors,[]);console.log('Death replay controller passed: A pause/resume, B results, A immediate retry.');
}finally{await browser.close();}
