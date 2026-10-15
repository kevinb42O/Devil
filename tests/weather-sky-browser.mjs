import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const directory=process.env.DEPTH_SKY_AUDIT?'artifacts/depth-skies':'artifacts/weather-skies';await mkdir(directory,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.route('**/weather-sky-fixture',route=>route.fulfill({contentType:'text/html',body:'<html><head><link rel="icon" href="data:,"></head><body style="margin:0;background:#000"></body></html>'}));
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/weather-sky-fixture');
  await page.evaluate(async()=>{
    const [{GameRenderer},{World,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
    const canvas=document.body.appendChild(document.createElement('canvas'));canvas.style.cssText='position:fixed;inset:0;z-index:99999';
    const r=new GameRenderer(canvas,{quality:'high',fov:90});await r.prepare();
    const w=new World(17,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,9);
    for(const [kind,x,y,z] of [['squid',-8,3.3,-12],['spider',8,2,-9],['skull',-3,3,-5],['skull2',5,5,-9]]){
      const e=w.spawn(kind,v(x,y,z));e.pos=v(x,y,z);e.age=20;e.headExposure=.7;
    }
    w.effects=[];const gl=r.renderer.getContext();
    const read=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    const draw=(time,yaw=0,pitch=0)=>{w.time=time;r.render(w,yaw,pitch,0,false);return read();};
    const difference=(a,b)=>a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/a.length;
    window.weatherFixture={r,w,read,draw,difference};
  });
  const frames=[];
  for(const [name,time] of (process.env.DEPTH_SKY_AUDIT?[['furnace-arrival',259],['furnace',289],['furnace-to-cathedral',371],['cathedral',380],['cathedral-later',410],['cathedral-to-depths',463],['unlit',472]]:[['ash',30],['ash-later',45],['ash-to-storm',60],['cloud-grave',69],['cloud-grave-later',100],['storm-to-veil',135],['veil',144]])){
    for(const [view,pitch] of [['front',0],['up',.85]]){
      const row=await page.evaluate(({time,pitch})=>{const {r,draw}=window.weatherFixture;draw(time,0,pitch);return {...r.skyDiagnostics,calls:r.renderer.info.render.calls,glError:r.renderer.getContext().getError()};},{time,pitch});
      assert.equal(row.glError,0);frames.push({name,view,...row});
      await page.screenshot({path:`${directory}/${name}-${view}.png`});
    }
  }
  const checks=await page.evaluate(async depth=>{
    const {r,draw,difference}=window.weatherFixture;
    const phase=depth?380:69,end=depth?472:144;
    const paused=draw(phase),pausedAgain=draw(phase);draw(end);const rewind=draw(phase);
    const joins=(depth?[241,259,362,380,454,472]:[30,51,69,126,144]).map(time=>({time,difference:difference(draw(time-.001),draw(time+.001))}));
    const THREE=await import('/node_modules/three/build/three.module.js'),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(90,1280/720,.1,200);
    const parent=r.sky.mesh.parent;scene.add(r.sky.mesh);
    const isolatedCalls=[];
    for(const time of (depth?[259,371,380,463,472]:[30,60,69,135,144])){r.sky.update(camera,time);r.renderer.info.reset();r.renderer.render(scene,camera);isolatedCalls.push(r.renderer.info.render.calls);}
    const sample=(yaw,pitch)=>{camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateWorldMatrix(true,false);r.sky.update(camera,phase);r.renderer.render(scene,camera);const p=new Uint8Array(4),gl=r.renderer.getContext();gl.readPixels(640,360,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
    // -X is the wrap direction. Probe either side with almost identical rays.
    const seamA=sample(Math.PI/2-.0001,0),seamB=sample(Math.PI/2+.0001,0);
    const top=sample(0,Math.PI/2),bottom=sample(0,-Math.PI/2);
    parent.add(r.sky.mesh);r.configure({quality:'low',fov:90,skyMotion:'reduced'});draw(69);
    return {pause:difference(paused,pausedAgain),rewind:difference(paused,rewind),joins,seamA,seamB,top,bottom,isolatedCalls,reducedTravel:r.skyDiagnostics.travel};
  },!!process.env.DEPTH_SKY_AUDIT);
  assert.equal(checks.pause,0);assert.equal(checks.rewind,0);assert.equal(checks.reducedTravel,0);
  for(const row of checks.joins)assert.ok(row.difference<.1,`continuous join at ${row.time}`);
  assert.ok(checks.seamA.slice(0,3).every((n,i)=>Math.abs(n-checks.seamB[i])<3),'no hard panorama seam');
  assert.ok(checks.isolatedCalls.every(calls=>calls===1),'every sky phase uses one draw, including crossfades');
  for(const time of (process.env.DEPTH_SKY_AUDIT?[289,380]:[30,69])){
    await page.evaluate(time=>{const {draw}=window.weatherFixture;draw(time);},time);
    await page.screenshot({path:`${directory}/low-${time}.png`});
  }
  assert.deepEqual(errors,[]);await writeFile(`${directory}/audit.json`,JSON.stringify({frames,checks,errors},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
