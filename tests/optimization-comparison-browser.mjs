import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';

// Compare against a recorded revision in alternating, fenced GPU samples.
// A temporary reference source tree is served by Vite and removed on exit.
const reference=process.argv[2]??'cae94e067cbe5a71ef76b5a0d42bcfd9adc24742';
const directory='artifacts/optimization';await mkdir(directory,{recursive:true});
const root=await mkdtemp(`${directory}/reference-`);
const files=execFileSync('git',['ls-tree','-r','--name-only',reference,'src'],{encoding:'utf8'}).trim().split('\n');
for(const file of files){const path=`${root}/${file}`;await mkdir(dirname(path),{recursive:true});await writeFile(path,execFileSync('git',['show',`${reference}:${file}`],{maxBuffer:32*1024*1024}));}
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async root=>{
  const [{World,v,idleInput,STEP},{GameRenderer:Before},{GameRenderer:After}]=await Promise.all([import('/src/simulation.ts'),import(`/${root}/src/renderer.ts`),import('/src/renderer.ts')]);
  document.body.replaceChildren();
  const renderers=[];
  for(const Constructor of [Before,After]){const canvas=document.createElement('canvas');const r=new Constructor(canvas,{quality:'high',fov:90});await r.prepare();renderers.push(r);}
  const stats=values=>{values.sort((a,b)=>a-b);return {median:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)]};};
  const fixture=scene=>{
   const w=new World(1,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,12);w.level=4;
   const count=scene==='empty'?0:scene==='swarm'?600:300;
   for(let i=0;i<count;i++){const e=w.spawn(['skull','skull2','skull3','skull4'][i%4],v(Math.sin(i*2.399)*(8+i%35),2+i%7,Math.cos(i*2.399)*(8+i%35)-12));e.age=20;}
   if(scene==='mixed'){
    for(const [i,kind] of ['squid','squid2','squid3','spider','spider2','centipede','gigapede','ghostpede','leviathan'].entries()){
     const pos=v((i%3-1)*15,kind==='leviathan'?12:4,-20-Math.floor(i/3)*12),e=w.spawn(kind,pos);e.pos=pos;e.age=20;e.headExposure=.6;
     e.segments.forEach((s,j)=>{s.pos=v(pos.x+Math.sin(j*.3)*8,3,pos.z-j*1.3);});
    }
    for(let i=0;i<350;i++)w.projectiles.push({id:10000+i,pos:v(Math.sin(i)*20,2+i%6,-i%45),vel:v(0,0,-70),age:.5,homing:i%3===0,level:4});
    for(let i=0;i<250;i++)w.gems.push({id:20000+i,pos:v(Math.sin(i)*25,1,-i%50),vel:v(),age:2});
   }
   w.effects=[];return w;
  };
  const hardware=renderers.map(r=>{const gl=r.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,timers:!!gl.getExtension('EXT_disjoint_timer_query_webgl2')};});
  const comparisons={},visuals=[],images={};
  const pixels=r=>{const gl=r.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const compare=(world,yaw,pitch,time,name,menu=false)=>{
   const buffers=renderers.map(r=>{r.visualTime=time;r.render(world,yaw,pitch,0,menu);const bytes=pixels(r);if(name==='mixed/front')images[r===renderers[0]?'before':'after']=r.renderer.domElement.toDataURL('image/png').split(',')[1];return bytes;});
   let changes=0,max=0;for(let i=0;i<buffers[0].length;i++){const d=Math.abs(buffers[0][i]-buffers[1][i]);if(d)changes++;max=Math.max(max,d);}
   visuals.push({name,changedChannels:changes,maxChannelDifference:max});
   // Include hidden/off-screen lighting and transforms in the equivalence oracle.
   const fields=renderers.map(r=>r.enemyLighting.pixels);
   let fieldChanges=0;for(let i=0;i<fields[0].length;i++)if(fields[0][i]!==fields[1][i])fieldChanges++;
   visuals.at(-1).fieldChangedBytes=fieldChanges;
  };
  for(const scene of ['empty','swarm','mixed']){
   for(const r of renderers){r.clear();r.visualTime=10;}
   const world=fixture(scene),samples=renderers.map(()=>({cpu:[],gpu:[],lighting:[],submit:[]}));
   const lightingTimes=[0,0],submitTimes=[0,0];
   renderers.forEach((r,index)=>{
    const lighting=r.enemyLighting.update,submit=r.composer.render;
    r.enemyLighting.update=function(...args){const t=performance.now();const value=lighting.apply(this,args);lightingTimes[index]+=performance.now()-t;return value;};
    r.composer.render=function(...args){const t=performance.now();const value=submit.apply(this,args);submitTimes[index]+=performance.now()-t;return value;};
   });
   for(let i=0;i<65;i++)for(const index of i%2?[1,0]:[0,1]){
    const r=renderers[index],gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),q=timer&&gl.createQuery();
    lightingTimes[index]=submitTimes[index]=0;
    if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
    const begin=performance.now();r.render(world,0,-.08,0,false);const cpu=performance.now()-begin;
    if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);
    let ready=false;
    if(q)for(let wait=0;wait<200;wait++){ready=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);if(ready)break;await new Promise(resolve=>setTimeout(resolve,1));}
    else await new Promise(resolve=>setTimeout(resolve,16));
    if(i>=15){samples[index].cpu.push(cpu);samples[index].lighting.push(lightingTimes[index]);samples[index].submit.push(submitTimes[index]);if(q&&ready&&!gl.getParameter(timer.GPU_DISJOINT_EXT))samples[index].gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);}
    if(q)gl.deleteQuery(q);
   }
   comparisons[scene]=Object.fromEntries(renderers.map((r,i)=>[i?'after':'before',{cpuMs:stats(samples[i].cpu),gpuMs:samples[i].gpu.length?stats(samples[i].gpu):null,lightingMs:stats(samples[i].lighting),sceneSubmitMs:stats(samples[i].submit),drawCalls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles}]));
   compare(world,0,-.08,10,`${scene}/front`);compare(world,.8,.2,21,`${scene}/turned`);
   if(scene==='mixed'){
    world.enemies.forEach((e,i)=>{e.age=(i%10)*.6;e.weakpoints.forEach((p,j)=>{if(j%2===0)p.hp=0;});e.segments.forEach((s,j)=>{if(j%3===0)s.hp=0;});});
    compare(world,-.7,-.3,35,'mixed/emergence-and-broken-crystals');
    for(let frame=0;frame<20;frame++){
     world.time+=STEP;for(const e of world.enemies){e.age+=STEP;e.pos.x+=.025;e.pos.z-=.018;for(const s of e.segments){s.pos.x+=.013;s.pos.y+=.002;}}
     if(frame%5===0)compare(world,frame*.07,-.08,35+frame*STEP,`mixed/moving-${frame}`);
    }
    // Exercise simulation against original code too, including heavy collision.
    const {World:ReferenceWorld}=await import(`/${root}/src/simulation.ts`);
    const simWorlds=[new ReferenceWorld(42,{schedule:false,invulnerable:true}),new World(42,{schedule:false,invulnerable:true})];
    const times=[[],[]];for(const w of simWorlds){w.level=4;w.reserve=1000;for(let i=0;i<300;i++){const e=w.spawn('skull',v(Math.sin(i)*25,2,Math.cos(i)*25));e.age=20;}}
    for(let tick=0;tick<240;tick++)for(const index of tick%2?[1,0]:[0,1]){const t=performance.now();simWorlds[index].step({...idleInput(),fire:true,homing:true},STEP);times[index].push(performance.now()-t);simWorlds[index].effects=[];}
    comparisons.simulation={beforeMs:stats(times[0]),afterMs:stats(times[1]),identical:JSON.stringify(simWorlds[0])===JSON.stringify(simWorlds[1])};
   }
  }
  // Visibility, camera, quality, lifecycle and capacity changes are checked
  // against the original renderer, not against a duplicated implementation.
  const {ENEMY_KINDS}=await import('/src/enemy-kinds.ts');
  for(const kind of ENEMY_KINDS){
   for(const r of renderers)r.clear();
   const world=new World(5,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,12);
   const e=world.spawn(kind,v(0,4,-14));e.pos=v(0,4,-14);e.age=20;e.headExposure=.6;
   e.segments.forEach((s,j)=>{s.pos=v(Math.sin(j*.3)*8,3,-14-j*1.3);});
   compare(world,.1,-.08,55,`kind/${kind}`);
  }
  for(const r of renderers)r.clear();
  const crowded=new World(5,{schedule:false,invulnerable:true});crowded.player.pos=v(0,1.7,12);
  for(let i=0;i<6;i++){const e=crowded.spawn('ghostpede',v((i-3)*3,4,-12));e.age=20;e.segments.forEach((s,j)=>{s.pos=v((i-3)*3+Math.sin(j*.3)*3,3,-12-j);});}
  compare(crowded,0,-.08,55,'segments/capacity-growth');
  for(const r of renderers)r.topDown=true;
  compare(crowded,0,0,55,'segments/top-down');
  for(const r of renderers){r.topDown=false;r.configure({quality:'low',fov:105});}
  compare(crowded,0,-.08,55,'segments/low-quality');
  for(const r of renderers)r.configure({quality:'high',fov:90});
  compare(crowded,0,-.08,55,'segments/restored-high');
  for(const r of renderers)r.clear();
  compare(null,0,0,55,'lifecycle/menu-after-clear',true);
  // Isolate GPU changes within ONE context: alternating WebGL contexts and
  // browser presentation can otherwise skew GPU query timings on this driver.
  const {AbyssSky}=await import(`/${root}/src/sky.ts`);
  const r=renderers[1],gl=r.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const optimizedSky=r.sky,originalSky=new AbyssSky();r.scene.add(originalSky.mesh);
  const intersects=r.swarmFrustum.intersectsSphere,gpuIsolation={};
  for(const scene of ['empty','swarm','mixed']){
   r.clear();const world=fixture(scene),modes=['optimized','originalSky','unculledSwarm'],samples=Object.fromEntries(modes.map(m=>[m,[]]));
   for(let frame=0;frame<55;frame++)for(let offset=0;offset<modes.length;offset++){
    const mode=modes[(frame+offset)%modes.length];
    optimizedSky.mesh.visible=mode!=='originalSky';originalSky.mesh.visible=mode==='originalSky';r.sky=mode==='originalSky'?originalSky:optimizedSky;
    r.swarmFrustum.intersectsSphere=mode==='unculledSwarm'?()=>true:intersects;
    const q=timer&&gl.createQuery();if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
    r.render(world,0,-.08,0,false);if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);
    let ready=false;if(q)for(let wait=0;wait<200;wait++){ready=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);if(ready)break;await new Promise(resolve=>setTimeout(resolve,1));}
    if(frame>=15&&q&&ready&&!gl.getParameter(timer.GPU_DISJOINT_EXT))samples[mode].push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
    if(q)gl.deleteQuery(q);
   }
   gpuIsolation[scene]=Object.fromEntries(Object.entries(samples).map(([mode,times])=>[mode,times.length?stats(times):null]));
  }
  r.sky=optimizedSky;optimizedSky.mesh.visible=true;r.scene.remove(originalSky.mesh);r.swarmFrustum.intersectsSphere=intersects;
  return {hardware,comparisons,visuals,images,gpuIsolation};
 },root);
 assert.deepEqual(errors,[]);
 for(const [name,base64] of Object.entries(result.images))await writeFile(`${directory}/${name}.png`,Buffer.from(base64,'base64'));
 delete result.images;
 await writeFile(`${directory}/comparison.json`,JSON.stringify({reference,...result},null,2));
 console.log(JSON.stringify(result,null,2));
 for(const visual of result.visuals){assert.equal(visual.changedChannels,0,visual.name);assert.equal(visual.fieldChangedBytes,0,visual.name+' floor lighting');}
 assert.equal(result.comparisons.simulation.identical,true);
}finally{await browser.close();await rm(root,{recursive:true,force:true});}
