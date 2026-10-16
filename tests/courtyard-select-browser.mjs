import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5195,strictPort:false,watch:{ignored:['**/external-trainer/**']}}});
await server.listen();
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Select test',configured:true}));
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:'controller'}));
  window.testPad={id:'Select controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
  Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});
 });
 await page.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.abyss?.courtyardAssets.loaded&&window.abyss.originalAssets,{timeout:60000});
 await page.evaluate(async()=>{const {FriendsSession}=await import('/src/multiplayer.ts');FriendsSession.prototype.hostPublic=async function(){this.room='SELECT01';this.lobbyName='Select regression';window.session=this;this.onChange();};});
 await page.click('#friends-open');await page.click('#friends-host');
 await page.waitForFunction(()=>window.abyss.friends?.members[0].loaded===window.abyss.friends?.epoch);
 await page.bringToFront();
 const set=async held=>page.evaluate(value=>{window.testPad.buttons[8].pressed=value;window.testPad.buttons[8].value=Number(value);},held);
 await page.evaluate(()=>{window.session.world.player.pos.x=0;window.session.world.player.pos.z=2;});
 await set(true);
 await page.locator('.courtyard-select-charge').waitFor({state:'visible'});
 await page.waitForTimeout(5500);
 assert.equal(await page.evaluate(()=>window.session.courtyard.phase),'gathering','cover blockage prevents opening');
 assert.match(await page.locator('.courtyard-select-reason').textContent(),/Clear the pit cover/);
 await page.evaluate(()=>{window.session.world.player.pos.z=8;});
 await page.waitForFunction(()=>window.session.courtyard.phase!=='gathering');
 const state=await page.evaluate(()=>({phase:window.session.courtyard.phase,ready:window.session.members[0].ready,reason:window.session.pitBlockedReason,meterHidden:document.querySelector('.courtyard-select-charge').hidden,mode:window.abyss.mode}));
 await set(false);
 assert.notEqual(state.phase,'gathering',JSON.stringify(state));
 assert.deepEqual(errors,[]);
 console.log('Holding the actual controller Select input readies the host and opens the real courtyard pit:',state);
}finally{await browser.close();await server.close();}
