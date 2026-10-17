import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
await mkdir('artifacts/remake-audio',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],oldRequests=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('Preview render error:',e.message)});page.on('request',r=>{if(r.url().includes('/original/devil-daggers/audio/'))oldRequests.push(r.url());});
 await page.route('**/enemy-chatter-gameplay*',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas><div id="label" style="position:fixed;top:20px;left:25px;color:#eee;font:18px system-ui;text-shadow:0 2px 4px black">Enemy location · stereo headphones</div></body>'}));
 await page.goto(base+'/enemy-chatter-gameplay'+(process.env.QUICK?'?.1':''));
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,STEP},{Sound},{REMAKE_AUDIO}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/audio.ts'),import('/src/remake-audio.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,screenShake:0,movementMotion:0,mist:false}),sound=new Sound();await game.prepare();await sound.start();
  for(const [name,asset] of Object.entries(REMAKE_AUDIO))if(!asset.role.endsWith('music'))await sound.load(name);
  const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:18};world.level=3;world.reserve=100;
  const {ENEMY_KINDS}=await import('/src/enemy-kinds.ts');let shown=-1,enemy;
  const destination=sound.context.createMediaStreamDestination();sound.master.connect(destination);
  const stream=game.renderer.domElement.captureStream(30),tracks=[...stream.getVideoTracks(),...destination.stream.getAudioTracks()],output=new MediaStream(tracks);
  const recorder=new MediaRecorder(output,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:3500000,audioBitsPerSecond:192000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();
  let last=performance.now(),accumulator=0,elapsed=0,nextSpawn=5,frames=0;const start=last;
  await new Promise(resolve=>{
   function frame(now){
    const dt=Math.min(.05,(now-last)/1000);last=now;elapsed=Math.max(0,(now-start)/1000);accumulator+=dt;
    const input={...idleInput(),yaw:0,pitch:.05};
    const index=Math.min(21,Math.floor(elapsed/(Number(location.search.slice(1))||3)));
    if(index!==shown){shown=index;world.enemies=[];world.effects=[];enemy=world.spawn(ENEMY_KINDS[index],{x:0,y:2,z:4});enemy.age=20;enemy.status='idle';}
    const phase=(elapsed%3)/3,angle=(phase-.5)*Math.PI*1.5,previous={...enemy.pos};enemy.pos={x:Math.sin(angle)*14,y:enemy.kind.startsWith('squid')?0:2,z:18-Math.cos(angle)*14};for(const segment of enemy.segments){segment.pos.x+=enemy.pos.x-previous.x;segment.pos.y+=enemy.pos.y-previous.y;segment.pos.z+=enemy.pos.z-previous.z;}enemy.age+=dt;world.time+=dt;
    document.querySelector('#label').textContent=`${index+1} / 22 · ${enemy.kind} · ${phase<.3?'LEFT':phase>.7?'RIGHT':'AHEAD'} · stereo headphones`;
    for(const effect of world.effects)sound.play(effect,world);world.effects=[];
    sound.listener(world.player.pos,input.yaw,input.pitch);sound.update(world);game.render(world,input.yaw,input.pitch,dt,false,1,null,false,false,input);frames++;
    if(elapsed<(Number(location.search.slice(1))||3)*22)requestAnimationFrame(frame);else resolve();
   }requestAnimationFrame(frame);
  });
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop()});sound.clear();tracks.forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:recorder.mimeType}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),frames,duration:elapsed,bytes:bytes.length,decoded:sound.diagnostics.loaded,failed:sound.diagnostics.failed};
 });
 await writeFile('artifacts/remake-audio/enemy-chatter-gameplay.webm',Buffer.from(result.base64,'base64'));delete result.base64;
 assert.deepEqual(result.failed,[]);assert.deepEqual(errors,[]);assert.deepEqual(oldRequests,[]);assert.ok(result.frames>100);
 await writeFile('artifacts/remake-audio/enemy-chatter-gameplay-report.json',JSON.stringify({...result,errors,oldRequests},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
