import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
const chrome=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/rest/v1/rpc/**',async route=>{requests.push({name:new URL(route.request().url()).pathname.split('/').at(-1),args:route.request().postDataJSON()??{}});await route.fulfill({json:[]});});
 const url=process.env.GAME_URL||'http://127.0.0.1:5173';
 await page.route('**/reset-seed',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Reset fixture</title>'}));
 await page.goto(url+'/reset-seed');
 await page.evaluate(async()=>{
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:'qwerty'}));
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Fresh player',automatic:false,configured:true}));
  for(const key of ['abyss-survival-v3-best','abyss-last-run','abyss-pending-score','abyss-pending-score-v7'])localStorage.setItem(key,'999');
  for(const [name,stores]of [['abyss-replays',['runs']],['abyss-replay-sharing',['cache','pending']],['abyss-crew-recordings',['runs','cache']]]){
   await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{for(const store of stores)r.result.createObjectStore(store,{keyPath:'id'});};r.onsuccess=()=>{const db=r.result,tx=db.transaction(stores,'readwrite');for(const store of stores)tx.objectStore(store).put({id:'old',created:1});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});
  }
 });
 await page.goto(url);await page.waitForFunction(()=>window.abyss?.originalAssets&&!document.querySelector('#start').disabled);
 await page.waitForFunction(()=>['abyss-replays','abyss-replay-sharing','abyss-crew-recordings'].every(name=>localStorage.getItem('abyss-replay-reset:2026-10-20:'+name)==='done'));
 assert.deepEqual(await page.evaluate(async()=>{
  const contents=[],existing=new Set((await indexedDB.databases()).map(db=>db.name));
  for(const name of ['abyss-replays','abyss-replay-sharing','abyss-crew-recordings']){if(!existing.has(name)){contents.push(0);continue;}contents.push(await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>{const db=r.result,stores=Array.from(db.objectStoreNames);if(!stores.length){db.close();resolve(0);return;}const tx=db.transaction(stores,'readonly');let count=0;for(const store of stores){const q=tx.objectStore(store).count();q.onsuccess=()=>count+=q.result;}tx.oncomplete=()=>{db.close();resolve(count);};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}));}
  return contents;
 }),[0,0,0],'all local recordings, caches and upload jobs are gone');
 assert.deepEqual(await page.evaluate(()=>['abyss-survival-v3-best','abyss-last-run','abyss-pending-score','abyss-pending-score-v7'].map(key=>localStorage.getItem(key))),[null,null,null,null]);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('abyss-player-profile')).name),'Fresh player');
 await page.click('#leaderboard-open');assert.equal(await page.locator('#leaderboard-history').count(),0);
 await page.click('#leaderboard-crew');await page.getByText('No matching parties have published a score for the current gameplay version yet.',{exact:true}).waitFor();
 await page.click('#crew-size-3');await page.click('#leaderboard-solo');
 assert.ok(requests.some(r=>r.name==='abyss_crew_board_v20'));assert.ok(requests.some(r=>r.name==='abyss_leaderboard_replays'&&r.args.p_rules===7));
 assert.ok(!requests.some(r=>r.name.includes('history')||r.name==='abyss_leaderboard_replays'&&r.args.p_rules!==7));
 await page.evaluate(()=>localStorage.setItem('abyss-survival-v3-best','12'));
 await page.reload();await page.waitForFunction(()=>window.abyss?.originalAssets&&!document.querySelector('#start').disabled);
 assert.equal(await page.evaluate(()=>localStorage.getItem('abyss-survival-v3-best')),'12','new scores survive a reload');
 await page.click('#leaderboard-open');mkdirSync('artifacts/leaderboard-reset',{recursive:true});await page.screenshot({path:'artifacts/leaderboard-reset/desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/leaderboard-reset/mobile.png'});
 assert.deepEqual(errors,[]);console.log('Fresh leaderboard UI, one-time local score/replay cleanup, retained profile, current-only RPCs and reload persistence passed.');
}finally{await browser.close();}
