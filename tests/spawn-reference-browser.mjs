import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts/spawn-reference',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SPAWN_TEST_URL??'http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{World,STEP,idleInput},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');canvas.id='spawn-reference';canvas.style.cssText='position:fixed;inset:0;z-index:99999;width:100vw;height:100vh';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'medium',fov:90});
  await Promise.all([renderer.originalEnemies.loaded,renderer.originalWeapon.loaded]);renderer.topDown=true;
  window.spawnReference={World,STEP,idleInput,renderer};
 });
 const results=[];
 for(const [time,count,label] of [[3,1,'opening'],[839/60,1,'second-tower'],[39,2,'tower-spider'],[174,4,'snake-three-spiders'],[229,6,'six-towers'],[259,3,'three-gigapedes'],[442,1,'ghostpede'],[456,2,'first-loop']]){
  const result=await page.evaluate(({time,label})=>{
   const {World,STEP,idleInput,renderer}=window.spawnReference;
   const world=new World(29,{invulnerable:true});world.startAt(time-STEP);world.step(idleInput());renderer.clear();renderer.render(world,0,0,0,false);
   return {label,time:world.time,enemies:world.enemies.map(e=>({kind:e.kind,pos:e.pos})),calls:renderer.renderer.info.render.calls};
  },{time,label});
  assert.equal(result.enemies.length,count,label);
  assert.ok(result.enemies.every(e=>Object.values(e.pos).every(Number.isFinite)));
  results.push(result);
  if(['opening','tower-spider','three-gigapedes'].includes(label)){
   await page.evaluate(({time,label})=>{const {World,STEP,idleInput,renderer}=window.spawnReference;const world=new World(29,{invulnerable:true});world.startAt(time-STEP);const duration=label==='three-gigapedes'?3.6:.8;while(world.time<time+duration)world.step(idleInput());renderer.clear();renderer.render(world,0,0,0,false);},{time,label});
   await page.locator('#spawn-reference').screenshot({path:`artifacts/spawn-reference/${label}.png`});
  }
 }
 const entrance=await page.evaluate(()=>{
  const {World,STEP,idleInput,renderer}=window.spawnReference,world=new World(29,{invulnerable:true});world.startAt(3-STEP);
  const samples=[];
  for(const time of [4.483333333333333,364/60,382/60]){
   while(world.tick<Math.round(time/STEP))world.step(idleInput());renderer.clear();renderer.render(world,0,0,0,false);
   const tower=world.enemies.find(e=>e.kind==='squid');samples.push({time:world.time,radius:Math.hypot(tower.pos.x,tower.pos.z),children:world.enemies.filter(e=>e.kind==='skull'||e.kind==='skull2').length});
  }
  return samples;
 });
 assert.ok(Math.abs(entrance[0].radius-31.9956)<.01);
 assert.equal(entrance[1].children,1);assert.equal(entrance[2].children,11);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({groups:results,entrance},null,2));
}finally{await browser.close();}
