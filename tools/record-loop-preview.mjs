import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';

const ascentOnly=process.argv.includes('--ascent');
const directory=ascentOnly?'artifacts/ascent':'artifacts/escape';
await mkdir(directory,{recursive:true});
const ffmpeg=execFileSync('python3',['-c',"import sys; sys.path.insert(0,'/tmp/abyss-video-runtime'); import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"],{encoding:'utf8'}).trim();
const segments=ascentOnly?[{start:478,end:501,speed:1}]:[{start:0,end:472,speed:24},{start:472,end:482,speed:5},{start:482,end:498,speed:2},{start:498,end:510,speed:6},{start:510,end:579,speed:12}];
let duration=0;
for(const segment of segments){segment.at=duration;duration+=(segment.end-segment.start)/segment.speed;}
const fps=24,frames=Math.ceil(duration*fps),output=directory+(ascentOnly?'/ascent-real-time.mp4':'/endless-descent-preview.mp4');
const encoder=spawn(ffmpeg,['-hide_banner','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','ignore','pipe']});
let encodingLog='',count=0;
encoder.stderr.on('data',data=>encodingLog+=data);
const encoded=once(encoder,'close');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.exposeFunction('encodeLoopFrame',async data=>{
  if(!encoder.stdin.write(Buffer.from(data,'base64')))await once(encoder.stdin,'drain');
  count++;if(count%150===0)console.log(`Captured ${count}/${frames} frames`);
 });
 await page.route('**/endless-loop-capture',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas></body>'}));
 await page.goto('http://127.0.0.1:5173/endless-loop-capture');
 const audioTimeline=await page.evaluate(async({segments,duration,frames,fps,ascentOnly})=>{
  const [{GameRenderer},{World,v,idleInput},{environmentMix}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/environment-audio.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:85,skyMotion:'full',mist:true,screenShake:ascentOnly?35:0,movementMotion:0});await renderer.prepare();
  renderer.renderer.setPixelRatio(1);renderer.renderer.setSize(1280,720);renderer.composer.setPixelRatio(1);renderer.composer.setSize(1280,720);renderer.originalWeapon.resize(1280,720);
  const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,9);world.effects=[];
  for(const [kind,x,y,z] of [['squid',-10,3.3,-15],['spider',12,2,-15],['skull',-4,4,-10],['skull2',6,7,-15]]){
   const enemy=world.spawn(kind,v(x,y,z));enemy.age=20;enemy.headExposure=.7;
  }
  const film=document.createElement('canvas');film.width=1280;film.height=720;const paint=film.getContext('2d',{alpha:false});
  let previousTime=segments[0].start;const mix=[];
  for(let frame=0;frame<frames;frame++){
   const elapsed=Math.min(duration,frame/fps),segment=segments.findLast(s=>elapsed>=s.at),time=Math.min(segment.end,segment.start+(elapsed-segment.at)*segment.speed);
   world.time=time;world.tick=Math.round(time*120);world.rainHeavenGems(Math.max(0,time-previousTime));world.updateGems(idleInput(),Math.max(0,time-previousTime));previousTime=time;
   const smooth=(a,b,v)=>{const x=Math.max(0,Math.min(1,(v-a)/(b-a)));return x*x*(3-2*x);};
   const yaw=ascentOnly?0:.22+Math.sin(elapsed*.12)*.1;
   const pitch=ascentOnly?.2+1.0*smooth(484.5,486,time)*(1-smooth(488,490,time)):.34+Math.sin(elapsed*.16)*.06;
   mix.push({time:elapsed,gameTime:time,beds:environmentMix(time)});
   renderer.render(world,yaw,pitch,1/fps,false);
   paint.drawImage(renderer.renderer.domElement,0,0,1280,720);
   const phase=time%510,cycle=Math.floor(time/510)+1;
   const name=ascentOnly&&time>=482&&time<493?'ASCENT / ESCAPE VELOCITY':time>=510&&phase<18?'THE DESCENT BEGINS AGAIN':renderer.skyDiagnostics.chapter.toUpperCase();
   const gradient=paint.createLinearGradient(0,0,0,140);gradient.addColorStop(0,'rgba(2,4,10,.76)');gradient.addColorStop(1,'rgba(2,4,10,0)');paint.fillStyle=gradient;paint.fillRect(0,0,1280,140);
   paint.fillStyle='#b7becb';paint.font='12px system-ui';paint.fillText(`ABYSS / DAGGERS   ·   ENDLESS DESCENT   ·   CYCLE ${cycle}`,32,31);
   paint.fillStyle='#f3f1eb';paint.font='500 25px system-ui';paint.fillText(name,32,67);
   paint.fillStyle='#d5d7df';paint.font='14px system-ui';paint.fillText(`${Math.floor(time/60)}:${String(Math.floor(time%60)).padStart(2,'0')}   /   ${segment.speed}× speed`,32,94);
   paint.fillStyle='rgba(2,4,10,.55)';paint.fillRect(0,714,1280,6);paint.fillStyle='#d7c6a5';paint.fillRect(0,714,1280*elapsed/duration,6);
   await window.encodeLoopFrame(film.toDataURL('image/jpeg',.94).split(',')[1]);
  }
  return mix;
 },{segments,duration,frames,fps,ascentOnly});
 encoder.stdin.end();const [code]=await encoded;
 await writeFile(directory+'/preview-encode.log',encodingLog);
 if(code!==0||count!==frames||errors.length)throw Error(JSON.stringify({code,count,frames,errors,encodingLog:encodingLog.slice(-500)}));
 await writeFile(directory+'/preview-audio-timeline.json',JSON.stringify({duration,frames,fps,segments,output,mix:audioTimeline},null,2));
 await writeFile(directory+'/preview-timeline.json',JSON.stringify({duration,frames,fps,segments,output},null,2));
 console.log(`Finished ${output}: ${duration.toFixed(2)} seconds, ${frames} frames.`);
}finally{await browser.close();if(encoder.exitCode===null)encoder.kill();}
