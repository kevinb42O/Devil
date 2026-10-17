import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='artifacts/combat-presentation';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/combat-presentation-check',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:black}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/combat-presentation-check');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,idleInput}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,mist:false});await renderer.prepare();
  const world=new World(1,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,0);world.level=4;
  for(const [kind,pos] of [['squid2',[0,5,-18]],['spider',[-12,4.455,-20]],['skull3',[4,2,-9]],['gigapede',[10,4,-16]]]){
   const e=world.spawn(kind,v(...pos));e.pos=v(...pos);e.age=15;e.headExposure=1;e.facingYaw=0;e.vel=v(0,0,1);
   e.segments.forEach((s,i)=>s.pos=v(10+Math.sin(i*.18)*5,4+i*.05,-16-(i+1)*1.95));
  }
  const frame=(dt=0)=>renderer.render(world,0,0,dt,false);
  const pixels=()=>{const gl=renderer.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  window.combat={renderer,world,frame,pixels,idleInput};frame();
 });
 const visibility=[];
 for(const quality of ['low','high'])for(const time of [0,90,300]){
  const result=await page.evaluate(({quality,time})=>{
   const {renderer,world,frame,pixels}=window.combat;world.time=time;renderer.configure({quality,fov:90,mist:false});
   renderer.originalEnemies.surfaceLightStrength.value=0;frame();const before=pixels();
   renderer.originalEnemies.surfaceLightStrength.value=1;frame();const after=pixels();
   let visiblePixels=0,redGain=0;for(let i=0;i<before.length;i+=4){const d=after[i]-before[i];if(d>10){visiblePixels++;redGain+=d;}}
   return {quality,time,visiblePixels,meanRedGain:redGain/Math.max(1,visiblePixels),drawCalls:renderer.renderer.info.render.calls};
  },{quality,time});
  assert.ok(result.visiblePixels>1000,`enemy surfaces brighten in ${quality} at ${time}s: ${JSON.stringify(result)}`);visibility.push(result);
  if(time===0){
   await page.screenshot({path:`${dir}/visibility-${quality}-after.png`});
   await page.evaluate(()=>{window.combat.renderer.originalEnemies.surfaceLightStrength.value=0;window.combat.frame();});
   await page.screenshot({path:`${dir}/visibility-${quality}-before.png`});
   await page.evaluate(()=>{window.combat.renderer.originalEnemies.surfaceLightStrength.value=1;window.combat.frame();});
  }
 }
 const weapon=await page.evaluate(()=>{
  const {renderer,world,frame,idleInput}=window.combat,weapon=renderer.originalWeapon;renderer.clear();world.enemies=[];world.level=4;frame();
  const camera=renderer.camera.quaternion.toArray();world.projectiles=[];world.shoot(idleInput(),true,false);
  const shots=JSON.stringify(world.projectiles),cameraBefore=JSON.stringify(camera);
  for(const effect of world.effects)renderer.effect(effect,world,0,0);world.effects=[];frame();
  const peak=weapon.effectDiagnostics.recoil;frame(.2);const recovered=weapon.effectDiagnostics.recoil;
  if(JSON.stringify(world.projectiles)!==shots)throw Error('Presentation changed projectile trajectories');
  if(JSON.stringify(renderer.camera.quaternion.toArray())!==cameraBefore)throw Error('Hand recoil deflected aim');
  if(!(peak>=.04&&recovered<peak*.1))throw Error('Burst response fails to settle');
  weapon.effect({kind:'shot',level:4,pos:world.player.pos},world,0,0);weapon.update(world,0,false,renderer.camera);
  const stream=weapon.effectDiagnostics.recoil;if(!(stream>0&&stream<peak*.3))throw Error('Stream kick overwhelms burst distinction');
  frame(.4);if(weapon.effectDiagnostics.flashTime)throw Error('Flash lingered after shooting');
  return {peak,recovered,stream,aimUnchanged:true,trajectoriesUnchanged:true};
 });
 assert.deepEqual(errors,[]);await writeFile(`${dir}/audit.json`,JSON.stringify({visibility,weapon},null,2));
 console.log('Combat presentation passed:',JSON.stringify({visibility,weapon}));
 // Exercise the actual solo frame loop, including pause/retry lifecycle.
 await page.goto('http://127.0.0.1:5173/?hand-preview=1');
 await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss.originalEnemies);
 await page.click('#start');await page.waitForFunction(()=>window.abyss?.mode==='playing'&&!window.abyss.entrance);
 await page.evaluate(()=>{const {world}=window.__abyssTrainerAccess.get();world.options.invulnerable=true;world.stats.collected=9;world.collect();});
 await page.waitForFunction(()=>window.abyss.soloUpgradeRate<.6);
 const slow=await page.evaluate(()=>({rate:window.abyss.soloUpgradeRate,time:window.abyss.time,wall:performance.now()}));
 await page.waitForTimeout(180);
 const later=await page.evaluate(()=>({rate:window.abyss.soloUpgradeRate,time:window.abyss.time,wall:performance.now()}));
 assert.ok((later.time-slow.time)/((later.wall-slow.wall)/1000)<.85,'actual solo simulation slows');
 await page.waitForFunction(()=>window.abyss.soloUpgradeRate===1);
 await page.evaluate(()=>{const {world}=window.__abyssTrainerAccess.get();world.stats.collected=69;world.collect();});
 await page.waitForFunction(()=>window.abyss.soloUpgradeRate<.6);await page.keyboard.press('Escape');
 await page.waitForFunction(()=>window.abyss.mode==='paused');assert.equal(await page.evaluate(()=>window.abyss.soloUpgradeRate),1);
 assert.deepEqual(errors,[]);console.log('Solo frame loop passed: real upgrade, reduced world advancement, normal recovery, second tier, pause reset.');
}finally{await browser.close();}
