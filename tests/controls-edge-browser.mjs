import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Controls audit',automatic:false,configured:true}));
  const pad=(index)=>({id:`Audit controller ${index}`,index,connected:index===0,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))});
  window.testPad=pad(0);window.secondPad=pad(1);Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad,window.secondPad]});
 });
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
 const button=async(i,held,pad='testPad')=>{await page.evaluate(([i,held,pad])=>window[pad].buttons[i].pressed=held,[i,held,pad]);await page.waitForTimeout(90);};
 const tap=async(i,pad='testPad')=>{await button(i,true,pad);await button(i,false,pad);};
 await page.click('#settings-open');await page.selectOption('#control-scheme','controller');await page.locator('#volume').fill('0');await page.locator('#control-scheme').focus();
 await tap(14);assert.equal(await page.locator('#control-scheme').inputValue(),'azerty');await tap(14);assert.equal(await page.locator('#control-scheme').inputValue(),'qwerty');
 await tap(15);await tap(15);assert.equal(await page.locator('#control-scheme').inputValue(),'controller','controller navigation survives selecting keyboard');
 await page.locator('#fov').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#settings').isVisible(),false,'Escape works on a focused settings input');
 await button(0,true);await page.waitForFunction(()=>window.abyss.mode==='playing');await page.waitForTimeout(160);
 assert.equal(await page.evaluate(()=>window.abyss.input.jump),false,'confirm button cannot become an automatic jump');
 assert.ok(await page.evaluate(()=>window.abyss.position.y)<1.8);await button(0,false);await button(0,true);
 assert.equal(await page.evaluate(()=>window.abyss.input.jump),true);assert.ok(await page.evaluate(()=>window.abyss.position.y)>1.8);await button(0,false);
 await button(7,true);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.abyss.input.fire),true);
 await tap(9);assert.equal(await page.evaluate(()=>window.abyss.mode),'paused');await tap(9);assert.equal(await page.evaluate(()=>window.abyss.mode),'playing');
 await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>window.abyss.input.fire),false,'held trigger requires release after resume');
 await button(7,false);await button(7,true);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.abyss.input.fire),true);await button(7,false);
 await page.keyboard.press('Digit3');await button(6,true);await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>window.abyss.stats.homingFired)>0,'LT spends homing reserve');await button(6,false);
 await page.evaluate(()=>{window.testPad.connected=false;window.secondPad.connected=true;window.secondPad.buttons[9].pressed=true;});await page.waitForFunction(()=>window.abyss.mode==='paused');
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.abyss.mode),'paused','replacement controller cannot resume through its detection button');
 await button(9,false,'secondPad');await tap(9,'secondPad');assert.equal(await page.evaluate(()=>window.abyss.mode),'playing');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForFunction(()=>window.abyss.mode==='paused');
 assert.equal(await page.evaluate(()=>window.abyss.input.fire),false,'blur releases actions');await tap(9,'secondPad');
 await tap(9,'secondPad');await page.click('#pause-settings');await page.selectOption('#control-scheme','azerty');await page.locator('#fov').focus();await page.keyboard.press('Escape');await page.click('#resume');
 await page.waitForFunction(()=>window.abyss.mode==='playing'&&!!document.pointerLockElement);
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyW'})));await page.waitForTimeout(90);
 assert.equal(await page.evaluate(()=>window.abyss.input.forward),1,'movement works after leaving a focused slider');
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW'})));await page.waitForTimeout(90);
 assert.equal(await page.evaluate(()=>window.abyss.input.forward),0,'keyup clears the original letter if layout changed while held');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.abyss.mode==='paused'&&!document.pointerLockElement);await page.click('#pause-settings');await page.selectOption('#control-scheme','controller');
 for(const viewport of [{width:1280,height:620},{width:390,height:640},{width:640,height:360}]){
  await page.setViewportSize(viewport);await page.locator('#settings-close').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#settings-close').isVisible());
  assert.equal(await page.evaluate(()=>{const el=document.querySelector('.settings-panel');return el.scrollWidth<=el.clientWidth+1;}),true,'options never overflow horizontally');
 }
 await page.screenshot({path:'artifacts/control-options-small.png'});
 await page.click('#settings-close');await page.click('#quit');
 await page.evaluate(()=>{window.testPad.connected=false;window.secondPad.connected=false;});await page.click('#start');await page.waitForFunction(()=>window.abyss.mode==='paused');
 assert.match(await page.locator('#controller-status').textContent(),/Connect a controller/);
 assert.deepEqual(errors,[]);console.log('Controls edge audit passed: layout switching, modal Escape, confirm/trigger carryover, homing, controller replacement, blur, key release, missing controller, responsive options.');
}finally{await browser.close();}
