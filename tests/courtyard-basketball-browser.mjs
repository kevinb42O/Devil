import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5197,strictPort:false,watch:null,hmr:false}});await server.listen();
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const errors=[],missing=[],pages=[];mkdirSync('artifacts/basketball',{recursive:true});
try{
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(i=>{localStorage.setItem('abyss-player-profile',JSON.stringify({name:i?'Hoops guest':'Hoops host',configured:true}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:i?'qwerty':'controller'}));window.testPad={id:'Basketball controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>!i||window.controllerConnected?[window.testPad]:[]});},i);
  const p=await context.newPage();p.setDefaultTimeout(25000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&r.url().includes('/models/basketball/'))missing.push(r.url());});
  await p.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.abyss?.courtyardAssets.loaded&&window.abyss.originalAssets,undefined,{timeout:60000});
  await p.evaluate(async()=>{const {FriendsSession}=await import('/src/multiplayer.ts'),{LobbyBrowser}=await import('/src/lobbies.ts');LobbyBrowser.prototype.start=async function(){this.rooms.set('BASKET01',{id:'BASKET01',name:'Hoops',host:'Hoops host',players:1,ready:0,state:'waiting',updated:Date.now()});this.onChange();};FriendsSession.prototype.hostPublic=async function(){this.room='BASKET01';window.session=this;this.onChange();};FriendsSession.prototype.joinPublic=async function(){window.session=this;};});
  await p.click('#friends-open');pages.push(p);
 }
 console.log('Assets ready on both clients');
 const [host,guest]=pages;await host.click('#friends-host');await host.waitForFunction(()=>window.abyss.friends?.prelobby);await guest.click('.join-lobby');const offer=await host.evaluate(()=>window.session.offer()),answer=await guest.evaluate(o=>window.session.answer(o),offer);await host.evaluate(a=>window.session.accept(a),answer);await guest.waitForFunction(()=>window.abyss.friends?.prelobby&&window.abyss.friends.members.length===2);
 console.log('WebRTC connected');
 // Controller movement from spawn enters the new court directly to the right.
 await host.bringToFront();await host.evaluate(()=>window.testPad.axes[0]=1);await host.waitForFunction(()=>window.abyss.position.x>9);await host.evaluate(()=>window.testPad.axes[0]=0);assert.ok(await host.evaluate(()=>window.abyss.position.z>6&&window.abyss.position.z<10));
 await host.waitForFunction(()=>!document.querySelector('.courtyard-basketball-controls').hidden);await host.evaluate(()=>window.__abyssTrainerAccess.set(Math.PI,0));await host.screenshot({path:'artifacts/basketball/right-side-entrance.png'});
 console.log('Direct entrance checked');
 // Host picks up with the controller action button; guest uses E over WebRTC.
 await host.evaluate(()=>{const w=window.session.world;w.crew[0].player.pos={x:12,y:1.7,z:8};w.crew[0].player.vel={x:0,y:0,z:0};w.crew[1].player.pos={x:12,y:1.7,z:10};w.crew[1].player.vel={x:0,y:0,z:0};});
 await host.evaluate(()=>window.testPad.buttons[2].pressed=true);await host.waitForFunction(()=>window.abyss.courtyard.basketball.balls.some(b=>b.owner==='host'));await host.evaluate(()=>window.testPad.buttons[2].pressed=false);
 await guest.bringToFront();await guest.waitForFunction(()=>window.abyss.position.x>11);await guest.keyboard.press('e');await host.waitForFunction(()=>window.abyss.courtyard.basketball.balls.filter(b=>b.owner).length===2);await guest.waitForFunction(()=>window.abyss.courtyard.basketball.balls.filter(b=>b.owner).length===2);
 console.log('Both players own separate balls');
 await host.bringToFront();const aimBefore=await host.evaluate(()=>({yaw:window.abyss.yaw,pitch:window.abyss.pitch}));await host.evaluate(()=>{window.testPad.axes[2]=.55;window.testPad.axes[3]=-.55;});await host.waitForFunction(before=>Math.abs(window.abyss.yaw-before.yaw)>.08&&window.abyss.pitch-before.pitch>.08,aimBefore);await host.evaluate(()=>{window.testPad.axes[2]=0;window.testPad.axes[3]=0;});
 assert.ok(await host.evaluate(()=>window.abyss.courtyard.basketball.balls.some(b=>b.owner==='host')),'right-stick aiming must not drop the ball');

 // A real charge/release shot from beyond the arc, using a calibrated 60-degree arc.
 await host.bringToFront();await host.evaluate(async()=>{const {BASKETBALL:b}=await import('/src/courtyard-basketball.ts');const p=window.session.world.crew[0];p.player.pos={x:b.x+.14,y:1.7,z:b.hoopZ-7};p.player.vel={x:0,y:0,z:0};window.__abyssTrainerAccess.set(Math.PI,Math.PI/3);window.testPad.buttons[6].pressed=true;});
 await host.waitForFunction(()=>window.abyss.courtyard.basketball.hands.host.charge>=0);
 // Release at the host tick rather than using a wall-clock hold.
 await host.evaluate(async()=>{const {BASKETBALL:b}=await import('/src/courtyard-basketball.ts');const pitch=Math.PI/3,d=7-.55,h=b.hoopY-(1.7+.24),v=Math.sqrt(b.gravity*d*d/(2*Math.cos(pitch)**2*(d*Math.tan(pitch)-h))),ticks=Math.round((v-5.5)/9.5*b.chargeTicks),session=window.session,step=session.step.bind(session);session.step=function(input){const hand=this.courtyard.basketball.hands.host;if(hand.charge>=0&&this.world.tick-hand.charge>=ticks){window.testPad.buttons[6].pressed=false;input={...input,fire:false,homing:false};this.step=step;}return step(input);};});
 await host.waitForFunction(()=>window.abyss.courtyard.basketball.scores.host?.points===3);await guest.waitForFunction(()=>window.abyss.courtyard.basketball.scores.host?.points===3);assert.deepEqual(await host.evaluate(()=>window.abyss.courtyard.skull.goals),[0,0]);
 await host.evaluate(()=>window.__abyssTrainerAccess.set(Math.PI,.13));await host.screenshot({path:'artifacts/basketball/shared-hoop-scoreboard.png'});
 // Shot stays loose, and can be physically retrieved with the same controls.
 await host.waitForFunction(()=>window.abyss.courtyard.basketball.balls.find(b=>b.shooter==='host')?.pos.y<.2);
 await host.waitForFunction(()=>{const b=window.abyss.courtyard.basketball.balls.find(b=>b.shooter==='host');return b&&Math.hypot(b.vel.x,b.vel.y,b.vel.z)<4;});
 await host.evaluate(()=>{const ball=window.session.courtyard.basketball.balls.find(b=>b.shooter==='host');window.session.world.crew[0].player.pos={...ball.pos,y:1.7};window.session.world.crew[0].player.vel={x:0,y:0,z:0};window.testPad.buttons[2].pressed=true;});await host.waitForFunction(()=>window.abyss.courtyard.basketball.balls.some(b=>b.owner==='host'));await host.evaluate(()=>window.testPad.buttons[2].pressed=false);
 assert.equal(await host.evaluate(()=>window.abyss.courtyard.basketball.scores.host.attempts),1);
 // The right trigger performs the dunk; it never charges another shot.
 await host.evaluate(async()=>{const {BASKETBALL:b}=await import('/src/courtyard-basketball.ts');const p=window.session.world.crew[0];p.player.pos={x:b.x,y:1.7,z:b.hoopZ-1.1};p.player.vel={x:0,y:0,z:0};window.__abyssTrainerAccess.set(Math.PI,0);window.testPad.buttons[7].pressed=true;});
 await host.waitForFunction(()=>!!window.abyss.courtyard.basketball.hands.host.dunk);await host.waitForFunction(()=>window.abyss.courtyard.basketball.scores.host.points===5);await guest.waitForFunction(()=>window.abyss.courtyard.basketball.scores.host.points===5);
 await host.evaluate(()=>window.testPad.buttons[7].pressed=false);assert.equal(await host.evaluate(()=>window.abyss.courtyard.basketball.scores.host.attempts),2);
 // Guest right mouse uses the same authoritative action over the input channel.
 await host.evaluate(async()=>{const {BASKETBALL:b}=await import('/src/courtyard-basketball.ts');const p=window.session.world.crew[1];p.player.pos={x:b.x,y:1.7,z:b.hoopZ-1.1};p.player.vel={x:0,y:0,z:0};});
 await guest.bringToFront();await guest.waitForFunction(()=>window.abyss.position.z>19);if(!await guest.evaluate(()=>!!document.pointerLockElement)){await guest.evaluate(()=>document.querySelector('#game').requestPointerLock());await guest.waitForFunction(()=>!!document.pointerLockElement);}await guest.evaluate(()=>window.__abyssTrainerAccess.set(Math.PI,0));await guest.mouse.down({button:'right'});
 await host.waitForFunction(()=>Object.entries(window.abyss.courtyard.basketball.scores).some(([id,score])=>id!=='host'&&score.points===2));await guest.mouse.up({button:'right'});await guest.waitForFunction(()=>Object.entries(window.abyss.courtyard.basketball.scores).some(([id,score])=>id!=='host'&&score.points===2));
 console.log('Controller RT and guest RMB dunks scored over WebRTC');
 await guest.evaluate(()=>{window.controllerConnected=true;const select=document.querySelector('#control-scheme');select.value='controller';select.dispatchEvent(new Event('change'));});await guest.waitForFunction(()=>window.abyss.controls==='controller');
 await host.evaluate(()=>{const b=window.session.courtyard.basketball.balls.find(b=>!b.owner&&b.released<0),p=window.session.world.crew[1];p.player.pos={...b.pos,y:1.7};p.player.vel={x:0,y:0,z:0};});await guest.waitForFunction(()=>window.abyss.position.x>12);await guest.waitForTimeout(150);
 await guest.evaluate(()=>window.testPad.buttons[2].pressed=true);await guest.waitForFunction(()=>window.abyss.courtyard.basketball.balls.some(b=>b.owner===window.session.localId));await guest.evaluate(()=>window.testPad.buttons[2].pressed=false);await guest.waitForTimeout(120);
 const guestAim=await guest.evaluate(()=>window.abyss.yaw);await guest.evaluate(()=>window.testPad.axes[2]=.5);await guest.waitForFunction(yaw=>Math.abs(window.abyss.yaw-yaw)>.08,guestAim);await guest.evaluate(()=>{window.testPad.axes[2]=0;window.__abyssTrainerAccess.set(Math.PI,.7);window.testPad.buttons[6].pressed=true;});
 await host.waitForFunction(()=>Object.entries(window.abyss.courtyard.basketball.hands).some(([id,h])=>id!=='host'&&h.charge>=0&&window.session.world.tick-h.charge>30));await guest.evaluate(()=>window.testPad.buttons[6].pressed=false);
 await host.waitForFunction(()=>Object.entries(window.abyss.courtyard.basketball.scores).some(([id,s])=>id!=='host'&&s.attempts===2));await guest.waitForFunction(()=>window.abyss.courtyard.basketball.scores[window.session.localId].attempts===2);
 console.log('Guest controller X pickup, analog aim and LT release synchronized');

 // Mobile UI remains usable in portrait and landscape; same pickup action reaches host.
 const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const p=await mobile.newPage();
 await p.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Mobile hoops',configured:true}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:'mobile'}));});
 await p.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.abyss?.courtyardAssets.loaded);await p.evaluate(async()=>{const {FriendsSession}=await import('/src/multiplayer.ts');FriendsSession.prototype.hostPublic=async function(){window.session=this;this.room='MOBILE01';this.onChange();};});await p.click('#friends-open');await p.click('#friends-host');await p.waitForFunction(()=>window.abyss.friends?.prelobby);
 await p.evaluate(()=>{window.session.world.crew[0].player.pos={x:12,y:1.7,z:8};});await p.locator('#courtyard-basketball-pickup').tap();await p.waitForFunction(()=>window.abyss.courtyard.basketball.balls.some(b=>b.owner==='host'));
 for(const [width,height]of [[390,844],[844,390]]){await p.setViewportSize({width,height});await p.screenshot({path:`artifacts/basketball/mobile-${width}.png`});const rect=await p.locator('.courtyard-basketball-controls').boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height);}
 assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);writeFileSync('artifacts/basketball/browser.json',JSON.stringify({passed:true,clients:2,controls:['keyboard','controller','mobile'],errors,missing},null,2));console.log('Basketball browser checks passed: direct access, controller + guest pickup, charged 3-pointer, replicated score, retrieval, mobile.');
}catch(error){for(let i=0;i<pages.length;i++){console.log('Client',i,await pages[i].evaluate(()=>({mode:window.abyss?.mode,pos:window.abyss?.position,input:window.abyss?.input,friends:window.abyss?.friends,balls:window.abyss?.courtyard?.basketball})).catch(()=>null));await pages[i].screenshot({path:`artifacts/basketball/failure-${i}.png`}).catch(()=>{});}throw error;}finally{await browser.close();await server.close();}
