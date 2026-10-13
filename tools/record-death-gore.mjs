import {chromium} from '@playwright/test';
import {existsSync,mkdirSync} from 'node:fs';
const frames=process.argv[2]||'/tmp/death-gore-frames';mkdirSync(frames,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{World,v},{DeathHistory},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/death-analysis.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:9999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'high',fov:80});await renderer.prepare();
  const w=new World(1,{schedule:false}),h=new DeathHistory(),e=w.spawn('skull',v(0,1.7,0));e.age=12;w.player.pos=v(0,1.7,1);
  h.capture(w,0,0,true);w.time=1/30;w.tick=4;w.die('contact',e);h.capture(w,0,0,true);
  const a=h.clip(w.deathSource);a.sample(a.duration);
  window.recordGore=frame=>{
   const time=frame/25-.6,impact=time>=0,age=Math.max(0,Math.min(1.8,time));
   renderer.setDeathGhost(a.view.player.pos,a.victimYaw,impact,age,a.end);
   renderer.render(a.view,a.camera.yaw,a.camera.pitch,0,false,1,a.camera.position);
  };
 });
 for(let frame=0;frame<75;frame++){
  await page.evaluate(frame=>window.recordGore(frame),frame);
  await page.screenshot({path:`${frames}/${String(frame).padStart(3,'0')}.png`});
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log(`Recorded 75 frames at 25 fps into ${frames}`);
}finally{await browser.close();}
