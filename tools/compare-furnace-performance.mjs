import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {writeFile,unlink,mkdir} from 'node:fs/promises';
const reference=process.argv[2]||'113ecb8';
const files=['src/renderer-perf-reference.ts','src/furnace-perf-reference.ts','src/furnace-fire-perf-reference.ts'];
let browser;
try{
 const read=path=>execFileSync('git',['show',`${reference}:${path}`],{encoding:'utf8'});
 await writeFile(files[0],read('src/renderer.ts').replace("from './furnace'","from './furnace-perf-reference'"));
 await writeFile(files[1],read('src/furnace.ts').replace("from './furnace-fire'","from './furnace-fire-perf-reference'"));
 await writeFile(files[2],read('src/furnace-fire.ts'));
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/furnace-paired-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas id="old"></canvas><canvas id="new"></canvas></body>'}));
 await page.goto('http://127.0.0.1:5173/furnace-paired-test');
 const report=await page.evaluate(async()=>{
  const [{GameRenderer:Before},{GameRenderer:After},{World,v}]=await Promise.all([import('/src/renderer-perf-reference.ts'),import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const renderers={before:new Before(document.querySelector('#old'),{quality:'high',fov:85,mist:true}),after:new After(document.querySelector('#new'),{quality:'high',fov:85,mist:true})};
  for(const r of Object.values(renderers))await r.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});world.time=300;world.player.pos=v(0,1.7,8);const results=[];
  const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
  for(const mode of ['normal','blood','no-mist'])for(const label of ['before','after','after','before']){
   const r=renderers[label],field=r.blood.field;field.clear();
   if(mode==='blood'){for(let i=0;i<field.pixels.length;i+=4){field.pixels[i]=255;field.pixels[i+1]=176;field.pixels[i+2]=4;field.pixels[i+3]=180;}field.revision++;}
   r.render(world,0,-.28,0,false);r.openingMist.enabled=mode!=='no-mist';
   const gl=r.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),queries=[],times=[];
   for(let i=0;i<14;i++){
    await new Promise(requestAnimationFrame);const q=ext?gl.createQuery():null;if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
    const start=performance.now();r.composer.render();if(q)gl.endQuery(ext.TIME_ELAPSED_EXT);gl.finish();
    if(i>=4){times.push(performance.now()-start);if(q)queries.push(q);}else if(q)gl.deleteQuery(q);
   }
   for(let i=0;i<40&&queries.some(q=>!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE));i++)await new Promise(requestAnimationFrame);
   const gpu=[];if(ext&&!gl.getParameter(ext.GPU_DISJOINT_EXT))for(const q of queries)if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
   queries.forEach(q=>gl.deleteQuery(q));results.push({mode,label,cpuMs:median(times),gpuMs:gpu.length?median(gpu):null});
  }
  const r=renderers.after;r.blood.clear();r.render(world,0,-.45,0,false);document.querySelector('#old').style.display='none';window.optimized=r;
  return {viewport:[1280,720],results};
 });
 await mkdir('artifacts/furnace-lag',{recursive:true});await page.screenshot({path:'artifacts/furnace-lag/optimized.png'});
 await writeFile('artifacts/furnace-lag/paired.json',JSON.stringify({reference,...report,errors},null,2)+'\n');console.log(JSON.stringify({...report,errors}));
}finally{await browser?.close();for(const file of files)await unlink(file).catch(()=>{});}
