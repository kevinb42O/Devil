import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/descent-mist';await mkdir(directory,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 const report=await page.evaluate(async()=>{
  const [{GameRenderer},{World,v},THREE]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/three/build/three.module.js')]);
  const r=new GameRenderer(document.body.appendChild(document.createElement('canvas')),{quality:'high',fov:90});await r.prepare();
  const w=new World(9,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,9);
  for(let i=0;i<120;i++){const e=w.spawn(['skull','skull2','skull3'][i%3],v(Math.sin(i*2.399)*(8+i%20),2+i%5,Math.cos(i*2.399)*(8+i%20)-5));e.age=20;}
  w.effects=[];
  const gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const hardware=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  const summarize=values=>{const a=values.slice().sort((a,b)=>a-b);return a.length?{median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],samples:a.length}:null;};
  const results=[],isolated=[];
  for(const quality of ['high','low'])for(const [name,time,pitch] of [['clouds',45.5,0],['clouds-up',45.5,.8],['furnace',259,0],['cathedral',370,0],['depths',460,0]]){
   r.configure({quality,fov:90});w.time=time;r.render(w,0,pitch,0,false);
   const samples={on:[],off:[]},wall={on:[],off:[]};
   for(const mode of ['off','on','on','off']){
    r.openingMist.enabled=mode==='on';
    for(let i=0;i<22;i++){
     const q=timer&&gl.createQuery();if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
     const start=performance.now();r.composer.render();if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);gl.finish();const duration=performance.now()-start;
     let ready=false;if(q)for(let wait=0;wait<100;wait++){ready=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);if(ready)break;await new Promise(resolve=>setTimeout(resolve,1));}
     if(i>=6){wall[mode].push(duration);if(q&&ready&&!gl.getParameter(timer.GPU_DISJOINT_EXT))samples[mode].push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);}
     if(q)gl.deleteQuery(q);
    }
   }
   results.push({quality,name,gpuOn:summarize(samples.on),gpuOff:summarize(samples.off),wallOn:summarize(wall.on),wallOff:summarize(wall.off)});
   // Isolate the two fog draws from scene/bloom and noisy full-frame scheduling.
   const output=new THREE.WebGLRenderTarget(1280,720,{depthBuffer:false});
   const read=r.composer.readBuffer;r.renderer.setRenderTarget(read);r.renderer.render(r.scene,r.camera);
   const isolatedGpu=[];
   for(let i=0;i<30;i++){
    const q=timer&&gl.createQuery();if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
    r.openingMist.renderToScreen=false;r.openingMist.render(r.renderer,output,read,0,false);
    if(q){gl.endQuery(timer.TIME_ELAPSED_EXT);let ready=false;
     for(let wait=0;wait<100;wait++){ready=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);if(ready)break;await new Promise(resolve=>setTimeout(resolve,1));}
     if(i>=10&&ready&&!gl.getParameter(timer.GPU_DISJOINT_EXT))isolatedGpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);
    }
   }
   output.dispose();isolated.push({quality,name,gpuMs:summarize(isolatedGpu)});
  }
  return {hardware,timerQueries:!!timer,method:'Isolated fog draws plus full-frame comparison. One context, 120 enemies, 1280×720, ABBA blocks; 6 warm-up + 16 measured frames/block. GPU disjoint queries when available; wall time is a proxy only.',results,isolated};
 });
 assert.deepEqual(errors,[]);await writeFile(`${directory}/performance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
