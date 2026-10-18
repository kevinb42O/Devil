import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/veil-environment';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.route('**/veil-fixture',route=>route.fulfill({contentType:'text/html',body:'<html><head><link rel="icon" href="data:,"></head><body style="margin:0;background:#000"></body></html>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/veil-fixture');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const canvas=document.body.appendChild(document.createElement('canvas'));canvas.style.cssText='position:fixed;inset:0';
  const r=new GameRenderer(canvas,{quality:'high',fov:85,mist:true});await r.prepare();
  const w=new World(17,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,9);
  for(const [kind,x,y,z] of [['squid',-8,3.3,-12],['spider',8,2,-9],['skull',-3,3,-5],['skull2',5,5,-9]]){const e=w.spawn(kind,v(x,y,z));e.pos=v(x,y,z);e.age=20;e.headExposure=.7;}
  for(let i=0;i<6;i++)w.gems.push({id:1000+i,pos:v(-3+i,1,-4),vel:v(),age:2});w.effects=[];
  window.veilFixture={r,w};
  window.drawVeil=(time,pitch=-.2,yaw=0)=>{w.time=time;r.render(w,yaw,pitch,0,false);const gl=r.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,diagnostics:r.veilEnvironment.diagnostics,glError:gl.getError()};};
 });
 const frames=[];
 for(const [name,time,pitch,yaw] of [['rain',90,-.22,0],['arrival',135,-.22,0],['veil',180,-.22,0],['hero',180,.10,0],['floor',180,-.75,0],['tear',180,.6,0],['rim',180,-.24,1.7],['late',230,-.22,0],['furnace',270,-.22,0]]){
  const frame=await page.evaluate(({time,pitch,yaw})=>{const {pixels,...info}=drawVeil(time,pitch,yaw);return info;},{time,pitch,yaw});assert.equal(frame.glError,0);frames.push({name,...frame});
  await page.screenshot({path:`${directory}/${name}.png`});
 }
 await page.evaluate(()=>{const {w}=veilFixture;w.player.pos.x=23;w.player.pos.z=3;drawVeil(180,-.38,-Math.PI/2);});
 await page.screenshot({path:`${directory}/edge.png`});
 await page.evaluate(()=>{const {w}=veilFixture;w.player.pos.x=0;w.player.pos.z=9;});
 const checks=await page.evaluate(()=>{
  const diff=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
  const a=drawVeil(180),paused=drawVeil(180);drawVeil(270);const rewind=drawVeil(180);
  const joins=[126,144,241,259].map(t=>({time:t,difference:diff(drawVeil(t-.001).pixels,drawVeil(t+.001).pixels)}));
  const {r}=veilFixture;drawVeil(180);r.renderer.info.reset();r.composer.render();const highCalls=r.renderer.info.render.calls;
  r.veilEnvironment.update(r.camera,180,false);r.renderer.info.reset();r.composer.render();const baselineCalls=r.renderer.info.render.calls;
  r.configure({quality:'low',fov:85,skyMotion:'reduced'});const low=drawVeil(180),reduced=drawVeil(200);
  const out=drawVeil(270);return {paused:diff(a.pixels,paused.pixels),rewind:diff(a.pixels,rewind.pixels),joins,extraCalls:highCalls-baselineCalls,low:low.diagnostics,reduced:reduced.diagnostics,outside:out.diagnostics};
 });
 assert.equal(checks.paused,0);assert.equal(checks.rewind,0);assert.equal(checks.extraCalls,3);assert.equal(checks.low.fragments,64);assert.equal(checks.reduced.clock,0);assert.equal(checks.outside.visible,false);
 for(const join of checks.joins)assert.ok(join.difference<.15,`continuous chapter boundary at ${join.time}`);
 await page.evaluate(()=>drawVeil(180,-.5));await page.screenshot({path:`${directory}/low-floor.png`});
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({frames,checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
