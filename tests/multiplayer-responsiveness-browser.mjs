import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const pages=[],errors=[],name='Responsiveness '+Date.now();
 for(let i=0;i<2;i++){
  const page=await browser.newPage({viewport:{width:960,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,controlScheme:'qwerty'}));
   // Only enable artificial delay once both channels and the game are ready.
   window.networkDelay=0;const original=RTCDataChannel.prototype.send;RTCDataChannel.prototype.send=function(data){const delay=window.networkDelay;if(!delay)return original.call(this,data);setTimeout(()=>{if(this.readyState==='open')original.call(this,data);},delay);};
  });
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);await page.click('#friends-open');await page.fill('#friends-name',i?'Guest':'Host');pages.push(page);
 }
 const [host,guest]=pages;await host.fill('#friends-lobby-name',name);await host.click('#friends-host');await host.waitForFunction(()=>window.abyss.friends?.members.length===1);
 const row=guest.locator('.public-lobby').filter({hasText:name});await row.waitFor({timeout:30000});await row.locator('.join-lobby').click();await host.waitForFunction(()=>window.abyss.friends.connected===1,{},{timeout:35000});await guest.waitForFunction(()=>window.abyss.friends.members.length===2);
 for(const page of pages){await page.bringToFront();await page.locator('#friends-ready').click();}await host.waitForFunction(()=>window.abyss.friends.allReady);await host.bringToFront();await host.click('#friends-start');
 // Starting the crew opens the shared courtyard. Walk through the seal before
 // expecting the survival clock to advance, just as the real players do.
 await host.waitForFunction(()=>window.abyss.entrance);await host.keyboard.down('KeyW');
 try{await host.waitForFunction(()=>!window.abyss.entrance,{},{timeout:30000});}finally{await host.keyboard.up('KeyW');}
 await guest.waitForFunction(()=>window.abyss.time>.2);await guest.bringToFront();await guest.waitForFunction(()=>window.abyss.mode==='playing');
 // With half a second of delay in each direction, no host response can arrive
 // during the next frame. Inspect the real keyboard handler and rendered camera.
 for(const page of pages)await page.evaluate(()=>window.networkDelay=500);
 const hostBefore=await host.evaluate(()=>window.abyss.friends.crew[1].position.x);
 const response=await guest.evaluate(async()=>{
  const before=window.abyss.position.x,cameraBefore=window.abyss.cameraPosition[0];
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',code:'KeyD'}));
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const after=window.abyss.position.x,cameraAfter=window.abyss.cameraPosition[0];
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'d',code:'KeyD'}));
  return {before,after,cameraBefore,cameraAfter,network:window.abyss.friends.network};
 });
 const hostAfter=await host.evaluate(()=>window.abyss.friends.crew[1].position.x);
 assert.ok(response.after>response.before,'Actual guest controller must move on the next frame');assert.ok(response.cameraAfter>response.cameraBefore,'Rendered camera must respond on the next frame');assert.equal(hostAfter,hostBefore,'Local movement must precede the delayed host response');
 // Losing focus while commands are in flight must release controls and eventually
 // recover prediction history rather than replaying old held movement forever.
 await guest.keyboard.press('Escape');assert.equal(await guest.evaluate(()=>window.abyss.mode),'playing');await guest.evaluate(()=>{document.exitPointerLock();window.dispatchEvent(new Event('blur'));});assert.equal(await guest.evaluate(()=>window.abyss.mode),'playing');for(const page of pages)await page.evaluate(()=>window.networkDelay=0);try{await guest.waitForFunction(()=>window.abyss.friends.network.pendingInputs<60,{},{timeout:10000});}catch(error){console.log('Host:',await host.evaluate(()=>window.abyss));console.log('Guest:',await guest.evaluate(()=>window.abyss));throw error;}
 assert.deepEqual(errors,[]);console.log('Actual game UI responds on the next frame despite 1,000 ms added RTT:',JSON.stringify(response));
 for(const page of pages)await page.locator('#friends-leave').evaluate(el=>el.click());
}finally{await browser.close();}
