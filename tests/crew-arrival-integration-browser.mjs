import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--autoplay-policy=no-user-gesture-required','--disable-features=WebRtcHideLocalIpsWithMdns','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const errors=[];
try{
 const pages=[];
 for(const role of ['host','guest']){
  const context=await browser.newContext({viewport:{width:960,height:600}});
  await context.addInitScript(()=>{
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:55,musicVolume:0,controlScheme:'qwerty'}));
   localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Arrival audit',configured:true}));
  });
  const page=await context.newPage();await page.routeWebSocket(url.replace('http','ws')+'/**',socket=>socket.close());page.on('pageerror',e=>errors.push(`${role}: ${e.message}`));
  console.log("Opening",role);await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
  // Use the actual game UI, sessions, WebRTC, snapshots, renderer and handlers.
  // Replace public discovery with local signaling for a deterministic WebRTC pair.
  await page.evaluate(async()=>{
   const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
   const [{FriendsSession},{LobbyBrowser}]=await Promise.all([import(moduleUrl('multiplayer')),import(moduleUrl('lobbies'))]);
   LobbyBrowser.prototype.start=async function(){this.rooms.set('ARRIVAL',{id:'ARRIVAL',name:'Arrival audit',host:'Audit host',players:1,ready:0,state:'waiting',updated:Date.now()});this.onChange();};
   FriendsSession.prototype.hostPublic=async function(name){this.lobbyName=name;this.iceServers=[];window.auditSession=this;this.onChange();};
   FriendsSession.prototype.joinPublic=async function(){this.iceServers=[];window.auditSession=this;};
   const {Sound}=await import(moduleUrl('audio'));
   const cue=Sound.prototype.crewArrival;
   Sound.prototype.crewArrival=function(beat,remaining){(window.arrivalCues??=[]).push(beat);cue.call(this,beat,remaining);if(beat===0)window.releaseAudio=this.diagnostics;};

  });
  console.log('Ready',role);await page.locator('#friends-open').evaluate(el=>el.click());pages.push(page);
 }
 const [host,guest]=pages;
 await host.bringToFront();await host.locator('#friends-host').evaluate(el=>el.click());await host.waitForFunction(()=>!!window.auditSession,{},{timeout:5000});
 await guest.bringToFront();await guest.locator('.join-lobby').evaluate(el=>el.click());await guest.waitForFunction(()=>!!window.auditSession);
 const offer=await host.evaluate(()=>window.auditSession.offer());
 const answer=await guest.evaluate(offer=>window.auditSession.answer(offer),offer);
 await host.evaluate(answer=>window.auditSession.accept(answer),answer);
 await host.waitForFunction(()=>window.abyss.friends?.connected===1);
 await guest.waitForFunction(()=>window.abyss.friends?.members.length===2);
 for(const page of pages)await page.locator('#friends-ready').evaluate(el=>el.click());
 await host.waitForFunction(()=>window.abyss.friends.allReady);
 await host.locator('#friends-start').evaluate(el=>el.click());
 for(const page of pages)await page.waitForFunction(()=>window.abyss.entrance);
 await host.waitForFunction(()=>window.abyss.audio.loaded>=14);
 // Crossing through the session uses the real arena epoch, state transport, and game handlers.
 await host.evaluate(()=>{
  const session=window.auditSession,c=session.world.courtyard;
  // The courtyard now requires the complete crew below the opened pit.
  // Seed that completed entrance state; retain the real authoritative start gate.
  if(c){for(const member of session.members){member.ready=true;member.loaded=session.epoch;}c.phase='collecting';c.participants=session.members.map(m=>m.id);c.committed=[...c.participants];}
  session.start(true);
 });
 for(const page of pages)await page.waitForFunction(()=>window.arrivalCues?.includes(0));
 for(const page of pages){
  const cues=await page.evaluate(()=>window.arrivalCues);assert.equal(cues[0],6);assert.equal(cues.at(-1),0);assert.equal(new Set(cues).size,cues.length);
  const audio=await page.evaluate(()=>window.releaseAudio);
  assert.ok(audio.oneShotNames.includes('spawnplayer'),JSON.stringify(audio));
  assert.ok(!audio.oneShotNames.includes('crew-countdown'),JSON.stringify(audio));
  assert.equal(await page.locator('.arrival-value').textContent(),'SURVIVE');
 }

 for(const page of pages){
  await page.waitForFunction(()=>document.querySelector('#crew-arrival').hidden);
  assert.ok(await page.evaluate(()=>window.abyss.time>0));
 }
 // Freeze a presentation sample after the live gate so screenshot speed cannot affect timing checks.
 await host.evaluate(async()=>{
  const {CrewArrival}=await import('/src/crew-arrival.ts');document.querySelector('#crew-arrival').remove();
  window.arrivalPreview=new CrewArrival(()=>{});window.arrivalPreview.update(1,4000,1800,2);
 });
 await host.screenshot({path:'artifacts/crew-arrival-desktop.png'});
 await host.setViewportSize({width:390,height:844});
 await host.screenshot({path:'artifacts/crew-arrival-mobile.png'});
 await host.setViewportSize({width:1280,height:800});
 await host.evaluate(()=>window.arrivalPreview.update(1,4000,4000,2));
 await host.screenshot({path:'artifacts/crew-arrival-release.png'});
 // Regression: startAt disappears in guest snapshots at the first simulation tick.
 const edge=await guest.evaluate(async()=>{
  const {CrewArrival}=await import('/src/crew-arrival.ts');const cues=[];
  const arrival=new CrewArrival(beat=>cues.push(beat));
  arrival.update(1,6000,1000,2);arrival.update(1,6000,2000,2);arrival.update(1,6000,3000,2);
  arrival.update(1,0,6010,2);arrival.update(1,0,6020,2);arrival.update(1,0,6900,2);
  const hidden=arrival.element.hidden;
  arrival.reset();arrival.update(2,0,9000,2);const lateHidden=arrival.element.hidden;
  arrival.reset();arrival.update(3,12000,9000,2);arrival.update(3,12000,11000,2);arrival.update(3,12100,11010,2);
  arrival.reset();arrival.element.remove();return {cues,hidden,lateHidden};
 });
 assert.deepEqual(edge,{cues:[5,4,3,0,3,1],hidden:true,lateHidden:true});
 assert.deepEqual(errors,[]);
 console.log('Crew arrival passed: real host/guest countdown, frozen simulation, single beat cues, countdown voice and spawn release, mobile layout, cleanup, cleared guest deadline, late joins and clock correction.');
}finally{await browser.close();}
