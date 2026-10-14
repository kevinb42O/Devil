import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const [{World,v},{GameRenderer},{floorHeight}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/arena.ts')]);
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'low',fov:95});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true});world.player.pos=v(0,5,13);
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const render=()=>renderer.render(world,0,-.28,1/60,false);
  render();const baselineCalls=renderer.renderer.info.render.calls;
  for(let i=0;i<70;i++){
   const x=(i%10-4.5)*1.5,z=(Math.floor(i/10)-3)*1.5;
   const enemy=world.spawn('skull',v(x,3+(i%4),z));world.damageEnemy(enemy,enemy.hp);
   for(const effect of world.effects)renderer.effect(effect,world,0,0);world.effects=[];world.enemies=[];
  }
  world.gems=[];renderer.originalWeapon.clear();
  check(renderer.blood.diagnostics.active===renderer.blood.diagnostics.capacity,'bounded spray pool');
  world.time=.15;render();const airborneCalls=renderer.renderer.info.render.calls;
  const timings=[],activeTimings=[];
  for(let i=10;i<240;i++){world.time=i/60;const active=renderer.blood.diagnostics.active;const start=performance.now();renderer.blood.advance(world.time);const ms=performance.now()-start;timings.push(ms);if(active)activeTimings.push(ms);}
  render();const settledCalls=renderer.renderer.info.render.calls,d=renderer.blood.diagnostics;
  check(d.landings>300,'sprays land');check(d.active===0,'all droplets settle');check(settledCalls===baselineCalls,'settled blood adds zero draw calls');check(airborneCalls===baselineCalls+12,'airborne blood uses eleven native gore batches and one spray batch');
  const version=renderer.blood.texture.version;render();check(renderer.blood.texture.version===version,'no texture upload on unchanged frame');
  renderer.effect({kind:'kill',bloodId:140,bloodTime:0,pos:v(0,5,0)},world,0,0);check(renderer.blood.diagnostics.active===0,'duplicate network event ignored');
  const before=renderer.blood.field.pixels.slice();world.time=150;render();check(before.every((n,i)=>n===renderer.blood.field.pixels[i]),'shrinking floor retains painted texture');
  world.time=4;renderer.blood.effect({kind:'hit',bloodId:141,bloodTime:4,pos:v(0,floorHeight(0,0,4)+.06,0)},world);world.time=5;render();
  const partialUploadBytes=renderer.blood.diagnostics.uploadBytes;check(partialUploadBytes>0&&partialUploadBytes<d.textureBytes,'small landing uploads only changed rows');
  window.bloodFixture={renderer,world,render,v,floorHeight};
  timings.sort((a,b)=>a-b);activeTimings.sort((a,b)=>a-b);
  return {baselineCalls,airborneCalls,settledCalls,partialUploadBytes,kills:world.stats.kills,...d,activeAdvanceP95Ms:activeTimings[Math.floor(activeTimings.length*.95)],advanceMedianMs:timings[Math.floor(timings.length*.5)],advanceP95Ms:timings[Math.floor(timings.length*.95)],unchangedFrameUploads:0,duplicateSuppressed:true};
 });
 await page.screenshot({path:'artifacts/blood-floor-low.png'});
 await page.evaluate(()=>{bloodFixture.renderer.configure({quality:'high',fov:95});bloodFixture.render();});
 await page.screenshot({path:'artifacts/blood-floor-high.png'});
 const burst=await page.evaluate(()=>{
  const {renderer,world,render,v}=bloodFixture;renderer.clear();world.time=0;world.player.pos=v(0,5,8);
  const enemy=world.spawn('skull',v(0,3,0));world.damageEnemy(enemy,enemy.hp);
  for(const effect of world.effects)renderer.effect(effect,world,0,0);world.effects=[];world.enemies=[];world.gems=[];renderer.originalWeapon.clear();
  world.time=.1;render();return renderer.blood.diagnostics;
 });
 assert.equal(burst.assetsReady,true,'native gore assets loaded');assert.equal(burst.goreVariants,11);
 assert.ok(burst.sprayActive>=24,'single enemy kill produces a visible textured burst');
 await page.screenshot({path:'artifacts/blood-enemy-kill.png'});
 const faded=await page.evaluate(()=>{bloodFixture.world.time=.55;bloodFixture.render();return bloodFixture.renderer.blood.diagnostics;});
 assert.equal(faded.sprayActive,0,'textured burst expires promptly');assert.ok(faded.active>0,'gore continues falling after initial spray');
 const reset=await page.evaluate(()=>{bloodFixture.renderer.clear();bloodFixture.render();return {active:bloodFixture.renderer.blood.diagnostics.active,landings:bloodFixture.renderer.blood.diagnostics.landings,empty:bloodFixture.renderer.blood.field.pixels.every(n=>n===0)};});
 assert.deepEqual(reset,{active:0,landings:0,empty:true});assert.deepEqual(errors,[]);
 await writeFile('artifacts/blood-audit.json',JSON.stringify({...result,burst,faded,reset,errors},null,2)+'\n');console.log('Blood browser checks passed:',JSON.stringify(result));
}finally{await browser.close();}
