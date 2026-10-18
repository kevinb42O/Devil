import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';

const directory='artifacts/blood-liquid';await mkdir(directory,{recursive:true});
const python='/Users/kevin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const ffmpeg=execFileSync(python,['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true});world.player.pos=v(0,4,3.7);
  window.preview={world,renderer,v};
 });
 const encoder=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',`${directory}/liquid-motion.mp4`],{stdio:['pipe','ignore','pipe']});
 let encoderError='';encoder.stderr.on('data',data=>encoderError+=data);
 const completed=once(encoder,'close');
 const measurements=[];
 // Three lighting environments, shown at quarter speed for the liquid breakup.
 for(const [label,base]of [['cosmic',5],['furnace',305],['cathedral',415]]){
  await page.evaluate(base=>{
   const {world,renderer,v}=preview;renderer.clear();world.time=base;
   renderer.blood.effect({kind:'kill',bloodId:777,enemyId:1,pos:v(0,3,0),amount:2,direction:v(.35,.05,-1)},world);
  },base);
  for(let frame=0;frame<90;frame++){
   const sample=await page.evaluate(({base,frame})=>{
    const {world,renderer}=preview;world.time=base+frame/120;
    const start=performance.now();renderer.render(world,0,-.25,0,false);
    return {ms:performance.now()-start,...renderer.blood.diagnostics,triangles:renderer.renderer.info.render.triangles};
   },{base,frame});
   if(frame===18){await page.screenshot({path:`${directory}/volume-${label}.png`});measurements.push({label,...sample});}
   const bytes=await page.screenshot({type:'jpeg',quality:92});
   if(!encoder.stdin.write(bytes))await once(encoder.stdin,'drain');
  }
 }
 encoder.stdin.end();const [code]=await completed;if(code!==0)throw Error(encoderError);
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(`${directory}/motion-audit.json`,JSON.stringify({playbackSpeed:.25,measurements,errors},null,2)+'\n');
 console.log(JSON.stringify({preview:`${directory}/liquid-motion.mp4`,measurements,errors}));
}finally{await browser.close();}
