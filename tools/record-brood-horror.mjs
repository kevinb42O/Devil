import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='artifacts/brood-horror';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/brood-film',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/brood-film');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput},{enemyFloorHeight}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-floor.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});await game.prepare();
  const world=new World(71,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:1.7,z:13};
  for(const [kind,x,z,age]of [['skull4',-6,-7,12],['transmuted4',6,-10,12],['spider',-17,-17,12],['spider2',21,-28,12],['egg',-2,7,8],['egg2',3,6,6]]){
   const e=world.spawn(kind,{x,y:1,z});e.age=age;e.headExposure=1;e.facingYaw=0;e.vel={x:0,y:0,z:0};
   e.pos.y=kind.startsWith('spider')?2.7*e.size*.62:enemyFloorHeight(e,world.time)+e.radius+.02;
  }
  const canvas=game.renderer.domElement,input=idleInput(),camera={x:0,y:2.7,z:20},shots=[];let frames=0,step=0;
  game.render(world,0,-.06,0,false,1,camera,false,false,input);game.renderer.getContext().finish();
  const stream=canvas.captureStream(30),mime='video/mp4;codecs=avc1.640028';if(!MediaRecorder.isTypeSupported(mime))throw Error('H264 unsupported');
  const chunks=[],recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:10000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(500);
  const began=performance.now();
  while(true){
   await new Promise(requestAnimationFrame);const elapsed=(performance.now()-began)/1000;if(elapsed>=9)break;
   while(step<Math.floor(elapsed*120)){world.step(input);world.effects=[];step++;}
   game.render(world,0,-.06,1/60,false,1,camera,false,false,input);frames++;
   if((!shots.length&&elapsed>.1)||(shots.length===1&&elapsed>3)||(shots.length===2&&elapsed>6))shots.push(canvas.toDataURL('image/png').split(',')[1]);
  }
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=32768)data+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(data),frames,step,shots,hatchlings:world.enemies.filter(e=>e.kind==='spiderling').length,remainingEggs:world.enemies.filter(e=>(e.kind==='egg'||e.kind==='egg2')&&e.hp>0).length};
 });
 await writeFile(`${output}/brood-in-motion.mp4`,Buffer.from(result.base64,'base64'));delete result.base64;
 for(let i=0;i<result.shots.length;i++)await writeFile(`${output}/film-${['start','hatch','end'][i]}.png`,Buffer.from(result.shots[i],'base64'));delete result.shots;
 assert.ok(result.frames>30&&result.step>900);assert.ok(result.hatchlings>=10);assert.equal(result.remainingEggs,0);assert.deepEqual(errors,[]);
 const media=await page.evaluate(async()=>{
  const video=document.createElement('video');video.src='/artifacts/brood-horror/brood-in-motion.mp4';await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});video.currentTime=Math.max(.1,video.duration-.2);await new Promise(resolve=>video.onseeked=resolve);
  const c=document.createElement('canvas');c.width=1280;c.height=800;c.getContext('2d').drawImage(video,0,0);return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,end:c.toDataURL('image/png').split(',')[1]};
 });await writeFile(`${output}/film-decoded-end.png`,Buffer.from(media.end,'base64'));delete media.end;assert.equal(media.width,1280);assert.equal(media.height,800);
 await writeFile(`${output}/film-report.json`,JSON.stringify({...result,media,errors},null,2));console.log(JSON.stringify({...result,media,errors}));
}finally{await browser.close();}
