import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const dir='artifacts/upgrade-ground-pulse';await mkdir(dir,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(url+'/upgrade-check',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:#000}canvas{display:block}</style><canvas id="game"></canvas>'}));
 await page.goto(url+'/upgrade-check');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World},{WebGLRenderer}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,mist:false});await renderer.prepare();
  const world=new World(1,{schedule:false});world.player.pos={x:0,y:1.7,z:0};
  window.probe={renderer,world,age:0};
  window.frame=(dt=0)=>renderer.render(world,0,-.2,dt,false);
  window.trigger=(level)=>{renderer.clear();world.level=level;renderer.effect({kind:'upgrade',level,amount:level,pos:world.player.pos,shooterId:world.crew.find(p=>p.player===world.player)?.id},world,0,-.2);window.frame();};
  window.frame();
  // Compare the actual framebuffer, not just shader flags: an upgrade must
  // leave each original firing frame identical for both upper hand tiers.
  const weapon=renderer.originalWeapon,handRenderer=new WebGLRenderer({preserveDrawingBuffer:true});handRenderer.setSize(640,360);weapon.resize(640,360);
  const gl=handRenderer.getContext();
  for(const level of [3,4])for(const kind of ['shot','burst']){
   function shot(upgrade){
    weapon.clear();world.level=level;
    if(upgrade){weapon.effect({kind:'upgrade',level,amount:level,pos:world.player.pos},world,0,0);weapon.update(world,0,false);}
    weapon.effect({kind,level,pos:world.player.pos},world,0,0);weapon.update(world,.016,false);
    handRenderer.clear();weapon.render(handRenderer,false);const bytes=new Uint8Array(640*360*4);gl.readPixels(0,0,640,360,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
   }
   const baseline=shot(false),upgraded=shot(true);if(!baseline.every((v,i)=>v===upgraded[i]))throw Error(`Upgrade changed ${kind} framebuffer for hand ${level}`);
  }
  handRenderer.dispose();renderer.clear();renderer.resize();
 });
 for(const quality of ['high','low'])for(const level of [2,3,4]){
  await page.evaluate(({quality,level})=>{window.probe.renderer.configure({quality,fov:90,mist:false});window.trigger(level);},{quality,level});
  assert.equal(await page.evaluate(()=>window.probe.renderer.upgradePulse.diagnostics.length),1);
  assert.equal(await page.evaluate(()=>window.probe.renderer.originalWeapon.effectDiagnostics.particles),0,'no spark shower');
  for(const age of [0,.12,.3,.65,1.15,1.7]){
   await page.evaluate(age=>{window.frame(age-window.probe.age);window.probe.age=age;},age);
   if(quality==='high')await page.screenshot({path:`${dir}/level-${level}-${String(age).replace('.','_')}.png`});
  }
  assert.equal(await page.evaluate(()=>window.probe.renderer.upgradePulse.diagnostics.length),0,'ground pulse settles');
  await page.evaluate(()=>window.probe.age=0);
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{window.probe.renderer.resize();window.trigger(4);window.frame(.2);});
 await page.screenshot({path:`${dir}/portrait.png`});
 await page.evaluate(()=>{
  const {renderer,world}=window.probe;renderer.clear();world.addCrew('host');world.addCrew('guest');world.selectCrew('host');
  renderer.effect({kind:'upgrade',level:4,amount:4,pos:{x:10,y:1.7,z:0},shooterId:'guest'},world,0,0);window.frame();
  if(renderer.originalWeapon.effectDiagnostics.upgradeTime)throw Error('Remote upgrade lit local hand');
  if(renderer.upgradePulse.diagnostics[0].x!==10)throw Error('Remote ground pulse misplaced');
  window.frame(.2);world.player.pos.x=3;window.frame(.1);
  if(renderer.upgradePulse.diagnostics[0].x!==10)throw Error('Ground pulse followed local player');
  renderer.clear();window.frame();if(renderer.upgradePulse.diagnostics.length)throw Error('Restart retained pulse');
  window.trigger(3);renderer.render(world,0,0,0,true);if(renderer.upgradePulse.diagnostics.length)throw Error('Menu retained pulse');
 });
 assert.deepEqual(errors,[]);
 console.log('Ground upgrade passed: all tiers, both quality modes, portrait, lifecycle, remote placement, and pixel-identical hand 3/4 stream + burst firing during upgrades.');
}finally{await browser.close();}
