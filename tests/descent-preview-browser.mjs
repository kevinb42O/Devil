import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,rename,writeFile} from 'node:fs/promises';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const directory='artifacts/descent';await mkdir(`${directory}/video`,{recursive:true});
const url=(process.env.GAME_URL||'http://127.0.0.1:5173')+'/artifacts/descent/preview.html';
const errors=[];
async function open(record=false){
 const context=await browser.newContext({viewport:{width:1280,height:720},...(record?{recordVideo:{dir:`${directory}/video`,size:{width:1280,height:720}}}:{})});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export const createHotContext=()=>({accept(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const injectQuery=url=>url;export const removeStyle=id=>document.getElementById(id)?.remove();export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s)}s.textContent=content}'}));
 await page.goto(url);await page.waitForFunction(()=>!!window.descentPreview);
 return {context,page};
}
try{
 const {context,page}=await open();
 const colors=await page.evaluate(async()=>{
  const {renderer,world}=window.descentPreview;
  const {Scene,PerspectiveCamera}=await import('/node_modules/three/build/three.module.js');
  const isolated=new Scene(),camera=new PerspectiveCamera(90,16/9,.1,200),sky=renderer.sky;const parent=sky.mesh.parent;isolated.add(sky.mesh);
  const gl=renderer.renderer.getContext();const values=[];
  for(const pitch of [-.7,0,.7]){
   camera.rotation.set(pitch,0,0,'YXZ');camera.updateWorldMatrix(true,false);sky.update(camera,30,false);renderer.renderer.render(isolated,camera);
   const pixel=new Uint8Array(4);gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);values.push({pitch,pixel:[...pixel]});
  }
  parent.add(sky.mesh);window.descentPreview.setTime(30);return values;
 });
 for(const sample of colors)assert.ok(Math.max(...sample.pixel.slice(0,3))<90&&sample.pixel[2]>2,`ash sky stays dim but visible above, at and below horizon: ${JSON.stringify(sample)}`);
 const floor=await page.evaluate(async()=>{
  const {renderer,world}=window.descentPreview;const {Vector3}=await import('/node_modules/three/build/three.module.js');
  const p=new Vector3(4,0,0).project(renderer.camera),gl=renderer.renderer.getContext();
  const read=()=>{const pixel=new Uint8Array(4);gl.readPixels(Math.round((p.x+1)*gl.drawingBufferWidth/2),Math.round((p.y+1)*gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];};
  window.descentPreview.setTime(30);const daylight=read();
  renderer.environment.update(30,true);renderer.composer.render();renderer.originalWeapon.render(renderer.renderer,false);const unlit=read();
  window.descentPreview.setTime(30);return {daylight,unlit};
 });
 assert.ok(floor.daylight[0]+floor.daylight[1]+floor.daylight[2]>floor.unlit[0]+floor.unlit[1]+floor.unlit[2]+5,'native arena texture retains restrained ambient fill');
 await page.screenshot({path:`${directory}/ash-opening.png`});
 await page.evaluate(()=>window.descentPreview.setTime(350));await page.screenshot({path:`${directory}/cathedral-preview.png`});
 await page.locator('[data-range="51,69"]').click();await page.waitForFunction(()=>window.descentPreview.time>51.05);
 const first=await page.evaluate(()=>({time:window.descentPreview.time,sky:window.descentPreview.renderer.skyDiagnostics}));
 await page.click('#play');await page.waitForTimeout(150);const paused=await page.evaluate(()=>window.descentPreview.time);
 await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.descentPreview.time),paused);
 assert.equal(first.sky.chapter,'The Last Sky');assert.ok(first.time<52,'transition buttons play at real speed');
 await page.evaluate(()=>window.descentPreview.setTime(30));await page.check('#fire');
 const shots=[];
 for(const quality of ['high','low'])for(const level of [1,2,3,4])for(const pitch of [.22,.7]){
  await page.selectOption('#quality',quality);await page.selectOption('#hand',String(level));
  await page.evaluate(pitch=>{const p=window.descentPreview;p.world.projectiles=[];p.setCamera(0,pitch);},pitch);
  await page.waitForTimeout(700);
  const sample=await page.evaluate(async()=>{
   const {renderer,world}=window.descentPreview;const {Vector3}=await import('/node_modules/three/build/three.module.js');
   window.descentPreview.setTime(30);
   const shot=world.projectiles.find(p=>p.age>.08&&p.age<.2);if(!shot)throw Error('No real outgoing dagger in probe interval');
   const p=new Vector3(shot.pos.x,shot.pos.y,shot.pos.z).project(renderer.camera),gl=renderer.renderer.getContext();
   const x=Math.round((p.x+1)*gl.drawingBufferWidth/2)-5,y=Math.round((p.y+1)*gl.drawingBufferHeight/2)-5;
   const read=()=>{const bytes=new Uint8Array(11*11*4);gl.readPixels(x,y,11,11,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
   const visible=read();renderer.originalWeapon.daggers.forEach(b=>b.visible=false);renderer.projectileLighting.glow.visible=false;
   renderer.composer.render();renderer.originalWeapon.render(renderer.renderer,false);const background=read();
   let contrast=0;for(let i=0;i<visible.length;i+=4)contrast=Math.max(contrast,Math.hypot(visible[i]-background[i],visible[i+1]-background[i+1],visible[i+2]-background[i+2]));
   renderer.originalWeapon.daggers.forEach(b=>b.visible=true);window.descentPreview.setTime(30);
   return {contrast,daggers:renderer.originalWeapon.projectileDiagnostics.count,background:[...background.slice(60*4,60*4+3)]};
  });
  assert.ok(sample.contrast>35,`${quality}/hand ${level}/pitch ${pitch}: dagger separates from sky, ${JSON.stringify(sample)}`);
  shots.push({quality,level,pitch,...sample});
  await page.screenshot({path:`${directory}/ash-shots-${quality}-${level}-${pitch===.22?'horizon':'upper'}.png`});
 }
 await page.uncheck('#fire');
 await context.close();
 if(process.argv.includes('--record')){
  for(const clip of [{name:'descent-full-tour',start:0,end:480,speed:24},{name:'ash-to-cloud-grave-real-time',start:21,end:39,speed:1}]){
   const {context,page}=await open(true);const video=page.video();
   await page.evaluate(start=>{window.descentPreview.setTime(start);},clip.start);
   await page.check('#fire');
   await page.waitForTimeout(1200);
   await page.evaluate(clip=>window.descentPreview.setRange(clip.start,clip.end,clip.speed),clip);
   await page.waitForFunction(()=>!window.descentPreview.playing,{},{timeout:60000});
   await page.waitForTimeout(1200);await context.close();
   await rename(await video.path(),`${directory}/${clip.name}.webm`);
  }
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/preview.json`,JSON.stringify({colors,floor,shots,first,paused,recorded:process.argv.includes('--record')},null,2));
 console.log('Preview passed: dim ash sky, actual renderer, real-time transition controls and stable pause.');
}finally{await browser.close();}
