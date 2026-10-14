import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--disable-features=WebRtcHideLocalIpsWithMdns','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const errors=[];
try{
 const pages=[];
 for(const role of ['host','guest']){
  const context=await browser.newContext({viewport:{width:960,height:600}});
  await context.addInitScript(()=>{
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:'qwerty'}));
   localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Connection audit',configured:true}));
  });
  const page=await context.newPage();await page.routeWebSocket(url.replace('http','ws')+'/**',socket=>socket.close());page.on('pageerror',e=>errors.push(`${role}: ${e.message}`));
  await page.goto(url);await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
  await page.evaluate(async()=>{
   const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
   const [{FriendsSession},{LobbyBrowser}]=await Promise.all([import(moduleUrl('multiplayer')),import(moduleUrl('lobbies'))]);
   LobbyBrowser.prototype.start=async function(){this.rooms.set('METERTEST',{id:'METERTEST',name:'Connection audit',host:'Audit host',players:1,ready:0,state:'waiting',updated:Date.now()});this.onChange();};
   FriendsSession.prototype.hostPublic=async function(){this.iceServers=[];window.auditSession=this;this.onChange();};
   FriendsSession.prototype.joinPublic=async function(){this.iceServers=[];window.auditSession=this;};
   const start=FriendsSession.prototype.start;
   FriendsSession.prototype.start=function(){start.call(this);this.startAt=0;this.world.options.schedule=false;this.world.options.invulnerable=true;};
  });
  assert.equal(await page.locator('#connection-meter').isVisible(),false);
  await page.click('#friends-open');pages.push(page);
 }
 const [host,guest]=pages;
 await host.click('#friends-host');await host.waitForFunction(()=>!!window.auditSession);
 await guest.locator('.join-lobby').click();await guest.waitForFunction(()=>!!window.auditSession);
 const offer=await host.evaluate(()=>window.auditSession.offer());
 const answer=await guest.evaluate(offer=>window.auditSession.answer(offer),offer);
 await host.evaluate(answer=>window.auditSession.accept(answer),answer);
 for(const page of pages)await page.waitForFunction(()=>window.auditSession.connection.state==='connected');
 for(const page of pages)await page.locator('#friends-ready').evaluate(el=>el.click());
 await host.waitForFunction(()=>window.abyss.friends.allReady);await host.click('#friends-start');
 for(const page of pages){
  await page.waitForFunction(()=>window.abyss.mode==='playing');
  assert.equal(await page.locator('#connection-meter').isVisible(),true);
  assert.match(await page.locator('#connection-value').textContent(),/^\d+$/);
  assert.match(await page.locator('#connection-meter').getAttribute('aria-label'),/round-trip latency/);
  await page.waitForFunction(()=>Number(document.querySelector('#fps-value').textContent)>0);
  assert.equal(await page.locator('#fps-meter small').textContent(),'FPS');
 }
 // Freeze periodic probes only while checking controlled latency/freshness states.
 await host.evaluate(()=>{clearInterval(window.auditSession.networkTimer);window.auditSession.pumpNetwork=()=>{};});
 for(const [rtt,quality]of [[42,'good'],[120,'fair'],[250,'poor']]){
  await host.evaluate(rtt=>{for(const link of window.auditSession.links.values()){link.rttMs=rtt;link.pongAt=performance.now();}},rtt);
  await host.waitForFunction(({rtt,quality})=>document.querySelector('#connection-value').textContent===String(rtt)&&document.querySelector('#connection-meter').dataset.quality===quality,{rtt,quality});
 }
 // Near-threshold changes should update the number without flickering the bars.
 for(const [rtt,quality]of [[155,'poor'],[145,'fair'],[79,'fair'],[70,'good'],[85,'good'],[95,'fair']]){
  await host.evaluate(rtt=>{for(const link of window.auditSession.links.values()){link.rttMs=rtt;link.pongAt=performance.now();}},rtt);
  await host.waitForFunction(({rtt,quality})=>document.querySelector('#connection-value').textContent===String(rtt)&&document.querySelector('#connection-meter').dataset.quality===quality,{rtt,quality});
 }
 assert.equal(await host.locator('#connection-context').textContent(),'CREW');
 assert.equal(await guest.locator('#connection-context').textContent(),'PING');
 const widths=[];
 for(const rtt of [9,99,999]){
  await host.evaluate(rtt=>{for(const link of window.auditSession.links.values()){link.rttMs=rtt;link.pongAt=performance.now();}},rtt);
  await host.waitForFunction(rtt=>document.querySelector('#connection-value').textContent===String(rtt),rtt);
  widths.push((await host.locator('#connection-meter').boundingBox()).width);
 }
 assert.ok(Math.max(...widths)-Math.min(...widths)<1,'ping digits should not shift the meter');
 for(const viewport of [{width:1280,height:720},{width:640,height:360}]){
  await host.setViewportSize(viewport);
  const box=await host.locator('#connection-meter').boundingBox(),timer=await host.locator('#timer').boundingBox();
  assert.ok(box.x>=18&&box.y>=12&&box.width<185&&box.height<=28,JSON.stringify(box));
  assert.ok(box.x+box.width<timer.x);
 }
 await host.setViewportSize({width:1280,height:720});
 await host.evaluate(()=>{for(const link of window.auditSession.links.values()){link.rttMs=42;link.pongAt=performance.now();}});
 await host.waitForFunction(()=>document.querySelector('#connection-value').textContent==='42');
 await host.screenshot({path:'/tmp/multiplayer-connection-meter.png'});
 await host.evaluate(()=>{for(const link of window.auditSession.links.values())link.pongAt=performance.now()-4000;});
 await host.waitForFunction(()=>document.querySelector('#connection-value').textContent==='WAIT');
 assert.equal(await host.locator('#connection-unit').isVisible(),false);
 // Multiple peers must report the slowest, independent of reply ordering.
 const aggregate=await host.evaluate(()=>{
  const session=window.auditSession,link=[...session.links.values()][0];link.pongAt=performance.now();link.rttMs=42;
  session.links.set('audit-slow',{...link,rttMs:180});const result=session.connection;
  session.links.delete('audit-slow');return result;
 });
 assert.deepEqual(aggregate,{state:'connected',rttMs:180});
 for(const page of pages)await page.evaluate(()=>window.auditSession.close());
 assert.deepEqual(errors,[]);
 console.log('Connection meter passed: live WebRTC ping, host/guest HUD, quality states, stale replies, slowest peer and compact placement.');
}finally{await browser.close();}
