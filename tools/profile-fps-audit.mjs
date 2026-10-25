import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.argv[2]??'before',url=process.env.GAME_URL??'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/fps-audit',r=>r.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));await page.goto(url+'/fps-audit');
 const result=await page.evaluate(async(label)=>{
  const [{World,STEP,idleInput,v},{GameRenderer},{DeathHistory}]=await Promise.all([import(label==='before'?'/artifacts/fps-deep-audit/simulation-before.ts':'/src/simulation.ts'),import('/src/renderer.ts'),import('/src/death-analysis.ts')]);
  const summary=a=>{a.sort((x,y)=>x-y);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,mist:true});await r.prepare();const gl=r.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');

  const make=(count,towers=0)=>{const w=new World(71,{schedule:false,invulnerable:true});w.time=120;w.level=7;w.reserve=10000;w.player.pos=v(0,2,25);
   for(let i=0;i<count;i++){const e=w.spawn(['skull','skull2','skull3'][i%3],v(Math.sin(i*2.399)*22,3+i%5,Math.cos(i*2.399)*22-8));e.age=20;}
   for(let i=0;i<towers;i++){const e=w.spawn(['squid','squid2','squid3'][i%3],v((i%3-1)*14,5,-8-Math.floor(i/3)*15));e.age=20;}w.effects=[];return w;};
  const checksum=w=>{let hash=2166136261;const data=JSON.stringify({enemies:w.enemies,projectiles:w.projectiles,stats:w.stats,gems:w.gems});for(let i=0;i<data.length;i++)hash=Math.imul(hash^data.charCodeAt(i),16777619);return (hash>>>0).toString(16);};
  const cpu={};
  for(const [name,count,towers,homing] of [['empty',0,0,false],['swarm',600,0,false],['towers',150,6,false],['homing-swarm',600,0,true],['homing-towers',150,6,true],['tower-stream-600',600,6,false],['tower-stream-1500',1500,6,false]]){
   const w=make(count,towers);if(name.startsWith('tower-stream'))for(const e of w.enemies)if(e.kind.startsWith('skull'))e.towerFlight={gravity:18,height:2,descentSpeed:6,agility:2.5,curl:.5};const history=new DeathHistory(),samples={},parts={};
   for(const key of ['updateEnemies','updateProjectiles','updateGems','accessibleHomingPoint']){const original=w[key];w[key]=function(...args){const start=performance.now();const result=original.apply(this,args);parts[key]=(parts[key]??0)+performance.now()-start;return result;};}
   if(homing)for(let i=0;i<48;i++)w.projectiles.push({id:20000+i,pos:v(Math.sin(i)*3,3,20+Math.cos(i)*3),vel:v(0,0,-35),age:0,homing:true,level:3});
   else for(let i=0;i<300;i++)w.projectiles.push({id:20000+i,pos:v(Math.sin(i)*22,3+i%5,-10-Math.cos(i)*15),vel:v(0,0,-35),age:0,homing:false,level:7});
   for(let tick=0;tick<60;tick++){for(const p of w.projectiles)p.age=0;const start=performance.now();w.step(idleInput());const step=performance.now()-start;const h=performance.now();history.capture(w,0,0);const capture=performance.now()-h;w.effects=[];
    if(tick>=10){for(const [k,value]of Object.entries({step,capture,...parts}))(samples[k]??=[]).push(value);}for(const k in parts)parts[k]=0;
   }
   cpu[name]={timingsMs:Object.fromEntries(Object.entries(samples).map(([k,a])=>[k,summary(a)])),enemies:w.enemies.length,projectiles:w.projectiles.length,stateChecksum:checksum(w)};
  }
  const render={};let parts={};
  for(const [name,obj,key]of [['enemyLighting',r.enemyLighting,'update'],['weapon',r.originalWeapon,'update'],['projectileLighting',r.projectileLighting,'update'],['scene',r.composer,'render'],['tiles',r,'updateTiles']]){const original=obj[key];obj[key]=function(...args){const start=performance.now();const result=original.apply(this,args);parts[name]=(parts[name]??0)+performance.now()-start;return result;};}
  for(const [name,count,towers]of [['empty',0,0],['swarm',600,0],['towers',150,6]]){
   r.clear();const w=make(count,towers);
   for(const variant of ['fixed']){
    const samples={},gpu=[];
    for(let i=0;i<40;i++){parts={};const q=ext&&gl.createQuery();if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);const start=performance.now();r.render(w,0,0,1/60,false);const submit=performance.now()-start;if(q)gl.endQuery(ext.TIME_ELAPSED_EXT);gl.finish();const wall=performance.now()-start;
     if(q){for(let wait=0;wait<200&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);wait++)await new Promise(resolve=>setTimeout(resolve,1));if(i>=12&&!gl.getParameter(ext.GPU_DISJOINT_EXT)&&gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
     if(i>=12)for(const [k,value]of Object.entries({submit,wall,...parts}))(samples[k]??=[]).push(value);
    }
    render[name+'/'+variant]={timingsMs:Object.fromEntries(Object.entries(samples).map(([k,a])=>[k,summary(a)])),gpuMs:gpu.length?summary(gpu):null,draws:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles};
   }
  }
  const cadence=[];await new Promise(resolve=>{let last;const tick=t=>{if(last!==undefined)cadence.push(t-last);last=t;if(cadence.length<60)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
  return {hardware:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),cpu,render,cadenceMs:summary(cadence)};
 },label);
 assert.deepEqual(errors,[]);
 if(label==='after'){const before=JSON.parse(await readFile('artifacts/fps-deep-audit/before.json','utf8'));for(const name in result.cpu)assert.equal(result.cpu[name].stateChecksum,before.result.cpu[name].stateChecksum,`${name}: physics changed`);}
 await mkdir('artifacts/fps-deep-audit',{recursive:true});await writeFile(`artifacts/fps-deep-audit/${label}.json`,JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
}finally{await browser.close();}
