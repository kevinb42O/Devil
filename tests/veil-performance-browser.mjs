import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.addInitScript(()=>{window.testFrame=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=()=>0;});
 await page.route('**/veil-performance',route=>route.fulfill({contentType:'text/html',body:'<html><head><link rel="icon" href="data:,"></head><body style="margin:0;background:#000"></body></html>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/veil-performance');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const r=new GameRenderer(document.body.appendChild(document.createElement('canvas')),{quality:'high',fov:85,mist:true});await r.prepare();
  const w=new World(17,{schedule:false,invulnerable:true});w.time=180;w.player.pos=v(0,1.7,9);w.effects=[];
  const gl=r.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),rows=[];
  const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  for(const quality of ['high','low']){
   r.configure({quality,fov:85,mist:true});r.render(w,0,-.38,0,false);
   for(const enabled of [false,true]){
    r.veilEnvironment.update(r.camera,180,enabled);const cpu=[],queries=[];let calls=0;
    for(let i=0;i<22;i++){
     await new Promise(window.testFrame);r.renderer.info.reset();
     const query=ext?gl.createQuery():null;if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
     const start=performance.now();r.composer.render();if(query)gl.endQuery(ext.TIME_ELAPSED_EXT);gl.finish();
     if(i>=6){cpu.push(performance.now()-start);if(query)queries.push(query);}else if(query)gl.deleteQuery(query);
     calls=r.renderer.info.render.calls;
    }
    for(let attempt=0;attempt<30&&queries.some(q=>!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE));attempt++)await new Promise(resolve=>setTimeout(resolve,20));
    const gpu=[];if(ext&&!gl.getParameter(ext.GPU_DISJOINT_EXT))for(const query of queries)if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
    for(const query of queries)gl.deleteQuery(query);
    rows.push({quality,enabled,calls,cpuMedianMs:median(cpu),gpuMedianMs:gpu.length?median(gpu):null});
   }
  }
  return {viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],gpuTimerAvailable:!!ext,rows};
 });
 await mkdir('artifacts/veil-environment',{recursive:true});await writeFile('artifacts/veil-environment/performance.json',JSON.stringify(result,null,2));console.log(result);
 for(const quality of ['high','low']){
  const baseline=result.rows.find(r=>r.quality===quality&&!r.enabled),veil=result.rows.find(r=>r.quality===quality&&r.enabled);
  assert.equal(veil.calls-baseline.calls,3);
  if(veil.gpuMedianMs!==null)assert.ok(veil.gpuMedianMs-baseline.gpuMedianMs<8,'veil additional GPU time remains below 8 ms in the local 720p fixture');
 }
}finally{await browser.close();}
