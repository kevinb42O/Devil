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
 await guest.bringToFront();await guest.locator('#game').click();await guest.waitForFunction(()=>!!document.pointerLockElement);
 await guest.keyboard.down('KeyW');await guest.mouse.down();await host.waitForFunction(()=>window.abyss.stats.shots>0);
 await kill(localId);await guest.waitForFunction(()=>window.abyss.spectating);
 await guest.waitForFunction(()=>document.querySelector('#phase').textContent==='SPECTATING');
 const death=await sample(guest);assert.equal(death.state.mode,'playing');assert.equal(death.hand,false);assert.equal(death.killcam,false);assert.equal(death.deathPanel,false);assert.equal(death.state.input.fire,false);assert.equal(death.state.input.jump,false);
 assert.ok(death.gore.some(g=>g.id===localId&&g.visible&&g.assetsReady),'guest death still displays the gore burst');
 assert.match(await guest.locator('#crew-hud').textContent(),/SPECTATING/);assert.match(await guest.locator('#phase').textContent(),/SPECTATING/);
 const body=death.state.position,shots=death.state.stats.shots;
 await guest.waitForTimeout(200);assert.equal((await sample(guest)).state.stats.shots,shots,'held mouse cannot fire after death');
 await guest.keyboard.up('KeyW');await guest.mouse.up();
 await fly(guest,'KeyW',2,-1);await fly(guest,'KeyE',1,1);await fly(guest,'ControlLeft',1,-1);
 await guest.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:100,movementY:-1000})));
 await guest.waitForFunction(()=>window.abyss.pitch===Math.PI/2);assert.notEqual((await sample(guest)).state.yaw,death.state.yaw);
 assert.deepEqual((await sample(guest)).state.position,body,'flight never moves the dead body');
 await guest.evaluate(()=>document.exitPointerLock());await guest.keyboard.press('Escape');assert.equal((await sample(guest)).state.mode,'playing');
 await guest.locator('#game').click();await guest.waitForFunction(()=>!!document.pointerLockElement);
 // The host also becomes a free spectator while a third crew member survives.
 await kill('host');await host.waitForFunction(()=>window.abyss.spectating);const hostDeath=await sample(host);
 assert.equal(hostDeath.hand,false);assert.equal(hostDeath.killcam,false);assert.equal(hostDeath.deathPanel,false);
 await fly(host,'KeyD',0,1);
 await guest.bringToFront();await guest.waitForTimeout(150);
 const beforeWipe=await Promise.all(pages.map(sample));
 await kill('audit-survivor');for(const page of pages)await page.waitForFunction(()=>window.abyss.mode==='dead');
 const wipe=await Promise.all(pages.map(sample));
 for(let i=0;i<pages.length;i++){
  assert.deepEqual(wipe[i].state.cameraPosition,beforeWipe[i].state.cameraPosition,`${i===0?'host':'guest'} camera must not snap to corpse on crew wipe`);
  assert.equal(wipe[i].hand,false,'weapon stays hidden at crew wipe');assert.equal(wipe[i].killcam,false);assert.equal(wipe[i].deathPanel,true);
 }
 assert.equal(await guest.locator('#retry').isVisible(),false);
 // Host returns everyone to the lobby and a new epoch restores living controls.
 await host.bringToFront();await host.click('#retry');
 for(const page of pages)await page.waitForFunction(()=>window.abyss.mode==='menu'&&!window.abyss.spectating);
 await startRound();for(const page of pages){const a=await sample(page);assert.equal(a.state.spectating,false);assert.equal(a.hand,true);assert.equal(a.gore.length,0);assert.equal(a.killcam,false);}
 // A fall death starts within the fixed arena bubble, and never starts a killcam.
 await kill('host',true);await host.waitForFunction(()=>window.abyss.spectating);
 const fall=await sample(host),[x,y,z]=fall.state.cameraPosition;
 assert.ok(Math.hypot(x,y-8,z)<=50+1e-6);assert.ok(y>=1);assert.equal(fall.hand,false);assert.equal(fall.killcam,false);
 // The final living client has no free camera yet when the team dies.
 await kill('audit-survivor');await host.waitForFunction(()=>window.abyss.friends.crew.find(p=>p.id==='audit-survivor').alive===false);
 assert.equal((await sample(guest)).state.spectating,false);
 await kill(localId);for(const page of pages)await page.waitForFunction(()=>window.abyss.mode==='dead');
 const lastSurvivor=await sample(guest);assert.equal(lastSurvivor.state.spectating,true);assert.equal(lastSurvivor.hand,false);assert.equal(lastSurvivor.killcam,false);
 await host.evaluate(()=>window.auditSession.close());await guest.waitForFunction(()=>window.abyss.mode==='menu'&&!window.abyss.spectating);
 assert.deepEqual(errors,[]);
 console.log('Actual multiplayer spectator flow passed: WebRTC host/guest death, held-input release, flight/aim, recapture, frozen bodies, gore without killcam, stable crew-wipe camera, last-survivor death, round reset, fall bounds and host disconnect.');
}finally{await browser.close();}
