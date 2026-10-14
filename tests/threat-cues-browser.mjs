import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 for(const {scheme,viewport} of [{scheme:'qwerty',viewport:{width:1280,height:720}},{scheme:'mobile',viewport:{width:844,height:390}},{scheme:'mobile',viewport:{width:390,height:844}}]){
  const context=await browser.newContext({viewport,hasTouch:scheme==='mobile'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(scheme=>localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:scheme,threatCues:true})),scheme);
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/?hand-preview=1');
  await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
  await page.evaluate(async()=>{
   const url=performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname==='/src/simulation.ts').at(-1)?.name??'/src/simulation.ts';
   const {World}=await import(url),step=World.prototype.step;
   World.prototype.step=function(...args){window.cueWorld=this;if(window.freezeCues)return;this.options.schedule=false;this.options.invulnerable=true;step.apply(this,args);};
  });
  await page.click('#start');await page.waitForFunction(()=>window.cueWorld);
  await page.evaluate(()=>{
   window.freezeCues=true;const w=window.cueWorld;w.enemies=[];
   const p=w.player.pos;
   for(const [kind,x,z] of [['skull',0,-4],['spider',4,0],['egg',0,4],['centipede',-4,0]]){
    const e=w.spawn(kind,{x:p.x+x,y:p.y,z:p.z+z});e.age=20;e.pos={x:p.x+x,y:p.y,z:p.z+z};
    e.status='hunting';e.centipedeMotion=undefined;e.segments=[];
   }
  });
  await page.waitForFunction(()=>document.querySelectorAll('#threat-ring .threat').length===4);
  assert.equal(await page.locator('#threat-ring').isVisible(),true,'cue layer must escape the minimal HUD hide rule');
  await page.evaluate(()=>window.cueMarkers=Array.from(document.querySelectorAll('#threat-ring .threat')));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.cueMarkers.every((el,i)=>el===document.querySelectorAll('#threat-ring .threat')[i])),true,'HUD updates reuse markers');
  const markers=await page.evaluate(()=>Array.from(document.querySelectorAll('#threat-ring .threat')).map(el=>{
   const transform=new DOMMatrix(getComputedStyle(el).transform),rect=el.getBoundingClientRect();
   return {x:transform.m41,y:transform.m42,color:getComputedStyle(el).backgroundColor,visible:getComputedStyle(el).display!=='none'&&rect.width>0&&rect.height>0};
  }));
  assert.ok(markers.every(m=>m.visible),JSON.stringify(markers));
  assert.deepEqual(markers.map(m=>m.color),['rgb(239, 114, 87)','rgb(201, 145, 255)','rgb(184, 229, 107)','rgb(112, 217, 229)']);
  assert.ok(Math.abs(markers[0].x)<1&&markers[0].y<0);
  assert.ok(markers[1].x>0&&Math.abs(markers[1].y)<1);
  assert.ok(Math.abs(markers[2].x)<1&&markers[2].y>0);
  assert.ok(markers[3].x<0&&Math.abs(markers[3].y)<1);
  // Exercise the real settings handler while the run is paused.
  if(scheme==='mobile')await page.click('#timer');else await page.evaluate(()=>document.exitPointerLock());
  await page.waitForFunction(()=>window.abyss.mode==='paused');
  await page.click('#pause-settings');await page.uncheck('#threat-cues');
  await page.waitForFunction(()=>document.querySelectorAll('.threat').length===0);
  await page.check('#threat-cues');await page.waitForFunction(()=>document.querySelectorAll('.threat').length===4);
  assert.equal(await page.evaluate(()=>window.cueMarkers.every((el,i)=>el===document.querySelectorAll('#threat-ring .threat')[i])),true,'setting toggles reuse markers');
  assert.deepEqual(errors,[]);
  console.log(`Threat cues passed: ${scheme} ${viewport.width}x${viewport.height}, distinct family colours, visible cardinal bearings and live setting toggle.`);
  await context.close();
 }
}finally{await browser.close();}
