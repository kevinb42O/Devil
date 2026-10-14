import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/descent-mist';await mkdir(directory,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const canvas=document.createElement('canvas');document.body.append(canvas);canvas.style.cssText='position:fixed;inset:0;z-index:999999';
  const renderer=new GameRenderer(canvas,{quality:'high',fov:90});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,9);
  for(const [kind,x,y,z] of [['squid',-8,3.3,-12],['spider',8,2,-9],['skull',-3,2,-5],['skull2',5,3,-9],['skull3',0,5,-18]]){
   const e=world.spawn(kind,v(x,y,z));e.pos=v(x,y,z);e.age=20;e.headExposure=.7;
  }
  world.effects=[];
  const gl=renderer.renderer.getContext();
  const pixels=()=>{const b=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
  const difference=(a,b)=>{let d=0;for(let i=0;i<a.length;i+=4)d+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);return d/(a.length*.75);};
  window.mistAudit={renderer,world,pixels,difference};
 });
 const phases=[];
 for(const quality of ['high','low'])for(const [name,time] of [['opening',0],['cloud-arrival',30],['cloud-grave',45.5],['cloud-break',58.5],['bruised-veil',140],['furnace',259],['cathedral',370],['unlit-depth',460]]){
  const row=await page.evaluate(({quality,time})=>{
   const {renderer:r,world:w,pixels,difference}=window.mistAudit;w.time=time;r.configure({quality,fov:90});
   const draw=()=>r.render(w,0,.05,0,false);draw();const mist=r.openingMist.diagnostics,on=pixels();
   r.openingMist.enabled=false;r.composer.render();r.originalWeapon.render(r.renderer,false);const off=pixels();draw();
   return {mist,meanDifference:difference(on,off),calls:r.renderer.info.render.calls,sky:r.skyDiagnostics};
  },{quality,time});
  assert.equal(row.mist.chapter,row.sky.chapter);assert.equal(row.mist.blend,row.sky.blend);assert.ok(row.meanDifference>.1);
  assert.ok(row.mist.lights>0&&row.mist.lights<=16);
  phases.push({quality,name,time,...row});await page.screenshot({path:`${directory}/${name}-${quality}.png`});
 }
 const stability=await page.evaluate(()=>{
  const {renderer:r,world:w,pixels,difference}=window.mistAudit;
  w.time=45.5;r.render(w,0,.05,0,false);const first=pixels();
  r.render(w,0,.05,0,false);const paused=pixels();
  w.time=370;r.render(w,0,.05,0,false);w.time=45.5;r.render(w,0,.05,0,false);const rewind=pixels();
  r.configure({quality:'low',fov:90,skyMotion:'reduced'});w.time=45.5;r.render(w,0,.05,0,false);const a=r.openingMist.diagnostics;
  w.time=58.5;r.render(w,0,.05,0,false);const b=r.openingMist.diagnostics;
  return {pausedDifference:difference(first,paused),rewindDifference:difference(first,rewind),reducedA:a,reducedB:b};
 });
 assert.equal(stability.pausedDifference,0);assert.equal(stability.rewindDifference,0);
 assert.equal(stability.reducedA.time,0);assert.equal(stability.reducedB.time,0);assert.equal(stability.reducedA.pulse,stability.reducedB.pulse);
 const lights=await page.evaluate(async()=>{
  const {renderer:r,world:w,pixels,difference}=window.mistAudit;
  w.time=460;r.configure({quality:'high',fov:90});r.render(w,0,0,0,false);const lit=pixels();
  r.openingMist.uniforms.litMedium.value=0;r.composer.render();r.originalWeapon.render(r.renderer,false);const unlit=pixels();
  const enemyDifference=difference(lit,unlit);
  // Dense nearby volleys stay inside a fixed lighting budget and clear immediately.
  const {idleInput}=await import('/src/simulation.ts');
  for(let i=0;i<20;i++){w.player.shotTimer=0;w.step({...idleInput(),fire:true});}
  r.render(w,0,0,0,false);const shooting=r.openingMist.diagnostics;
  w.enemies=[];w.projectiles=[];r.render(w,0,0,0,false);const cleared=r.openingMist.diagnostics;
  return {enemyDifference,shooting,cleared};
 });
 assert.ok(lights.enemyDifference>.02,'emissive enemies must illuminate the volume');assert.ok(lights.shooting.lights<=16);
 assert.equal(lights.cleared.lights,0,'light must not persist after its source disappears');
 const livePage=await browser.newPage({viewport:{width:1280,height:720}});
 livePage.on('pageerror',e=>errors.push(e.message));
 await livePage.addInitScript(()=>{
  localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,skyMotion:'full'}));
  localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Mist audit',automatic:false,configured:true}));
 });
 await livePage.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await livePage.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies);
 await livePage.locator('.practice summary').click();await livePage.locator('#practice-time').fill('39');await livePage.click('#practice-start');
 await livePage.waitForFunction(()=>window.abyss.entrance);
 await livePage.keyboard.down('KeyW');await livePage.waitForFunction(()=>!window.abyss.entrance);await livePage.keyboard.up('KeyW');
 await livePage.waitForFunction(()=>window.abyss.sky.time>=39);
 await livePage.keyboard.press('Escape');await livePage.waitForFunction(()=>window.abyss.mode==='paused');await livePage.waitForTimeout(80);
 const live=await livePage.evaluate(()=>({sky:window.abyss.sky,mist:window.abyss.mist}));
 assert.equal(live.mist.chapter,live.sky.chapter);assert.equal(live.mist.time,live.sky.time);
 await livePage.waitForTimeout(180);assert.deepEqual(await livePage.evaluate(()=>window.abyss.mist),live.mist);
 await livePage.close();
 assert.deepEqual(errors,[]);
 await writeFile(`${directory}/audit.json`,JSON.stringify({phases,stability,lights,live,errors},null,2));
 console.log(JSON.stringify({phases:phases.map(({quality,name,meanDifference,mist})=>({quality,name,difference:meanDifference,lights:mist.lights})),stability,lights},null,2));
}finally{await browser.close();}
