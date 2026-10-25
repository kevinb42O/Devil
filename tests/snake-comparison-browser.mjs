import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='artifacts/gigapede-sweeps';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/snake-comparison',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#090d12"><canvas id="comparison" width="1440" height="600" style="width:100vw"></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/snake-comparison');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,idleInput}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  // The comparison contains only serpents. Skip unused Drake swarm batches,
  // whose in-progress anatomy currently cannot merge for instancing.
  const {OriginalEnemies}=await import('/src/original-enemies.ts');
  const swarmBatch=OriginalEnemies.prototype.createSwarmBatch;
  OriginalEnemies.prototype.createSwarmBatch=function(kind,capacity){return kind==='skull4'||kind==='transmuted4'?[]:swarmBatch.call(this,kind,capacity);};
  const canvas=document.querySelector('#comparison'),ctx=canvas.getContext('2d'),views=[];
  for(const [index,kind] of ['centipede','gigapede','ghostpede'].entries()){
   const source=document.createElement('canvas'),renderer=new GameRenderer(source,{quality:'low',fov:65,mist:false,screenShake:0,movementMotion:0,skyMotion:'reduced'});await renderer.prepare();
   renderer.renderer.setPixelRatio(1);renderer.renderer.setSize(480,460,false);renderer.camera.aspect=480/460;renderer.camera.updateProjectionMatrix();
   const world=new World(32,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,0);const enemy=world.spawnAt(kind,0,.4);
   const camera=v(57,40,66),target=v(0,7,0),yaw=Math.atan2(camera.x-target.x,camera.z-target.z),pitch=Math.atan2(target.y-camera.y,Math.hypot(target.x-camera.x,target.z-camera.z));
   // A fixed marker identifies the stationary player's position in every panel.
   const THREE=await import('/node_modules/.vite/deps/three.js');
   const marker=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,3,12),new THREE.MeshBasicMaterial({color:0xffffff}));marker.position.set(0,1.5,0);renderer.scene.add(marker);
   views.push({renderer,world,enemy,camera,yaw,pitch,source,index,kind});
  }
  const titles=['SNAKE 1 · CENTIPEDE','SNAKE 2 · GIGAPEDE','SNAKE 3 · GHOSTPEDE'];
  const subtitles=['Rise → overpass → burrow','Climb → sweep → pull away','Elevated circular patrol'];
  const draw=()=>{
   ctx.fillStyle='#090d12';ctx.fillRect(0,0,1440,600);
   for(const view of views){
    const {renderer,world,enemy,camera,yaw,pitch,source,index}=view;
    renderer.render(world,yaw,pitch,1/60,false,1,camera);ctx.drawImage(source,index*480,80,480,460);
    ctx.fillStyle='#f2e6ce';ctx.font='bold 20px sans-serif';ctx.fillText(titles[index],index*480+20,30);
    ctx.fillStyle='#a7b7c5';ctx.font='16px sans-serif';ctx.fillText(subtitles[index],index*480+20,57);
    const state=index===0?enemy.centipedeMotion?.stage:index===1?enemy.gigapedeMotion?.sweep?.stage:enemy.status;
    ctx.fillStyle='#f2e6ce';ctx.font='16px sans-serif';ctx.fillText(`${world.time.toFixed(1)}s  ·  ${state||'underground'}  ·  head ${enemy.pos.y.toFixed(1)}`,index*480+20,570);
    ctx.fillStyle='#30404c';ctx.fillRect(index*480+479,0,1,600);
   }
   ctx.fillStyle='#7c8b98';ctx.font='12px sans-serif';ctx.fillText('Actual simulation · same fixed camera · white marker = stationary player · invulnerable movement demonstration',20,593);
  };
  draw();window.comparison={canvas,views,draw,idleInput};
 });
 const summary=await page.evaluate(async()=>{
  const {canvas,views,draw,idleInput}=window.comparison;
  const types=['video/mp4;codecs=avc1.42001E','video/webm;codecs=vp9','video/webm'];const mimeType=types.find(t=>MediaRecorder.isTypeSupported(t));
  const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:5000000}),chunks=[];
  const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  const stages=views.map(()=>new Set());
  for(let frame=0;frame<900;frame++){
   for(const [i,view] of views.entries()){
    for(let tick=0;tick<4;tick++){view.world.step(idleInput());view.world.effects=[];}
    stages[i].add(i===0?view.enemy.centipedeMotion?.stage:i===1?view.enemy.gigapedeMotion?.sweep?.stage:view.enemy.status);
   }
   draw();await new Promise(resolve=>setTimeout(resolve,1000/30));
  }
  recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:mimeType}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  window.comparisonVideo=btoa(binary);return {mimeType,bytes:bytes.length,stages:stages.map(s=>[...s]),simulationSeconds:views[0].world.time};
 });
 const base64=await page.evaluate(()=>window.comparisonVideo);const path=`${dir}/three-snakes.${summary.mimeType.startsWith('video/mp4')?'mp4':'webm'}`;
 await writeFile(path,Buffer.from(base64,'base64'));await page.screenshot({path:`${dir}/three-snakes.png`});assert.deepEqual(errors,[]);
 await writeFile(`${dir}/comparison-report.json`,JSON.stringify({...summary,path,errors},null,2));console.log({...summary,path,errors});
}finally{await browser.close();}
