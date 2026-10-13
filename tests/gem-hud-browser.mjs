import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
try{
 for(const {scheme,viewport} of [{scheme:'qwerty',viewport:{width:1280,height:720}},{scheme:'mobile',viewport:{width:844,height:390}},{scheme:'mobile',viewport:{width:390,height:844}}]){
  const context=await browser.newContext({viewport,hasTouch:scheme==='mobile'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(scheme=>{localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:scheme}));localStorage.setItem('abyss-player-profile',JSON.stringify({name:'HUD audit',configured:true}));},scheme);
  await page.goto(url+'/?hand-preview=1');await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
  assert.equal(await page.locator('.economy').isVisible(),false);
  await page.evaluate(async()=>{
   const moduleUrl=performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname==='/src/simulation.ts').at(-1)?.name??'/src/simulation.ts';
   const {World}=await import(moduleUrl),step=World.prototype.step;
   World.prototype.step=function(...args){window.hudWorld=this;this.options.schedule=false;this.options.invulnerable=true;step.apply(this,args);};
  });
  await page.click('#start');await page.waitForFunction(()=>window.hudWorld&&window.abyss.time>.1);
  assert.equal(await page.locator('.economy').isVisible(),true);assert.equal(await page.locator('#respawn-status').isVisible(),false);assert.equal(await page.locator('.economy').innerText(),'0\n0');
  await page.evaluate(()=>{for(let i=0;i<80;i++)window.hudWorld.collect();});await page.waitForFunction(()=>document.querySelector('#gems').textContent==='80');
  assert.equal(await page.locator('#homing').textContent(),'70');assert.equal(await page.locator('.sword-icon').isVisible(),true);
  await page.evaluate(()=>window.hudWorld.reserve=0);await page.waitForTimeout(100);assert.equal(await page.locator('.economy').innerText(),'80\n0','shows total collected rather than homing reserve');
  const geometry=await page.evaluate(()=>{const hud=document.querySelector('#hud'),counter=document.querySelector('.economy'),icon=counter.querySelector('svg'),style=getComputedStyle(counter);return {right:hud.clientWidth-counter.offsetLeft-counter.offsetWidth,bottom:hud.clientHeight-counter.offsetTop-counter.offsetHeight,text:counter.innerText,icon:icon.getBoundingClientRect().width,pointerEvents:style.pointerEvents,rotated:document.body.dataset.mobileRotated};});
  assert.ok(Math.abs(geometry.right-18)<1,JSON.stringify(geometry));assert.ok(Math.abs(geometry.bottom-18)<1,JSON.stringify(geometry));assert.ok(geometry.icon>0);assert.equal(geometry.pointerEvents,'none');
  await page.evaluate(()=>window.hudWorld.stats.collected=12345);await page.waitForFunction(()=>document.querySelector('#gems').textContent==='12345');
  await page.screenshot({path:`/tmp/gem-hud-${scheme}-${viewport.width}.png`});
  if(scheme==='qwerty')await page.evaluate(()=>document.exitPointerLock());else await page.click('#timer');
  await page.waitForFunction(()=>window.abyss.mode==='paused');await page.click('#quit');
  assert.equal(await page.locator('.economy').isVisible(),false);
  await page.click('#start');await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.time>.05&&document.querySelector('#gems').textContent==='0');
  assert.equal(await page.locator('#respawn-status').isVisible(),false);
  assert.deepEqual(errors,[]);console.log(`Gem HUD passed: ${scheme} ${viewport.width}x${viewport.height}, visible icon/count, total collection, large count and bottom-right placement.`);await context.close();
 }
}finally{await browser.close();}
