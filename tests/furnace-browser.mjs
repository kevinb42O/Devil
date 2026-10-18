import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const directory='artifacts/furnace';mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/furnace-fixture',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;overflow:hidden;background:black"></body>'}));
 await page.addInitScript(()=>window.requestAnimationFrame=()=>0);await page.goto('http://127.0.0.1:5173/furnace-fixture');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,idleInput},{floorHeight}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/arena.ts')]);
  window.furnaceFloorHeight=floorHeight;
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'high',fov:85,mist:true});await renderer.prepare();const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,8);world.effects=[];
  for(const [kind,x,y,z]of [['squid',-9,3.3,-12],['skull',-3,3,-6],['skull2',5,6,-9]]){const e=world.spawn(kind,v(x,y,z));e.age=10;}world.effects=[];
  window.furnaceFixture={renderer,world};
  window.captureFurnace=(time,enabled=true,pitch=-.18,position=null)=>{world.time=time;renderer.render(world,0,pitch,0,false,1,position,false,false,idleInput());if(!enabled){renderer.furnace.update(renderer.camera,time,false);renderer.openingMist.setHeat(0,time,world.radius);renderer.composer.render();}
   const gl=renderer.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,diagnostics:renderer.furnace.diagnostics};};
 });
 const result=await page.evaluate(()=>{
  const difference=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
  const cold=captureFurnace(230),fire=captureFurnace(300),pause=captureFurnace(300),off=captureFurnace(300,false),moving=captureFurnace(300.2);captureFurnace(390);const rewind=captureFurnace(300);
  const deckAnchors=furnaceFixture.renderer.furnace.deckFlames.geometry.getAttribute('furnaceAnchor');
  let deckGroundError=0;for(let i=0;i<48;i++){const x=deckAnchors.getX(i),z=deckAnchors.getZ(i);deckGroundError=Math.max(deckGroundError,Math.abs(deckAnchors.getY(i)-furnaceFloorHeight(x,z,300,0)-.015));}
  const floorOnly=t=>{captureFurnace(t,true,-.7);const r=furnaceFixture.renderer;r.furnace.group.visible=false;r.composer.render();const gl=r.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels.slice(0,Math.floor(pixels.length*.45));};
  const floorMotion=difference(floorOnly(300),floorOnly(301));
  const renderer=furnaceFixture.renderer;renderer.furnace.update(renderer.camera,300,true);renderer.renderer.info.reset();renderer.composer.render();const onCalls=renderer.renderer.info.render.calls;
  renderer.furnace.update(renderer.camera,300,false);renderer.renderer.info.reset();renderer.composer.render();const offCalls=renderer.renderer.info.render.calls;
  renderer.configure({quality:'low',fov:85,skyMotion:'reduced',mist:true});const reduced=captureFurnace(300),end=captureFurnace(420);
  return {floorMotion,deckGroundError,cold:cold.diagnostics,fire:fire.diagnostics,reduced:reduced.diagnostics,end:end.diagnostics,motion:difference(fire.pixels,moving.pixels),visibleDifference:difference(fire.pixels,off.pixels),frozen:difference(fire.pixels,pause.pixels),rewind:difference(fire.pixels,rewind.pixels),extraCalls:onCalls-offCalls};
 });
 assert.ok(result.deckGroundError<.00001,'platform flames remain rooted on actual tile heights');assert.ok(result.floorMotion>.02,"the floor itself has visible moving effects");assert.equal(result.cold.fire,0);assert.equal(result.fire.fire,1);assert.equal(result.fire.interactive,false);assert.ok(result.fire.minimumFireRadius>result.fire.platformRadius+6);assert.equal(result.fire.loaded,true);assert.equal(result.fire.fireTechnique,'ray-marched-volume');assert.equal(result.fire.fireSteps,40);assert.equal(result.reduced.fireSteps,24);assert.equal(result.fire.deckEmitters,48);assert.equal(result.reduced.deckEmitters,28);assert.equal(result.reduced.emitters,16);assert.equal(result.end.heat,0);assert.ok(result.motion>.01);assert.ok(result.visibleDifference>.2);assert.equal(result.frozen,0);assert.equal(result.rewind,0);assert.equal(result.extraCalls,6);
 for(const [name,time,pitch,position]of [['arrival',250,-.14,null],['inferno',300,-.12,null],['hot-stone',300,-.65,null],['rim',300,-.15,{x:0,y:1.5,z:-19}],['wide',300,-.55,{x:0,y:23,z:40}],['cathedral',375,-.12,null],['volume-close',300,-.2,{x:4,y:1.4,z:5}],['volume-side',300,-.24,{x:-6,y:1.6,z:5}]]){
  await page.evaluate(({time,pitch,position})=>{furnaceFixture.renderer.configure({quality:'high',fov:85,mist:true});captureFurnace(time,true,pitch,position);},{time,pitch,position});await page.screenshot({path:`${directory}/${name}.png`});
 }
 assert.deepEqual(errors,[]);writeFileSync(directory+'/report.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}
