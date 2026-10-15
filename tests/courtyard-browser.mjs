import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const size=Number(process.env.CREW_SIZE||2),base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const pages=[],errors=[],badAssets=[];
try{
 for(let i=0;i<size;i++){
  const context=await browser.newContext({viewport:size>2?{width:800,height:600}:{width:1280,height:900}});
  await context.addInitScript(i=>{localStorage.setItem('abyss-player-profile',JSON.stringify({name:['Ash','Ember','Nyx','Rune','Hex','Moss'][i],configured:true}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));},i);
  const p=await context.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&/\/models\/(courtyard|football)\//.test(r.url()))badAssets.push(r.url());});
  console.log('Loading client',i+1,'of',size);await p.goto(base,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>window.abyss?.courtyardAssets.loaded&&window.abyss.originalAssets&&window.abyss.originalEnemies,undefined,{timeout:60000});
  // Mock only public discovery/signaling; gameplay channels below are real WebRTC.
  await p.evaluate(async()=>{
   const url=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.endsWith(`/src/${name}.ts`)).at(-1)?.name??`/src/${name}.ts`;
   const {FriendsSession}=await import(url('multiplayer')),{LobbyBrowser}=await import(url('lobbies'));
   const {Sound}=await import(url('audio')),courtyard=Sound.prototype.courtyard;window.goalCues=0;Sound.prototype.courtyard=function(kind,pos){if(kind==='goal')window.goalCues++;return courtyard.call(this,kind,pos);};
   LobbyBrowser.prototype.start=async function(){this.rooms.set('COURT001',{id:'COURT001',name:'The First Circle',host:'Ash',players:1,ready:0,state:'waiting',updated:Date.now()});this.onChange();};
   FriendsSession.prototype.hostPublic=async function(){this.room='COURT001';this.lobbyName='The First Circle';window.session=this;this.onChange();};
   FriendsSession.prototype.joinPublic=async function(){window.session=this;};
  });
  // Keep host and interacting guest fully rendered. Spectator clients still run
  // real input/physics/network/UI, with 5 Hz drawing to fit six clients on one CPU.
  if(size>2&&i>0&&i<size-1)await p.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname.endsWith('/src/renderer.ts'))?.name??'/src/renderer.ts';const {GameRenderer}=await import(url),render=GameRenderer.prototype.render;let last=-1000;GameRenderer.prototype.render=function(...args){const now=performance.now();if(now-last<200)return;last=now;return render.apply(this,args);};});
  await p.click('#friends-open');pages.push(p);
 }
 const host=pages[0];await host.click('#friends-host');await host.waitForFunction(()=>window.abyss.friends?.prelobby&&window.abyss.friends.members[0].loaded===window.abyss.friends.epoch);
 assert.equal(await host.evaluate(()=>window.abyss.friends.members[0].ready),false,'host enters before ready');
 for(let i=1;i<size;i++){
  const guest=pages[i];await guest.click('.join-lobby');console.log('Connecting guest',i);const offer=await host.evaluate(()=>window.session.offer());const answer=await guest.evaluate(offer=>window.session.answer(offer),offer);await host.evaluate(answer=>window.session.accept(answer),answer);
  await guest.waitForFunction(()=>window.abyss.friends?.prelobby&&window.abyss.friends.members.every(m=>m.loaded===window.abyss.friends.epoch));
  console.log('Joined gathering courtyard',i+1);
 }
 await host.waitForFunction(n=>window.abyss.friends.members.length===n&&window.abyss.friends.members.every(m=>m.loaded===window.abyss.friends.epoch),size);
 for(let i=0;i<size;i++)await pages[i].evaluate(i=>window.session.setColor(['crimson','ember','violet','frost','gold','jade'][i]),i);
 await host.waitForFunction(n=>window.abyss.friends.members.length===n,size);
 // The guest really holds/releases the mouse; the host validates charge and collision.
 const kicker=pages.at(-1);await kicker.bringToFront();if(await kicker.evaluate(()=>window.abyss.mode==='paused'))await kicker.click('#resume');if(!await kicker.evaluate(()=>!!document.pointerLockElement))await kicker.locator('#game').click();await kicker.waitForFunction(()=>document.pointerLockElement===document.querySelector('#game'));
 const capturedAt=await host.evaluate(()=>window.session.world.tick);await host.waitForFunction(t=>window.session.world.tick-t>90,capturedAt); // Drain the pointer-capture click before positioning the ball.
 await host.evaluate(()=>{const p=window.session.world.crew.at(-1);p.player.pos={x:36,y:1.7,z:3.1};p.player.vel={x:0,y:0,z:0};const s=window.session.world.courtyard.skull;s.pos={x:36,y:.36,z:2};s.vel={x:0,y:0,z:0};});await kicker.waitForFunction(()=>Math.abs(window.abyss.position.x-36)<.2);
 await kicker.mouse.down();await host.waitForFunction(()=>Object.values(window.abyss.courtyard.kicks).some(k=>k.started>=0&&window.session.world.tick-k.started>=144));
 assert.ok(await host.evaluate(()=>Math.abs(window.abyss.courtyard.skull.pos.z-2)<.1),'Held mouse does not kick early');await kicker.mouse.up();
 await host.waitForFunction(()=>Math.hypot(window.abyss.courtyard.skull.vel.x,window.abyss.courtyard.skull.vel.z)>18);await kicker.waitForFunction(()=>Object.values(window.abyss.courtyard.kicks).some(k=>k.power>.9&&k.started===-1));
 await host.evaluate(()=>{const s=window.session.world.courtyard.skull;s.pos={x:55,y:.36,z:2};s.vel={x:0,y:0,z:0};});for(const p of pages)await p.waitForFunction(()=>Math.abs(window.abyss.courtyard.skull.pos.x-36)<.1&&Math.abs(window.abyss.courtyard.skull.pos.z-2)<.1);
 await host.evaluate(()=>{const p=window.session.world.crew.at(-1);p.player.pos={x:3,y:1.7,z:8};p.player.vel={x:0,y:0,z:0};});
 // Keyboard readiness, connected-room traversal, downloaded assets and shared football scoring.
 await host.bringToFront();if(await host.evaluate(()=>window.abyss.mode==='paused'))await host.click('#resume');await host.evaluate(()=>document.exitPointerLock());
 await host.keyboard.press('KeyF');await host.waitForFunction(()=>window.abyss.friends.members[0].ready);
 await host.keyboard.down('KeyF');await host.keyboard.down('KeyF');await host.keyboard.up('KeyF');await host.waitForFunction(()=>!window.abyss.friends.members[0].ready);
 await host.evaluate(()=>{window.session.world.crew[0].player.pos={x:5,y:1.7,z:2.075};window.session.world.crew[0].player.vel={x:0,y:0,z:0};});
 await host.locator('#game').click();await host.keyboard.down('KeyD');await host.waitForFunction(()=>window.abyss.position.x>20);await host.keyboard.up('KeyD');assert.equal(await host.evaluate(()=>window.abyss.position.y),1.7);
 await host.evaluate(()=>{window.session.world.crew[0].player.pos={x:36,y:1.7,z:15};window.session.world.crew[0].player.vel={x:0,y:0,z:0};});await host.waitForTimeout(250);
 const fieldShot=await host.screenshot({path:`artifacts/football-field-${size}-players.png`});
 const grassPixels=await host.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let green=0;for(let i=0;i<data.length;i+=4)if(data[i+1]>30&&data[i+1]>data[i]*1.15&&data[i+1]>data[i+2]*1.15)green++;return green;},fieldShot.toString('base64'));
 assert.ok(grassPixels>10000,`Downloaded football pitch must actually render: ${grassPixels} grass pixels`);
 await host.evaluate(()=>{window.session.world.crew[0].player.pos={x:36,y:1.7,z:-12};window.session.world.crew[0].player.vel={x:0,y:0,z:0};});await host.waitForTimeout(250);await host.screenshot({path:`artifacts/football-goal-${size}-players.png`});
 await host.evaluate(()=>{const c=window.session.world.courtyard;c.skull.pos={x:36,y:.36,z:-20.7};c.skull.vel={x:0,y:0,z:-7};});
 for(const p of pages)await p.waitForFunction(()=>window.abyss.courtyard.skull.goals[0]===1);
 for(const p of pages)await p.waitForFunction(()=>window.abyss.courtyardAssets.presentation.scores.every(s=>s?.goals.join(':')==='1:0')&&window.goalCues===1);
 await host.waitForTimeout(300);for(const p of pages)assert.equal(await p.evaluate(()=>window.goalCues),1,'Each goal cues audio once, despite repeated snapshots');
 await host.evaluate(()=>{window.session.world.crew[0].player.pos={x:0,y:1.7,z:8};window.session.world.crew[0].player.vel={x:0,y:0,z:0};});
 for(const p of pages){await p.bringToFront();if(await p.evaluate(()=>window.abyss.mode==='paused'))await p.click('#resume');await p.evaluate(()=>document.exitPointerLock());await p.keyboard.press('KeyF');}await host.waitForFunction(()=>window.abyss.friends.allReady);
 await host.bringToFront();if(await host.evaluate(()=>window.abyss.mode==='paused'))await host.click('#resume');await host.evaluate(()=>document.exitPointerLock());
 await host.screenshot({path:`artifacts/courtyard-${size}-players.png`});
 // Real host button hold opens the cover, with no arena start.
 const button=host.locator('#courtyard-open');const bounds=await button.boundingBox();await host.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await host.mouse.down();await host.waitForTimeout(700);await host.mouse.up();
 await host.waitForFunction(()=>window.abyss.courtyard.phase==='open');assert.equal(await host.evaluate(()=>window.abyss.friends.running),false);console.log('Pit opened for',size,'players');await host.keyboard.press('KeyF');assert.equal(await host.evaluate(()=>window.abyss.friends.allReady),true,'F cannot change readiness after the pit opens');
 // A real guest movement enters the shaft. All others remain in the room.
 const jumper=pages.at(-1);await jumper.bringToFront();if(await jumper.evaluate(()=>window.abyss.mode==='paused'))await jumper.click('#resume');await jumper.locator('#game').click();
 const facing=await jumper.evaluate(()=>window.abyss.yaw),approach={x:Math.sin(facing)*3.2,y:1.7,z:2.075+Math.cos(facing)*3.2};await host.evaluate(pos=>{const p=window.session.world.crew.at(-1);p.player.pos=pos;p.player.vel={x:0,y:0,z:0};},approach);await jumper.waitForFunction(pos=>Math.hypot(window.abyss.position.x-pos.x,window.abyss.position.z-pos.z)<.2,approach);await jumper.keyboard.down('KeyW');await host.waitForFunction(()=>window.abyss.courtyard.committed.length===1);await jumper.keyboard.up('KeyW');assert.equal(await host.evaluate(()=>window.abyss.friends.running),false);
 await host.evaluate(()=>window.session.cancelDescent());await jumper.waitForFunction(()=>window.abyss.courtyard.phase==='gathering'&&window.abyss.position.y>0);assert.equal(await host.evaluate(()=>window.abyss.courtyard.committed.length),0);
 await host.evaluate(()=>window.session.openPit());await host.waitForFunction(()=>window.abyss.courtyard.phase==='open');
 const epoch=await host.evaluate(()=>window.abyss.friends.epoch);
 // Position fixtures at the drop plane; the actual host simulation validates each descent.
 for(let i=0;i<size;i++){
  await host.evaluate(i=>{const p=window.session.world.crew[i];p.player.pos={x:0,y:-3.2,z:2.075};p.player.vel={x:0,y:-1,z:0};},i);
  if(i<size-1){await host.waitForFunction(n=>window.abyss.courtyard.committed.length===n,i+1);assert.equal(await host.evaluate(()=>window.abyss.friends.running),false);}
 }
 for(const p of pages)await p.waitForFunction(epoch=>window.abyss.friends.running&&window.abyss.friends.epoch===epoch+1&&window.abyss.time>.05,epoch);
 const gunner=pages.at(-1);await gunner.bringToFront();if(await gunner.evaluate(()=>window.abyss.mode==='paused'))await gunner.click('#resume');await gunner.mouse.down();await host.waitForFunction(()=>window.abyss.stats.shots>0);await gunner.mouse.up();
 // Repeat full return/start ten times, ensuring state remains bounded and peers stay connected.
 const cycles=Number(process.env.COURTYARD_CYCLES||2);
 for(let cycle=0;cycle<cycles;cycle++){
  if(cycle===0){await host.evaluate(()=>{for(const p of window.session.world.crew)p.player.pos={x:90,y:-10,z:90};});for(const p of pages)await p.waitForFunction(()=>window.abyss.mode==='dead');await host.locator('#retry').evaluate(b=>b.click());}else await host.evaluate(()=>{window.session.world.time=42.5;window.session.returnToLobby();});
  for(const p of pages)await p.waitForFunction(()=>window.abyss.friends.prelobby&&window.abyss.friends.members.every(m=>m.loaded===window.abyss.friends.epoch));
  assert.ok(await host.evaluate(()=>window.abyss.courtyard.lastRun.time>0));
  for(const p of pages)await p.evaluate(()=>window.session.setReady(true));await host.waitForFunction(()=>window.abyss.friends.allReady);
  console.log('Return cycle',cycle+1,'of',cycles);if(cycle===cycles-1)break;
  await host.evaluate(()=>window.session.openPit());await host.waitForFunction(()=>window.abyss.courtyard.phase==='open');await host.evaluate(()=>{for(const p of window.session.world.crew){p.player.pos={x:0,y:-3.2,z:2.075};p.player.vel={x:0,y:-1,z:0};}});await host.waitForFunction(()=>window.abyss.friends.running);
 }
 await pages.at(-1).close();await host.waitForFunction(n=>window.abyss.friends.connected===n,size-2);assert.equal(await host.evaluate(()=>window.abyss.courtyard.phase),'gathering');
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);console.log(`Courtyard passed: ${size} clients, late joins, loading/ready, host hold, physical guest drop, cancellation, all-soul launch, shared release and ${cycles} return cycles.`);
}catch(e){console.log('Browser errors',errors,'Missing assets',badAssets);for(let i=0;i<pages.length;i++){console.log('Client',i,JSON.stringify(await pages[i].evaluate(()=>({mode:window.abyss?.mode,pos:window.abyss?.position,yaw:window.abyss?.yaw,friends:window.abyss?.friends,c:window.abyss?.courtyard,links:[...window.session.links.values()].map(l=>({state:l.pc.connectionState,ice:l.pc.iceConnectionState,signaling:l.pc.signalingState,local:l.pc.localDescription?.type,remote:l.pc.remoteDescription?.type}))})).catch(()=>null)));await pages[i].screenshot({path:`artifacts/courtyard-failure-${i}.png`}).catch(()=>{});}throw e;}finally{await browser.close();}
