import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],pages=[];
try{
 for(const name of ['Courtyard QA','Invite QA']){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(name=>{localStorage.setItem('abyss-player-profile',JSON.stringify({name,configured:true,automatic:false}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedInvite=text;}}});},name);
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));pages.push(page);
 }
 const [host,guest]=pages;await host.goto(base,{waitUntil:'domcontentloaded'});await host.click('#friends-open');await host.fill('#friends-lobby-name','Courtyard invite check '+Date.now());await host.click('#friends-host');await host.locator('#courtyard-hud').waitFor({state:'visible'});await host.waitForFunction(()=>!document.querySelector('#courtyard-ready').disabled);
 await host.evaluate(()=>document.exitPointerLock());await host.click('#courtyard-room');await host.click('#courtyard-copy-invite');await host.click('#friends-close');await host.evaluate(()=>document.exitPointerLock());const invite=await host.evaluate(()=>window.copiedInvite);assert.equal(new URL(invite).origin,new URL(base).origin);assert.match(new URL(invite).searchParams.get('crew'),/^[A-Z0-9]{6,16}$/);
 await guest.goto(invite,{waitUntil:'domcontentloaded'});await guest.locator('#courtyard-hud').waitFor({state:'visible'});for(const p of pages)await p.waitForFunction(()=>document.querySelector('.courtyard-count').textContent.endsWith('/ 2 ready')&&!document.querySelector('#courtyard-ready').disabled);
 for(const p of pages){await p.evaluate(()=>document.exitPointerLock());await p.click('#courtyard-ready');}await host.waitForFunction(()=>!document.querySelector('#courtyard-open').disabled);
 const box=await host.locator('#courtyard-open').boundingBox();await host.mouse.move(box.x+box.width/2,box.y+box.height/2);await host.mouse.down();await host.waitForTimeout(700);await host.mouse.up();for(const p of pages)await p.waitForFunction(()=>document.querySelector('.courtyard-message').textContent==='Pit open · Jump in');
 await host.click('#courtyard-cancel');for(const p of pages)await p.waitForFunction(()=>!document.querySelector('#courtyard-ready').hidden);
 await host.click('#courtyard-room');await host.click('#friends-leave');await guest.waitForFunction(()=>document.querySelector('#friends-status').textContent.includes('host left'));
 assert.deepEqual(errors,[]);console.log('Production invite passed: real public discovery/signaling, copy-invite URL, automatic guest join, readiness, host pit hold, shared cancel and host departure.');
}finally{await browser.close();}
