import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Host',configured:true}));});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
 await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/multiplayer.ts')?.name??'/src/multiplayer.ts';const {FriendsSession}=await import(url);FriendsSession.prototype.hostPublic=async function(){window.session=this;this.onChange();};});
 await page.click('#friends-open');await page.click('#friends-host');
 await page.evaluate(()=>{const s=window.session;s.members[0].name='Host with a long name';for(let i=1;i<6;i++){const id='layout-'+i;s.addLobbyCrew(id);s.members.push({id,name:'Player '+i+' abcdefghijklmnop',ready:true,host:false});}s.onChange();});
 assert.equal(await page.locator('#friends-roster .crew-slot:not(.empty)').count(),6);assert.equal(await page.locator('#friends-player-count').textContent(),'6 / 6 PLAYERS');
 mkdirSync('artifacts/six-player-lobby',{recursive:true});
 for(const [width,height]of [[1280,800],[844,390],[390,844]]){
  await page.setViewportSize({width,height});
  const overflow=await page.evaluate(()=>{const shell=document.querySelector('.friends-shell');return {scroll:shell.scrollWidth,client:shell.clientWidth};});assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify({width,height,...overflow}));
  await page.locator('#friends-ready').scrollIntoViewIfNeeded();await page.locator('#friends-ready').click({trial:true});await page.locator('#friends-player-count').scrollIntoViewIfNeeded();
  await page.screenshot({path:`artifacts/six-player-lobby/${width}x${height}.png`});
 }
 await page.click('#friends-close');await page.click('#leaderboard-open');await page.click('#leaderboard-crew');for(const n of [2,3,4,5,6])assert.equal(await page.locator('#crew-size-'+n).isVisible(),true);
 assert.deepEqual(errors,[]);console.log('Six-player lobby fits desktop and both mobile orientations; all cards, Ready and party-size filters remain accessible.');
}finally{await browser.close();}
