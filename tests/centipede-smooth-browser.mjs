import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('artifacts/centipede',{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600},recordVideo:{dir:'artifacts/centipede/video-tmp',size:{width:960,height:600}}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalEnemies);
 const report=await page.evaluate(async()=>{
  const {World,v,idleInput,STEP}=await import('/src/simulation.ts');const {GameRenderer}=await import('/src/renderer.ts');const {CENTIPEDE_TUNING:t}=await import('/src/centipede-motion.ts');
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:9999;width:100%;height:100%';document.body.append(canvas);
  const r=new GameRenderer(canvas,{quality:'low',fov:75});await r.prepare();
  const w=new World(32,{schedule:false}),e=w.spawn('centipede',v(0,3,14));w.player.pos=v(0,1.7,0);
  e.age=10;e.status='hunting';e.statusUntil=30;e.nextMove=6;e.pos=v(0,3,14);e.vel=v(0,0,-t.speed);e.segments.forEach((s,i)=>s.pos=v(0,3,14+(i+1)*t.spacing));
  const passed=new Set(),points=[];let peak=0;
  // Fixed side view exposes the rise, safe scraping position and dive in one shot.
  const camera=v(19,9,7),target=v(0,3,-1),yaw=Math.atan2(camera.x-target.x,camera.z-target.z),pitch=Math.atan2(target.y-camera.y,Math.hypot(target.x-camera.x,target.z-camera.z));
  for(let frame=0;frame<600;frame++){
   for(let tick=0;tick<2;tick++){
    const previous=e.segments.map(s=>s.pos.z);w.effects=[];w.step(idleInput());
    for(const f of w.effects)r.effect(f,w,yaw,pitch);
    e.segments.forEach((s,i)=>{if(previous[i]>0&&s.pos.z<=0)passed.add(i);});
   }
   peak=Math.max(peak,e.pos.y);if(frame%30===0)points.push({time:(frame+1)/60,head:{...e.pos},stage:e.centipedeMotion.stage});
   r.render(w,yaw,pitch,1/60,false,1,camera);await new Promise(requestAnimationFrame);
  }
  return {state:w.state,peak,passedGems:passed.size,points};
 });
 assert.equal(report.state,'playing');assert.equal(report.passedGems,25);assert.ok(report.peak>=7);assert.deepEqual(errors,[]);
 await page.screenshot({path:'artifacts/centipede/smooth-pass-final.png'});await page.close();await page.video().saveAs('artifacts/centipede/smooth-pass.webm');writeFileSync('artifacts/centipede/smooth-pass-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({state:report.state,peak:report.peak,passedGems:report.passedGems}));
}finally{await browser.close();}
