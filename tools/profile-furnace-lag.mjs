import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const phase=process.argv[2]||'before';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/furnace-lag-profile',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto('http://127.0.0.1:5173/furnace-lag-profile');
 const report=await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,segmentSphere},{armorBounds,sweepArmor},trainer]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/projectile-collision.ts'),import('/external-trainer/targeting.mjs')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:85,mist:true});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});world.time=300;world.player.pos=v(0,1.7,8);
  const gl=renderer.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info'),results=[];
  const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
  for(const setting of [{label:'full',steps:40},{label:'24-steps',steps:24},{label:'16-steps',steps:16},{label:'no-volumes',volumes:false},{label:'no-mist',mist:false},{label:'floor-only',group:false},{label:'no-fire',fire:false}]){
   renderer.render(world,0,-.28,0,false);renderer.furnace.update(renderer.camera,300,setting.fire!==false);
   renderer.furnace.uniforms.fireSteps.value=setting.steps??40;
   renderer.furnace.group.visible=setting.group!==false&&setting.fire!==false;
   renderer.furnace.flames.visible=renderer.furnace.deckFlames.visible=setting.volumes!==false;
   renderer.openingMist.enabled=setting.mist!==false;renderer.openingMist.setHeat(setting.fire===false?0:1,300,world.radius);
   const cpu=[],gpu=[],queries=[];
   for(let i=0;i<14;i++){
    await new Promise(requestAnimationFrame);const q=timer?gl.createQuery():null;if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
    const start=performance.now();renderer.composer.render();if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);gl.finish();
    if(i>=4){cpu.push(performance.now()-start);if(q)queries.push(q);}else if(q)gl.deleteQuery(q);
   }
   for(let n=0;n<40&&queries.some(q=>!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE));n++)await new Promise(requestAnimationFrame);
   if(timer&&!gl.getParameter(timer.GPU_DISJOINT_EXT))for(const q of queries)if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
   for(const q of queries)gl.deleteQuery(q);
   results.push({...setting,cpuMedianMs:median(cpu),gpuMedianMs:gpu.length?median(gpu):null});
  }
  const scans=[];
  for(let i=0;i<600;i++){const angle=i*2.399,r=10+i%22;const e=world.spawn('skull',v(Math.sin(angle)*r,2+i%4,Math.cos(angle)*r));e.age=12;}
  for(let i=0;i<8;i++){const e=world.spawn('squid2',v(Math.sin(i*2.399)*15,5.2,Math.cos(i*2.399)*15));e.age=12;e.phase=Math.PI;e.facingYaw=Math.PI;e.status='idle';}
  for(const time of [200,250,300])for(const enabled of [false,true]){
   world.time=time;const state={world,mode:'playing',focused:true,yaw:0,pitch:0,fire:true,armorEnemies:world.enemies.filter(e=>armorBounds(e)!==null)};
   const adapter=trainer.createMemoryAim({get:()=>state,set:()=>{},resolve:(e,p,r,s,h,t)=>trainer.resolveDamagePoint(e,p,r,s,h,{segmentSphere,armorBounds,sweepArmor},t)}, {performance,requestAnimationFrame:()=>0});
   const times=[];for(let i=0;i<15;i++){adapter.control({enabled,fov:360});const start=performance.now();adapter.step();if(i>=5)times.push(performance.now()-start);}
   scans.push({time,enabled,cpuMedianMs:median(times),targets:adapter.snapshot().targets});adapter.stop();
  }
  return {renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],results,scans};
 });
 await writeFile(`artifacts/furnace-lag/${phase}.json`,JSON.stringify({...report,errors},null,2)+'\n');console.log(JSON.stringify({...report,errors}));
}finally{await browser.close();}
