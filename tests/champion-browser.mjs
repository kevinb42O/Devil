import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const leader={player_name:'Ash Sovereign',survival_ms:712345,kills:1594,gems:432,achieved_at:'2026-10-14T12:00:00Z'};
const second={player_name:'Bone Collector',survival_ms:605123,kills:1100,gems:280,achieved_at:'2026-10-14T11:00:00Z'};
let scores=[leader,second],own={...leader,rank:1},failed=false;
const errors=[];mkdirSync('artifacts/crown',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addInitScript(()=>{
  // This suite exercises menu cosmetics without rendering the arena in the background.
  window.requestAnimationFrame=()=>0;
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Ash Sovereign',automatic:false,configured:true}));
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));
  const exp=Math.floor(Date.now()/1000)+86400,uid='11111111-1111-4111-8111-111111111111';
  const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({exp,sub:uid,role:'authenticated'}))+'.test';
  localStorage.setItem('abyss-leaderboard-auth',JSON.stringify({access_token:token,refresh_token:'test',expires_at:exp,expires_in:86400,token_type:'bearer',user:{id:uid,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-14T00:00:00Z'}}));
 });
 await context.route('**/rest/v1/rpc/**',async route=>{
  const rpc=new URL(route.request().url()).pathname.split('/').at(-1);
  if(rpc==='abyss_leaderboard_replays'||rpc==='abyss_leaderboard')await route.fulfill({status:failed?503:200,contentType:'application/json',body:JSON.stringify(failed?{message:'Unavailable'}:scores)});
  else if(rpc==='abyss_my_score')await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(own?[own]:[])});
  else await route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const waitFor=fn=>page.waitForFunction(fn,undefined,{polling:50});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await waitFor(()=>document.querySelector('#shrine-name').textContent==='Ash Sovereign');
 await page.locator('#coronation').waitFor({state:'visible'});
 assert.equal(await page.locator('#player-title').textContent(),'REIGNING CHAMPION');
 await page.screenshot({path:'artifacts/crown/coronation-desktop.png'});
 await page.click('#coronation-dismiss');await page.locator('.sovereign-row').waitFor();
 assert.equal(await page.locator('#throne-name').textContent(),leader.player_name);
 await page.locator('#leaderboard-search').fill('Bone');assert.equal(await page.locator('#leaderboard-rows tr').count(),1);
 assert.equal(await page.locator('#leaderboard-rows td').first().textContent(),'2');assert.equal(await page.locator('#throne-name').textContent(),leader.player_name);
 await page.locator('#leaderboard-search').fill('');await page.screenshot({path:'artifacts/crown/throne-desktop.png'});
 await page.click('#leaderboard-close');await page.screenshot({path:'artifacts/crown/shrine-desktop.png'});
 // Reload never repeats a coronation for the same uninterrupted reign.
 await page.reload();await waitFor(()=>document.querySelector('#shrine-name').textContent==='Ash Sovereign');assert.equal(await page.locator('#coronation').isVisible(),false);
 const box=await page.locator('#champion-shrine').boundingBox();assert.ok(box.x>600&&box.width>300,'desktop shrine sits inside the seal');
 // Crown transfers even with the same score: server order defines the winner.
 scores=[{...second,survival_ms:leader.survival_ms},leader];own={...leader,rank:2};
 await page.click('#champion-shrine');await page.click('#leaderboard-refresh');
 await waitFor(()=>document.querySelector('#throne-name').textContent==='Bone Collector');assert.equal(await page.locator('#player-title').textContent(),'THE CONDEMNED');
 // Nickname text is never HTML.
 scores=[{...leader,player_name:'<img src=x onerror=1>'},second];own=null;await page.click('#leaderboard-refresh');await waitFor(()=>document.querySelector('#throne-name').textContent.includes('<img'));
 assert.equal(await page.locator('#throne-name img').count(),0);
 scores=[leader,second];await page.click('#leaderboard-refresh');await waitFor(()=>document.querySelector('#throne-name').textContent==='Ash Sovereign');await page.click('#leaderboard-close');
 await page.setViewportSize({width:390,height:844});await page.locator('#champion-shrine').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/crown/shrine-mobile.png'});
 const mobile=await page.locator('#champion-shrine').boundingBox();assert.ok(mobile.x>=0&&mobile.x+mobile.width<=390,'mobile shrine fits viewport');
 await page.click('#champion-shrine');await page.screenshot({path:'artifacts/crown/throne-mobile.png'});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.shrine-relic').evaluate(el=>getComputedStyle(el).animationName),'none');
 scores=[];await page.click('#leaderboard-refresh');await waitFor(()=>document.querySelector('#shrine-name').textContent==='The crown awaits.');assert.equal(await page.locator('#champion-throne').isVisible(),false);
 failed=true;await page.click('#leaderboard-refresh');await waitFor(()=>document.querySelector('#leaderboard-status').textContent.includes('unavailable'));assert.equal(await page.locator('#champion-shrine').isVisible(),false);
 await page.locator('#leaderboard-search').fill('Ash');assert.equal(await page.locator('.sovereign-row').count(),0);await page.locator('#leaderboard-search').fill('');
 failed=false;scores=[leader,second];await page.click('#leaderboard-refresh');await waitFor(()=>document.querySelector('#throne-name').textContent==='Ash Sovereign');await page.locator('#champion-throne').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);console.log('Crown passed: public shrine, authenticated ownership, coronation once, throne, search rank, tie transfer, safe names, mobile, reduced motion, empty board, failure and recovery.');
 await context.close();
}finally{await browser.close();}
