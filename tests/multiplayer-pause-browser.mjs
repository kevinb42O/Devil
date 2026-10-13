import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 for(const scheme of ['qwerty','controller','mobile']){
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(scheme=>{
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,controlScheme:scheme}));
   window.testPad={id:'Pause audit',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
   Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});
  },scheme);
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
  await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
  // Keep this UI regression independent of public lobby discovery. The real
  // session, readiness gate, crew simulation and input handlers still run.
  await page.evaluate(async()=>{
   const {FriendsSession}=await import('/src/multiplayer.ts');
   const {LobbyBrowser}=await import('/src/lobbies.ts');
   LobbyBrowser.prototype.start=async()=>{};
   FriendsSession.prototype.hostPublic=async function(name){this.lobbyName=name;this.onChange();};
   const start=FriendsSession.prototype.start;
   FriendsSession.prototype.start=function(){start.call(this);this.startAt=0;};
  });
  await page.click('#friends-open');await page.click('#friends-host');
  await page.waitForFunction(()=>window.abyss.friends?.members.length===1);
  await page.click('#friends-ready');await page.click('#friends-start');
  await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.time>.1);
  const assertPlaying=async()=>{
   assert.equal(await page.evaluate(()=>window.abyss.mode),'playing',scheme);
   assert.equal(await page.locator('#pause').isVisible(),false,scheme);
  };
  const before=await page.evaluate(()=>window.abyss.time);
  await page.keyboard.press('Escape');await assertPlaying();
  await page.evaluate(()=>window.testPad.buttons[9].pressed=true);
  await page.waitForTimeout(100);await assertPlaying();
  await page.evaluate(()=>window.testPad.buttons[9].pressed=false);
  assert.equal(await page.locator('#timer').isDisabled(),true);
  await page.locator('#timer').evaluate(el=>el.click());await assertPlaying();
  await page.evaluate(()=>{document.exitPointerLock();window.dispatchEvent(new Event('blur'));});
  await page.waitForTimeout(150);await assertPlaying();
  assert.equal(await page.evaluate(()=>window.abyss.input.fire),false);
  assert.ok(await page.evaluate(()=>window.abyss.time)>before,'crew clock continues through pause attempts');
  if(scheme==='controller'){
   await page.evaluate(()=>window.testPad.connected=false);await page.waitForTimeout(100);await assertPlaying();
  }
  // The run still ends normally when the crew dies.
  await page.evaluate(async()=>{
   const {FriendsSession}=await import('/src/multiplayer.ts');
   const step=FriendsSession.prototype.step;
   FriendsSession.prototype.step=function(input){this.world.player.pos.x=100;step.call(this,input);};
  });
  await page.waitForFunction(()=>window.abyss.mode==='dead');
  assert.equal(await page.locator('#pause').isVisible(),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Multiplayer pause regression passed: keyboard, controller, mobile, focus/capture loss, disconnect, continuous clock and normal death.');
}finally{await browser.close();}
