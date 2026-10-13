import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer},THREE]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/node_modules/.vite/deps/three.js')]);
  const canvas=document.createElement('canvas');canvas.id='light-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'low',fov:95});await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded]);
  const world=new World(91,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,0);
  window.lightFixture={renderer,world,THREE,v};
 });
 const results=[];
 for(const quality of ['low','high']){
  results.push(await page.evaluate(quality=>{
   const {renderer,world,THREE,v}=window.lightFixture;renderer.configure({quality,fov:95});world.projectiles=[];renderer.render(world,0,0,0,false);
   const sample=(x,y,z)=>{const point=new THREE.Vector3(x,y,z).project(renderer.camera),gl=renderer.renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(Math.round((point.x+1)*.5*gl.drawingBufferWidth),Math.round((point.y+1)*.5*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];};
   const dark=sample(.7,0,-8);
   world.projectiles=Array.from({length:12},(_,i)=>({id:i,pos:v((i%3-1)*1.4,1.1,-4-Math.floor(i/3)*2.5),vel:v(0,0,-70),age:.1,homing:false,level:1}));
   renderer.render(world,0,0,0,false);const lit=sample(.7,0,-8),calls=renderer.renderer.info.render.calls;
   const gl=renderer.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   renderer.projectileLighting.glow.visible=false;renderer.composer.render();renderer.originalWeapon.render(renderer.renderer,false);
   const callsWithoutGlow=renderer.renderer.info.render.calls-calls;const floorLit=sample(.7,0,-8);
   const without=new Uint8Array(pixels.length);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,without);let glowPixelGain=0;for(let i=0;i<pixels.length;i+=4)glowPixelGain+=Math.max(0,pixels[i+1]-without[i+1]);
   renderer.render(world,0,0,0,false);
   return {quality,dark,lit,floorLit,extraGlowDraws:calls-callsWithoutGlow,glowPixelGain,...renderer.projectileLighting.diagnostics};
  },quality));
  await page.locator('#light-test').screenshot({path:`artifacts/projectile-light-${quality}.png`});
 }
 for(const r of results){assert.ok(r.floorLit[1]>r.dark[1]+3&&r.floorLit[1]<r.dark[1]+35,JSON.stringify(r));assert.ok(r.floorLit[1]-r.dark[1]>r.floorLit[0]-r.dark[0],JSON.stringify(r));assert.ok(r.glowPixelGain>1000,JSON.stringify(r));assert.equal(r.count,12);assert.equal(r.extraGlowDraws,1);}
 await page.evaluate(async()=>{
  const {renderer,world,v}=window.lightFixture;const {idleInput,STEP}=await import('/src/simulation.ts');
  renderer.clear();world.projectiles=[];world.effects=[];world.level=1;world.player.pos=v(0,1.7,0);
  for(let tick=0;tick<60;tick++){if(tick%5===0){world.shoot(idleInput(),false,false);for(const e of world.effects)renderer.effect(e,world,0,0);world.effects=[];}world.updateProjectiles(STEP);renderer.originalWeapon.update(world,STEP,false,renderer.camera);}
  renderer.render(world,0,0,0,false);
 });
 await page.locator('#light-test').screenshot({path:'artifacts/projectile-light-stream.png'});
 const dense=await page.evaluate(()=>{
  const {renderer,world,v}=window.lightFixture,lighting=renderer.projectileLighting;
  world.projectiles=Array.from({length:6000},(_,i)=>({id:i,pos:v(i%100*.15-7.5,1,-3-Math.floor(i/100)*.3),vel:v(0,0,-70),age:.1,homing:false,level:4}));
  const times=[];for(let i=0;i<50;i++){const begin=performance.now();lighting.update(world,false,.5,720);if(i>=10)times.push(performance.now()-begin);}times.sort((a,b)=>a-b);
  renderer.render(world,0,0,0,false);const dense={...lighting.diagnostics,maxGpuInstances:lighting.glow.geometry._maxInstanceCount};
  world.projectiles[0].previous=v(2,1,-3);world.projectiles[0].pos=v(4,1,-5);lighting.update(world,false,.5,720);
  const center=lighting.glow.geometry.getAttribute('shotCenter');const interpolated=[center.getX(0),center.getZ(0)];
  renderer.render(world,0,0,0,true);const menuCount=lighting.diagnostics.count;
  world.projectiles=[];lighting.update(world,false,1,720);const version=center.version,textureVersion=lighting.field.version;lighting.update(world,false,1,720);
  return {dense,interpolated,menuCount,emptyUploadFree:center.version===version&&lighting.field.version===textureVersion,updateMedianMs:times[20],updateP95Ms:times[38]};
 });
 const strafe=await page.evaluate(()=>{
  const {THREE,v}=window.lightFixture,scene=new THREE.Scene();
  const Lighting=window.lightFixture.renderer.projectileLighting.constructor;
  const lighting=new Lighting(scene,new THREE.MeshBasicMaterial()),renderer=new THREE.WebGLRenderer({antialias:false});
  renderer.setSize(512,512);renderer.setClearColor(0);
  const camera=new THREE.PerspectiveCamera(90,1,.05,100),p={id:1,pos:v(0,0,-4),vel:v(0,0,-70),age:.1,homing:false,level:1};
  const world={projectiles:[p],level:1},pixels=new Uint8Array(512*512*4);let maxCenterError=0,maxAnisotropy=0,checks=0;
  const draw=()=>{lighting.update(world,false,1,512);renderer.render(scene,camera);const gl=renderer.getContext();gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,pixels);};
  for(const x of [-1,0,1]){
   camera.position.set(x,0,0);camera.updateMatrixWorld(true);draw();const reference=pixels.slice();
   p.vel=v(18,9,-70);draw();if(!pixels.every((value,i)=>value===reference[i]))throw Error('glow shape changes with lateral shot velocity');p.vel=v(0,0,-70);
   let weight=0,sx=0,sy=0;
   for(let i=0;i<pixels.length;i+=4){const w=pixels[i]+pixels[i+1]+pixels[i+2];weight+=w;sx+=w*((i/4)%512+.5);sy+=w*(Math.floor(i/4/512)+.5);}
   if(!weight)throw Error('missing glow');const cx=sx/weight,cy=sy/weight;let xx=0,yy=0;
   for(let i=0;i<pixels.length;i+=4){const w=pixels[i]+pixels[i+1]+pixels[i+2];xx+=w*((i/4)%512+.5-cx)**2;yy+=w*(Math.floor(i/4/512)+.5-cy)**2;}
   const projected=new THREE.Vector3(0,0,-4).project(camera);
   maxCenterError=Math.max(maxCenterError,Math.hypot(cx-(projected.x+1)*256,cy-(projected.y+1)*256));
   maxAnisotropy=Math.max(maxAnisotropy,Math.abs(xx/yy-1));checks++;
  }
  renderer.dispose();lighting.clear();
  if(maxCenterError>.1||maxAnisotropy>.01)throw Error('strafe produces a shifted or elongated light');
  return {checks,maxCenterError,maxAnisotropy,velocityIndependent:true};
 });
 assert.equal(dense.dense.count,6000);assert.ok(dense.dense.maxGpuInstances>=6000);assert.deepEqual(dense.interpolated,[3,-4]);assert.equal(dense.menuCount,0);assert.ok(dense.emptyUploadFree);assert.deepEqual(errors,[]);
 await writeFile('artifacts/projectile-lighting-audit.json',JSON.stringify({results,...dense,strafe},null,2)+'\n');
 console.log('Projectile lighting passed',JSON.stringify({results,...dense,strafe}));
}finally{await browser.close();}
