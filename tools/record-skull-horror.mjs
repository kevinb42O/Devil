import{chromium}from'@playwright/test';
import{mkdir,writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const directory='artifacts/skull-horror/film';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/skull-motion-film',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#05080d"><canvas></canvas></body>'}));
 await page.goto('http://127.0.0.1:5173/skull-motion-film');
 const result=await page.evaluate(async()=>{
  const[T,{GameRenderer},{World,idleInput}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const canvas=document.querySelector('canvas'),game=new GameRenderer(canvas,{quality:'high',fov:60,mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});await game.prepare();game.renderer.setSize(1280,720);
  const scene=new T.Scene();scene.background=new T.Color(0x070b12);scene.add(new T.HemisphereLight(0x8da0bb,0x161014,.65));
  const key=new T.DirectionalLight(0xd0d9e2,1.0);key.position.set(-4,6,5);scene.add(key);
  const camera=new T.PerspectiveCamera(38,1280/720,.01,200),kinds=['skull','skull2','skull3'],names=['SHRIEKER','EXECUTIONER','RELIQUARY'];
  const models=kinds.map(k=>game.originalEnemies.clone(k)),centers=[],distances=[];
  for(const m of models){m.updateMatrixWorld(true);const box=new T.Box3().setFromObject(m),size=box.getSize(new T.Vector3());centers.push(box.getCenter(new T.Vector3()));distances.push(Math.max(size.y,size.x/1.77)*1.95);}
  const world=new World(71,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:2.4,z:10};
  kinds.forEach((k,i)=>{const e=world.spawn(k,{x:(i-1)*3.1,y:2.4,z:0});e.age=20;e.vel={x:0,y:0,z:6};});
  const film=document.createElement('canvas');film.width=1280;film.height=720;const ctx=film.getContext('2d',{alpha:false});
  const mime='video/mp4;codecs=avc1.640028';if(!MediaRecorder.isTypeSupported(mime))throw Error('H264 unsupported');
  const stream=film.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:12000000}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  // Compile studio and full arena pipelines before starting the recording.
  for(const model of models){scene.add(model);camera.position.copy(centers[models.indexOf(model)]).add(new T.Vector3(0,.3,distances[models.indexOf(model)]));camera.lookAt(centers[models.indexOf(model)]);game.renderer.render(scene,camera);scene.remove(model);}
  game.render(world,0,0,0,false,1,{x:0,y:2.35,z:10},false,false,idleInput());game.renderer.getContext().finish();
  let active=-1,frames=0;const shots=[],taken=new Set();recorder.start(500);const began=performance.now();
  for(;;){await new Promise(requestAnimationFrame);const t=(performance.now()-began)/1000;if(t>=23)break;
   game.originalEnemies.setTime(18+t);
   if(t<15){
    const index=Math.floor(t/5),local=t-index*5;
    if(index!==active){if(active>=0)scene.remove(models[active]);scene.add(models[index]);active=index;}
    const m=models[index],center=centers[index],distance=distances[index],angle=-.40+local*.15;
    m.position.y=Math.sin(local*1.4)*.035;m.rotation.y=Math.sin(local*.8)*.035;
    camera.position.copy(center).add(new T.Vector3(Math.sin(angle)*distance,.15*distance,Math.cos(angle)*distance));camera.lookAt(center);
    game.renderer.render(scene,camera);
   }else{
    world.time=120+t-15;const angle=Math.sin((t-15)*.22)*.12,position={x:Math.sin(angle)*10,y:2.35,z:Math.cos(angle)*10};
    world.enemies.forEach((e,i)=>{e.age=20+t;e.pos.y=2.4+Math.sin(t*1.3+i*1.7)*.11;});
    game.render(world,angle,0,1/30,false,1,position,false,false,idleInput());
   }
   ctx.drawImage(canvas,0,0,1280,720);
   const gradient=ctx.createLinearGradient(0,520,0,720);gradient.addColorStop(0,'rgba(3,6,11,0)');gradient.addColorStop(1,'rgba(3,6,11,.93)');ctx.fillStyle=gradient;ctx.fillRect(0,520,1280,200);
   ctx.textBaseline='alphabetic';ctx.fillStyle='#8c9cad';ctx.font='500 13px Arial';
   ctx.fillStyle='#e9e3d7';ctx.font='500 32px Arial';ctx.fillText(t<15?names[Math.floor(t/5)]:'IN THE ARENA',48,655);
   ctx.fillStyle='#a9b3bd';ctx.font='16px Arial';ctx.fillText(t<5?'Amber embers recessed into bone':t<10?'Heavy descending ram horns':t<15?'Serrated horns and an extended biting jaw':'Current game models · surface illumination · no added enemy lights',48,687);
   frames++;
   for(const at of [3,8,13,19])if(t>=at&&!taken.has(at)){shots.push({at,data:film.toDataURL('image/png').split(',')[1]});taken.add(at);}
  }
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return{base64:btoa(binary),frames,shots};
 });
 await writeFile(directory+'/skulls-in-motion.mp4',Buffer.from(result.base64,'base64'));delete result.base64;
 assert.deepEqual(result.shots.map(shot=>shot.at),[3,8,13,19]);
 for(const shot of result.shots)await writeFile(`${directory}/frame-${shot.at}.png`,Buffer.from(shot.data,'base64'));delete result.shots;
 const media=await page.evaluate(async directory=>{const video=document.createElement('video');video.src='/'+directory+'/skulls-in-motion.mp4';await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});video.currentTime=8;await new Promise(resolve=>video.onseeked=resolve);const c=document.createElement('canvas');c.width=1280;c.height=720;c.getContext('2d').drawImage(video,0,0);const frame=c.toDataURL('image/png').split(',')[1];video.currentTime=Math.max(0,video.duration-.25);await new Promise(resolve=>video.onseeked=resolve);c.getContext('2d').drawImage(video,0,0);return{duration:video.duration,width:video.videoWidth,height:video.videoHeight,frame,endFrame:c.toDataURL('image/png').split(',')[1]};},directory);
 await writeFile(directory+'/decoded-frame.png',Buffer.from(media.frame,'base64'));delete media.frame;await writeFile(directory+'/decoded-end.png',Buffer.from(media.endFrame,'base64'));delete media.endFrame;
 console.log('Decoded film',JSON.stringify({...media,frames:result.frames}));assert.ok(Number.isFinite(media.duration)&&media.duration>0);assert.equal(media.width,1280);assert.equal(media.height,720);assert.ok(result.frames>90);assert.deepEqual(errors,[]);
 await writeFile(directory+'/report.json',JSON.stringify({...result,media,errors},null,2));console.log(JSON.stringify({...result,media,errors}));
}finally{await browser.close();}
