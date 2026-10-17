import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='artifacts/emergence-audio';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/emergence-preview',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#080808"><canvas></canvas><div id="label" style="position:fixed;left:28px;top:24px;color:#eee;font:20px system-ui;text-shadow:0 2px 4px black"></div></body>'}));
 await page.goto('http://127.0.0.1:5173/emergence-preview');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,STEP},{Sound}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/audio.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,screenShake:0,movementMotion:0,mist:false}),sound=new Sound();await game.prepare();await sound.start();await sound.warmEmergences();
  const destination=sound.context.createMediaStreamDestination();sound.master.connect(destination);
  const stream=new MediaStream([...game.renderer.domElement.captureStream(30).getVideoTracks(),...destination.stream.getAudioTracks()]);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:3000000,audioBitsPerSecond:192000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
  const kinds=['squid','squid2','squid3'];let index=-1,world,elapsed=0,last=performance.now(),accumulator=0,frames=0;const start=last,events=[];
  await new Promise((resolve,reject)=>{
   function frame(now){try{
    const dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;elapsed=Math.max(0,(now-start)/1000);const scene=Math.floor(elapsed/6);
    if(scene>=kinds.length){resolve();return;}
    if(scene!==index){
     index=scene;sound.clear();world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:18};world.enemies=[];world.effects=[];
     const enemy=world.spawn(kinds[scene],{x:0,y:3,z:0});enemy.nextSpawn=Infinity;world.effects[0].pos={...enemy.pos};
     document.querySelector('#label').textContent=['TOWER I · fractured stone and gravel','TOWER II · masonry strain and falling grit','TOWER III · deep earth heave and slab fracture'][scene];
     sound.listener(world.player.pos,0,.1);for(const e of world.effects){sound.play(e,world);events.push({kind:e.enemy,sound:sound.diagnostics.oneShotNames});}world.effects=[];accumulator=0;
    }
    accumulator+=dt;while(accumulator>=STEP){world.step(idleInput());world.effects=[];accumulator-=STEP;}
    sound.listener(world.player.pos,0,.1);sound.update(world);game.render(world,0,.1,dt,false,1,null,false,false,idleInput());frames++;requestAnimationFrame(frame);
   }catch(error){reject(error);}}requestAnimationFrame(frame);
  });
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});sound.clear();stream.getTracks().forEach(t=>t.stop());await sound.context.close();
  const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),frames,duration:elapsed,events,bytes:bytes.length};
 });
 await page.screenshot({path:output+'/tower-preview.png'});await writeFile(output+'/tower-emergence-gameplay.webm',Buffer.from(result.base64,'base64'));delete result.base64;
 assert.deepEqual(errors,[]);assert(result.frames>100);await writeFile(output+'/preview-report.json',JSON.stringify({...result,errors},null,2));console.log(result);
}finally{await browser.close();}
