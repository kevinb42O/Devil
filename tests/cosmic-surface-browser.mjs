import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/cosmic-surface';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const r=new GameRenderer(canvas,{quality:'high',fov:85,mist:true});await r.prepare();
  const w=new World(17,{schedule:false,invulnerable:true});w.player.pos=v(0,2,7);
  for(const [kind,x,y,z]of [['squid',-9,3.3,-12],['skull',-3,3,-6],['skull2',5,6,-9]]){const e=w.spawn(kind,v(x,y,z));e.age=10;}
  w.effects=[];window.spaceFixture={r,w};
  window.captureSpace=(time,pitch=-.2,enabled=true)=>{w.time=time;r.render(w,0,pitch,0,false);if(!enabled){r.cosmicEnvironment.update(r.camera,time,false);r.composer.render();r.originalWeapon.render(r.renderer,false);}
   const gl=r.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   return {pixels,diagnostics:r.cosmicEnvironment.diagnostics};};
 });
 for(const [name,time,pitch]of [['orbit',8,-.12],['mineral',8,-.7],['planet',8,.4],['shooting-stars',12,.45],['transition',26,-.2],['storm',90,-.2]]){await page.evaluate(({time,pitch})=>captureSpace(time,pitch),{time,pitch});await page.screenshot({path:`${dir}/${name}.png`});}
 const result=await page.evaluate(()=>{
  const diff=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
  const on=captureSpace(8),paused=captureSpace(8),off=captureSpace(8,-.2,false),motion=captureSpace(9);captureSpace(25);const rewind=captureSpace(8);
  const r=spaceFixture.r,gl=r.renderer.getContext();
  const measure=enabled=>{const samples=[];let calls=0;for(let i=0;i<14;i++){captureSpace(8+i*.02,-.2,enabled);r.renderer.info.reset();const t=performance.now();r.composer.render();gl.finish();if(i>=4)samples.push(performance.now()-t);calls=r.renderer.info.render.calls;}samples.sort((a,b)=>a-b);return {calls,medianMs:samples[Math.floor(samples.length/2)]};};
  const baseline=measure(false),cosmic=measure(true);
  const storm=captureSpace(90),stormDisabled=captureSpace(90,-.2,false);
  r.configure({quality:'low',fov:85,skyMotion:'reduced'});const low=captureSpace(8);
  // Hold the rest of the scene fixed to test this effect's reduced-motion path.
  const read=()=>{r.composer.render();r.originalWeapon.render(r.renderer,false);const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  r.cosmicEnvironment.update(r.camera,15);const reducedPixels=read(),reducedClock=r.cosmicEnvironment.diagnostics.clock;
  const outside=captureSpace(30);
  r.configure({quality:'high',fov:85,skyMotion:'reduced'});captureSpace(8);const reducedHighMeteors=r.cosmicEnvironment.diagnostics.meteors;
  r.configure({quality:'high',fov:85});
  const meteor=r.cosmicEnvironment.group.getObjectByName('orbital-shooting-stars'),seeds=meteor.geometry.getAttribute('meteorSeed');
  const dx=seeds.getX(0)-14.4-r.camera.position.x,dy=seeds.getY(0)-3.75-r.camera.position.y,dz=seeds.getZ(0)+1.7-r.camera.position.z;
  spaceFixture.w.time=3.+seeds.getW(0)*23.;r.render(spaceFixture.w,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)),0,false);
  const withMeteor=read();meteor.visible=false;const withoutMeteor=read();meteor.visible=true;
  return {meteorDifference:diff(withMeteor,withoutMeteor),active:on.diagnostics,low:low.diagnostics,outside:outside.diagnostics,difference:diff(on.pixels,off.pixels),motion:diff(on.pixels,motion.pixels),paused:diff(on.pixels,paused.pixels),rewind:diff(on.pixels,rewind.pixels),reducedClock,reducedDifference:diff(low.pixels,reducedPixels),reducedHighMeteors,laterEnvironmentDifference:diff(storm.pixels,stormDisabled.pixels),extraCalls:cosmic.calls-baseline.calls,performance:{baseline,cosmic}};
 });
 assert.ok(result.meteorDifference>.00001,'shooting stars contribute visible pixels');assert.ok(result.difference>.3);assert.ok(result.motion>.01);assert.equal(result.paused,0);assert.equal(result.rewind,0);assert.equal(result.extraCalls,7);assert.equal(result.low.fragments,72);assert.equal(result.low.dust,220);assert.equal(result.low.meteors,false);assert.equal(result.reducedHighMeteors,false);assert.equal(result.reducedClock,0);assert.equal(result.reducedDifference,0);assert.equal(result.laterEnvironmentDifference,0);assert.equal(result.outside.visible,false);assert.deepEqual(errors,[]);
 writeFileSync(`${dir}/report.json`,JSON.stringify({...result,errors},null,2));console.log(result);
}finally{await browser.close();}
