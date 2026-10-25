import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='artifacts/ascent';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/ascent-fixture',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas><button style="position:fixed;top:0;left:0">Audio</button></body>'}));
 await page.goto('http://127.0.0.1:5173/ascent-fixture');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,v},{AscentAudio}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/ascent-audio.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:85,skyMotion:'full',mist:true});await renderer.prepare();
  const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,9);
  for(const [kind,x,y,z] of [['squid',-10,3.3,-15],['skull',4,4,-12],['spider',11,2,-13]]){const enemy=world.spawn(kind,v(x,y,z));enemy.age=20;enemy.headExposure=.7;}
  const render=(time,pitch=.2)=>{world.time=time;renderer.render(world,0,pitch,0,false);};
  const gl=renderer.renderer.getContext(),read=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const diff=(a,b)=>a.reduce((n,v,i)=>n+(i%4===3?0:Math.abs(v-b[i])),0)/(a.length*.75);
  renderer.configure({quality:'high',fov:85,skyMotion:'full',screenShake:100,movementMotion:0});
  const simulationBefore=JSON.stringify({pos:world.player.pos,vel:world.player.vel,projectiles:world.projectiles});
  render(486);const shakenPosition=renderer.camera.position.toArray(),rotation=renderer.camera.rotation.toArray(),shake={...renderer.ascentRumble.diagnostics.offset};
  renderer.configure({quality:'high',fov:85,skyMotion:'full',screenShake:0,movementMotion:0});render(486);
  const stillPosition=renderer.camera.position.toArray(),stillRotation=renderer.camera.rotation.toArray();
  const simulationStable=simulationBefore===JSON.stringify({pos:world.player.pos,vel:world.player.vel,projectiles:world.projectiles});
  renderer.configure({quality:'high',fov:85,skyMotion:'full',screenShake:100,movementMotion:0});render(486);
  renderer.render(world,0,.2,0,false,1,{x:0,y:3,z:10});const spectatorShake={...renderer.ascentRumble.diagnostics.offset};
  renderer.configure({quality:'high',fov:85,skyMotion:'reduced',screenShake:100,movementMotion:0});render(486);const reducedShake={...renderer.ascentRumble.diagnostics.offset};
  renderer.configure({quality:'high',fov:85,skyMotion:'full',screenShake:35,movementMotion:0});
  render(486);const first=read(),cost=renderer.renderer.info.render.calls;
  renderer.ascentRush.update(renderer.camera,486,false);renderer.composer.render();renderer.originalWeapon.render(renderer.renderer,false);const changed=diff(first,read());
  render(486);const paused=diff(first,read());render(504);render(486);const rewind=diff(first,read());
  const samples=[];for(const time of [481,482.25,484,486,488,490,492,494,504,519,996]){render(time);samples.push({time,...renderer.ascentRush.diagnostics});}
  renderer.configure({quality:'low',fov:85,skyMotion:'reduced'});render(486);const reduced=renderer.ascentRush.diagnostics;
  const c=new AudioContext(),master=c.createGain(),analyser=c.createAnalyser();master.gain.value=.55;master.connect(analyser);analyser.connect(c.destination);
  const audio=new AscentAudio(c,master);window.ascentFixture={renderer,world,render,c,master,audio,analyser,time:474};
  document.querySelector('button').onclick=()=>c.resume();
  window.ascentTimer=setInterval(()=>{const f=window.ascentFixture;if(f.time!==null){audio.update(f.time);f.time+=.02;}},20);
  return {shakenPosition,stillPosition,rotation,stillRotation,shake,simulationStable,spectatorShake,reducedShake,changed,paused,rewind,cost,samples,reduced};
 });
 assert.ok(result.shakenPosition.some((v,i)=>Math.abs(v-result.stillPosition[i])>.001));
 assert.deepEqual(result.rotation,result.stillRotation);assert.equal(result.simulationStable,true);
 assert.deepEqual(result.spectatorShake,{x:0,y:0,z:0});assert.deepEqual(result.reducedShake,{x:0,y:0,z:0});
 assert.ok(result.changed>.2,`rush must be clearly visible: ${result.changed}`);assert.equal(result.paused,0);assert.equal(result.rewind,0);
 assert.equal(result.samples.find(s=>s.time===504).visible,false);assert.equal(result.samples.find(s=>s.time===519).visible,false);assert.equal(result.samples.find(s=>s.time===996).visible,true);
 assert.equal(result.reduced.visible,false);
 await page.click('button');await page.waitForFunction(()=>ascentFixture.audio.diagnostics.loaded);
 await page.evaluate(()=>ascentFixture.time=486.25);await page.waitForFunction(()=>ascentFixture.audio.diagnostics.playing);
 await page.waitForFunction(()=>{const x=new Float32Array(2048);ascentFixture.analyser.getFloatTimeDomainData(x);return Math.max(...x.map(Math.abs))>.01;});
 result.audio=await page.evaluate(()=>{const x=new Float32Array(2048);ascentFixture.analyser.getFloatTimeDomainData(x);return {...ascentFixture.audio.diagnostics,peak:Math.max(...x.map(Math.abs))};});
 await page.evaluate(()=>{ascentFixture.audio.stop();ascentFixture.time=null;});assert.equal(await page.evaluate(()=>ascentFixture.audio.diagnostics.playing),false);
 await page.evaluate(()=>ascentFixture.time=999);await page.waitForFunction(()=>ascentFixture.audio.diagnostics.playing&&ascentFixture.audio.diagnostics.offset>8);
 await page.evaluate(()=>ascentFixture.time=1008);await page.waitForFunction(()=>!ascentFixture.audio.diagnostics.playing);
 for(const quality of ['high','low'])for(const [name,time,pitch] of [['compression',481.7,.2],['launch',482.25,.2],['rush',486,.2],['up',486,1.2],['space',490,.4],['heaven',498,.2]]){
  await page.evaluate(({quality,time,pitch})=>{const f=ascentFixture;f.renderer.configure({quality,fov:85,skyMotion:'full'});f.render(time,pitch);},{quality,time,pitch});
  await page.screenshot({path:`${directory}/${quality}-${name}.png`});
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/integration.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
