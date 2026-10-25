import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const directory='artifacts/heaven';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/heaven-fixture',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas></body>'}));
 await page.goto('http://127.0.0.1:5173/heaven-fixture');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,idleInput},{HeavenAudio}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/heaven-audio.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:85,skyMotion:'full',mist:true});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,9);
  for(const [kind,x,y,z] of [['squid',-9,3.3,-15],['skull',4,4,-12],['spider',11,2,-13]]){const enemy=world.spawn(kind,v(x,y,z));enemy.age=20;enemy.headExposure=.7;}
  const render=(time,yaw=0,pitch=.2)=>{world.time=time;renderer.render(world,yaw,pitch,0,false);};
  const renderReward=(time)=>{
   const reward=new World(17,{schedule:false,invulnerable:true});reward.startAt(497.9);
   while(reward.time+1e-7<time)reward.step(idleInput());
   renderer.render(reward,0,.3,0,false);return {released:reward.stats.released,collected:reward.stats.collected,falling:reward.gems.length,kills:reward.stats.kills};
  };
  window.heavenFixture={renderer,world,render,renderReward};
  const gl=renderer.renderer.getContext(),read=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const diff=(a,b)=>a.reduce((sum,v,i)=>sum+(i%4===3?0:Math.abs(v-b[i])),0)/(a.length*.75);
  render(504);const full=read(),cost=renderer.renderer.info.render.calls;
  renderer.heaven.group.visible=false;renderer.composer.render();renderer.originalWeapon.render(renderer.renderer,false);const architectureDifference=diff(full,read());
  render(504);renderer.heaven.uniforms.heavenFloor.value=0;renderer.composer.render();renderer.originalWeapon.render(renderer.renderer,false);const floorDifference=diff(full,read());
  render(504);const repeat=diff(full,read());render(69);render(504);const rewind=diff(full,read());
  const samples=[];for(const time of [488,492,494,496,498,504,510,519,528,579,1008]){render(time);samples.push({time,...renderer.heaven.diagnostics,far:renderer.camera.far});}
  renderer.configure({quality:'low',fov:85,skyMotion:'reduced'});render(504);const low={...renderer.heaven.diagnostics,calls:renderer.renderer.info.render.calls};
  render(509.999);const before=read();render(510.001);const cycleSeam=diff(before,read());
  const reward=renderReward(501);const collected=renderReward(505);
  const context=new OfflineAudioContext(2,44100*3,44100),audio=new HeavenAudio(context,context.destination);
  audio.update(495.9);audio.update(496.1);const buffer=await context.startRendering();
  let peak=0,energy=0;const signal=buffer.getChannelData(0);for(const v of signal){peak=Math.max(peak,Math.abs(v));energy+=v*v;}audio.stop();
  return {reward,collected,architectureDifference,floorDifference,repeat,rewind,cost,samples,low,cycleSeam,audio:{peak,rms:Math.sqrt(energy/signal.length)}};
 });
 assert.equal(result.reward.released,50);assert.ok(result.reward.falling>0);assert.equal(result.reward.kills,0);assert.equal(result.collected.collected,50);
 assert.ok(result.architectureDifference>3,'actual architecture must materially change the view');
 assert.ok(result.floorDifference>2,'the deck must transform, not just the sky');
 assert.equal(result.repeat,0);assert.equal(result.rewind,0);
 assert.equal(result.samples.find(s=>s.time===488).visible,false);
 assert.equal(result.samples.find(s=>s.time===504).throne,1);
 assert.equal(result.samples.find(s=>s.time===504).far,520);
 assert.ok(result.samples.find(s=>s.time===519).lift>0);
 assert.equal(result.samples.find(s=>s.time===579).visible,false);
 assert.equal(result.samples.find(s=>s.time===1008).throne,1);
 assert.equal(result.low.throne,1);assert.equal(result.low.lift,0);
 assert.ok(result.low.batches<=10);assert.ok(result.cycleSeam<1);
 assert.ok(result.audio.rms>.005&&result.audio.peak<.8,'bounded, audible chord and bell');
 for(const quality of ['high','low'])for(const [view,yaw,pitch] of [['hero',0,.2],['side',1.57,.2],['back',Math.PI,.2],['up',0,.8],['edge',0,-.65]]){
  await page.evaluate(({quality,yaw,pitch})=>{const f=window.heavenFixture;f.renderer.configure({quality,fov:85,skyMotion:'full'});f.render(504,yaw,pitch);},{quality,yaw,pitch});
  await page.screenshot({path:`${directory}/${quality}-${view}.png`});
 }
 for(const time of [492,494,496,498,510,519,528]){await page.evaluate(time=>window.heavenFixture.render(time),time);await page.screenshot({path:`${directory}/reveal-${time}.png`});}
 await page.evaluate(()=>{const f=window.heavenFixture;f.renderer.configure({quality:'high',fov:85,skyMotion:'full'});f.renderReward(499.6);});
 await page.screenshot({path:`${directory}/reward-rain.png`});
 await page.evaluate(()=>{const f=window.heavenFixture;f.world.time=504;f.renderer.render(f.world,.5,-.7,0,false,1,{x:25,y:9,z:18});});
 await page.screenshot({path:`${directory}/hanging-foundations.png`});
 assert.deepEqual(errors,[]);await writeFile(`${directory}/integration.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
