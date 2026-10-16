import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5196,strictPort:false,watch:{ignored:['**/external-trainer/**']}}});
await server.listen();
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const errors=[];
try{
 const pages=[];
 for(const controller of [true,false]){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(controller=>{
   localStorage.setItem('abyss-player-profile',JSON.stringify({name:controller?'Artist host':'Artist guest',configured:true}));
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:controller?'controller':'qwerty'}));
   window.testPad={id:'Pencil controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
   Object.defineProperty(navigator,'getGamepads',{value:()=>controller?[window.testPad]:[]});
  },controller);
  const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('console',message=>{if(message.type()==='error'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(message.text()))errors.push(message.text());});await p.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.abyss?.courtyardAssets.loaded&&window.abyss.originalAssets,undefined,{timeout:60000});
  await p.evaluate(async()=>{
   const {FriendsSession}=await import('/src/multiplayer.ts'),{LobbyBrowser}=await import('/src/lobbies.ts');
   LobbyBrowser.prototype.start=async function(){this.rooms.set('DRAWTEST',{id:'DRAWTEST',name:'Drawing test',host:'Artist',players:1,ready:0,state:'waiting',updated:Date.now()});this.onChange();};
   FriendsSession.prototype.hostPublic=async function(){this.room='DRAWTEST';window.session=this;this.onChange();};
   FriendsSession.prototype.joinPublic=async function(){window.session=this;};
  });
  await p.click('#friends-open');pages.push(p);
 }
 const [host,guest]=pages;
 await host.click('#friends-host');await guest.click('.join-lobby');
 const offer=await host.evaluate(()=>{window.session.iceServers=[];return window.session.offer();});
 const answer=await guest.evaluate(offer=>{window.session.iceServers=[];return window.session.answer(offer);},offer);
 await host.evaluate(answer=>window.session.accept(answer),answer);
 await guest.waitForFunction(()=>window.abyss.friends?.prelobby&&window.abyss.friends.members.every(m=>m.loaded===window.abyss.friends.epoch));
 await host.evaluate(()=>{for(const [i,p]of window.session.world.crew.entries()){p.player.pos={x:76+i*10,y:1.7,z:17};p.player.vel={x:0,y:0,z:0};}});
 await host.bringToFront();await host.waitForFunction(()=>window.abyss.position.x===76);
 await host.evaluate(()=>window.testPad.buttons[2].pressed=true);await host.waitForTimeout(180);await host.evaluate(()=>window.testPad.buttons[2].pressed=false);
 await host.waitForFunction(()=>window.abyss.courtyard.drawing.pencils[0].owner==='host');
 await guest.bringToFront();await guest.waitForFunction(()=>Math.abs(window.abyss.position.x-86)<.1);
 await guest.waitForFunction(()=>!document.querySelector('.courtyard-drawing-controls').hidden&&!document.querySelector('#courtyard-pencil').disabled);
 assert.match(await guest.locator('#courtyard-pencil').textContent(),/PICK UP/);
 await guest.click('#game');
 await host.waitForFunction(()=>!!window.abyss.courtyard.drawing.pencils[1].owner);
 await guest.waitForFunction(()=>document.querySelector('#courtyard-pencil').textContent.includes('DROP PENCIL'));
 await guest.waitForTimeout(300);await guest.keyboard.press('KeyG');
 await host.waitForFunction(()=>!window.abyss.courtyard.drawing.pencils[1].owner);
 await guest.waitForTimeout(300);await guest.keyboard.press('KeyE');
 await host.waitForFunction(()=>window.abyss.courtyard.drawing.pencils.slice(0,2).every(p=>p.owner));
 await host.evaluate(()=>{for(const p of window.session.world.crew){p.player.pos.z=10;p.player.vel={x:0,y:0,z:0};}});
 await guest.waitForFunction(()=>Math.abs(window.abyss.position.z-10)<.1);
 await guest.evaluate(()=>window.__abyssTrainerAccess.set(0,-1.1));
 await guest.click('#game');await guest.mouse.down();await guest.waitForTimeout(200);
 await guest.mouse.move(650,600);await guest.waitForTimeout(200);await guest.mouse.up();
 await host.waitForFunction(()=>window.abyss.courtyard.drawing.ink.some(row=>row[0]===1));
 await host.bringToFront();await host.evaluate(()=>{window.__abyssTrainerAccess.set(0,-1.1);window.testPad.buttons[7].pressed=true;});
 await host.waitForTimeout(180);await host.evaluate(()=>window.testPad.axes[2]=.7);await host.waitForTimeout(250);
 await host.evaluate(()=>{window.testPad.axes[2]=0;window.testPad.buttons[7].pressed=false;});
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.ink.some(row=>row[0]===0));
 assert.ok(await host.evaluate(()=>window.abyss.courtyard.drawing.ink.length)>2);
 await host.evaluate(()=>window.__abyssTrainerAccess.set(0,-1.1));
 // Inspect actual animated palm sockets, not the simulation's approximate hand positions.
 await host.evaluate(async()=>{
  const {GameRenderer}=await import('/src/renderer.ts');
  const render=GameRenderer.prototype.render;
  GameRenderer.prototype.render=function(...args){const result=render.apply(this,args);window.testRenderer=this;return result;};
 });
 await host.waitForFunction(()=>window.testRenderer?.emoteHands?.userData.holdingPencil);
 const grips=await host.evaluate(async()=>{
  const {Vector3}=await import('/node_modules/three/build/three.module.js');
  const r=window.testRenderer;
  return window.abyss.courtyard.drawing.pencils.slice(0,2).map((p,i)=>{
   const mesh=r.courtyard.scene.getObjectByName('giant-pencil-'+i);
   const avatar=p.owner==='host'?r.emoteHands:r.crewModels.get(p.owner);
   const index=avatar.getObjectByName('Index2R'),middle=avatar.getObjectByName('Middle2R');
   const palm=index.getWorldPosition(new Vector3()).add(middle.getWorldPosition(new Vector3())).multiplyScalar(.5);
   const point=mesh.worldToLocal(palm);
   return {visible:mesh.visible,holding:avatar.userData.holdingPencil,radial:Math.hypot(point.x,point.z),height:point.y};
  });
 });
 for(const grip of grips){assert.equal(grip.visible,true);assert.equal(grip.holding,true);assert.ok(grip.radial<.001,'shaft intersects the animated palm');assert.ok(grip.height>.6&&grip.height<3.15,'palm is on the pencil shaft');}
 mkdirSync('artifacts/drawing-court',{recursive:true});await host.screenshot({path:'artifacts/drawing-court/first-person.png'});
 // Render the exact replicated court from above to inspect all 64 squares and both pencils.
 await host.evaluate(async()=>{const {GameRenderer}=await import('/src/renderer.ts');const render=GameRenderer.prototype.render;GameRenderer.prototype.render=function(...args){const result=render.apply(this,args);if(this.courtyard.scene.visible){this.camera.position.set(81,30,24);this.camera.lookAt(81,0,2);this.renderer.render(this.courtyard.scene,this.camera);}return result;};});
 await host.waitForTimeout(200);await host.screenshot({path:'artifacts/drawing-court/board-overview.png'});

 // Pick up the giant eraser on PC and scrub only the host's orange marks.
 const orangeBefore=await host.evaluate(()=>window.abyss.courtyard.drawing.ink.filter(row=>row[0]===0).length);
 await guest.bringToFront();await guest.keyboard.press('KeyG');
 await host.waitForFunction(()=>!window.abyss.courtyard.drawing.pencils[1].owner);
 await host.evaluate(()=>{const p=window.session.world.crew[1];p.player.pos={x:81,y:1.7,z:17};p.player.vel={x:0,y:0,z:0};});
 await guest.waitForFunction(()=>Math.abs(window.abyss.position.x-81)<.1&&Math.abs(window.abyss.position.z-17)<.1);
 await guest.waitForTimeout(300);await guest.keyboard.press('KeyE');
 await host.waitForFunction(()=>!!window.abyss.courtyard.drawing.pencils[2].owner);
 await guest.waitForFunction(()=>document.querySelector('#courtyard-pencil').textContent.includes('DROP ERASER'));
 await host.evaluate(()=>{window.session.world.crew[0].player.pos.x=73;window.session.world.crew[1].player.pos={x:76,y:1.7,z:10};});
 await guest.waitForFunction(()=>Math.abs(window.abyss.position.x-76)<.1&&Math.abs(window.abyss.position.z-10)<.1);
 await guest.evaluate(()=>window.__abyssTrainerAccess.set(0,-1.1));
 await guest.mouse.down();await guest.waitForTimeout(350);await guest.mouse.up();
 await host.waitForFunction(before=>window.abyss.courtyard.drawing.ink.filter(row=>row[0]===0).length<before,orangeBefore);
 assert.ok(await host.evaluate(()=>window.abyss.courtyard.drawing.ink.some(row=>row[0]===1)),'distant guest marks survive erasing');
 await guest.screenshot({path:'artifacts/drawing-court/eraser-first-person.png'});
 // A guest can operate the physical wall button without host permissions.
 await host.evaluate(()=>{window.session.world.crew[1].player.pos={x:93.2,y:1.7,z:7};});
 await guest.waitForFunction(()=>Math.abs(window.abyss.position.x-93.2)<.1);
 await guest.evaluate(()=>window.__abyssTrainerAccess.set(-Math.PI/2,.15));
 await guest.waitForTimeout(150);
 await guest.screenshot({path:'artifacts/drawing-court/wall-clear-button.png'});
 await guest.mouse.down();await guest.mouse.up();
 await host.waitForFunction(()=>window.abyss.courtyard.drawing.ink.length===0);
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.ink.length===0);
 await host.bringToFront();
 await host.evaluate(()=>window.testPad.buttons[3].pressed=true);await host.waitForTimeout(150);await host.evaluate(()=>window.testPad.buttons[3].pressed=false);
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.ink.length===0&&window.abyss.courtyard.drawing.pencils[0].owner==='host'&&window.abyss.courtyard.drawing.pencils[2].owner);
 await host.evaluate(()=>window.__abyssTrainerAccess.set(1.2,.3));
 await host.waitForTimeout(150);
 const idleGrip=await host.evaluate(async()=>{
  const {Vector3}=await import('/node_modules/three/build/three.module.js');
  const mesh=window.testRenderer.courtyard.scene.getObjectByName('giant-pencil-0');
  const point=mesh.worldToLocal(new Vector3(...mesh.userData.grip));
  return {radial:Math.hypot(point.x,point.z),height:point.y};
 });
 assert.ok(idleGrip.radial<.001);assert.ok(Math.abs(idleGrip.height-1.1)<.001,'idle pencil follows the palm too');
 await host.evaluate(()=>{window.session.world.crew[1].player.pos={x:81,y:1.7,z:10};});
 await guest.bringToFront();await guest.waitForFunction(()=>Math.abs(window.abyss.position.x-81)<.1);
 await guest.waitForTimeout(300);await guest.keyboard.press('KeyG');
 await host.waitForFunction(()=>window.abyss.courtyard.drawing.pencils[2].owner===null);
 await host.bringToFront();await host.evaluate(()=>window.testPad.buttons[2].pressed=true);
 await host.waitForTimeout(150);await host.evaluate(()=>window.testPad.buttons[2].pressed=false);
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.pencils.every(p=>p.owner===null));
 // Free-draw styles and grid replicate, including long-reach drawing.
 await host.evaluate(()=>{window.session.world.crew[1].player.pos={x:86,y:1.7,z:17};});
 await guest.bringToFront();await guest.waitForFunction(()=>Math.abs(window.abyss.position.x-86)<.1&&Math.abs(window.abyss.position.z-17)<.1);
 await guest.keyboard.press('KeyE');await host.waitForFunction(()=>!!window.abyss.courtyard.drawing.pencils[1].owner);
 await guest.keyboard.press('Digit7');await guest.keyboard.press('BracketLeft');await guest.keyboard.press('KeyH');
 await host.waitForFunction(()=>window.abyss.courtyard.drawing.pencils[1].color===6&&window.abyss.courtyard.drawing.pencils[1].width===4&&window.abyss.courtyard.drawing.grid===true);
 await guest.evaluate(()=>window.__abyssTrainerAccess.set(0,-Math.atan2(1.7,24)));
 await guest.mouse.down();await guest.waitForTimeout(250);await guest.mouse.up();
 await host.waitForFunction(()=>window.abyss.courtyard.drawing.ink.some(row=>row[0]===6&&row[5]===4));
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.ink.some(row=>row[0]===6&&row[5]===4));
 await guest.keyboard.press('KeyH');await host.waitForFunction(()=>!window.abyss.courtyard.drawing.grid);
 // Controller palette/size changes use independent D-pad edges.
 await host.bringToFront();await host.evaluate(()=>{window.session.world.crew[0].player.pos={x:76,y:1.7,z:17};});
 await host.waitForFunction(()=>Math.abs(window.abyss.position.z-17)<.1);
 await host.evaluate(()=>window.testPad.buttons[2].pressed=true);await host.waitForTimeout(150);await host.evaluate(()=>window.testPad.buttons[2].pressed=false);
 await host.waitForFunction(()=>window.abyss.courtyard.drawing.pencils[0].owner==='host');
 await host.evaluate(()=>window.testPad.buttons[15].pressed=true);await host.waitForTimeout(120);await host.evaluate(()=>window.testPad.buttons[15].pressed=false);
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.pencils[0].color===1);
 await host.evaluate(()=>window.testPad.buttons[12].pressed=true);await host.waitForTimeout(120);await host.evaluate(()=>window.testPad.buttons[12].pressed=false);
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.pencils[0].width===16);
 // Recovery of a board far beyond the old 512-segment cap, then a small delta.
 await host.evaluate(()=>{
  const d=window.session.world.courtyard.drawing;
  d.ink=Array.from({length:16000},(_,i)=>[i%2,i%768,Math.floor(i/768),i%768,Math.floor(i/768)]);d.sequence++;
 });
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.ink.length===16000,undefined,{timeout:30000});
 await host.evaluate(()=>{const d=window.session.world.courtyard.drawing;d.ink.push([0,100,100,101,101]);d.sequence++;});
 await guest.waitForFunction(()=>window.abyss.courtyard.drawing.ink.length===16001);
 assert.deepEqual(errors,[]);
 console.log('Real WebRTC: PC click/E/G and controller pickup, shared drawing, animated grips, local eraser, guest wall clear, 16,000-segment recovery, free-draw reach/colors/brush/grid and incremental updates passed.');
 await host.evaluate(()=>window.session.close());await guest.evaluate(()=>window.session.close());
}finally{await browser.close();await server.close();}
