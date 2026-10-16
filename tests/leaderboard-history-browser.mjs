import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
const chrome=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:'qwerty'})));
 await page.route('**/rest/v1/rpc/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),args=route.request().postDataJSON()??{};requests.push({name,args});let body=[];
  if(name==='abyss_leaderboard_replays'&&args.p_rules===6)body=[{player_name:'Historical champion',survival_ms:315725,kills:10,gems:20,achieved_at:'2026-10-14T20:00:00Z',replay_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}];
  if(name==='abyss_crew_board_history'&&args.p_rules===18&&args.p_size===2)body=[{rank:1,run_id:'old-run',roster:[{id:'host',name:'Old host',host:true},{id:'guest',name:'Old guest',host:false}],survival_ms:10000,kills:2,gems:3,achieved_at:'2026-10-14T20:00:00Z',replay_id:null}];
  await route.fulfill({json:body});
 });
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalAssets&&!document.querySelector('#start').disabled);
 await page.click('#leaderboard-open');await page.locator('#leaderboard-history tbody').getByText('Historical champion',{exact:true}).waitFor();
 assert.equal(await page.locator('#leaderboard-rows').textContent(),'','current board stays separate');
 const replayRequest=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/abyss_replay'));
 await page.locator('#leaderboard-history').getByRole('button',{name:"Watch Historical champion's replay"}).click();await replayRequest;
 await page.selectOption('#leaderboard-history-version','5');await page.getByText('No published scores for solo rules 5.',{exact:false}).waitFor();
 await page.selectOption('#leaderboard-history-version','6');await page.locator('#leaderboard-history tbody').getByText('Historical champion',{exact:true}).waitFor();
 mkdirSync('artifacts/leaderboard-history',{recursive:true});await page.locator('#leaderboard-history').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/leaderboard-history/desktop.png'});
 await page.click('#leaderboard-crew');await page.selectOption('#leaderboard-history-version','18');await page.locator('#leaderboard-history tbody').getByText('Old host · Old guest',{exact:false}).waitFor();
 await page.click('#crew-size-3');await page.getByText('No published scores for 3-player crews in revision 18.',{exact:false}).waitFor();
 await page.click('#leaderboard-solo');assert.equal(await page.inputValue('#leaderboard-history-version'),'6');await page.locator('#leaderboard-history tbody').getByText('Historical champion',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.locator('#leaderboard-history').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/leaderboard-history/mobile.png'});
 assert.deepEqual(errors,[]);assert.ok(requests.some(r=>r.name==='abyss_crew_board_v20'));assert.ok(requests.some(r=>r.name==='abyss_leaderboard_replays'&&r.args.p_rules===7));
 console.log('Historical solo/crew boards, version and party-size switches, replay links, current-rule isolation and mobile rendering passed.');
}finally{await browser.close();}
