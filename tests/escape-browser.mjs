import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

const directory='artifacts/escape';await mkdir(directory,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export const createHotContext=()=>({accept(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const injectQuery=url=>url;export const removeStyle=id=>document.getElementById(id)?.remove();export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s)}s.textContent=content}'}));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  // The fixture renders explicitly; the normal application must not animate concurrently.
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
  const result=await page.evaluate(async()=>{
    const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
    const canvas=document.createElement('canvas');canvas.id='descent-fixture';canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
    const renderer=new GameRenderer(canvas,{quality:'high',fov:90,skyMotion:'full'});await renderer.prepare();
    const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,7);
    for(const [kind,x,y,z] of [['squid',-9,3.3,-12],['spider',8,2,-11],['skull',-3,3,-5],['skull2',5,6,-9],['skull3',0,8,-18]]){
      const e=world.spawn(kind,v(x,y,z));e.pos=v(x,y,z);e.age=20;e.headExposure=.7;
    }
    for(let i=0;i<8;i++)world.gems.push({id:1000+i,pos:v(-4+i,1,-4),vel:v(),age:2});
    world.effects=[];
    window.descentFixture={renderer,world};
    const frames=[];
    for(const time of [472,480,482,484,486,488,490,492,495,498,504]){
      world.time=time;renderer.render(world,0,0,0,false);
      frames.push({time,...renderer.skyDiagnostics,calls:renderer.renderer.info.render.calls});
    }
    // Changes to renderer age, render dt, local respawn age and spectator position
    // must not move the environment away from the match/replay timestamp.
    world.time=350;renderer.render(world,0,0,.5,false);const first={...renderer.skyDiagnostics};
    renderer.render(world,.8,-.4,3,false,1,v(4,12,8));const second={...renderer.skyDiagnostics};
    renderer.render(world,0,0,0,false);const paused={...renderer.skyDiagnostics};
    world.time=144;renderer.render(world,0,0,0,false);const scrub={...renderer.skyDiagnostics};
    world.time=0;renderer.render(world,0,0,0,false);const restart={...renderer.skyDiagnostics};
    renderer.configure({quality:'low',fov:90,skyMotion:'reduced'});
    world.time=259;renderer.render(world,0,0,1,false);const reduced={...renderer.skyDiagnostics};
    const skyProgram=renderer.renderer.properties.get(renderer.sky.mesh.material).currentProgram.id;
    world.time=350;renderer.render(world,0,0,1,false);const reducedLater={...renderer.skyDiagnostics};
    world.time=472;renderer.render(world,0,0,0,false);const final={...renderer.skyDiagnostics};
    renderer.render(null,0,0,0,true);const menu={...renderer.skyDiagnostics};
    renderer.configure({quality:'low',fov:90,skyMotion:'full'});
    const gl=renderer.renderer.getContext();
    const capture=time=>{world.time=time;renderer.render(world,0,0,0,false);const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    const difference=(a,b)=>a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/a.length;
    const cosmic=capture(487),cosmicPause=capture(487);capture(504);const cosmicRewind=capture(487);
    const arrivalBefore=capture(497.999),arrivalAfter=capture(498.001);
    const continuity={pause:difference(cosmic,cosmicPause),rewind:difference(cosmic,cosmicRewind),arrival:difference(arrivalBefore,arrivalAfter)};
    // Sample the atmosphere alone so creature animation cannot mask a seam.
    const skyScene=new renderer.scene.constructor();skyScene.add(renderer.sky.mesh.clone());
    const captureSky=time=>{
      world.time=time;renderer.render(world,0,0,0,false);
      renderer.renderer.setRenderTarget(null);renderer.renderer.render(skyScene,renderer.camera);
      const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
    };
    const joins=[480,482,486,490,492,498,510,528,1020].map(time=>({time,difference:difference(captureSky(time-.001),captureSky(time+.001))}));
    const mean=pixels=>pixels.reduce((sum,value,i)=>sum+(i%4===3?0:value),0)/(pixels.length*.75);
    const depthBrightness=mean(capture(480)),beyondBrightness=mean(capture(504));
    const clear= !renderer.cathedral.group.visible&&!renderer.descentPassage.group.visible&&!renderer.cosmicEnvironment.group.visible;
    renderer.configure({quality:'low',fov:90,skyMotion:'reduced'});capture(488);
    const reducedEscape={distance:renderer.descentPassage.diagnostics.distance,clock:renderer.cosmicEnvironment.diagnostics.clock,streaks:renderer.sky.mesh.material.uniforms.escapeMotion.value};
    capture(504);const reducedArrival={...renderer.skyDiagnostics};
    const repeated=[];
    for(const time of [510,519,528,579,654,769,890,982,1000,1008,1020]){
      capture(time);repeated.push({...renderer.skyDiagnostics,cathedral:renderer.cathedral.group.visible,passage:renderer.descentPassage.group.visible,space:renderer.cosmicEnvironment.group.visible});
    }
    return {repeated,joins,depthBrightness,beyondBrightness,clear,reducedEscape,reducedArrival,frames,first,second,paused,scrub,restart,reduced,reducedLater,final,menu,continuity,skyProgram,finalSkyProgram:renderer.renderer.properties.get(renderer.sky.mesh.material).currentProgram.id};
  });
  assert.deepEqual(result.first,result.second);assert.deepEqual(result.first,result.paused);
  assert.equal(result.scrub.chapter,'The Bruised Veil');assert.equal(result.restart.chapter,'The Cosmic Expanse');
  assert.equal(result.reduced.travel,0);assert.equal(result.reducedLater.travel,0);assert.equal(result.reduced.octaves,2);
  assert.equal(result.final.chapter,'The Unlit Depth');assert.deepEqual(result.menu,result.final,'separate menu scene leaves gameplay sky unchanged');
  assert.equal(result.skyProgram,result.finalSkyProgram,'time and chapter changes must not compile the sky shader');
  assert.equal(result.continuity.pause,0);assert.equal(result.continuity.rewind,0);
  assert.ok(result.continuity.arrival<.05,'no visible jump at the final arrival');
  assert.equal(result.frames.at(-1).chapter,'Beyond the Last Star');
  assert.equal(result.frames.find(f=>f.time===490).cosmic,1);
  assert.equal(result.frames.at(-1).beyond,1);
  assert.equal(result.repeated.find(f=>f.time===510).chapter,'Beyond the Last Star');
  assert.equal(result.repeated.find(f=>f.time===579).chapter,'The Cloud Grave');
  assert.equal(result.repeated.find(f=>f.time===890).cathedral,true);
  assert.equal(result.repeated.find(f=>f.time===1008).chapter,'Beyond the Last Star');
  assert.ok(result.clear,'leave the cathedral and passage behind');
  assert.ok(result.beyondBrightness>result.depthBrightness*1.5,'the final realm restores visibility');
  assert.deepEqual(result.reducedEscape,{distance:0,clock:0,streaks:0});
  assert.equal(result.reducedArrival.chapter,'Beyond the Last Star');
  await writeFile(`${directory}/integration.json`,JSON.stringify(result,null,2));
  for(const time of [509.999,510.001]){
    await page.evaluate(time=>{const {renderer,world}=window.descentFixture;renderer.configure({quality:'low',fov:90,skyMotion:'full'});world.time=time;renderer.render(world,0,0,0,false);},time);
    await page.screenshot({path:`${directory}/loop-${time}.png`});
  }
  for(const join of result.joins)assert.ok(join.difference<.1,`visible jump at ${join.time}: ${join.difference}`);
  for(const quality of ['high','low'])for(const time of [480,484,487,490,495,498,519,579,890])for(const [view,pitch] of [['front',0],['up',.8]]){
    await page.evaluate(({quality,time,pitch})=>{const {renderer,world}=window.descentFixture;renderer.configure({quality,fov:90,skyMotion:'full'});world.time=time;renderer.render(world,0,pitch,0,false);},{quality,time,pitch});
    await page.screenshot({path:`${directory}/${quality}-${time}-${view}.png`});
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${directory}/integration.json`,JSON.stringify(result,null,2));
  console.log('Escape browser passed:',JSON.stringify(result));
}finally{await browser.close();}
