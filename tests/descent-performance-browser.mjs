import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const directory='artifacts/descent';await mkdir(directory,{recursive:true});
// Keep the original shader as a reproducible reference; alternate in ONE context.
const reference=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!existsSync(`${directory}/baseline-sky.ts`))await writeFile(`${directory}/baseline-sky.ts`,execFileSync('git',['show',`${reference}:src/sky.ts`]));
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export const createHotContext=()=>({accept(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const injectQuery=url=>url;export const removeStyle=id=>document.getElementById(id)?.remove();export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s)}s.textContent=content}'}));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
  const report=await page.evaluate(async()=>{
    const [{World,v},{GameRenderer},{AbyssSky:Baseline}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/artifacts/descent/baseline-sky.ts')]);
    const r=new GameRenderer(document.createElement('canvas'),{quality:'high',fov:90});await r.prepare();
    const after=r.sky,before=new Baseline();r.scene.add(before.mesh);
    const gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const hardware={renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerQueries:!!timer,viewport:[1280,720],devicePixelRatio:devicePixelRatio};
    const world=new World(19,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,7);
    for(let i=0;i<200;i++){const e=world.spawn(['skull','skull2','skull3','skull4'][i%4],v(Math.sin(i*2.399)*(6+i%15),2+i%8,Math.cos(i*2.399)*(6+i%15)-10));e.age=20;}
    for(const [i,kind] of ['squid','spider2','gigapede','ghostpede'].entries()){
      const e=world.spawn(kind,v((i-1)*8,4,-18));e.age=20;e.headExposure=.7;
      e.segments.forEach((s,j)=>s.pos=v((i-1)*8+Math.sin(j*.3)*6,3,-18-j));
    }
    world.effects=[];
    const summary=values=>{if(!values.length)return null;const a=values.slice().sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],samples:a.length};};
    const results=[];
    for(const quality of ['high','low']){
      r.sky=after;r.configure({quality,fov:90,skyMotion:'full'});
      for(const [time,pitch,name] of [[0,0,'daylight/combat'],[0,1.15,'daylight/mostly-sky'],[259,0,'furnace/combat'],[350,.8,'cathedral/sky'],[442,0,'depths/combat']]){
        world.time=time;
        const samples={before:{gpu:[],cpu:[],fenced:[]},after:{gpu:[],cpu:[],fenced:[]}},calls={};
        // ABBA blocks measure sustained rendering without switching the sky
        // program every frame, and balance warm caches and background drift.
        for(const mode of ['before','after','after','before']){
          r.sky=mode==='after'?after:before;after.mesh.visible=mode==='after';before.mesh.visible=mode==='before';
          for(let i=0;i<60;i++){
          const q=timer&&gl.createQuery();if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
          const start=performance.now();r.render(world,0,pitch,0,false);const cpu=performance.now()-start;
          if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);gl.finish();const fenced=performance.now()-start;
          let ready=false;
          if(q)for(let wait=0;wait<200;wait++){ready=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);if(ready)break;await new Promise(resolve=>setTimeout(resolve,1));}
          else await new Promise(resolve=>setTimeout(resolve,4));
          if(i>=20){samples[mode].cpu.push(cpu);samples[mode].fenced.push(fenced);if(q&&ready&&!gl.getParameter(timer.GPU_DISJOINT_EXT))samples[mode].gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);}
          if(q)gl.deleteQuery(q);calls[mode]=r.renderer.info.render.calls;
          }
        }
        results.push({name,quality,time,pitch,drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],calls,before:{gpuMs:summary(samples.before.gpu),cpuMs:summary(samples.before.cpu),fencedMs:summary(samples.before.fenced)},after:{gpuMs:summary(samples.after.gpu),cpuMs:summary(samples.after.cpu),fencedMs:summary(samples.after.fenced)}});
      }
    }
    // Isolate sky cost from noisy enemy/bloom timings. Full-frame p95 is still
    // reported above, but cannot be substituted for the shader's GPU cost.
    const skyOnly=[],scene=new r.scene.constructor();scene.add(before.mesh,after.mesh);
    for(const quality of ['high','low']){
      after.configure(quality,'full');
      for(const time of [0,39,114,259,350,442]){
        const samples={before:[],after:[]};r.camera.rotation.set(.8,0,0,'YXZ');r.camera.updateWorldMatrix(true,false);
        for(let i=0;i<85;i++)for(const mode of i%2?['after','before']:['before','after']){
          before.mesh.visible=mode==='before';after.mesh.visible=mode==='after';(mode==='before'?before:after).update(r.camera,time,false);
          const q=timer&&gl.createQuery();if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
          r.renderer.render(scene,r.camera);if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);
          let ready=false;if(q)for(let wait=0;wait<200;wait++){ready=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);if(ready)break;await new Promise(resolve=>setTimeout(resolve,1));}
          if(i>=25&&q&&ready&&!gl.getParameter(timer.GPU_DISJOINT_EXT))samples[mode].push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
          if(q)gl.deleteQuery(q);
        }
        skyOnly.push({quality,time,drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],beforeGpuMs:summary(samples.before),afterGpuMs:summary(samples.after)});
      }
    }
    r.sky=after;after.mesh.visible=true;r.scene.add(after.mesh);scene.remove(before.mesh);before.mesh.geometry.dispose();before.mesh.material.dispose();
    return {hardware,method:'One WebGL context; identical world and camera. Full-frame ABBA blocks: 20 warm-up + 40 measured frames per block (80 measured frames per mode/case). Isolated sky alternates modes: 25 warm-up + 60 measured frames per mode/case, pitch 0.8 radians. GPU disjoint queries when available; fenced wall time otherwise is a proxy, not GPU time.',results,skyOnly};
  });
  assert.deepEqual(errors,[]);
  for(const row of report.results)assert.equal(row.calls.before,row.calls.after,`${row.name}: sky must not add draws`);
  await writeFile(`${directory}/performance.json`,JSON.stringify({reference,...report},null,2));
  console.log(JSON.stringify(report,null,2));
  for(const row of report.skyOnly)if(row.beforeGpuMs&&row.afterGpuMs)assert.ok(row.afterGpuMs.median-row.beforeGpuMs.median<=.3,`${row.quality}/${row.time}: added sky GPU cost exceeds 0.3 ms`);
}finally{await browser.close();}
