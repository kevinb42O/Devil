import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const pages=[],errors=[],url=process.env.GAME_URL||'http://127.0.0.1:5173';
try{
 for(const role of ['host','guest']){
  const context=await browser.newContext(role==='guest'?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{});
  await context.addInitScript(role=>{
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:role==='guest'?'mobile':'qwerty'}));
   Element.prototype.requestFullscreen=undefined;
   localStorage.setItem('abyss-player-profile',JSON.stringify({name:role,configured:true}));
  },role);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
  await page.evaluate(async()=>{
   const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
   const {FriendsSession}=await import(moduleUrl('multiplayer')),{LobbyBrowser}=await import(moduleUrl('lobbies'));
   LobbyBrowser.prototype.start=async function(){this.rooms.set('PHONE001',{id:'PHONE001',name:'Phone regression',host:'host',players:1,ready:0,state:'waiting',updated:Date.now()});this.onChange();};
   FriendsSession.prototype.hostPublic=async function(){this.onChange();window.session=this;};
   FriendsSession.prototype.joinPublic=async function(){window.session=this;};
  });
  await page.locator('#friends-open').click();pages.push(page);
 }
 const [host,guest]=pages;await host.locator('#friends-host').click();await guest.locator('.join-lobby').click();
 assert.equal(await guest.locator('#friends-player-count').textContent(),'CONNECTING…');
 assert.equal(await guest.locator('#friends-ready').isDisabled(),true);
 assert.equal(await guest.locator('#friends-ready').isDisabled(),true);
 const offer=await host.evaluate(()=>window.session.offer());
 const answer=await guest.evaluate(offer=>window.session.answer(offer),offer);await host.evaluate(answer=>window.session.accept(answer),answer);
 await guest.waitForFunction(()=>window.abyss.friends?.members.length===2&&!document.querySelector('#friends-ready').disabled);
 assert.equal(await guest.locator('#friends-player-count').textContent(),'2 / 6 PLAYERS');
 assert.equal(await guest.locator('#friends-status').textContent(),'Connected to your crew.');
 await guest.locator('#courtyard-ready').tap();
 await host.waitForFunction(()=>window.abyss.friends.members.find(p=>!p.host)?.ready);
 await host.locator('#friends-ready').evaluate(button=>button.click());
 await host.waitForFunction(()=>window.abyss.friends.allReady);await host.evaluate(()=>window.session.openPit());
 await guest.waitForFunction(()=>window.abyss.entrance&&window.abyss.mode==='playing'&&window.abyss.courtyard.phase==='open');
 assert.deepEqual(errors,[]);
 console.log('Mobile lobby UI passed: connecting state, two-player roster, touch Ready, host readiness and host-opened pit.');
}finally{await browser.close();}
