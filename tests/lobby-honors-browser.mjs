import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const names=['Ash Sovereign','Silver Fang','Bronze Warden','Wanderer'];
let scores=names.slice(0,3).map((player_name,i)=>({player_name,survival_ms:700000-i*100000,kills:100,gems:50,achieved_at:'2026-10-15T10:00:00Z'})),failed=false;
const errors=[];mkdirSync('artifacts/lobby-honors',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Ash Sovereign',configured:true,automatic:false}));localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));});
 await context.route('**/rest/v1/rpc/**',route=>route.fulfill({status:failed?400:200,contentType:'application/json',body:JSON.stringify(failed?{message:'Unavailable'}:route.request().url().includes('abyss_my_score')?[]:scores)}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const waitFor=fn=>page.waitForFunction(fn,undefined,{polling:50});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await waitFor(()=>document.querySelector('#shrine-name').textContent==='Ash Sovereign');
 await page.evaluate(async names=>{
  const moduleUrl=name=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===`/src/${name}.ts`).at(-1)?.name??`/src/${name}.ts`;
  const {FriendsSession}=await import(moduleUrl('multiplayer')),{LobbyBrowser}=await import(moduleUrl('lobbies'));
  LobbyBrowser.prototype.start=async function(){};
  FriendsSession.prototype.hostPublic=async function(){window.testSession=this;this.lobbyName='The Podium';this.members=names.map((name,i)=>({id:i?'guest'+i:'host',name,host:i===0,ready:false}));this.onChange();};
 },names);
 await page.click('#friends-open');await page.click('#friends-host');
 await page.locator('.crew-slot[data-podium="1"]').waitFor();
 const ranks=()=>page.locator('.crew-slot').evaluateAll(cards=>cards.map(c=>c.dataset.podium??null));
 assert.deepEqual(await ranks(),['1','2','3',null]);
 assert.equal(await page.locator('.crew-crown-fire').count(),1);
 assert.equal(await page.locator('.crew-rank-honor').count(),3);
 await page.screenshot({path:'artifacts/lobby-honors/desktop.png'});
 await page.locator('#friends-ready').evaluate(el=>el.click());
 assert.equal(await page.locator('.crew-slot[data-podium="1"]').evaluate(el=>el.classList.contains('is-ready')),true);
 assert.deepEqual(await ranks(),['1','2','3',null]);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/lobby-honors/mobile.png'});
 const championName=page.locator('.crew-slot[data-podium="1"] strong');assert.match(await championName.textContent(),/Ash Sovereign/);
 assert.equal(await championName.evaluate(el=>getComputedStyle(el).visibility),'visible');
 assert.equal(await championName.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 assert.equal(await page.evaluate(()=>document.querySelector('.friends-shell').scrollWidth<=document.querySelector('.friends-shell').clientWidth),true);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.crew-crown-fire i').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 // A refreshed board transfers every honor, including after the champion changes.
 scores=[scores[1],scores[2],scores[0]];
 await page.click('#friends-close');await page.click('#champion-shrine');await page.click('#leaderboard-refresh');
 await waitFor(()=>document.querySelector('#throne-name').textContent==='Silver Fang');
 assert.deepEqual(await ranks(),['3','1','2',null]);
 failed=true;await page.click('#leaderboard-refresh');await waitFor(()=>document.querySelector('#leaderboard-status').textContent.includes('unavailable'));
 assert.deepEqual(await ranks(),[null,null,null,null]);assert.equal(await page.locator('.crew-crown-fire').count(),0);
 failed=false;scores=[];await page.click('#leaderboard-refresh');await waitFor(()=>document.querySelector('#shrine-name').textContent==='The crown awaits.');assert.deepEqual(await ranks(),[null,null,null,null]);
 assert.deepEqual(errors,[]);console.log('Lobby honors passed: global top three, champion-only fire, ready state, mobile fit, reduced motion, rank transfer, failure and empty board.');
}finally{await browser.close();}
