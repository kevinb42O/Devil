import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='artifacts/gigapede-formation';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/trio-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#090e15"><canvas id="film" width="1440" height="650" style="width:100vw"></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/trio-review');
 await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput,v,STEP},{OriginalEnemies}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/original-enemies.ts')]);
  // No Drakes are present in this isolated spawn review; skip their unused batches.
  const batch=OriginalEnemies.prototype.createSwarmBatch;OriginalEnemies.prototype.createSwarmBatch=function(kind,capacity){return kind==='skull4'||kind==='transmuted4'?[]:batch.call(this,kind,capacity);};
  const film=document.querySelector('#film'),ctx=film.getContext('2d'),views=[];
  for(const coordinated of [false,true]){
   const source=document.createElement('canvas'),renderer=new GameRenderer(source,{quality:'low',fov:65,mist:false,screenShake:0,movementMotion:0,skyMotion:'reduced'});await renderer.prepare();if(!renderer.originalEnemies.ready)throw Error(renderer.originalEnemies.error);
   renderer.renderer.setPixelRatio(1);renderer.renderer.setSize(720,510,false);renderer.camera.aspect=720/510;renderer.camera.updateProjectionMatrix();
   const world=new World(29,{invulnerable:true,legacyGigapedeFormation:!coordinated});world.startAt(259-STEP);world.step(idleInput());world.enemies=world.enemies.filter(e=>e.kind==='gigapede');
   const marker=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,3,12),new THREE.MeshBasicMaterial({color:0xffffff}));marker.position.set(0,1.5,0);renderer.scene.add(marker);
   const camera=v(48,38,57),target=v(0,9,0),yaw=Math.atan2(camera.x-target.x,camera.z-target.z),pitch=Math.atan2(target.y-camera.y,Math.hypot(target.x-camera.x,target.z-camera.z));
   views.push({source,renderer,world,camera,yaw,pitch,coordinated,passes:[0,0,0],overlappingPassTicks:0,nearBodySamples:0});
  }
  const draw=()=>{
   ctx.fillStyle='#090e15';ctx.fillRect(0,0,1440,650);
   views.forEach(({source,renderer,world,camera,yaw,pitch,coordinated},i)=>{
    renderer.render(world,yaw,pitch,1/30,false,1,camera);ctx.drawImage(source,i*720,90,720,510);
    ctx.fillStyle='#e8edf4';ctx.font='bold 24px sans-serif';ctx.fillText(coordinated?'AFTER · COORDINATED TRIO':'BEFORE · INDEPENDENT FLIGHT',i*720+24,34);
    ctx.fillStyle='#99b3ca';ctx.font='16px sans-serif';ctx.fillText(coordinated?'Separate sectors · staggered passes · body-trail avoidance':'Three snakes pursue and commit independently',i*720+24,63);
    world.enemies.forEach((e,j)=>{
     const p=new THREE.Vector3(e.pos.x,e.pos.y+2,e.pos.z).project(renderer.camera),x=i*720+(p.x+1)*360,y=90+(1-p.y)*255;
     if(Math.abs(p.x)<.95&&Math.abs(p.y)<.92){ctx.fillStyle='#080e18';ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f4eee2';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(String(j+1),x,y+5);ctx.textAlign='left';}
     const stage=e.gigapedeMotion?.sweep?.stage??'emerging';ctx.fillStyle=stage==='pass'?'#ffbc65':'#99b3ca';ctx.font='16px sans-serif';ctx.fillText(`${j+1}: ${stage.toUpperCase()}`,i*720+24+j*214,620);
    });
   });
   ctx.fillStyle='#526b7c';ctx.fillRect(719,0,2,650);ctx.fillStyle='#7b92a7';ctx.font='12px sans-serif';ctx.fillText(`Actual 4:19 spawn · same seed, player and camera · ${views[0].world.enemies[0].age.toFixed(1)} seconds after spawn · invulnerable movement review`,24,644);
  };
  draw();window.trioReview={THREE,views,film,draw,idleInput};
 });
 const result=await page.evaluate(async()=>{
  const {views,film,draw,idleInput}=window.trioReview,stream=film.captureStream(30),mimeType='video/mp4;codecs=avc1.42001E',recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6500000}),chunks=[];
  recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  for(let frame=0;frame<960;frame++){
   for(const view of views)for(let tick=0;tick<4;tick++){
    view.world.enemies=view.world.enemies.filter(e=>e.kind==='gigapede');const previous=view.world.enemies.map(e=>e.gigapedeMotion?.sweep?.stage);
    view.world.step(idleInput());view.world.effects=[];
    view.world.enemies.forEach((e,j)=>{if(e.gigapedeMotion?.sweep?.stage==='pass'&&previous[j]!=='pass')view.passes[j]++;});
    if(view.world.enemies.filter(e=>e.gigapedeMotion?.sweep?.stage==='pass').length>1)view.overlappingPassTicks++;
   }
   if(frame%8===0&&frame>450)for(const view of views){const enemies=view.world.enemies;for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)for(const a of [enemies[i].pos,...enemies[i].segments.map(s=>s.pos)])for(const b of [enemies[j].pos,...enemies[j].segments.map(s=>s.pos)])if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<2)view.nearBodySamples++;}
   draw();await new Promise(resolve=>setTimeout(resolve,1000/30));
  }
  recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(chunks,{type:mimeType}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));window.trioVideo=btoa(binary);
  return views.map(v=>({coordinated:v.coordinated,passes:v.passes,overlappingPassTicks:v.overlappingPassTicks,nearBodySamples:v.nearBodySamples,slots:v.world.enemies.map(e=>e.gigapedeMotion?.formation?.slot)}));
 });
 await writeFile(`${dir}/trio-before-after.mp4`,Buffer.from(await page.evaluate(()=>window.trioVideo),'base64'));await page.screenshot({path:`${dir}/trio-before-after.png`});
 assert.equal(result[1].overlappingPassTicks,0);assert.ok(result[1].passes.every(n=>n>=1));assert.deepEqual(errors,[]);
 await writeFile(`${dir}/browser-report.json`,JSON.stringify({result,errors},null,2));console.log({result,errors});
}finally{await browser.close();}
