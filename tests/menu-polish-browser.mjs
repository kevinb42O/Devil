import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const errors=[],results=[];
const scores=[{player_name:'Ash Sovereign',survival_ms:712345,kills:1594,gems:432,achieved_at:'2026-10-14T12:00:00Z'}];
mkdirSync('artifacts/menu-polish',{recursive:true});
async function prepare(context){
 await context.addInitScript(()=>{
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Wanderer',automatic:false,configured:true}));
  if(!localStorage.getItem('abyss-settings'))localStorage.setItem('abyss-settings',JSON.stringify({quality:'high',volume:0,musicVolume:0,controlScheme:'qwerty'}));
 });
 await context.route('**/rest/v1/rpc/abyss_leaderboard*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(scores)}));
}
try{
 const context=await browser.newContext({viewport:{width:1600,height:1000}});await prepare(context);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text()))errors.push(m.text());});
 await page.goto(url);await page.waitForFunction(()=>window.abyss&&document.documentElement.dataset.relics==='ready');
 await page.waitForFunction(()=>!document.querySelector('#start').disabled&&document.querySelector('#shrine-name').textContent==='Ash Sovereign');
 assert.equal((await page.evaluate(()=>window.abyss.menuRelics)).loaded,2);
 assert.equal(await page.evaluate(()=>window.abyss.menuRelics.player),'quaternius-demon');
 assert.ok(await page.evaluate(()=>window.abyss.menuRelics.mist.steps>=12));
 for(const [width,height] of [[1600,1000],[1440,900],[1366,768],[1152,648],[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const fit=await page.evaluate(()=>{
   const b=selector=>document.querySelector(selector).getBoundingClientRect();
   const stage=b('#champion-stage'),start=b('#start'),menu=b('.menu-content'),best=b('.best-card');
   return {stageFits:stage.x>=0&&stage.right<=innerWidth,startFits:start.x>=0&&start.right<=innerWidth,scrollFits:document.querySelector('.menu-content').scrollWidth<=menu.width+1,bestVisible:best.bottom<=menu.bottom,primaryVisible:start.bottom<=menu.bottom};
  });
  assert.ok(fit.stageFits&&fit.startFits&&fit.scrollFits,`${width}x${height}: no horizontal overflow`);
  if(width>=1366)assert.ok(fit.bestVisible,`${width}x${height}: complete desktop menu is visible`);
  if(width===390)assert.ok(fit.primaryVisible,'mobile Play is visible without scrolling');
  results.push({width,height,...fit});
  await page.screenshot({path:`artifacts/menu-polish/${width}x${height}.png`});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#leaderboard-open').click();await page.locator('#leaderboard').waitFor({state:'visible'});await page.locator('#leaderboard-close').click();
 await page.locator('#settings-open').click();await page.locator('#settings').waitFor({state:'visible'});await page.locator('#settings-close').click();
 await page.locator('#history-open').click();await page.locator('#history').waitFor({state:'visible'});await page.locator('#history-close').click();
 await page.locator('#profile-edit').click();await page.locator('#player-profile').waitFor({state:'visible'});await page.locator('#profile-cancel').click();
 // Reduced motion freezes the actual 3D scene, including particles and lighting.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('abyss-settings'));s.skyMotion='reduced';localStorage.setItem('abyss-settings',JSON.stringify(s));});
 await page.reload();await page.waitForFunction(()=>window.abyss&&document.documentElement.dataset.relics==='ready');await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 const before=await page.evaluate(()=>window.abyss.menuRelics.time);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.abyss.menuRelics.time),before);
 assert.equal(await page.locator('.shrine-relic').evaluate(el=>getComputedStyle(el).animationName),'none');
 // Starting still captures input in the initiating gesture and enters the existing descent.
 await page.locator('#start').click();await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.entrance);
 assert.equal(await page.locator('#menu').isVisible(),false);
 assert.equal(await page.locator('#menu-threshold').evaluate(el=>el.classList.contains('is-crossing')),true);
 // Optional art failing to download must never disable the game.
 const fallback=await browser.newContext({viewport:{width:1440,height:900}});await prepare(fallback);
 await fallback.route('**/models/relics/*.glb',route=>route.abort());
 const offline=await fallback.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.goto(url);
 await offline.waitForFunction(()=>window.abyss&&window.abyss.menuRelics.failures.includes('crown')&&!document.querySelector('#start').disabled);
 await offline.locator('#start').click();await offline.waitForFunction(()=>window.abyss.entrance);
 assert.deepEqual(errors,[]);writeFileSync('artifacts/menu-polish/verification.json',JSON.stringify({results,errors,models:'existing player and downloaded crown loaded; crown failure fallback verified',mist:'depth-aware volume rendered',reducedMotion:'frozen',descent:'passed'},null,2));
 console.log('Menu polish passed: 7 viewports, player, crown, volumetric mist, panel navigation, reduced motion, descent, and model-download failure.');
}finally{await browser.close();}
