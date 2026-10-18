import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const directory='artifacts/descent-passage';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/descent-passage-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/descent-passage-test');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,skyMotion:'full',mist:true});await r.prepare();
  const w=new World(17,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,8);
  for(const [kind,x,y,z] of [['squid',-8,3.3,-12],['skull',-3,3,-6],['skull2',5,6,-9]])w.spawn(kind,v(x,y,z)).age=16;
  window.fixture={r,w};
  window.capture=(time,{enabled=true,x=0,yaw=0,pitch=.06}={})=>{
   w.time=time;w.player.pos.x=x;r.render(w,yaw,pitch,0,false);
   if(!enabled){r.descentPassage.update(r.camera,time,false);r.composer.render();r.originalWeapon.render(r.renderer,false);}
   const gl=r.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   return {pixels,diagnostics:r.descentPassage.diagnostics};
  };
 });
 const result=await page.evaluate(()=>{
  const difference=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
  const cases=[];
  for(const time of [8,27,64,137,253,372,410,465,540]){
   const on=capture(time),off=capture(time,{enabled:false}),paused=capture(time);capture(time+100);const rewind=capture(time),moving=capture(time+.5);
   cases.push({time,...on.diagnostics,visible:difference(on.pixels,off.pixels),pause:difference(on.pixels,paused.pixels),rewind:difference(on.pixels,rewind.pixels),motion:difference(on.pixels,moving.pixels)});
  }
  const {r}=fixture;capture(410);r.renderer.info.reset();r.composer.render();const calls=r.renderer.info.render.calls;r.descentPassage.group.visible=false;r.renderer.info.reset();r.composer.render();const extraCalls=calls-r.renderer.info.render.calls;
  r.configure({quality:'low',fov:90,skyMotion:'reduced',mist:false});capture(100);const low=r.descentPassage.diagnostics;capture(101);const reduced=r.descentPassage.diagnostics;
  return {cases,extraCalls,low,reduced};
 });
 for(const c of result.cases){assert.ok(c.visible>.025,`passage visible at ${c.time}: ${c.visible}`);assert.ok(c.motion>.005,`motion visible at ${c.time}`);assert.equal(c.pause,0);assert.equal(c.rewind,0);}
 assert.equal(result.extraCalls,4);assert.equal(result.low.distance,0);assert.equal(result.reduced.distance,0);assert.equal(result.low.rocks,72);
 for(const [name,time] of [['orbital',8],['cloud-crossing',27],['storm',64],['veil',137],['furnace',253],['cathedral-arrival',372],['cathedral',410],['unlit',490]]){
  await page.evaluate(time=>{fixture.r.configure({quality:'high',fov:90,skyMotion:'full',mist:true});capture(time);},time);
  await page.screenshot({path:`${directory}/${name}.png`});
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
