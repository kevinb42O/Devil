import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='artifacts/blood-floor-liquid';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer},{floorHeight}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/arena.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true});
  window.floorFixture={renderer,world,v,floorHeight};
 });
 const reports=[];
 for(const [label,base,dried]of [['cosmic-fresh',8,false],['furnace-fresh',305,false],['cathedral-fresh',415,false],['cathedral-dried',415,true]]){
  const report=await page.evaluate(({base,dried})=>{
   const {renderer,world,v,floorHeight}=floorFixture;renderer.clear();world.effects=[];world.enemies=[];world.gems=[];
   const ground=floorHeight(0,0,base,0),born=base-(dried?73:3);world.time=born;
   world.player.pos=v(0,ground+3.5,5.5);
   renderer.blood.effect({kind:'kill',bloodId:777,enemyId:1,pos:v(0,ground+1.1,0),amount:2,direction:v(.5,0,-1)},world);
   renderer.blood.advance(born+3);world.time=base;
   renderer.render(world,0,-.65,0,false);
   const gl=renderer.renderer.getContext(),frame=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,frame);
   let luminance=0;for(let i=0;i<frame.length;i+=4)luminance+=frame[i]*.2126+frame[i+1]*.7152+frame[i+2]*.0722;
   const pixels=renderer.blood.field.pixels;let stained=0,pooled=0,thick=0;
   for(let i=0;i<pixels.length;i+=4){if(pixels[i])stained++;if(pixels[i]>190)pooled++;if(pixels[i+3]>80)thick++;}
   return {stained,pooled,thick,luminance,...renderer.blood.diagnostics,maxTextureUnits:renderer.renderer.capabilities.maxTextures};
  },{base,dried});
  assert.ok(report.stained>200,'large splashes cover the floor');assert.ok(report.pooled>30,'connected opaque pool cores');assert.ok(report.thick>30,'liquid depth stored');assert.equal(report.active,0);
  await page.screenshot({path:`${directory}/${label}.png`});
  reports.push({label,...report});
 }
 assert.ok(reports[2].luminance>reports[3].luminance,'fresh blood reflects more light than dried blood under identical lighting');
 const perspectives=[];
 for(const [label,pos,yaw,pitch]of [['grazing',[0,1.2,5.5],0,-.22],['side',[5.5,3.5,0],Math.PI/2,-.65],['highlight',[1.8,4.5,-1.2],Math.atan2(1.8,-1.2),-1.12]]){
  await page.evaluate(({pos,yaw,pitch})=>{
   const {renderer,world,v,floorHeight}=floorFixture;renderer.clear();world.time=412;
   const ground=floorHeight(0,0,415,0);world.player.pos=v(pos[0],ground+pos[1],pos[2]);
   renderer.blood.effect({kind:'kill',bloodId:777,enemyId:1,pos:v(0,ground+1.1,0),amount:2,direction:v(.5,0,-1)},world);
   renderer.blood.advance(415);world.time=415;renderer.render(world,yaw,pitch,0,false);
  },{pos,yaw,pitch});
  await page.screenshot({path:`${directory}/${label}.png`});perspectives.push(label);
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${directory}/audit.json`,JSON.stringify({reports,perspectives,errors},null,2)+'\n');console.log(JSON.stringify({reports,perspectives,errors}));
}finally{await browser.close();}
