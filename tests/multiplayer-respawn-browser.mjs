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
   localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Spectator audit',configured:true}));
  });
  const page=await context.newPage();await page.routeWebSocket(url.replace('http','ws')+'/**',socket=>socket.close());page.on('pageerror',e=>errors.push(`${role}: ${e.message}`));
  await page.goto(url);await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
  // Use the actual game UI, sessions, WebRTC, snapshots, renderer and handlers.
  // Replace public discovery only, and control lethal contacts deterministically.
  await page.evaluate(async()=>{
   const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
   const [{FriendsSession},{LobbyBrowser},{GameRenderer},{v}]=await Promise.all([import(moduleUrl('multiplayer')),import(moduleUrl('lobbies')),import(moduleUrl('renderer')),import(moduleUrl('simulation'))]);
   LobbyBrowser.prototype.start=async function(){this.rooms.set('SPECTATE',{id:'SPECTATE',name:'Spectator audit',host:'Audit host',players:1,ready:0,state:'waiting',updated:Date.now()});this.onChange();};
   FriendsSession.prototype.hostPublic=async function(name){this.lobbyName=name;this.iceServers=[];window.auditSession=this;this.onChange();};
   FriendsSession.prototype.joinPublic=async function(){this.iceServers=[];window.auditSession=this;};
   const start=FriendsSession.prototype.start;
   FriendsSession.prototype.start=function(){start.call(this);this.startAt=0;this.world.options.schedule=false;this.world.addCrew('audit-survivor');this.world.crew.forEach((p,i)=>{p.player.pos=v((i-1)*8,1.8,2);});};
   const step=FriendsSession.prototype.step;
   FriendsSession.prototype.step=function(input){
    window.auditWorld=this.world;this.world.enemies=[];
    if(window.auditKill){
     const {id,fall}=window.auditKill,p=this.world.crew.find(p=>p.id===id);
     if(fall){p.player.pos=v(85,-9,85);}else {const enemy=this.world.spawn('skull',{...p.player.pos});enemy.age=12;}
     window.auditKill=null;
    }
    step.call(this,input);
   };
   const reconcile=FriendsSession.prototype.reconcile;
   FriendsSession.prototype.reconcile=function(w,s){window.auditWorld=w;reconcile.call(this,w,s);};
   const render=GameRenderer.prototype.render;
   GameRenderer.prototype.render=function(...args){window.auditRenderer=this;if(!this.auditHandHook){this.auditHandHook=true;const handRender=this.originalWeapon.render.bind(this.originalWeapon);this.originalWeapon.render=(gpu,hidden)=>{window.auditHandHidden=hidden;handRender(gpu,hidden);};}render.apply(this,args);};
  });
  await page.click('#friends-open');pages.push(page);
 }
 const [host,guest]=pages;
 await host.bringToFront();await host.click('#friends-host');await host.waitForFunction(()=>!!window.auditSession,{},{timeout:5000});
 await guest.bringToFront();await guest.locator('.join-lobby').click();await guest.waitForFunction(()=>!!window.auditSession);
 const offer=await host.evaluate(()=>window.auditSession.offer());
 const answer=await guest.evaluate(offer=>window.auditSession.answer(offer),offer);
 await host.evaluate(answer=>window.auditSession.accept(answer),answer);
 await host.waitForFunction(()=>window.abyss.friends?.connected===1);
 await guest.waitForFunction(()=>window.abyss.friends?.members.length===2);
 const startRound=async()=>{
  for(const page of pages){await page.bringToFront();await page.locator('#friends-ready').evaluate(el=>el.click());}
  await host.waitForFunction(()=>window.abyss.friends.allReady);await host.bringToFront();await host.click('#friends-start');
  for(const page of pages)await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.friends.crew?.length===3&&window.abyss.time>.1);
 };
 const kill=async(id,fall=false)=>{await host.evaluate(({id,fall})=>window.auditKill={id,fall},{id,fall});};
 const localId=await guest.evaluate(()=>window.auditSession.localId);
 const sample=page=>page.evaluate(()=>({state:window.abyss,hand:!window.auditHandHidden,gore:window.auditRenderer.crewDeathPresentation,killcam:!document.querySelector('#death-analysis').hidden,deathPanel:!document.querySelector('#death').hidden}));
 const fly=async(page,code,axis,sign)=>{
  await page.bringToFront();const before=(await sample(page)).state.cameraPosition[axis];
  await page.keyboard.down(code);await page.waitForFunction(({before,axis,sign})=>sign*(window.abyss.cameraPosition[axis]-before)>.5,{before,axis,sign},{timeout:5000});await page.keyboard.up(code);
 };
 await startRound();
 // Shared collection drives both visible counters; spending reserve is separate.
 await host.evaluate(()=>{for(let i=0;i<80;i++)window.auditWorld.collect();});
 for(const page of pages){await page.waitForFunction(()=>document.querySelector('#gems').textContent==='80');assert.equal(await page.locator('.economy').isVisible(),true);assert.equal(await page.locator('.economy').innerText(),'80\n70');}
 await guest.bringToFront();await guest.locator('#game').click();await guest.waitForFunction(()=>!!document.pointerLockElement);
 await guest.keyboard.down('KeyW');await guest.mouse.down();await host.waitForFunction(()=>window.abyss.stats.shots>0);
 await kill(localId);await guest.waitForFunction(()=>window.abyss.spectating);
 assert.equal(await guest.locator('#respawn-status').isVisible(),true);assert.match(await guest.locator('#respawn-status').textContent(),/RESPAWNING IN 15s/);
 await host.evaluate(()=>window.auditWorld.collect());
 for(const page of pages)await page.waitForFunction(()=>document.querySelector('#gems').textContent==='81');
 const deadline=await host.evaluate(id=>window.auditWorld.crew.find(p=>p.id===id).respawnAt,localId);
 const shotCount=await host.evaluate(()=>window.abyss.stats.shots);
 await guest.keyboard.up('KeyW');await guest.mouse.up();await guest.keyboard.down('KeyD');
 await guest.waitForFunction(()=>window.abyss.friends.crew.find(p=>p.id===window.auditSession.localId).life===1&&!window.abyss.spectating,{},{timeout:20000});
 assert.equal(await guest.locator('#respawn-status').isVisible(),false);
 const revived=await sample(guest);assert.equal(revived.hand,true);assert.equal(revived.deathPanel,false);assert.equal(revived.state.input.fire,false);assert.equal(revived.state.input.strafe,0);assert.equal(revived.state.stats.shots,shotCount);
 const hostLife=await host.evaluate(id=>({time:window.abyss.time,p:window.auditWorld.crew.find(p=>p.id===id)}),localId);
 assert.ok(hostLife.time>=deadline);assert.ok(hostLife.time<deadline+1);assert.equal(hostLife.p.life,1);assert.equal(hostLife.p.alive,true);
 await guest.keyboard.up('KeyD');await guest.keyboard.down('KeyW');
 const before=await host.evaluate(id=>({...window.auditWorld.crew.find(p=>p.id===id).player.pos}),localId);
 await host.waitForFunction(({id,before})=>{const pos=window.auditWorld.crew.find(p=>p.id===id).player.pos;return Math.hypot(pos.x-before.x,pos.z-before.z)>.5;},{id:localId,before},{timeout:5000});await guest.keyboard.up('KeyW');
 await guest.mouse.down();await host.waitForFunction(n=>window.abyss.stats.shots>n,shotCount);await guest.mouse.up();
 // The host returns from free flight even if revival occurs during a batch of ticks.
 await kill('host');await host.waitForFunction(()=>window.abyss.spectating);assert.equal(await host.locator('#respawn-status').isVisible(),true);assert.match(await host.locator('#respawn-status').textContent(),/RESPAWNING IN 15s/);
 await host.evaluate(()=>{window.auditWorld.time=window.auditWorld.crew[0].respawnAt-.1;});
 await host.waitForFunction(()=>window.abyss.friends.crew[0].life===1&&!window.abyss.spectating);
 const hostRevived=await sample(host);assert.equal(hostRevived.hand,true);assert.equal(hostRevived.state.input.fire,false);assert.ok(Math.abs(hostRevived.state.pitch)<=1.5);
 // A second death receives a new deadline; a total wipe cancels the pending return.
 await kill(localId,true);await guest.waitForFunction(()=>window.abyss.spectating);
 assert.equal(await guest.locator('#respawn-status').isVisible(),true);assert.match(await guest.locator('#respawn-status').textContent(),/RESPAWNING IN 15s/);
 await host.evaluate(()=>{for(const p of window.auditWorld.crew)if(p.alive)p.player.pos={x:85,y:-9,z:85};});
 for(const page of pages)await page.waitForFunction(()=>window.abyss.mode==='dead');
 assert.ok(await host.evaluate(()=>window.abyss.friends.crew.every(p=>!p.alive)));
 await host.bringToFront();await host.click('#retry');for(const page of pages)await page.waitForFunction(()=>window.abyss.mode==='menu');
 await startRound();for(const page of pages){await page.waitForFunction(()=>document.querySelector('#gems').textContent==='0');assert.equal(await page.locator('#respawn-status').isVisible(),false);}for(const page of pages)assert.ok(await page.evaluate(()=>window.abyss.friends.crew.every(p=>p.life===0&&p.alive&&p.respawnAt===null)));
 assert.deepEqual(errors,[]);
 console.log('Multiplayer respawn passed: real 15s guest countdown, WebRTC revival, first-person return, cleared spectator inputs, fresh movement/fire, host revival, repeat death, wipe and restart.');
}finally{await browser.close();}
