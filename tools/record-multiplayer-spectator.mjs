import {chromium} from '@playwright/test';
import {existsSync,mkdirSync} from 'node:fs';
const url=process.env.GAME_URL||'http://127.0.0.1:5173',frames=process.argv[2]||'/tmp/multiplayer-spectator-frames';
mkdirSync(frames,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:900,height:562}}),errors=[];
 await page.routeWebSocket(url.replace('http','ws')+'/**',socket=>socket.close());page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'high',volume:0,musicVolume:0,controlScheme:'qwerty'}));
  const native=requestAnimationFrame.bind(window);window.nativeRaf=native;window.recordMode=false;
  window.requestAnimationFrame=callback=>{if(window.recordMode&&callback.name==='frame'){window.recordRaf=callback;return 999999;}return native(callback);};
 });
 await page.goto(url);await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
 await page.evaluate(async()=>{
  const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
  const [{FriendsSession},{LobbyBrowser},{GameRenderer},{v}]=await Promise.all([import(moduleUrl('multiplayer')),import(moduleUrl('lobbies')),import(moduleUrl('renderer')),import(moduleUrl('simulation'))]);
  LobbyBrowser.prototype.start=async()=>{};
  FriendsSession.prototype.hostPublic=async function(){window.recordSession=this;this.onChange();};
  const start=FriendsSession.prototype.start;
  FriendsSession.prototype.start=function(){
   start.call(this);this.startAt=0;this.world.options.schedule=false;
   this.world.addCrew('alice');this.world.addCrew('bob');
   this.members.push({id:'alice',name:'Alice',host:false,ready:true},{id:'bob',name:'Bob',host:false,ready:true});
   this.world.crew[0].player.pos=v(0,1.8,9);this.world.crew[1].player.pos=v(-1.4,1.8,3);this.world.crew[2].player.pos=v(3,1.8,0);
  };
  const step=FriendsSession.prototype.step;
  FriendsSession.prototype.step=function(input){
   if(window.recordKill){const p=this.world.crew.find(p=>p.id===window.recordKill);const e=this.world.spawn('skull',{...p.player.pos});e.age=12;window.recordKill=null;}
   step.call(this,input);
  };
  const render=GameRenderer.prototype.render;
  GameRenderer.prototype.render=function(...args){window.recordRenderer=this;render.apply(this,args);};
 });
 await page.click('#friends-open');await page.locator('#friends-name').fill('You');await page.click('#friends-host');await page.click('#friends-ready');await page.click('#friends-start');
 await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.friends.crew?.length===3&&window.abyss.time>.1);
 await page.waitForFunction(()=>!!document.pointerLockElement);
 await page.evaluate(async()=>{
  window.recordMode=true;await new Promise(window.nativeRaf);await new Promise(window.nativeRaf);
  if(!window.recordRaf)throw Error('Main animation loop was not captured');window.recordNow=performance.now();
  document.dispatchEvent(new MouseEvent('mousemove',{movementY:60}));
 });
 for(let frame=0;frame<160;frame++){
  if(frame===14)await page.evaluate(()=>window.recordKill='alice');
  if(frame===27||frame===70)await page.evaluate(()=>window.recordSession.world.enemies=[]);
  if(frame===58)await page.evaluate(()=>window.recordKill='host');
  if(frame===64){await page.keyboard.down('KeyE');await page.keyboard.down('KeyS');await page.keyboard.down('KeyD');}
  if(frame===82){await page.keyboard.up('KeyE');await page.keyboard.up('KeyS');await page.keyboard.up('KeyD');}
  if(frame===78)await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:-200,movementY:140})));
  if(frame===134)await page.evaluate(()=>window.recordKill='bob');
  await page.evaluate(()=>{window.recordNow+=50;window.recordRaf(window.recordNow);});
  await page.screenshot({path:`${frames}/${String(frame).padStart(3,'0')}.png`});
 }
 if(errors.length)throw Error(errors.join('\n'));
 const state=await page.evaluate(()=>({mode:window.abyss.mode,spectating:window.abyss.spectating,killcam:!!window.abyss.deathAnalysis?.active,crew:window.abyss.friends.crew.map(p=>({id:p.id,alive:p.alive}))}));
 if(state.mode!=='dead'||!state.spectating||state.killcam)throw Error(JSON.stringify(state));
 console.log(JSON.stringify({frames:160,fps:20,directory:frames,...state}));
}finally{await browser.close();}
