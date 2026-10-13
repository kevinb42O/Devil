import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Connection audit',configured:true}));
  localStorage.setItem('abyss-settings',JSON.stringify({controlScheme:'controller',quality:'low',volume:0,musicVolume:0}));
  window.testPad={id:'DualSense Wireless Controller',index:0,connected:false,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
  window.blockGamepads=false;
  Object.defineProperty(navigator,'getGamepads',{value:()=>{
   if(window.blockGamepads)throw new DOMException('Gamepad access denied','SecurityError');
   return window.testPad.connected?[window.testPad]:[];
  }});
 });
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
 await page.click('#start');await page.waitForFunction(()=>window.abyss.mode==='paused');
 await page.waitForFunction(()=>document.querySelector('#pause p').textContent.includes('press a button'));
 assert.ok(await page.locator('#pause p').isVisible(),'connection instructions are visible over the entrance');
 await page.click('#resume');await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.abyss.mode),'paused','Return waits for a controller');
 // Browsers can hide a connected controller until the first button press.
 await page.evaluate(()=>{window.testPad.connected=true;window.testPad.buttons[0].pressed=true;window.testPad.buttons[7].pressed=true;});
 await page.waitForFunction(()=>window.abyss.mode==='playing');await page.waitForTimeout(150);
 assert.equal(await page.locator('#pause').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.abyss.input.jump),false,'the detection button cannot jump');
 assert.equal(await page.evaluate(()=>window.abyss.input.fire),false,'the detection trigger cannot fire');
 assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);
 await page.evaluate(()=>{window.testPad.buttons[0].pressed=false;window.testPad.buttons[7].pressed=false;window.testPad.axes=[0,-1,0,0];});
 await page.waitForFunction(()=>!window.abyss.entrance);
 await page.evaluate(()=>{window.testPad.axes=[0,0,0,0];window.testPad.connected=false;});
 await page.waitForFunction(()=>window.abyss.mode==='paused');
 await page.evaluate(()=>window.testPad.connected=true);await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.abyss.mode),'paused','a disconnected run still requires an explicit resume');
 await page.click('#resume');await page.waitForFunction(()=>window.abyss.mode==='playing');
 // A controller exposed with no usable mapping should explain the problem.
 await page.evaluate(()=>window.testPad.mapping='');await page.waitForFunction(()=>window.abyss.mode==='paused');
 await page.waitForFunction(()=>document.querySelector('#pause p').textContent.includes('no standard mapping'));
 await page.click('#pause-settings');await page.selectOption('#control-scheme','qwerty');await page.click('#settings-close');
 await page.waitForFunction(()=>document.querySelector('#pause p').textContent==='Your run is paused.');
 await page.click('#resume');await page.waitForFunction(()=>window.abyss.mode==='playing'&&!!document.pointerLockElement);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.abyss.mode==='paused');
 await page.click('#quit');await page.click('#settings-open');await page.selectOption('#control-scheme','controller');await page.click('#settings-close');
 await page.evaluate(()=>window.blockGamepads=true);await page.click('#start');await page.waitForFunction(()=>window.abyss.mode==='paused');
 await page.waitForFunction(()=>document.querySelector('#pause p').textContent.includes('not allowing controller access'));
 await page.click('#resume');assert.equal(await page.evaluate(()=>window.abyss.mode),'paused');
 assert.deepEqual(errors,[]);
 console.log('Controller connection regression passed: delayed detection, visible help, Return, safe wake-up inputs, entrance, disconnect, unsupported mapping, keyboard fallback and blocked API.');
}finally{await browser.close();}
