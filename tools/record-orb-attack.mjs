import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='artifacts/orb-attack';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];let encoded=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/orb-motion-film',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black;overflow:hidden"><canvas></canvas>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/orb-motion-film');
 const result=await page.evaluate(async poleStudy=>{
  const [{GameRenderer},{World,idleInput,STEP},THREE]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const canvas=document.querySelector('canvas'),game=new GameRenderer(canvas,{quality:'high',fov:58,mist:true,skyMotion:'reduced',screenShake:0,movementMotion:0});await game.prepare();
  game.renderer.setSize(1280,720);
  const world=new World(71,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:2.1,z:12};
  const orb=world.spawn('orb',{x:0,y:3.3,z:0},false);orb.age=12;orb.activeAt=0;orb.nextBeckon=13;world.effects=[];
  for(const [x,z] of [[-6,1],[6,-4],[-12,-6],[13,3],[-19,7],[21,-9]]){const e=world.spawn('skull2',{x,y:2,z},false);e.age=20;}
  let simulated=0;
  const canvas2=document.createElement('canvas');canvas2.width=1280;canvas2.height=720;const paint=canvas2.getContext('2d',{alpha:false});
  const mime='video/mp4;codecs=avc1.640028';if(!MediaRecorder.isTypeSupported(mime))throw Error('H264 recording unsupported');
  const stream=canvas2.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:14000000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  game.render(world,0,.10,1/30,false,1,{x:0,y:2.1,z:12},false,false,idleInput());
  const snapshots=[],poses=[];const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  let lightsBefore=0,firstPose,lastPose;
  let frames=0;recorder.start(500);const began=performance.now();
  for(let frame=0;;frame++){
   await new Promise(requestAnimationFrame);const t=(performance.now()-began)/1000;if(t>=16)break;frames++;
   while(simulated+STEP<=t){world.step(idleInput(),STEP);simulated+=STEP;}
   world.effects=[];
   // First six seconds hold the camera still, clearly showing the sphere's spin.
   // Then approach and arc gently to reveal the counterflow and polar vortex.
   const arc=ease((t-8)/8)*.18,position={x:Math.sin(arc)*29,y:10,z:Math.cos(arc)*29};
   const yaw=arc,pitch=Math.atan2(1.5-position.y,29);
   world.player.pos={x:0,y:1.7,z:26};game.render(world,yaw,pitch,1/60,false,1,position,false,false,idleInput());
   const model=game.enemies.get(orb.id),heart=model.getObjectByName('rift-heart');
   if(frame===0){firstPose=heart.quaternion.toArray();game.scene.traverse(o=>{if(o.isLight)lightsBefore++;});}
   lastPose=heart.quaternion.toArray();
   paint.drawImage(canvas,0,0,1280,720);
   if([90,240,420].includes(frame))snapshots.push({time:t,data:canvas2.toDataURL('image/png').split(',')[1]});
   if(frame%60===0)poses.push({time:t,position:orb.pos,rotation:heart.quaternion.toArray(),camera:position,waves:world.rings.length,transmuted:world.stats.transmuted});

  }
  let lightsAfter=0;game.scene.traverse(o=>{if(o.isLight)lightsAfter++;});
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),frames,duration:16,width:1280,height:720,firstPose,lastPose,lightsBefore,lightsAfter,poses,snapshots};
 },process.env.ORB_POLE_STUDY==='1');
 await writeFile(directory+'/orb-attack.mp4',Buffer.from(result.base64,'base64'));delete result.base64;encoded=result.frames;assert.ok(encoded>160);assert.deepEqual(errors,[]);assert.equal(result.lightsBefore,result.lightsAfter);assert.notDeepEqual(result.firstPose,result.lastPose);
 for(const shot of result.snapshots)await writeFile(`${directory}/motion-${shot.time}.png`,Buffer.from(shot.data,'base64'));delete result.snapshots;
 // Decode the deliverable itself, then inspect frames from the actual MP4.
 const media=await page.evaluate(async directory=>{
  const video=document.createElement('video');video.src='/'+directory+'/orb-attack.mp4';video.preload='auto';
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('MP4 failed to decode'));});
  window.orbVideo=video;return {duration:video.duration,width:video.videoWidth,height:video.videoHeight};
 },directory);
 assert.ok(Math.abs(media.duration-16)<.5);assert.equal(media.width,1280);assert.equal(media.height,720);
 for(const t of [2,5,12]){
  const data=await page.evaluate(async t=>{const v=window.orbVideo;v.currentTime=t;await new Promise(resolve=>v.onseeked=resolve);const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png').split(',')[1];},t);
  await writeFile(`${directory}/video-frame-${t}.png`,Buffer.from(data,'base64'));
 }
 await writeFile(directory+'/motion-report.json',JSON.stringify({...result,media,encoded,errors},null,2));console.log(JSON.stringify({frames:encoded,media,errors}));
}finally{await browser.close();}
