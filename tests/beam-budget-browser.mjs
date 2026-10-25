import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(url+'/beam-budget',r=>r.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));await page.goto(url+'/beam-budget');
 const result=await page.evaluate(async()=>{
  const [{World,idleInput,STEP},{GameRenderer},{STREAM_COUNTS}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/weapon-levels.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:95,movementMotion:0,screenShake:0});await renderer.prepare();const gl=renderer.renderer.getContext();
  const saved=STREAM_COUNTS[6],report={};
  const summary=a=>{a.sort((x,y)=>x-y);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
  try{
   // Override only this isolated test page to compare the rejected budget with shipping counts.
   for(const [label,budget] of [['excessive',256],['restored',saved]]){
    STREAM_COUNTS[6]=budget;renderer.clear();const w=new World(71,{schedule:false});w.level=7;w.player.pos={x:0,y:3.5,z:0};
    const advance=()=>{if(w.tick%9===0)w.shoot(idleInput(),false,false);w.updateProjectiles(STEP);w.effects=[];w.time+=STEP;w.tick++;};
    for(let tick=0;tick<480;tick++)advance();
    for(let frame=0;frame<10;frame++){renderer.render(w,0,0,0,false,1);gl.finish();}
    const frameMs=[],simulationMs=[],renderMs=[];
    for(let frame=0;frame<40;frame++){
     const start=performance.now();advance();advance();const simulated=performance.now();renderer.render(w,0,0,0,false,1);gl.finish();const end=performance.now();
     simulationMs.push(simulated-start);renderMs.push(end-simulated);frameMs.push(end-start);
    }
    report[label]={budget,liveDaggers:w.projectiles.length,frameMs:summary(frameMs),simulationMs:summary(simulationMs),renderMs:summary(renderMs),drawCalls:renderer.renderer.info.render.calls};
   }
  }finally{STREAM_COUNTS[6]=saved;}
  return report;
 });
 assert.equal(result.restored.budget,48);assert.ok(result.restored.liveDaggers<result.excessive.liveDaggers*.3);assert.deepEqual(errors,[]);
 await mkdir('artifacts/beam-growth',{recursive:true});await writeFile('artifacts/beam-growth/performance.json',JSON.stringify({result,errors},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
