import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

// Compare the actual pre-change shaders in one context, at fixed scene depth.
const reference='83f316e83d5eb4a29179c496894ad72fc5ef6335';
const folder=await mkdtemp('artifacts/cosmic-baseline-');
for(const file of ['sky.ts','descent.ts','opening-mist.ts','mist-state.ts','mist-light-field.ts'])
  await writeFile(`${folder}/${file}`,execFileSync('git',['show',`${reference}:src/${file}`]));
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
  const report=await page.evaluate(async folder=>{
    const [{GameRenderer},{World},{AbyssSky},{OpeningMist},THREE]=await Promise.all([
      import('/src/renderer.ts'),import('/src/simulation.ts'),import(`/${folder}/sky.ts`),import(`/${folder}/opening-mist.ts`),import('/node_modules/three/build/three.module.js')]);
    const r=new GameRenderer(document.createElement('canvas'),{quality:'high',fov:90});await r.prepare();
    const world=new World(17,{schedule:false});r.render(world,0,.5,0,false);
    const oldSky=new AbyssSky(),oldMist=new OpeningMist(),scene=new THREE.Scene();
    const gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const stats=a=>{if(!a.length)return null;a.sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],samples:a.length};};
    const cases=[];
    for(const quality of ['high','low'])for(const time of [0,25,30]){
      r.configure({quality,fov:90});oldSky.configure(quality);oldMist.configure(quality,false);
      oldMist.setSize(gl.drawingBufferWidth,gl.drawingBufferHeight);
      const samples={before:[],after:[]},wall={before:[],after:[]};
      for(let i=0;i<50;i++)for(const mode of i%2?['after','before']:['before','after']){
        const sky=mode==='before'?oldSky:r.sky,mist=mode==='before'?oldMist:r.openingMist;
        scene.clear();scene.add(sky.mesh);sky.update(r.camera,mode==='before'?0:time,false);mist.update(r.camera,mode==='before'?0:time);
        const q=timer&&gl.createQuery();if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
        const start=performance.now();
        r.renderer.setRenderTarget(r.composer.readBuffer);r.renderer.render(scene,r.camera);
        mist.render(r.renderer,r.composer.writeBuffer,r.composer.readBuffer,0,false);
        r.renderer.setRenderTarget(null);if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);gl.finish();
        const elapsed=performance.now()-start;
        if(q){
          for(let wait=0;wait<200&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);wait++)await new Promise(resolve=>setTimeout(resolve,1));
          if(i>=15&&gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(timer.GPU_DISJOINT_EXT))samples[mode].push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
          gl.deleteQuery(q);
        }
        if(i>=15)wall[mode].push(elapsed);
      }
      cases.push({quality,time,beforeGpuMs:stats(samples.before),afterGpuMs:stats(samples.after),beforeFencedMs:stats(wall.before),afterFencedMs:stats(wall.after)});
    }
    return {renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],timerQueries:!!timer,cases};
  },folder);
  assert.deepEqual(errors,[]);
  await mkdir('artifacts/cosmic-descent',{recursive:true});
  await writeFile('artifacts/cosmic-descent/performance.json',JSON.stringify({reference,method:'Isolated sky + two fog draws, same context and fixed scene depth. Alternate old opening and new opening at 0/25/30s. 15 warm-up + 35 samples each. Fenced wall times are only a proxy; no lower-power-device claim.',...report},null,2));
  for(const row of report.cases)if(row.beforeGpuMs&&row.afterGpuMs)assert.ok(row.afterGpuMs.median-row.beforeGpuMs.median<=.5,`${row.quality}/${row.time}: added GPU cost exceeds 0.5ms`);
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await rm(folder,{recursive:true,force:true});}
