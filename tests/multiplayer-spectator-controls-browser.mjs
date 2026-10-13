import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
try{
 for(const scheme of ['azerty','controller','mobile']){
  const context=await browser.newContext({viewport:{width:960,height:600},hasTouch:scheme==='mobile'}),page=await context.newPage(),errors=[];
  await page.routeWebSocket(url.replace('http','ws')+'/**',socket=>socket.close());page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(scheme=>{
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:scheme}));
   window.testPad={id:'Spectator control audit',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
   Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});
  },scheme);
  await page.goto(url);await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
  await page.evaluate(async()=>{
   const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
   const [{FriendsSession},{LobbyBrowser},{GameRenderer},{v}]=await Promise.all([import(moduleUrl('multiplayer')),import(moduleUrl('lobbies')),import(moduleUrl('renderer')),import(moduleUrl('simulation'))]);
   LobbyBrowser.prototype.start=async()=>{};
   FriendsSession.prototype.hostPublic=async function(){window.auditSession=this;this.onChange();};
   const start=FriendsSession.prototype.start;
   FriendsSession.prototype.start=function(){start.call(this);this.startAt=0;this.world.options.schedule=false;this.world.addCrew('survivor');this.world.crew.forEach((p,i)=>p.player.pos=v(i*10,1.8,0));};
   const step=FriendsSession.prototype.step;
   FriendsSession.prototype.step=function(input){this.world.enemies=[];if(window.auditKill){const p=this.world.crew.find(p=>p.id===window.auditKill);const e=this.world.spawn('skull',{...p.player.pos});e.age=12;window.auditKill=null;}step.call(this,input);};
   const render=GameRenderer.prototype.render;
   GameRenderer.prototype.render=function(...args){window.auditRenderer=this;if(!this.auditHandHook){this.auditHandHook=true;const handRender=this.originalWeapon.render.bind(this.originalWeapon);this.originalWeapon.render=(gpu,hidden)=>{window.auditHandHidden=hidden;handRender(gpu,hidden);};}render.apply(this,args);};
  });
  await page.click('#friends-open');await page.click('#friends-host');await page.click('#friends-ready');await page.click('#friends-start');
  await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.time>.1);await page.bringToFront();
  const cdp=scheme==='mobile'?await context.newCDPSession(page):null;
  const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const left={id:1,x:220,y:360},right={id:2,x:740,y:360};
  if(scheme==='azerty'){await page.keyboard.down('KeyZ');await page.mouse.down();}
  if(scheme==='controller')await page.evaluate(()=>{window.testPad.axes[1]=-1;window.testPad.buttons[7].pressed=true;window.testPad.buttons[0].pressed=true;});
  if(scheme==='mobile'){await touch('touchStart',[left,right]);await touch('touchMove',[{...left,y:280},right]);}
  await page.waitForFunction(()=>window.abyss.stats.shots>0);await page.evaluate(()=>window.auditKill='host');
  await page.waitForFunction(()=>window.abyss.spectating&&document.querySelector('#phase').textContent==='SPECTATING');
  assert.equal(await page.locator('#respawn-status').isVisible(),true);
  const dead=await page.evaluate(()=>({body:{...window.abyss.position},shots:window.abyss.stats.shots,camera:window.abyss.cameraPosition,time:window.abyss.time}));
  assert.equal(await page.evaluate(()=>window.auditHandHidden),true,scheme+' hides hand');
  assert.equal(await page.locator('#death-analysis').isVisible(),false);assert.equal(await page.locator('#death').isVisible(),false);
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.abyss.stats.shots),dead.shots,scheme+' stops held firing');
  if(scheme==='azerty'){
   await page.keyboard.up('KeyZ');await page.mouse.up();
   const before=await page.evaluate(()=>window.abyss.cameraPosition);
   await page.keyboard.down('KeyQ');await page.waitForFunction(x=>window.abyss.cameraPosition[0]<x-.5,before[0]);await page.keyboard.up('KeyQ');
   assert.ok(Math.abs((await page.evaluate(()=>window.abyss.cameraPosition[1]))-before[1])<.01,'AZERTY Q strafes instead of descending');
   await page.keyboard.down('KeyZ');await page.waitForFunction(z=>window.abyss.cameraPosition[2]<z-.5,before[2]);await page.keyboard.up('KeyZ');
  }
  if(scheme==='controller'){
   await page.evaluate(()=>{window.testPad.axes=[0,0,0,0];window.testPad.buttons.forEach(b=>b.pressed=false);});await page.waitForTimeout(80);
   const before=await page.evaluate(()=>window.abyss.cameraPosition);
   await page.evaluate(()=>window.testPad.axes[1]=-1);await page.waitForFunction(z=>window.abyss.cameraPosition[2]<z-.5,before[2]);
   await page.evaluate(()=>{window.testPad.axes[1]=0;window.testPad.buttons[0].pressed=true;});await page.waitForFunction(y=>window.abyss.cameraPosition[1]>y+.5,before[1]);
   const high=await page.evaluate(()=>window.abyss.cameraPosition[1]);
   await page.evaluate(()=>{window.testPad.buttons[0].pressed=false;window.testPad.buttons[4].pressed=true;});await page.waitForFunction(y=>window.abyss.cameraPosition[1]<y-.5,high);
   const aim=await page.evaluate(()=>window.abyss.yaw);
   await page.evaluate(()=>{window.testPad.buttons[4].pressed=false;window.testPad.axes[2]=.7;window.testPad.axes[3]=-.7;});await page.waitForFunction(yaw=>Math.abs(window.abyss.yaw-yaw)>.1&&window.abyss.pitch>.1,aim);
   await page.evaluate(()=>window.testPad.connected=false);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.abyss.mode),'playing');
   await page.evaluate(()=>{window.testPad.connected=true;window.testPad.axes=[0,0,0,0];});
  }
  if(scheme==='mobile'){
   await touch('touchEnd',[]);
   const before=await page.evaluate(()=>({camera:window.abyss.cameraPosition,yaw:window.abyss.yaw}));
   await touch('touchStart',[left,right]);await touch('touchMove',[{...left,y:280},{...right,x:780}]);
   await page.waitForFunction(before=>Math.hypot(window.abyss.cameraPosition[0]-before.camera[0],window.abyss.cameraPosition[2]-before.camera[2])>.5&&Math.abs(window.abyss.yaw-before.yaw)>.1,before);
   await touch('touchEnd',[]);
   assert.equal(await page.evaluate(()=>window.abyss.stats.shots),dead.shots,'spectator look touch never fires');
  }
  assert.deepEqual(await page.evaluate(()=>window.abyss.position),dead.body,scheme+' keeps dead body frozen');
  assert.ok(await page.evaluate(()=>window.abyss.time)>dead.time,'survivor keeps the run alive');
  // Advance the host clock to exercise revival with each real input scheme.
  if(scheme==='azerty')await page.keyboard.down('KeyZ');
  if(scheme==='controller')await page.evaluate(()=>{window.testPad.buttons[7].pressed=true;window.testPad.buttons[0].pressed=true;});
  if(scheme==='mobile'){await touch('touchStart',[left,right]);await touch('touchMove',[{...left,y:280},right]);}
  await page.evaluate(()=>{window.auditSession.world.time=window.auditSession.world.crew[0].respawnAt-.05;});
  await page.waitForFunction(()=>window.abyss.friends.crew[0].life===1&&!window.abyss.spectating);
  assert.equal(await page.locator('#respawn-status').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.auditHandHidden),false,scheme+' restores hand');
  assert.equal(await page.evaluate(()=>window.abyss.input.fire),false,scheme+' clears held spectator firing');
  assert.equal(await page.evaluate(()=>window.abyss.stats.shots),dead.shots);
  if(scheme==='azerty')await page.keyboard.up('KeyZ');
  if(scheme==='controller')await page.evaluate(()=>window.testPad.buttons.forEach(b=>b.pressed=false));
  if(scheme==='mobile')await touch('touchEnd',[]);
  await page.waitForTimeout(80);
  const revivedPosition=await page.evaluate(()=>({...window.abyss.position}));
  if(scheme==='azerty'){await page.keyboard.down('KeyZ');await page.mouse.down();}
  if(scheme==='controller')await page.evaluate(()=>{window.testPad.axes[1]=-1;window.testPad.buttons[7].pressed=true;});
  if(scheme==='mobile'){await touch('touchStart',[left,right]);await touch('touchMove',[{...left,y:280},right]);}
  await page.waitForFunction(before=>Math.hypot(window.abyss.position.x-before.x,window.abyss.position.z-before.z)>.3&&window.abyss.stats.shots>0,revivedPosition);
  if(scheme==='azerty'){await page.keyboard.up('KeyZ');await page.mouse.up();}
  if(scheme==='controller')await page.evaluate(()=>{window.testPad.axes=[0,0,0,0];window.testPad.buttons.forEach(b=>b.pressed=false);});
  if(scheme==='mobile')await touch('touchEnd',[]);
  await page.evaluate(()=>{const w=window.auditSession.world;w.time=Math.max(w.time,w.crew[0].protectedUntil+.1);window.auditKill='host';});
  await page.waitForFunction(()=>window.abyss.spectating);
  const beforeWipe=await page.evaluate(()=>window.abyss.cameraPosition);
  await page.evaluate(()=>window.auditKill='survivor');await page.waitForFunction(()=>window.abyss.mode==='dead');
  assert.deepEqual(await page.evaluate(()=>window.abyss.cameraPosition),beforeWipe,scheme+' keeps spectator view on wipe');
  assert.equal(await page.evaluate(()=>window.auditHandHidden),true);assert.equal(await page.locator('#death-analysis').isVisible(),false);
  await page.click('#retry');await page.waitForFunction(()=>window.abyss.mode==='menu'&&!window.abyss.spectating);
  await page.click('#friends-ready');await page.click('#friends-start');await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.time>.1);
  assert.equal(await page.evaluate(()=>window.abyss.spectating),false);assert.equal(await page.evaluate(()=>window.auditHandHidden),false);assert.equal(await page.evaluate(()=>window.auditRenderer.crewDeathPresentation.length),0);
  assert.deepEqual(errors,[]);await context.close();console.log(`${scheme} spectator controls passed: death with held controls, flight, fixed body, no shooting/killcam, revival, fresh movement/fire, stable wipe and clean restart.`);
 }
}finally{await browser.close();}
