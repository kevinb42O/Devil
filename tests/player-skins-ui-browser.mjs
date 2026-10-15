import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});mkdirSync('artifacts/ascendant',{recursive:true});
const scores=Array.from({length:4},(_,i)=>({player_name:['Champion','Silver','Bronze','Fourth'][i],survival_ms:700000-i*100000,kills:100,gems:50,achieved_at:'2026-10-15T10:00:00Z'}));
let own={...scores[1],rank:2},denied=false,claims=0;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(()=>{
  window.requestAnimationFrame=()=>0;localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Champion',configured:true,automatic:false}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));
  const exp=Math.floor(Date.now()/1000)+86400,uid='11111111-1111-4111-8111-111111111111',token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({exp,sub:uid,role:'authenticated'}))+'.test';
  localStorage.setItem('abyss-leaderboard-auth',JSON.stringify({access_token:token,refresh_token:'test',expires_at:exp,expires_in:86400,token_type:'bearer',user:{id:uid,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-14T00:00:00Z'}}));
 });
 await context.route('**/rest/v1/rpc/**',async route=>{
  const rpc=new URL(route.request().url()).pathname.split('/').at(-1);let data=[];
  if(rpc==='abyss_leaderboard_replays'||rpc==='abyss_leaderboard')data=scores;
  if(rpc==='abyss_my_score')data=own?[own]:[];
  if(rpc==='abyss_claim_podium_skin'){claims++;data=denied?null:{token:'11111111-1111-4111-8111-111111111111',rank:own.rank};}
  if(rpc==='abyss_verify_podium_skin')data=denied?null:own?.rank;
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];const waitFor=fn=>page.waitForFunction(fn,undefined,{polling:50});page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await waitFor(()=>document.querySelector('#shrine-name').textContent==='Champion');
 await page.evaluate(async()=>{
  const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
  const {FriendsSession}=await import(moduleUrl('multiplayer')),{LobbyBrowser}=await import(moduleUrl('lobbies'));LobbyBrowser.prototype.start=async function(){};
  FriendsSession.prototype.hostPublic=async function(){window.testSession=this;this.room='PODIUM';this.lobbyName='The Ascendant';this.onChange();};
 });
 await page.locator('#friends-open').evaluate(el=>el.click());await page.locator('#friends-host').click();const skin=page.locator('#player-skin-ascendant');await skin.waitFor({state:'visible'});assert.equal(await skin.isEnabled(),true);
 await skin.click();try{await waitFor(()=>window.testSession.members[0].skin==='ascendant');}catch(e){console.log({claims,errors,state:await page.evaluate(()=>({members:window.testSession.members,room:window.testSession.room,status:document.querySelector('#player-skin-status').textContent,badge:document.querySelector('#player-skin-badge').textContent}))});throw e;}assert.equal(await page.locator('#player-skin-badge').textContent(),'EQUIPPED');assert.equal(await page.locator('#player-color-name').textContent(),'Ascendant');
 assert.equal(await page.locator('.player-color-swatch[aria-pressed=true]').count(),0);assert.ok(claims>0);await page.screenshot({path:'artifacts/ascendant/lobby-unlocked.png'});
 await page.setViewportSize({width:390,height:844});await skin.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.querySelector('.friends-shell').scrollWidth<=document.querySelector('.friends-shell').clientWidth),true);await page.screenshot({path:'artifacts/ascendant/lobby-mobile.png'});
 await page.getByRole('button',{name:'Jade',exact:true}).click();assert.equal(await page.evaluate(()=>window.testSession.members[0].skin),undefined);assert.equal(await skin.getAttribute('aria-pressed'),'false');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.ascendant-preview').evaluate(el=>getComputedStyle(el).animationName),'none');
 // Server denial overrides the client UI's cached rank, with a usable normal-color fallback.
 denied=true;await skin.click();await waitFor(()=>document.querySelector('#player-skin-status').textContent.includes('reserved'));assert.equal(await page.evaluate(()=>window.testSession.members[0].skin),undefined);assert.equal(await page.locator('#friends-ready').isEnabled(),true);
 // Renaming to Champion cannot unlock an unranked authenticated identity.
 own={...scores[3],rank:4};await page.evaluate(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>document.querySelector('#player-skin-badge').textContent==='LOCKED');assert.equal(await skin.isDisabled(),true);assert.equal(await page.locator('#friends-name').inputValue(),'Champion');
 await page.screenshot({path:'artifacts/ascendant/lobby-locked.png'});assert.deepEqual(errors,[]);console.log('Ascendant UI passed: authenticated solo eligibility, selection and fallback, server rejection, nickname impersonation lock, mobile fit, reduced motion.');
}finally{await browser.close();}
