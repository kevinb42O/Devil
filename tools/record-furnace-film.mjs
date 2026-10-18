import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='artifacts/furnace-film';await mkdir(directory,{recursive:true});
const short=process.argv.includes('--short');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/furnace-film-preview',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black;overflow:hidden"><canvas id="game"></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/furnace-film-preview');
 const result=await page.evaluate(async short=>{
  const [{GameRenderer},{World,v,idleInput},{EnvironmentAudio},{floorHeight}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/environment-audio.ts'),import('/src/arena.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:77,mist:true,movementMotion:0,screenShake:0});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,2,8);
  const tower=world.spawn('squid',v(-12,3.3,-10));tower.age=16;tower.nextSpawn=Infinity;world.effects=[];
  const context=new AudioContext();await context.resume();
  const master=context.createGain();master.gain.value=.7;master.connect(context.destination);
  const destination=context.createMediaStreamDestination(),meter=context.createAnalyser(),previewLevel=context.createGain();previewLevel.gain.value=3.2;master.connect(previewLevel);previewLevel.connect(destination);master.connect(meter);meter.fftSize=4096;
  const ambience=new EnvironmentAudio(context,master);
  // Same chapter mixer and audio files as gameplay. Only the edit has a short dip between shots.
  const shots=short?[
   {title:'FURNACE / SURFACE STUDY',detail:'LIVE GAME RENDER · GAME AMBIENCE',start:300,duration:8,type:'macro'},
  ]:[
   {title:'I / INTO THE FURNACE',detail:'THE VEIL → FIRE · REAL-TIME TRANSITION',start:237,duration:27,type:'arrival'},
   {title:'II / HEAT IN THE STONE',detail:'RADIANT WARMTH · HEAT SHIMMER',start:300,duration:8,type:'macro'},
   {title:'III / THE BURNING ABYSS',detail:'FIRE BEYOND THE PLATFORM · CLEAR PLAYABLE FLOOR',start:310,duration:8,type:'wide'},
   {title:'IV / THE FIRE RECEDES',detail:'FURNACE → CATHEDRAL · REAL-TIME TRANSITION',start:359,duration:27,type:'clear'},
  ];
  const preview=document.createElement('canvas');preview.width=1280;preview.height=720;const paint=preview.getContext('2d',{alpha:false});
  const stream=new MediaStream([...preview.captureStream(30).getVideoTracks(),...destination.stream.getAudioTracks()]);
  const mime='video/mp4;codecs=avc1.640028,mp4a.40.2';assertSupported();
  function assertSupported(){if(!MediaRecorder.isTypeSupported(mime))throw Error('MP4/H.264 recording unavailable');}
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000,audioBitsPerSecond:192000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const samples=new Float32Array(4096),audioStats=[],timings=[];
  let frames=0,previous=performance.now(),shotIndex=0,shotStarted=previous,lastSample=-1;
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  const place=(shot,elapsed)=>{
   let x=0,z=8,y=1.8,yaw=0,pitch=-.14;
   if(shot.type==='arrival'){x=1.2*Math.sin(elapsed*.055);z=8-elapsed*.07;y=1.7;pitch=-.1-elapsed*.002;}
   if(shot.type==='storm'){x=-2+elapsed*.14;z=9-elapsed*.13;y=1.6;pitch=-.12-elapsed*.004;}
   if(shot.type==='wide'){x=5*Math.sin(elapsed*.055);z=40;y=23;pitch=-.55;yaw=elapsed*.008;}
   if(shot.type==='macro'){x=-6+elapsed*.13;z=3-elapsed*.15;y=1.1;pitch=-.30;yaw=-.04+elapsed*.012;}
   if(shot.type==='clear'){x=1-elapsed*.08;z=7-elapsed*.09;y=1.5;pitch=-.12-elapsed*.003;}
   const ground=floorHeight(x,z,world.time,0);return {position:v(x,Math.max(ground+.22,y),z),yaw,pitch};
  };
  // Start with real samples available; recording never begins on a silent loading frame.
  for(const shot of shots){ambience.update(shot.start,.02);await new Promise(resolve=>setTimeout(resolve,500));}
  ambience.stop();ambience.update(shots[0].start,.02);await new Promise(resolve=>setTimeout(resolve,500));
  recorder.start(1000);previous=shotStarted=performance.now();
  await new Promise((resolve,reject)=>{
   const frame=now=>{try{
    const dt=Math.min(.05,(now-previous)/1000);previous=now;let elapsed=(now-shotStarted)/1000;
    if(elapsed>=shots[shotIndex].duration){timings.push({title:shots[shotIndex].title,duration:elapsed});shotIndex++;shotStarted=now;elapsed=0;if(shotIndex===shots.length){resolve();return;}}
    const shot=shots[shotIndex];world.time=shot.start+elapsed;world.tick=Math.round(world.time*120);
    const camera=place(shot,elapsed);ambience.update(world.time,dt);
    const fade=Math.min(ease(elapsed/.55),ease((shot.duration-elapsed)/.55));master.gain.value=.7*fade;
    renderer.render(world,camera.yaw,camera.pitch,dt,false,1,camera.position,false,false,idleInput());
    paint.globalAlpha=1;paint.fillStyle='#000';paint.fillRect(0,0,1280,720);paint.globalAlpha=fade;paint.drawImage(renderer.renderer.domElement,0,0,1280,720);
    paint.fillStyle='#05090d';paint.fillRect(0,0,1280,34);paint.fillRect(0,650,1280,70);
    paint.fillStyle='#e0e8ef';paint.font='500 16px sans-serif';paint.letterSpacing='2px';paint.fillText(shot.title,34,680);
    paint.font='10px sans-serif';paint.fillStyle='#899aa8';paint.fillText(shot.detail,34,700);
    paint.textAlign='right';paint.fillText('ABYSS / DESCENT',1246,680);paint.fillText('MATCH CLOCK '+world.time.toFixed(1)+'s',1246,700);paint.textAlign='left';paint.globalAlpha=1;
    frames++;
    const second=Math.floor(elapsed);
    if(second!==lastSample){lastSample=second;meter.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);audioStats.push({shot:shotIndex,elapsed,worldTime:world.time,rms,furnace:renderer.furnace.diagnostics.fire});}
    requestAnimationFrame(frame);
   }catch(error){reject(error);}};requestAnimationFrame(frame);
  });
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});ambience.stop();stream.getTracks().forEach(t=>t.stop());await context.close();
  const blob=new Blob(chunks,{type:mime}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),bytes:bytes.length,frames,shots:timings,audioStats,audioFailures:ambience.diagnostics.failed,previewGainDb:20*Math.log10(3.2)};
 },short);
 const name=short?'surface-study.mp4':'descent-furnace-film-v2.mp4';await writeFile(directory+'/'+name,Buffer.from(result.base64,'base64'));delete result.base64;
 assert.deepEqual(errors,[]);assert.deepEqual(result.audioFailures,[]);assert.ok(result.audioStats.some(s=>s.rms>.001),'recorded audio is audible');
 await writeFile(directory+'/'+(short?'study':'film')+'-report.json',JSON.stringify({...result,errors},null,2));
 await page.screenshot({path:directory+'/capture-page.png'});console.log({name,bytes:result.bytes,frames:result.frames,shots:result.shots,audioSamples:result.audioStats.length});
}finally{await browser.close();}
