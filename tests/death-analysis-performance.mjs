import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 const report=await page.evaluate(async()=>{
  const [{World,v,idleInput},{DeathHistory},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/death-analysis.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');document.body.append(canvas);const renderer=new GameRenderer(canvas,{quality:'low',fov:90});await renderer.prepare();const gl=renderer.renderer.getContext();
  const results=[];
  for(const count of [300,1000]){
   const off=[],on=[];
   for(let pass=0;pass<4;pass++)for(const recording of pass%2?[true,false]:[false,true]){
    renderer.clear();const w=new World(39,{schedule:false,invulnerable:true});for(let n=0;n<count;n++){const e=w.spawn('skull',v(Math.sin(n)*20,2,Math.cos(n)*20));e.age=2;}for(let n=0;n<3;n++)w.spawn('gigapede',v(n*8,3,-20));
    const h=new DeathHistory();for(let frame=0;frame<50;frame++){
     const start=performance.now();for(let tick=0;tick<2;tick++){w.step(idleInput());w.effects=[];if(recording)h.capture(w,0,0);}renderer.render(w,0,0,1/60,false);gl.finish();if(frame>=10)(recording?on:off).push(performance.now()-start);
    }
   }
   off.sort((a,b)=>a-b);on.sort((a,b)=>a-b);const median=a=>a[Math.floor(a.length*.5)],p95=a=>a[Math.floor(a.length*.95)];results.push({count,baselineMedianMs:median(off),recordingMedianMs:median(on),medianChangePercent:(median(on)/median(off)-1)*100,baselineP95Ms:p95(off),recordingP95Ms:p95(on)});
  }return {viewport:'1280×720',quality:'low',method:'headless Chrome, warmed assets, two simulation ticks plus one render with GPU finish per frame; alternating capture off/on',scenes:results};
 });
 await writeFile('artifacts/death-analysis-frame-performance.json',JSON.stringify(report,null,2));for(const scene of report.scenes)assert.ok(Number.isFinite(scene.recordingMedianMs));console.log(JSON.stringify(report));
}finally{await browser.close();}
