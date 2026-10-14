import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,controlScheme:'qwerty'}));
  window.allowFrames=true;const raf=requestAnimationFrame.bind(window);
  window.requestAnimationFrame=cb=>raf(now=>{if(window.allowFrames)cb(now);else window.savedFrame=cb;});
 });
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
 await page.evaluate(async()=>{
  const {FriendsSession}=await import('/src/multiplayer.ts'),{LobbyBrowser}=await import('/src/lobbies.ts');
  LobbyBrowser.prototype.start=async()=>{};FriendsSession.prototype.hostPublic=async function(){this.onChange();};
  const start=FriendsSession.prototype.start;FriendsSession.prototype.start=function(){start.call(this);this.startAt=0;};
 });
 await page.click('#friends-open');await page.click('#friends-host');await page.click('#friends-ready');await page.click('#friends-start');await page.waitForFunction(()=>window.abyss.time>.1);
 const before=await page.evaluate(()=>{window.allowFrames=false;return window.abyss.time;});
 await page.waitForFunction(before=>window.abyss.time>=before+1,before,{timeout:3000,polling:50});
 const during=await page.evaluate(()=>window.abyss.time);assert.ok(during-before<1.3);
 await page.evaluate(()=>{window.allowFrames=true;if(window.savedFrame)requestAnimationFrame(window.savedFrame);});
 await page.waitForFunction(during=>window.abyss.time>during+.1,during);
 assert.deepEqual(errors,[]);console.log('Host simulation advances at real time with rendering suspended, then resumes without duplicate ticks:',JSON.stringify({before,during}));
 await page.locator('#friends-leave').evaluate(el=>el.click());
}finally{await browser.close();}
