import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Diagnostic ablations never change shipping settings. Frames use fixed time,
// resolution and inputs, without the application's competing animation loop.
const label=process.argv[2]??'baseline';
const directory='artifacts/optimization';
await mkdir(directory,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');document.body.replaceChildren(canvas);
  const r=new GameRenderer(canvas,{quality:'high',fov:90});await r.prepare();
  const gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const summary=values=>{values.sort((a,b)=>a-b);return {median:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)]};};
  const profiles={},pending=[];
  let cpu={};
  for(const [name,obj,key] of [['tiles',r,'updateTiles'],['enemyLighting',r.enemyLighting,'update'],['glowSources',r.enemyGlowSources,'sources'],['gemLighting',r.gemLighting,'update'],['weaponUpdate',r.originalWeapon,'update'],['projectileLighting',r.projectileLighting,'update'],['sceneSubmit',r.composer,'render'],['weaponSubmit',r.originalWeapon,'render']]){
   const original=obj[key];obj[key]=function(...args){const begin=performance.now();const result=original.apply(this,args);cpu[name]=(cpu[name]??0)+performance.now()-begin;return result;};
  }
  const makeWorld=name=>{
   const w=new World(1,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,12);w.level=4;
   const count=name==='empty'?0:name==='swarm'?600:300;
   for(let i=0;i<count;i++){const e=w.spawn(['skull','skull2','skull3','skull4'][i%4],v(Math.sin(i*2.399)* (8+i%35),2+i%7,Math.cos(i*2.399)*(8+i%35)-12));e.age=20;}
   if(name==='mixed'){
    for(const [i,kind] of ['squid','squid2','squid3','spider','spider2','centipede','gigapede','ghostpede','leviathan'].entries()){
     const pos=v((i%3-1)*15,kind==='leviathan'?12:4,-20-Math.floor(i/3)*12),e=w.spawn(kind,pos);e.pos=pos;e.age=20;e.headExposure=.6;
     e.segments.forEach((s,j)=>{s.pos=v(pos.x+Math.sin(j*.3)*8,3,pos.z-j*1.3);});
    }
    for(let i=0;i<350;i++)w.projectiles.push({id:10000+i,pos:v(Math.sin(i)*20,2+i%6,-i%45),vel:v(0,0,-70),age:.5,homing:i%3===0,level:4});
    for(let i=0;i<250;i++)w.gems.push({id:20000+i,pos:v(Math.sin(i)*25,1,-i%50),vel:v(),age:2});
   }
   w.effects=[];return w;
  };
  const snapshots={};
  for(const scene of ['empty','swarm','mixed']){
   r.clear();const w=makeWorld(scene);r.visualTime=10;
   for(let i=0;i<15;i++){r.render(w,0,-.08,0,false);gl.finish();}
   const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   // Full framebuffer bytes for exact equivalence, rather than screenshot timing.
   let binary='';for(let i=0;i<pixels.length;i+=32768)binary+=String.fromCharCode(...pixels.subarray(i,i+32768));snapshots[scene]=btoa(binary);
   for(const variant of ['full','noBloom','noSky']){
    r.bloom.enabled=variant!=='noBloom';r.sky.mesh.visible=variant!=='noSky';
    const totals=[],components={};
    for(let i=0;i<40;i++){
     cpu={};const q=timer&&gl.createQuery();if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
     const begin=performance.now();r.render(w,0,-.08,0,false);const submitted=performance.now()-begin;
     if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);gl.finish();const elapsed=performance.now()-begin;
     if(i>=10){totals.push(elapsed);for(const [key,value] of Object.entries({...cpu,cpuSubmit:submitted}))(components[key]??=[]).push(value);if(q)pending.push({q,scene,variant});}else if(q)gl.deleteQuery(q);
     // Drain each sample before the next one; WebGL finish is not a reliable
     // synchronous GPU fence on every browser/driver.
     if(q&&i>=10)for(let wait=0;wait<200&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);wait++)await new Promise(resolve=>setTimeout(resolve,1));
     else await new Promise(resolve=>setTimeout(resolve,12));
    }
    profiles[`${scene}/${variant}`]={frameMs:summary(totals),cpuMs:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,summary(v)])),drawCalls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles,gpuMs:null};
   }
   r.bloom.enabled=true;r.sky.mesh.visible=true;
  }
  if(timer){
   for(let i=0;i<100&&pending.some(p=>!gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE));i++)await new Promise(resolve=>setTimeout(resolve,10));
   const disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT),groups={};
   for(const {q,scene,variant} of pending){if(!disjoint&&gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))(groups[`${scene}/${variant}`]??=[]).push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
   for(const [key,values] of Object.entries(groups))profiles[key].gpuMs=summary(values);
  }
  return {hardware:{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerQueries:!!timer,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},profiles,snapshots};
 });
 assert.deepEqual(errors,[]);
 for(const [scene,base64] of Object.entries(result.snapshots)){
  const bytes=Buffer.from(base64,'base64');await writeFile(`${directory}/${label}-${scene}.rgba`,bytes);
  if(label!=='baseline'){
   const before=await readFile(`${directory}/baseline-${scene}.rgba`);assert.equal(bytes.length,before.length);
   let changed=0,max=0;for(let i=0;i<bytes.length;i++){const difference=Math.abs(bytes[i]-before[i]);if(difference)changed++;max=Math.max(max,difference);}
   (result.visualComparison??={})[scene]={changedChannels:changed,maxChannelDifference:max};
   assert.equal(changed,0,`${scene}: optimization must preserve every framebuffer byte`);
  }
 }
 delete result.snapshots;
 await writeFile(`${directory}/${label}.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
