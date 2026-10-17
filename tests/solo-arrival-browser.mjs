import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:750}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Solo arrival',configured:true}));
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:55,musicVolume:0,controlScheme:'qwerty'}));
 });
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies&&!document.querySelector('#start').disabled);
 await page.evaluate(async()=>{
  const url=name=>performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===`/src/${name}.ts`)?.name??`/src/${name}.ts`;
  const [{World},{Sound},{CrewArrival}]=await Promise.all([import(url('simulation')),import(url('audio')),import(url('crew-arrival'))]);
  const step=World.prototype.stepEntrance;
  World.prototype.stepEntrance=function(...args){step.apply(this,args);if(window.crossSeal){this.player.pos={x:0,y:1.7,z:-7};window.crossSeal=false;}};
  const update=CrewArrival.prototype.update;
  CrewArrival.prototype.update=function(epoch,startAt,now,players){
   update.call(this,epoch,startAt,now,players);
   if(window.abyss?.entrance||!startAt)return;
   window.soloArrival??={started:now,release:null,cues:[],samples:[]};
   window.soloArrival.samples.push({remaining:startAt-now,time:window.abyss.time,hidden:this.element.hidden});
  };
  const cue=Sound.prototype.crewArrival;
  Sound.prototype.crewArrival=function(beat,remaining){cue.call(this,beat,remaining);window.soloCues??=[];window.soloCues.push(beat);if(beat===0)window.soloRelease={at:Date.now(),audio:this.diagnostics,time:window.abyss.time};};
 });
 await page.click('#start');await page.waitForFunction(()=>window.abyss.entrance&&window.abyss.mode==='playing');
 await page.waitForFunction(()=>window.abyss.audio.loaded>=15);
 await page.evaluate(()=>window.crossSeal=true);
 await page.waitForFunction(()=>!!window.soloRelease,{},{timeout:20000});
 const result=await page.evaluate(()=>({cues:window.soloCues,arrival:window.soloArrival,release:window.soloRelease}));
 assert.deepEqual(result.cues,[4,3,2,1,0]);
 const settling=result.arrival.samples.filter(s=>s.remaining>3000);
 assert.ok(settling.length>0);assert.ok(settling.every(s=>s.hidden&&s.time===0));
 assert.ok(result.arrival.samples.filter(s=>s.remaining>0).every(s=>s.time===0));
 assert.ok(result.release.at-result.arrival.started>=3900);
 assert.ok(result.release.audio.oneShotNames.includes('spawnplayer'));
 assert.ok(result.release.audio.oneShotNames.includes('crew-release-laugh'));
 assert.ok(!result.release.audio.oneShotNames.includes('crew-countdown'));
 await page.waitForFunction(()=>window.abyss.time>.1);
 assert.match(await page.locator('.arrival-detail').textContent(),/KEEP MOVING/);
 assert.deepEqual(errors,[]);
 console.log('Solo arrival passed: seal crossing, silent one-second lead, three-second voice/visual countdown, frozen survival timer, spawn release and simulation resume.');
}finally{await browser.close();}
