import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/opening-mist';await mkdir(directory,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const canvas=document.createElement('canvas');document.body.append(canvas);canvas.style.cssText='position:fixed;inset:0;z-index:999999';
  const renderer=new GameRenderer(canvas,{quality:'high',fov:90});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});
  window.mistAudit={renderer,world};
 });
 const results=[];
 for(const quality of ['high','low']){
  for(const [name,time,entrance,pitch] of [['entrance',0,true,.16],['arena',0,false,.16],['fading',19,false,.16],['cloud-arrival',30,false,.16],['above',0,false,-1.1]]){
   const sample=await page.evaluate(({quality,name,time,entrance,pitch})=>{
    const {renderer:r,world:w}=window.mistAudit;w.time=time;w.player.pos={x:0,y:name==='above'?8:1.7,z:entrance?0:9};
    r.configure({quality,fov:90,skyMotion:'full'});
    const draw=()=>r.render(w,0,pitch,0,false,1,null,false,entrance);
    draw();const mist={...r.openingMist.diagnostics};
    const gl=r.renderer.getContext();
    const read=()=>{const b=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
    const on=read();r.openingMist.enabled=false;const pass=r.composer.passes[0];pass.scene=entrance?r.entrance.scene:r.scene;r.composer.render();pass.scene=r.scene;if(!entrance)r.originalWeapon.render(r.renderer,false);const off=read();
    let difference=0;for(let i=0;i<on.length;i+=4)difference+=Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2]);
    draw();
    const times=[];for(let i=0;i<12;i++){const start=performance.now();draw();gl.finish();if(i>=4)times.push(performance.now()-start);}
    return {mist,meanDifference:difference/(on.length*.75),fencedMs:times.sort((a,b)=>a-b)[4],glError:gl.getError(),calls:r.renderer.info.render.calls};
   },{quality,name,time,entrance,pitch});
   assert.equal(sample.glError,0);assert.equal(sample.mist.enabled,true);
   assert.ok(sample.meanDifference>.05,`${name}: mist must change the image`);
   results.push({quality,name,...sample});await page.screenshot({path:`${directory}/${name}-${quality}.png`});
  }
 }
 const depth=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {renderer:r,world:w}=window.mistAudit;r.configure({quality:'low',fov:90});
  const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial({color:0xffffff});
  const blocker=new THREE.Mesh(new THREE.PlaneGeometry(10,10),material);scene.add(blocker);
  r.camera.position.set(0,1.7,0);r.camera.rotation.set(0,0,0);w.time=0;
  const pass=r.composer.passes[0],samples=[];
  const gl=r.renderer.getContext(),pixels=new Uint8Array(4);
  for(const distance of [.13,20]){
   blocker.position.set(0,1.7,-distance);pass.scene=scene;r.openingMist.update(r.camera,0);r.composer.render();
   gl.readPixels(gl.drawingBufferWidth/2,gl.drawingBufferHeight/2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const on=[...pixels];
   r.openingMist.enabled=false;r.composer.render();gl.readPixels(gl.drawingBufferWidth/2,gl.drawingBufferHeight/2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   samples.push(on.slice(0,3).reduce((sum,n,i)=>sum+Math.abs(n-pixels[i]),0));
  }
  pass.scene=r.scene;blocker.geometry.dispose();material.dispose();return {nearDifference:samples[0],farDifference:samples[1]};
 });
 assert.ok(depth.farDifference>5);assert.ok(depth.nearDifference<depth.farDifference*.1,'foreground geometry must occlude the volume');
 const reduced=await page.evaluate(()=>{const {renderer:r,world:w}=window.mistAudit;r.configure({quality:'low',fov:90,skyMotion:'reduced'});w.time=4;r.render(w,0,0,0,false);return r.openingMist.diagnostics;});
 assert.equal(reduced.time,0);assert.equal(reduced.steps,20);
 assert.deepEqual(errors,[]);
 await writeFile(`${directory}/audit.json`,JSON.stringify({results,depth,reduced,errors},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
