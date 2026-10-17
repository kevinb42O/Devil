import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='artifacts/tower-spacing';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/tower-spacing-check',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:black}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/tower-spacing-check');
 const report=await page.evaluate(async()=>{
  const [{GameRenderer},{World,STEP,idleInput,v},{towerFootprint,TOWER_SPACING}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/tower-movement.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,mist:false});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});
  for(let i=0;i<9;i++){const e=world.spawnAt(['squid','squid2','squid3'][i%3],i*Math.PI*2/9);e.nextSpawn=Infinity;}
  for(let i=0;i<180/STEP;i++){world.step(idleInput(),STEP);world.effects=[];}
  let smallestGap=Infinity;
  for(let i=0;i<world.enemies.length;i++)for(let j=i+1;j<world.enemies.length;j++){
   const a=world.enemies[i],b=world.enemies[j],gap=Math.hypot(a.pos.x-b.pos.x,a.pos.z-b.pos.z)-towerFootprint(a)-towerFootprint(b);
   smallestGap=Math.min(smallestGap,gap);
   if(gap<TOWER_SPACING-1e-5)throw Error(`Tower overlap: ${gap}`);
  }
  world.player.pos=v(0,26,34);renderer.render(world,0,-.55,0,false);
  return {seconds:world.time,towers:world.enemies.length,smallestGap,positions:world.enemies.map(e=>({kind:e.kind,pos:e.pos}))};
 });
 await page.screenshot({path:`${dir}/settled.png`});assert.deepEqual(errors,[]);
 await writeFile(`${dir}/audit.json`,JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
