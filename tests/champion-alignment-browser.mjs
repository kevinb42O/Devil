import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const sizes=[[2560,1440],[1920,1080],[1440,900],[1366,768],[1280,720],[1152,648],[1101,620],[1100,760],[1024,768],[851,600],[850,600],[768,1024],[600,800],[390,844],[320,568],[844,390]];
const rows=[{player_name:'Hussain',survival_ms:315725,kills:523,gems:110,achieved_at:'2026-10-14T12:00:00Z'}];
const errors=[],results=[];mkdirSync('artifacts/crown/alignment',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));const waitFor=fn=>page.waitForFunction(fn,undefined,{polling:50});
 await page.addInitScript(()=>{localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));window.requestAnimationFrame=()=>0;});
 await page.route('**/rest/v1/rpc/abyss_leaderboard*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)}));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await waitFor(()=>document.querySelector('#shrine-name').textContent==='Hussain');
 // This is a DOM layout audit; stop arena rendering so resizing does not measure GPU load.
 await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height});await page.locator('#champion-shrine').scrollIntoViewIfNeeded();
  const geometry=await page.evaluate(()=>{
   const bounds=selector=>{const b=document.querySelector(selector).getBoundingClientRect();return {cx:b.x+b.width/2,x:b.x,right:b.right,y:b.y,bottom:b.bottom,width:b.width,height:b.height}};
   return {seal:bounds('.infernal-seal'),stage:bounds('#champion-stage'),shrine:bounds('#champion-shrine'),relic:bounds('.shrine-relic'),kicker:bounds('#champion-shrine .shrine-kicker'),name:bounds('#shrine-name'),record:bounds('#shrine-record'),invitation:bounds('.shrine-invitation'),inscription:bounds('.seal-inscription')};
  });
  const compact=width<=600||(width<=1100&&height<=560),centered=!compact?['shrine','relic','kicker','name','record','invitation','inscription']:['shrine'];
  for(const key of centered)assert.ok(Math.abs(geometry[key].cx-geometry.stage.cx)<.6,`${width}×${height}: ${key} shares stage centre`);
  if(compact)assert.ok(geometry.relic.right<=geometry.name.x+.6,`${width}×${height}: compact character and caption occupy separate columns`);
  assert.ok(geometry.stage.x>=0&&geometry.stage.right<=width+.6,`${width}×${height}: stage inside viewport`);
  assert.ok(geometry.relic.y>=geometry.stage.y,`${width}×${height}: character anchor inside stage`);
  if(geometry.inscription.height>0)assert.ok(geometry.invitation.bottom<geometry.inscription.y,`${width}×${height}: caption clears inscription`);
  assert.ok(geometry.stage.bottom<=height,`${width}×${height}: composition visible after scroll`);
  results.push({width,height,centre:geometry.seal.cx,maximumAlignmentError:Math.max(...centered.map(key=>Math.abs(geometry[key].cx-geometry.stage.cx)))});
  if([1920,1152,390,844].includes(width))await page.screenshot({path:`artifacts/crown/alignment/${width}x${height}.png`});
 }
 // A maximum-length name must wrap around the same centre without colliding with the inscription.
 rows[0].player_name='MMMMMMMMMMMMMMMMMMMMMMMM';await page.click('#champion-shrine');await page.click('#leaderboard-refresh');await waitFor(()=>document.querySelector('#shrine-name').textContent==='MMMMMMMMMMMMMMMMMMMMMMMM');await page.click('#leaderboard-close');
 await page.setViewportSize({width:320,height:568});await page.locator('#champion-shrine').scrollIntoViewIfNeeded();
 const wrapped=await page.evaluate(()=>{const name=document.querySelector('#shrine-name').getBoundingClientRect(),shrine=document.querySelector('#champion-shrine').getBoundingClientRect(),invitation=document.querySelector('.shrine-invitation').getBoundingClientRect(),inscription=document.querySelector('.seal-inscription').getBoundingClientRect();return {fits:name.x>=shrine.x&&name.right<=shrine.right,clear:inscription.height===0||invitation.bottom<inscription.y};});
 assert.equal(wrapped.fits,true);assert.equal(wrapped.clear,true);assert.deepEqual(errors,[]);
 writeFileSync('artifacts/crown/alignment/verification.json',JSON.stringify(results,null,2));console.log(`Alignment passed at ${sizes.length} viewport sizes, including both breakpoints, short landscape, ultrawide, and a maximum-length name.`);
}finally{await browser.close();}
