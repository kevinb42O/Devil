import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='artifacts/gigapede-sweeps';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/snake-check',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/snake-check');
 const report=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:75,mist:false});await renderer.prepare();
  const results=[];
  for(const sweeps of [false,true]){
   const w=new World(32,{schedule:false,invulnerable:true,legacyGigapedeSweeps:!sweeps}),e=w.spawnAt('gigapede',0,.4);
   let min=Infinity,max=0,low=0,total=0,maxRadius=0;const samples=[];
   for(let tick=0;tick<120*60;tick++){
    w.step(idleInput());w.effects=[];
    if(e.age>15){min=Math.min(min,e.pos.y);max=Math.max(max,e.pos.y);low+=Number(e.pos.y<7);total++;maxRadius=Math.max(maxRadius,Math.hypot(e.pos.x,e.pos.z));}
    if(tick%120===0)samples.push({age:e.age,pos:{...e.pos},stage:e.gigapedeMotion.sweep?.stage});
   }
   results.push({sweeps,min,max,lowFraction:low/total,maxRadius,samples});
  }
  const w=new World(32,{schedule:false,invulnerable:true}),e=w.spawnAt('gigapede',0,.4);
  const camera=v(32,21,40),target=v(0,8,0),yaw=Math.atan2(camera.x-target.x,camera.z-target.z),pitch=Math.atan2(target.y-camera.y,Math.hypot(target.x-camera.x,target.z-camera.z));
  window.snakeCheck={w,e,renderer,yaw,pitch,camera,idleInput};
  return results;
 });
 for(const [label,seconds] of [['climb',5],['pass',12],['recover',19]]){
  const state=await page.evaluate(seconds=>{
   const {w,e,renderer,yaw,pitch,camera,idleInput}=window.snakeCheck;
   while(e.age<seconds){w.step(idleInput());w.effects=[];}
   renderer.render(w,yaw,pitch,1/60,false,1,camera);
   return {age:e.age,stage:e.gigapedeMotion.sweep.stage,pos:e.pos};
  },seconds);
  await page.screenshot({path:`${dir}/${label}.png`});console.log(label,state);
 }
 assert.ok(report[0].lowFraction>.5);assert.equal(report[1].lowFraction,0);assert.deepEqual(errors,[]);
 await writeFile(`${dir}/report.json`,JSON.stringify({results:report,errors},null,2));console.log(report.map(({samples,...r})=>r));
}finally{await browser.close();}
