import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.route('**/cosmic-haze-film',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;overflow:hidden;background:black"><canvas id="game"></canvas></body>'}));
 await page.goto('http://127.0.0.1:5173/cosmic-haze-film');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:85,mist:true,movementMotion:0,screenShake:0});await r.prepare();
  const w=new World(17,{schedule:false,invulnerable:true});w.player.pos=v(0,2,7);
  for(const [kind,x,y,z]of [['squid',-9,3.3,-12],['skull',-3,3,-6],['skull2',5,6,-9]]){const e=w.spawn(kind,v(x,y,z));e.age=10;}w.effects=[];
  w.time=3;r.render(w,0,-.12,0,false);
  const mp4='video/mp4;codecs=avc1.640028',type=MediaRecorder.isTypeSupported(mp4)?mp4:'video/webm;codecs=vp9';
  const stream=r.renderer.domElement.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:6500000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  const started=performance.now();let last=started,frames=0;
  await new Promise(resolve=>{const frame=now=>{const elapsed=(now-started)/1000,dt=(now-last)/1000;last=now;
   w.time=3+Math.min(12,elapsed)*1.5;w.player.pos=v(Math.sin(elapsed*.13)*3,2,7-elapsed*.12);
   r.render(w,Math.sin(elapsed*.17)*.07,-.12+Math.sin(elapsed*.2)*.035,dt,false);frames++;
   if(elapsed>=12)resolve();else requestAnimationFrame(frame);
  };requestAnimationFrame(frame);});
  recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),extension:type.startsWith('video/mp4')?'mp4':'webm',frames};
 });
 const path=`artifacts/cosmic-haze/nebula-motion.${result.extension}`;await writeFile(path,Buffer.from(result.base64,'base64'));console.log(JSON.stringify({path,frames:result.frames}));
}finally{await browser.close();}
