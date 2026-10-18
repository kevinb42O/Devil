import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.addInitScript(()=>{window.testRaf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=()=>0;});await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const canvas=document.createElement('canvas');document.body.append(canvas);const renderer=new GameRenderer(canvas,{quality:'high',fov:85,mist:true});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});world.time=300;world.player.pos=v(0,2,8);world.effects=[];
  const gl=renderer.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),results=[];
  const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
 for(const quality of ['high','low']){
   renderer.configure({quality,fov:85,mist:true});renderer.render(world,0,-.28,0,false);
   for(const enabled of [false,true]){
    const cpu=[],queries=[];let calls=0;
    for(let i=0;i<36;i++){
     await new Promise(window.testRaf);
     renderer.furnace.update(renderer.camera,300+i/60,enabled);renderer.openingMist.setHeat(enabled?1:0,300+i/60,renderer.furnace.uniforms.furnaceRadius.value);renderer.renderer.info.reset();
     const query=ext?gl.createQuery():null;if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
     const start=performance.now();renderer.composer.render();if(query)gl.endQuery(ext.TIME_ELAPSED_EXT);gl.finish();
     if(i>=6){cpu.push(performance.now()-start);if(query)queries.push(query);}else if(query)gl.deleteQuery(query);
     calls=renderer.renderer.info.render.calls;
    }
    const gpu=[];
    for(let attempt=0;attempt<50&&queries.some(q=>!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE));attempt++)await new Promise(r=>setTimeout(r,20));
    if(ext&&!gl.getParameter(ext.GPU_DISJOINT_EXT))for(const q of queries)if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
    for(const q of queries)gl.deleteQuery(q);
    results.push({quality,enabled,calls,cpuMedianMs:median(cpu),gpuMedianMs:gpu.length?median(gpu):null,gpuSamples:gpu.length});
   }
  }
  return {viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],gpuTimerAvailable:!!ext,results};
 });
 mkdirSync('artifacts/furnace',{recursive:true});writeFileSync('artifacts/furnace/performance.json',JSON.stringify(result,null,2));console.log(result);
 for(const quality of ['high','low']){
  const base=result.results.find(r=>r.quality===quality&&!r.enabled),full=result.results.find(r=>r.quality===quality&&r.enabled);assert.equal(full.calls-base.calls,5);
  if(full.gpuMedianMs!==null)assert.ok(full.gpuMedianMs-base.gpuMedianMs<8,'furnace fits within an eight millisecond additional GPU budget in this local fixture');
 }
}finally{await browser.close();}
