import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const size=2,base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
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

 const guest=pages[1];
 async function position(id,x,z){await host.evaluate(({id,x,z})=>{const p=window.session.world.crew[id];p.player.pos={x,y:1.7,z};p.player.vel={x:0,y:0,z:0};},{id,x,z});}
 async function walk(page,points){
  await page.bringToFront();if(await page.evaluate(()=>window.abyss.mode==='paused'))await page.click('#resume');await page.locator('#game').click();
  for(const [x,z]of points){
   for(let i=0;i<100;i++){
    const pose=await page.evaluate(()=>window.abyss.position),distance=Math.hypot(pose.x-x,pose.z-z);if(distance<.55)break;
    await page.evaluate(({x,z})=>{const p=window.abyss.position;window.__abyssTrainerAccess.set(Math.atan2(p.x-x,p.z-z),0);},{x,z});
    await page.keyboard.down('KeyW');await page.waitForTimeout(45);await page.keyboard.up('KeyW');
    if(i===99)throw Error('Could not walk to '+x+','+z+' from '+JSON.stringify(pose));
   }
  }
 }
 await position(1,-4,3);
 await guest.waitForFunction(()=>window.abyss.position.x< -3);
 // Actual guest keyboard input, real WebRTC and authoritative west-wing collision.
 await walk(guest,[[-8,4],[-11.7,4],[-11.7,0],[-16,0],[-20,0],[-23,-4.5],[-38,-4.5]]);
 await host.waitForFunction(()=>window.session.world.crew[1].player.pos.x< -37);
 await guest.screenshot({path:'artifacts/hide-and-seek/guest-in-room.png'});
 await walk(guest,[[-23,-4.5],[-20,0],[-16,0],[-11.7,0],[-11.7,4],[-8,4],[-4,3]]);
 await host.waitForFunction(()=>window.session.world.crew[1].player.pos.x> -5);
 // Host enters as well, then both can return to the standard ready / pit flow.
 await position(0,-4,3);await walk(host,[[-8,4],[-11.7,4],[-11.7,0],[-16,0],[-20,0]]);
 assert.ok(await host.evaluate(()=>window.abyss.position.x< -19));
 for(let i=0;i<2;i++)await position(i, i?3:0,8);
 for(const page of pages)await page.evaluate(()=>window.session.setReady(true));
 await host.waitForFunction(()=>window.abyss.friends.allReady);
 await host.evaluate(()=>window.session.openPit());await host.waitForFunction(()=>window.abyss.courtyard.phase==='open');
 await host.evaluate(()=>{for(const p of window.session.world.crew){p.player.pos={x:0,y:-3.2,z:2.075};p.player.vel={x:0,y:-1,z:0};}});
 for(const page of pages)await page.waitForFunction(()=>window.abyss.friends.running);
 await host.evaluate(()=>window.session.returnToLobby());for(const page of pages)await page.waitForFunction(()=>window.abyss.friends.prelobby);
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
 console.log('Passed: host and guest physically traverse both bends, enter and return; ready, pit launch and return to lobby still work.');
}finally{await browser.close();}
