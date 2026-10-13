import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{World,v,idleInput,STEP},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');canvas.id='spit-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999;width:100vw;height:100vh';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'high',fov:90});await Promise.all([renderer.originalEnemies.loaded,renderer.originalWeapon.loaded]);
  const world=new World(7,{schedule:false,invulnerable:true});world.player.pos=v(0,6,6);
  const towers=['squid','squid2','squid3'].map((kind,i)=>world.spawn(kind,v((i-1)*7,kind==='squid'?3.3:kind==='squid2'?5.2:7,-15)));
  window.spit={world,renderer,towers,idleInput,STEP};
 });
 for(const [time,name] of [[2.5,'closed'],[2.85,'opening'],[3.5,'ejection'],[4.5,'hunting'],[6.5,'settled']]){
  const result=await page.evaluate(time=>{const {world,renderer,towers,idleInput,STEP}=window.spit;while(world.time+STEP/2<time)world.step(idleInput(),STEP);renderer.render(world,0,0,0,false);return {count:world.enemies.length,drawCalls:renderer.renderer.info.render.calls,heights:world.enemies.filter(e=>e.towerFlight).map(e=>e.pos.y),crests:towers.map(e=>{let pos;renderer.enemies.get(e.id).traverse(o=>{if(o.name.endsWith('crest'))pos=o.position.y;});return pos;})};},time);
  if(name==='closed')assert.ok(result.crests.every(y=>y===0));
  if(name==='opening'||name==='ejection')assert.ok(result.crests.every(y=>y>0));
  if(name==='hunting'||name==='settled')assert.ok(result.crests.every(y=>y===0));
  if(time>=3)assert.equal(result.count,41);
  if(name==='settled'){assert.ok(Math.max(...result.heights)-Math.min(...result.heights)>.7);assert.ok(Math.max(...result.heights)<6);}
  await page.locator('#spit-test').screenshot({path:`artifacts/tower-spit-${name}.png`});console.log(name,{count:result.count,drawCalls:result.drawCalls,heightRange:result.heights.length?[Math.min(...result.heights),Math.max(...result.heights)]:[],crests:result.crests});
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
