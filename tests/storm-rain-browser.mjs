import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/storm-rain';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'high',fov:85,mist:true});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,2,7);
  for(const [kind,x,y,z]of [['squid',-9,3.3,-12],['skull',-3,3,-6],['skull2',5,6,-9]]){const e=world.spawn(kind,v(x,y,z));e.age=10;}
  world.effects=[];window.rainFixture={renderer,world};
  window.captureRain=(time,enabled=true,pitch=-.20)=>{world.time=time;renderer.render(world,0,pitch,0,false);if(!enabled){renderer.stormRain.update(renderer.camera,time,false);renderer.composer.render();}
   const gl=renderer.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   return {pixels,diagnostics:renderer.stormRain.diagnostics,calls:renderer.renderer.info.render.calls,triangles:renderer.renderer.info.render.triangles};};
 });
 const result=await page.evaluate(()=>{
  const diff=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
  const dry=captureRain(45),wet=captureRain(90),pause=captureRain(90),disabled=captureRain(90,false),moving=captureRain(90.15);
  const motion=diff(wet.pixels,moving.pixels),surface=diff(wet.pixels,disabled.pixels),frozen=diff(wet.pixels,pause.pixels);
  const again=captureRain(90);captureRain(180);const rewind=captureRain(90);
  const renderer=rainFixture.renderer,gl=renderer.renderer.getContext();
  const measure=enabled=>{const samples=[];let calls=0;
   for(let i=0;i<20;i++){renderer.stormRain.update(renderer.camera,90+i*.02,enabled);renderer.renderer.info.reset();const started=performance.now();renderer.composer.render();gl.finish();if(i>=5)samples.push(performance.now()-started);calls=renderer.renderer.info.render.calls;}
   samples.sort((a,b)=>a-b);return {calls,medianMs:samples[Math.floor(samples.length/2)]};
  };
  const baseline=measure(false),rain=measure(true);
  rainFixture.renderer.configure({quality:'low',fov:85,skyMotion:'reduced'});const low=captureRain(90);const outside=captureRain(270);
  return {dry:dry.diagnostics,wet:wet.diagnostics,low:low.diagnostics,outside:outside.diagnostics,motion,surface,frozen,rewind:diff(again.pixels,rewind.pixels),extraCalls:rain.calls-baseline.calls,performance:{baseline,rain}};
 });
 assert.equal(result.dry.rain,0);assert.equal(result.wet.rain,1);assert.equal(result.wet.wetness,1);assert.equal(result.low.instances,3000);assert.equal(result.low.streaks,false);
 assert.equal(result.outside.rain,0);assert.equal(result.outside.wetness,0);
 assert.ok(result.motion>.01,'rain visibly moves');assert.ok(result.surface>.15,'rain and wet surfaces visibly change the scene');assert.equal(result.frozen,0,'paused rain does not move');assert.equal(result.rewind,0,'replay scrub restores the same rain');assert.equal(result.extraCalls,3,'bounded three-draw-call weather');
 for(const [name,time,pitch,quality] of [['arrival',60,-.12,'high'],['storm',90,-.18,'high'],['puddles',90,-.65,'high'],['drying',180,-.4,'high'],['low',90,-.25,'low']]){
  await page.evaluate(({time,pitch,quality})=>{rainFixture.renderer.configure({quality,fov:85});captureRain(time,true,pitch);},{time,pitch,quality});await page.screenshot({path:`${dir}/${name}.png`});
 }
 assert.deepEqual(errors,[]);writeFileSync(`${dir}/report.json`,JSON.stringify(result,null,2));console.log('Storm rain render checks passed:',result);
}finally{await browser.close();}
