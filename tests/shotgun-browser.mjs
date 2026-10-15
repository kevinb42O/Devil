import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:black}canvas{display:block}</style><canvas id="test"></canvas>'}));await page.goto(url);
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,idleInput,STEP},T]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:95});await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded]);
  if(!renderer.originalWeapon.ready)throw Error(renderer.originalWeapon.error);
  window.shotgun={renderer,World,v,idleInput,STEP,T};
 });
 await mkdir('artifacts/shotgun',{recursive:true});const report=[];
 for(const quality of ['low','high'])for(const level of [1,2,3,4]){
  const result=await page.evaluate(({quality,level})=>{
   const {renderer,World,v,idleInput,STEP}=window.shotgun;renderer.clear();renderer.configure({quality,fov:95});const w=new World(71,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,10);w.level=level;w.shoot(idleInput(),true,false);
   for(const e of w.effects)renderer.originalWeapon.effect(e,w,0,0);
   for(let i=0;i<7;i++){w.updateProjectiles(STEP);w.time+=STEP;}
   renderer.render(w,0,0,0,false,1);window.shotgun.world=w;
   const styleIndex=12+(level-1)*2,weapon=renderer.originalWeapon,batches=weapon.daggers.map(b=>b.count),profiles=renderer.projectileLighting.glow.geometry.attributes.shotPellet.array;
   const colors=renderer.projectileLighting.glow.geometry.attributes.shotColor.array;
   return {quality,level,styleIndex,color:Array.from(colors.slice(0,3)),batches,alive:w.projectiles.length,allPellets:w.projectiles.every(p=>p.kind==='shotgun'),pelletShape:weapon.daggers[styleIndex].geometry.type,glowMatches:w.projectiles.every((_,i)=>profiles[i]===1),calls:renderer.renderer.info.render.calls,lighting:renderer.projectileLighting.diagnostics};
  },{quality,level});
  assert.equal(result.alive,[10,20,40,60][level-1]);assert.equal(result.batches[result.styleIndex],result.alive);assert.ok(result.allPellets&&result.glowMatches);assert.equal(result.pelletShape,'OctahedronGeometry');assert.equal(result.lighting.drawCalls,1);
  report.push(result);await page.locator('canvas').screenshot({path:`artifacts/shotgun/hand-${level}-${quality}.png`});
 }
 for(const quality of ['low','high'])assert.equal(new Set(report.filter(r=>r.quality===quality).map(r=>JSON.stringify(r.color))).size,4);
 const alignment=await page.evaluate(()=>{
  const {renderer,World,v,idleInput,T}=window.shotgun,weapon=renderer.originalWeapon;let maxError=0,checks=0;
  for(const aspect of [16/9,9/16])for(const fov of [75,115,145])for(const pitch of [0,1.45,-1.45])for(let level=1;level<=4;level++){
   renderer.clear();const w=new World(12,{schedule:false});w.level=level;w.player.pos=v(0,20,0);const yaw=.7;w.shoot({...idleInput(),yaw,pitch},true,false);
   const camera=new T.PerspectiveCamera(fov,aspect,.05,100);camera.position.copy(w.player.pos);camera.rotation.set(pitch,yaw,0,'YXZ');weapon.resize(aspect*360,360);weapon.update(w,0,false,camera,0);
   const p=w.projectiles[0],a=weapon.projectileView(p,{...p.pos}),b=weapon.projectileView({...p,id:99999,shotKey:'host:1:59'},{...p.pos});
   maxError=Math.max(maxError,Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z));checks++;
  }
  return {checks,maxError};
 });assert.equal(alignment.maxError,0);
 const pixels=await page.evaluate(()=>{
  const {renderer,World,v,T}=window.shotgun;renderer.clear();const w=new World(1,{schedule:false});const weapon=renderer.originalWeapon;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(90,1,.05,100),canvas=document.createElement('canvas'),gpu=new T.WebGLRenderer({canvas});gpu.setSize(256,256);gpu.setClearColor(0);
  // Draw the actual game's instanced pellet batches in isolation.
  const pellet=weapon.daggers[12];scene.add(pellet);const read=(kind)=>{w.projectiles=[{id:1,pos:v(0,0,-.85),previous:v(0,0,-.85),vel:v(0,0,-70),age:.2,homing:false,level:1,kind}];weapon.update(w,0,false,camera,1);gpu.render(scene,camera);const gl=gpu.getContext(),p=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,p);let red=0,green=0,blue=0,lit=0;for(let i=0;i<p.length;i+=4){red+=p[i];green+=p[i+1];blue+=p[i+2];if(p[i]+p[i+1]+p[i+2]>0)lit++;}return {red,green,blue,lit};};
  const actual=read('shotgun');renderer.scene.add(pellet);gpu.dispose();return actual;
 });assert.ok(pixels.lit>20);assert.ok(pixels.red>pixels.green*1.5&&pixels.red>pixels.blue*2,JSON.stringify(pixels));assert.deepEqual(errors,[]);
 await writeFile('artifacts/shotgun/audit.json',JSON.stringify({report,alignment,pixels,errors},null,2)+'\n');console.log('Shotgun browser checks passed',JSON.stringify({report,alignment,pixels}));
}finally{await browser.close();}
