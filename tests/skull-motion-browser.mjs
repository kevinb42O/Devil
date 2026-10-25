import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const directory='artifacts/skull-flight';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/skull-flight-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#05080d"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/skull-flight-review');
 await page.evaluate(async()=>{
  const [T,{GameRenderer},{World,idleInput},{enemyYaw}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-presentation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:65,mist:false,skyMotion:'full',screenShake:0,movementMotion:0});await game.prepare();
  const world=new World(71,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:2.3,z:14};
  ['skull','skull2','skull3','transmuted1','transmuted2','transmuted3'].forEach((kind,i)=>{const e=world.spawn(kind,{x:(i%3-1)*3.2,y:i<3?3.1:1.4,z:i<3?0:1});e.age=10;});
  const baseSample=game.skullMotion.sample.bind(game.skullMotion),base={yaw:0,pitch:0,roll:0,phase:0,follow:0,lift:0,energy:0};
  function bypass(e,player){base.yaw=enemyYaw(e,player);base.phase=e.phase+e.id*2.399963229728653;return base;}
  // Keep the hidden response alive while capturing the rigid comparison. Both
  // halves sample the same time; neither resets the other's motion history.
  function rigidSample(e,player,reduced,grounded){baseSample(e,player,reduced,grounded);return bypass(e,player);}
  const position={x:0,y:2.7,z:14},matrix=new T.Matrix4(),rotation=new T.Quaternion(),scale=new T.Vector3(),translation=new T.Vector3(),euler=new T.Euler(0,0,0,'YXZ');
  function frame(t,polished=true){
   game.skullMotion.sample=polished?baseSample:rigidSample;world.time=120+t;
   world.enemies.forEach((e,i)=>{
    const phase=i*.27,heading=Math.sin(t*1.8+phase)*.9;
    e.age=10+t;e.pos.x=(i%3-1)*3.2+Math.sin(t*1.2+phase)*.55;
    e.pos.y=(i<3?3.1:1.4)+Math.sin(t*1.5+phase)*.22;
    e.vel={x:Math.sin(heading)*6,y:Math.cos(t*1.5+phase)*2.2,z:Math.cos(heading)*6};
   });
   game.render(world,0,0,1/60,false,1,position,false,false,idleInput());
  }
  function attitude(kind){const batch=game.swarmBatches.get(kind),mesh=batch.meshes[0];mesh.getMatrixAt(0,matrix);matrix.decompose(translation,rotation,scale);euler.setFromQuaternion(rotation,'YXZ');return {count:mesh.count,pitch:euler.x,yaw:euler.y,roll:euler.z,position:translation.toArray(),motion:Array.from(mesh.geometry.getAttribute('skullMotion').array.slice(0,4))};}
  window.flight={T,GameRenderer,World,idleInput,game,world,position,frame,attitude,baseSample,bypass};
 });
 const checks=await page.evaluate(()=>{
  const {frame,attitude,world,game}=window.flight;
  for(let i=0;i<=90;i++)frame(i/60);
  const poses=['skull','skull2','skull3'].map(attitude),before=JSON.stringify(world.captureCrewCheckpoint());
  frame(1.5);const paused=attitude('skull');frame(1.5);const repeat=attitude('skull');
  const noMutation=before===JSON.stringify(world.captureCrewCheckpoint());
  frame(.2);const seek=attitude('skull');
  world.enemies[0].kind='transmuted1';frame(.21);const transmuted=attitude('transmuted1');
  const shaderCompiled=game.renderer.info.programs.every(p=>p.diagnostics?.runnable!==false);
  world.enemies[0].kind='skull';game.skullMotion.clear();for(let i=0;i<=45;i++)frame(i/60);
  const full=attitude('skull');game.environmentMotionReduced=true;frame(.75);const reduced=attitude('skull');game.environmentMotionReduced=false;
  return {poses,paused,repeat,noMutation,seek,transmuted,shaderCompiled,full,reduced};
 });
 assert.ok(checks.poses.every(p=>p.count===1&&Math.abs(p.pitch)>.01&&Math.abs(p.roll)>.01),JSON.stringify(checks.poses));
 assert.deepEqual(checks.paused,checks.repeat);assert.ok(checks.noMutation);assert.ok(checks.shaderCompiled);
 assert.ok(Math.abs(checks.reduced.roll)<Math.abs(checks.full.roll));
 for(const [name,t]of [['turn',.75],['climb',2.1],['recovery',3.4]]){
  await page.evaluate(t=>{const {game,frame}=window.flight;game.skullMotion.clear();for(let i=0;i<=Math.ceil(t*60);i++)frame(i/60);},t);
  await page.screenshot({path:`${directory}/${name}.png`});
 }
 // Record the real production instance path. The left half bypasses body motion;
 // the right half uses the shipping controller with the same position/velocity samples.
 const film=await page.evaluate(async()=>{
  const {frame,game}=window.flight,canvas=game.renderer.domElement,film=document.createElement('canvas');film.width=1280;film.height=720;
  const ctx=film.getContext('2d',{alpha:false}),mime='video/mp4;codecs=avc1.640028';
  if(!MediaRecorder.isTypeSupported(mime))throw Error('H264 unavailable');
  const stream=film.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6500000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};game.skullMotion.clear();recorder.start();
  const began=performance.now();let frames=0;
  while(performance.now()-began<8500){
   await new Promise(requestAnimationFrame);const t=(performance.now()-began)/1000;
   frame(t,false);ctx.drawImage(canvas,320,0,640,720,0,0,640,720);
   frame(t,true);ctx.drawImage(canvas,320,0,640,720,640,0,640,720);
   ctx.fillStyle='rgba(4,7,12,.9)';ctx.fillRect(0,0,1280,70);ctx.fillRect(0,658,1280,62);
   ctx.fillStyle='#dcd9d1';ctx.font='500 22px Arial';ctx.fillText('RIGID HEADING',28,43);ctx.fillText('FLIGHT + FOLLOW-THROUGH',668,43);
   ctx.fillStyle='#99abb9';ctx.font='16px Arial';ctx.fillText('Same gameplay positions and velocities · actual combat instance renderer',28,695);frames++;
  }
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),frames};
 });
 await writeFile(`${directory}/comparison.mp4`,Buffer.from(film.base64,'base64'));delete film.base64;
 const decoded=await page.evaluate(async directory=>{
  const video=document.createElement('video');video.src=`/${directory}/comparison.mp4`;
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});
  video.currentTime=1.5;await new Promise(resolve=>video.onseeked=resolve);
  const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);
  return {duration:video.duration,width:c.width,height:c.height,frame:c.toDataURL('image/png').split(',')[1]};
 },directory);
 await writeFile(`${directory}/comparison.png`,Buffer.from(decoded.frame,'base64'));delete decoded.frame;
 assert.ok(decoded.duration>=8&&decoded.duration<10);assert.equal(decoded.width,1280);assert.equal(decoded.height,720);
 const gameplay=await page.evaluate(()=>{
  const {game,World,idleInput,baseSample,T}=window.flight;game.clear();game.skullMotion.sample=baseSample;
  const w=new World(19,{schedule:false,invulnerable:true});w.time=20;w.player.pos={x:0,y:1.7,z:8};
  w.spawn('squid',{x:-8,y:0,z:-10});w.spawn('squid2',{x:8,y:0,z:-10});
  const drake=w.spawn('skull4',{x:0,y:7,z:-7});drake.age=10;
  let launched=0,descending=0,maxPitch=0,maxRoll=0,groundPitch=0,hitChecked=false,finite=true;
  const matrix=new T.Matrix4(),q=new T.Quaternion(),v=new T.Vector3(),scale=new T.Vector3(),angles=new T.Euler(0,0,0,'YXZ');
  for(let i=0;i<960;i++){
   const input={...idleInput(),strafe:Math.sin(i/180),yaw:0};w.step(input);w.effects=[];
   if(i%4!==0)continue;
   const victim=w.enemies.find(e=>e.kind==='skull3'&&e.age>1);
   if(victim&&!hitChecked){w.damageEnemy(victim,1);hitChecked=true;}
   game.render(w,0,-.16,1/30,false,1,{x:0,y:8,z:28},false,false,input);
   for(const e of w.enemies){
    if(!e.kind.startsWith('skull')||e.age<0)continue;
    const pose=game.skullMotion.sample(e,w.player.pos,false,e.kind==='skull4');
    finite&&=Object.values(pose).every(Number.isFinite);
    if(e.kind==='skull4')groundPitch=Math.max(groundPitch,Math.abs(pose.pitch));
    else {maxPitch=Math.max(maxPitch,Math.abs(pose.pitch));maxRoll=Math.max(maxRoll,Math.abs(pose.roll));}
    if(e.statusUntil>0&&e.age<e.statusUntil&&e.vel.y>1)launched++;
    if(e.towerFlight&&e.vel.y<-.5)descending++;
   }
   // Actual rendered Drake attitude, including the live shader path.
   const mesh=game.swarmBatches.get('skull4').meshes[0];if(mesh.count){mesh.getMatrixAt(0,matrix);matrix.decompose(v,q,scale);angles.setFromQuaternion(q,'YXZ');finite&&=Number.isFinite(angles.x);}
  }
  return {launched,descending,maxPitch,maxRoll,groundPitch,hitChecked,finite,skulls:w.enemies.filter(e=>e.kind.startsWith('skull')).length};
 });
 assert.ok(gameplay.launched>0&&gameplay.descending>0&&gameplay.hitChecked&&gameplay.finite,JSON.stringify(gameplay));
 assert.ok(gameplay.maxPitch>.1&&gameplay.maxRoll>.02);assert.ok(gameplay.groundPitch<.001);
 await page.screenshot({path:`${directory}/gameplay.png`});
 const dense=await page.evaluate(()=>{
  const {game,World,idleInput,baseSample,bypass}=window.flight;game.clear();game.configure({quality:'low',fov:75,mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});
  const w=new World(72,{schedule:false,invulnerable:true});w.time=120;w.player.pos={x:0,y:2,z:32};
  for(let i=0;i<1000;i++){const e=w.spawn(['skull','skull2','skull3'][i%3],{x:(i%40-20)*.6,y:1+Math.floor(i/200)*.6,z:-Math.floor(i/40)*.8});e.age=12;e.vel={x:1,y:.4,z:6};}
  const samples={bypass:[],motion:[]};let frame=0;const render=()=>{w.time=120+frame++/120;game.render(w,0,0,1/120,false,1,null,false,false,idleInput());};
  game.skullMotion.sample=baseSample;render();
  const growthPhases=[...game.swarmBatches.values()].reduce((count,b)=>{
   const mesh=b.meshes[0],a=mesh.geometry.getAttribute('skullMotion');if(!a)return count;
   for(let i=0;i<mesh.count;i++)if(Math.abs(a.getX(i))>.01)count++;return count;
  },0);
  // Interleave both modes to reduce warmup/thermal bias; CPU submission timings.
  for(let block=0;block<8;block++)for(const mode of block%2?['motion','bypass']:['bypass','motion']){
   game.skullMotion.sample=mode==='motion'?baseSample:bypass;
   for(let i=0;i<12;i++)render();
   for(let i=0;i<30;i++){const start=performance.now();render();samples[mode].push(performance.now()-start);}
  }
  const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
  const timing=Object.fromEntries(Object.entries(samples).map(([key,a])=>[key,{median:percentile(a,.5),p95:percentile(a,.95)}]));
  game.skullMotion.sample=baseSample;render();
  const shown=[...game.swarmBatches.values()].reduce((n,b)=>n+b.meshes[0].count,0),draws=game.renderer.info.render.calls,triangles=game.renderer.info.render.triangles,cache=game.skullMotion.size;
  game.clear();return {shown,draws,triangles,cache,growthPhases,cleared:game.skullMotion.size,timing,measurement:'CPU render submission; same shader/attributes, controller enabled versus bypassed'};
 });
 assert.equal(dense.shown,1000);assert.equal(dense.cache,1000);assert.equal(dense.growthPhases,1000);assert.equal(dense.cleared,0);assert.ok(dense.draws<70);assert.ok(dense.triangles<2400000);
 assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({checks,film,decoded,gameplay,dense,errors},null,2));console.log(JSON.stringify({checks,film,decoded,gameplay,dense,errors}));
}finally{await browser.close();}
