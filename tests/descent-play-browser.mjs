import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export const createHotContext=()=>({accept(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const injectQuery=url=>url;export const removeStyle=id=>document.getElementById(id)?.remove();export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s)}s.textContent=content}'}));
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('abyss-settings'))localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0}));
    localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Descent audit',automatic:false,configured:true}));
  });
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
  await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies);
  await page.click('#settings-open');
  assert.equal(await page.locator('#sky-motion').inputValue(),'reduced','honor OS motion preference on first use');
  await page.selectOption('#sky-motion','full');await page.click('#settings-close');
  await page.locator('.practice summary').click();await page.locator('#practice-time').fill('349');await page.click('#practice-start');
  await page.waitForFunction(()=>window.abyss.entrance);await page.keyboard.down('KeyW');await page.waitForFunction(()=>!window.abyss.entrance);await page.keyboard.up('KeyW');
  await page.waitForFunction(()=>window.abyss.sky.time>=349&&window.abyss.sky.time<350);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.abyss.mode==='paused');
  await page.waitForTimeout(80);const paused=await page.evaluate(()=>window.abyss.sky);
  await page.waitForTimeout(250);assert.deepEqual(await page.evaluate(()=>window.abyss.sky),paused);
  await page.click('#pause-settings');await page.selectOption('#sky-motion','reduced');await page.click('#settings-close');
  await page.waitForFunction(()=>window.abyss.sky.motion==='reduced');assert.equal(await page.evaluate(()=>window.abyss.sky.travel),0);
  await page.click('#resume');await page.waitForFunction(()=>window.abyss.sky.time>=350);
  const live=await page.evaluate(()=>({time:window.abyss.time,sky:window.abyss.sky}));
  assert.equal(live.sky.chapter,'The Cathedral Below');assert.ok(Math.abs(live.time-live.sky.time)<.1);
  // Exercise the real death-replay adapter with a deterministic fatal event.
  await page.evaluate(async()=>{
    const moduleUrl=performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname==='/src/simulation.ts').at(-1)?.name??'/src/simulation.ts';
    const {World}=await import(moduleUrl),step=World.prototype.step;
    World.prototype.step=function(...args){step.apply(this,args);if(this.time>=351.3&&this.state!=='dead')this.die('FALLEN');};
  });
  await page.waitForFunction(()=>window.abyss.deathAnalysis?.active);
  await page.click('#analysis-pause');await page.waitForTimeout(80);
  const death=await page.evaluate(()=>({sky:window.abyss.sky,replay:window.abyss.deathAnalysis,finalTime:window.abyss.time}));
  assert.ok(Math.abs(death.sky.time-death.replay.viewTime)<.01,'sky follows replay view, not final death time');
  assert.ok(death.sky.time<death.finalTime);
  await page.waitForTimeout(200);assert.deepEqual(await page.evaluate(()=>window.abyss.sky),death.sky);
  await page.keyboard.press('Escape');await page.click('#watch-last');await page.waitForFunction(()=>window.abyss.mode==='replay');
  await page.click('#replay-pause');
  await page.locator('#replay-seek').evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>window.abyss.sky.time>=351);const end=await page.evaluate(()=>window.abyss.sky);
  await page.locator('#replay-seek').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>window.abyss.sky.time===349);const rewind=await page.evaluate(()=>window.abyss.sky);
  assert.equal(rewind.chapter,'The Furnace');assert.equal(end.chapter,'The Cathedral Below');
  // The main menu uses its own relic scene; gameplay sky diagnostics stay at the last replay frame.
  await page.click('#replay-exit');await page.waitForFunction(()=>window.abyss.mode==='menu');
  assert.equal(await page.locator('#menu').isVisible(),true);
  await page.reload();await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies);
  await page.click('#settings-open');assert.equal(await page.locator('#sky-motion').inputValue(),'reduced');
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/descent/play.json',JSON.stringify({paused,live,death,end,rewind},null,2));
  console.log('Live descent passed: practice, pause, settings, milestone, death replay pause, replay seek, menu reset and persistence.');
}finally{await browser.close();}
