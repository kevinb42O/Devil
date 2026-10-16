import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[];
try{
 for(const scheme of ['mobile','controller']){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:scheme==='mobile',isMobile:scheme==='mobile'});
  await context.addInitScript(scheme=>{
   localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Ash',configured:true}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:scheme}));Element.prototype.requestFullscreen=undefined;
   window.testPad={id:'Courtyard controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>scheme==='controller'?[window.testPad]:[]});
  },scheme);
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.abyss?.courtyardAssets.loaded&&window.abyss.originalAssets,{timeout:60000});
  await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname.endsWith('/src/multiplayer.ts'))?.name??'/src/multiplayer.ts';const {FriendsSession}=await import(url);FriendsSession.prototype.hostPublic=async function(){this.room='DEVICE01';this.lobbyName='The First Circle';window.session=this;this.onChange();};});
  await page.click('#friends-open');await page.click('#friends-host');await page.waitForFunction(()=>window.abyss.friends?.members[0].loaded===window.abyss.friends?.epoch);
  if(scheme==='mobile'){
   await page.evaluate(()=>{for(let i=1;i<6;i++){const id='device-'+i;window.session.addLobbyCrew(id);window.session.members.push({id,name:['Ember','Nyx','Rune','Hex','Moss'][i-1],host:false,ready:true,loaded:window.session.epoch,color:['ember','violet','frost','gold','jade'][i-1]});}window.session.onChange();});
   for(const [width,height]of [[844,390],[390,844]]){
    await page.setViewportSize({width,height});await page.waitForFunction(()=>document.querySelector('.courtyard-count').textContent==='5 / 6 ready');
    const rects=await page.locator('.courtyard-buttons button:not([hidden]),.courtyard-touch-arms button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {id:n.id||n.textContent,left:r.left,top:r.top,right:r.right,bottom:r.bottom};}));
    for(const r of rects)assert.ok(r.left>=-1&&r.top>=-1&&r.right<=width+1&&r.bottom<=height+1,JSON.stringify({width,height,...r}));
    await page.screenshot({path:`artifacts/courtyard-mobile-${width}x${height}.png`});
   }
   await page.setViewportSize({width:844,height:390});await page.locator('#courtyard-ready').tap();await page.waitForFunction(()=>window.abyss.friends.members[0].ready);
   const left=page.getByRole('button',{name:'Hold left arm up'}),box=await left.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForFunction(()=>window.abyss.input.leftArm);await page.mouse.up();await page.waitForFunction(()=>!window.abyss.input.leftArm);
   await page.locator('#courtyard-room').tap();await page.locator('#friends').waitFor({state:'visible'});await page.locator('#friends-close').tap();await page.waitForFunction(()=>window.abyss.mode==='playing');
  }else{
   const press=async index=>{await page.evaluate(i=>window.testPad.buttons[i].pressed=true,index);await page.waitForTimeout(120);await page.evaluate(i=>window.testPad.buttons[i].pressed=false,index);await page.waitForTimeout(120);};
   await page.evaluate(()=>window.testPad.buttons[4].pressed=true);await page.waitForFunction(()=>window.abyss.input.leftArm);await page.evaluate(()=>window.testPad.buttons[4].pressed=false);await page.waitForFunction(()=>!window.abyss.input.leftArm);
   await page.evaluate(()=>window.testPad.buttons[5].pressed=true);await page.waitForFunction(()=>window.abyss.input.rightArm);await page.evaluate(()=>window.testPad.buttons[5].pressed=false);await page.waitForFunction(()=>!window.abyss.input.rightArm);
   await press(2);assert.equal(await page.locator('#courtyard-wave').count(),0);
   await press(9);await page.locator('#friends').waitFor({state:'visible'});await page.waitForFunction(()=>!!document.querySelector('.controller-focus'));
   await press(1);await page.locator('#friends').waitFor({state:'hidden'});await page.waitForFunction(()=>window.abyss.mode==='playing');
  }
  await context.close();console.log('Courtyard device passed:',scheme);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
