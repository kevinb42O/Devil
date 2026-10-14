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
  assert.equal(await page.locator('#fps-meter').isVisible(),false);
  await page.evaluate(async()=>{
   const moduleUrl=performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname==='/src/simulation.ts').at(-1)?.name??'/src/simulation.ts';
   const {World}=await import(moduleUrl),step=World.prototype.step;
   World.prototype.step=function(...args){window.hudWorld=this;this.options.schedule=false;this.options.invulnerable=true;step.apply(this,args);};
  });
  await page.click('#start');await page.waitForFunction(()=>window.hudWorld&&window.abyss.time>.1);
  assert.equal(await page.locator('.economy').isVisible(),true);assert.equal(await page.locator('#respawn-status').isVisible(),false);assert.equal(await page.locator('.economy').innerText(),'0\n0');
  await page.waitForFunction(()=>Number(document.querySelector('#fps-value').textContent)>0);
  assert.equal(await page.locator('#fps-meter').isVisible(),true);
  assert.equal(await page.locator('#connection-value').isVisible(),false);
  assert.equal(await page.locator('.connection-bars').isVisible(),false);
  assert.equal(await page.locator('#connection-context').isVisible(),false);
  assert.equal(await page.locator('#connection-unit').isVisible(),false);
  const fpsStyle=await page.locator('#fps-meter').evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el.parentElement).backgroundColor,shadow:getComputedStyle(el.parentElement).boxShadow}));
  assert.deepEqual(fpsStyle,{color:'rgb(255, 255, 255)',background:'rgba(0, 0, 0, 0)',shadow:'none'});
  if(scheme==='qwerty'){
   // Slow actual animation callbacks to prove this is a live frame counter.
   await page.evaluate(()=>{
    window.originalFrameRequest=window.requestAnimationFrame;
    window.requestAnimationFrame=callback=>window.originalFrameRequest(()=>setTimeout(()=>window.originalFrameRequest(callback),100));
   });
   await page.waitForFunction(()=>{const fps=Number(document.querySelector('#fps-value').textContent);return fps>0&&fps<15;},{},{timeout:10000});
   await page.evaluate(()=>window.requestAnimationFrame=window.originalFrameRequest);
   await page.waitForFunction(()=>Number(document.querySelector('#fps-value').textContent)>20,{},{timeout:10000});
  }

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
  assert.equal(await page.locator('#fps-meter').isVisible(),false);
  await page.click('#start');await page.waitForFunction(()=>window.abyss.mode==='playing'&&window.abyss.time>.05&&document.querySelector('#gems').textContent==='0');
  assert.equal(await page.locator('#respawn-status').isVisible(),false);
  assert.deepEqual(errors,[]);console.log(`Gem HUD passed: ${scheme} ${viewport.width}x${viewport.height}, visible icon/count, total collection, large count and bottom-right placement.`);await context.close();
 }
}finally{await browser.close();}
