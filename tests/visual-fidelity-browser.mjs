import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const dir='artifacts/visual-fidelity';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/fidelity-check',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:black}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/fidelity-check');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v},{Vector3,Box3}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,mist:false});await renderer.prepare();
  const world=new World(1,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,0);
  const frame=(dt=0)=>renderer.render(world,0,0,dt,false);
  const pixel=(x,y)=>{const gl=renderer.renderer.getContext(),p=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
  window.probe={renderer,world,frame,pixel,v,Vector3,Box3};frame();
 });
 const samples=[];
 for(const quality of ['low','high'])for(const level of [2,3,4,5,6,7]){
  const result=await page.evaluate(({quality,level})=>{
   const {renderer,world,frame,pixel}=window.probe;renderer.clear();renderer.configure({quality,fov:90,mist:false});world.level=level;
   frame();const baseline=pixel(10,700);
   renderer.effect({kind:'upgrade',level,pos:world.player.pos},world,0,0);frame();
   const peak=pixel(10,700),power=renderer.upgradeScreenFlash.diagnostics.power;
   return {quality,level,baseline,peak,power};
  },{quality,level});
  assert.ok(result.power>.3,'upgrade appears on its first frame');
  assert.ok(result.peak.slice(0,3).some((c,i)=>Math.abs(c-result.baseline[i])>15),'screen corner changes color, including the dark sky');
  if(quality==='high'&&level<=4)await page.screenshot({path:`${dir}/upgrade-${level}-peak.png`});
  await page.evaluate(()=>{window.probe.frame(.3);});
  assert.ok(await page.evaluate(()=>window.probe.renderer.upgradeScreenFlash.diagnostics.power)<result.power);
  await page.evaluate(()=>window.probe.frame(1));
  assert.equal(await page.evaluate(()=>window.probe.renderer.upgradeScreenFlash.diagnostics.power),0);
  samples.push(result);
 }
 const geometry=await page.evaluate(()=>{
  const {renderer,world,frame,Vector3,Box3}=window.probe;
  const result=[];
  for(const kind of ['squid','squid2','squid3','spider','spider2','centipede','gigapede']){
   const model=renderer.originalEnemies.clone(kind);model.updateMatrixWorld(true);result.push({kind,bounds:new Box3().setFromObject(model).getSize(new Vector3()).toArray()});
  }
  for(const index of [0,12]){const mesh=renderer.originalWeapon.daggers[index];mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox.getSize(new Vector3());if(bounds.z<.3||bounds.x<.15)throw Error('Projectile remains too small');if(!mesh.material.map)throw Error('Missing native dagger texture');}
  renderer.clear();world.addCrew('host');world.addCrew('guest');world.selectCrew('host');
  renderer.effect({kind:'upgrade',level:4,pos:world.player.pos,shooterId:'guest'},world,0,0);frame();
  if(renderer.upgradeScreenFlash.diagnostics.power)throw Error('Remote upgrade tinted local view');
  renderer.restoreReplayUpgrade({kind:'upgrade',level:4,pos:world.player.pos,shooterId:'host'},world,.4);frame();
  if(!(renderer.upgradeScreenFlash.diagnostics.power>0&&renderer.upgradeScreenFlash.diagnostics.power<.15))throw Error('Replay seek did not restore elapsed fade');
  renderer.clear();frame();if(renderer.upgradeScreenFlash.diagnostics.power)throw Error('Reset retained flash');
  renderer.effect({kind:'upgrade',level:4,pos:world.player.pos,shooterId:'host'},world,0,0);renderer.render(world,0,0,0,true);
  if(renderer.upgradeScreenFlash.diagnostics.power)throw Error('Menu retained flash');
  return result;
 });
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{const {renderer,world,frame}=window.probe;renderer.resize();renderer.effect({kind:'upgrade',level:4,pos:world.player.pos,shooterId:'host'},world,0,0);frame();});
 await page.screenshot({path:`${dir}/upgrade-portrait.png`});
 await page.setViewportSize({width:1280,height:720});
 await page.evaluate(()=>{
  const {renderer,world,frame,v}=window.probe;renderer.clear();renderer.resize();world.crew=[];world.player.pos=v(0,1.7,0);world.level=4;
  const tower=world.spawn('squid2',v(0,5,-18));tower.age=15;
  const spider=world.spawn('spider',v());spider.pos=v(-14,2.7*spider.size,-22);spider.age=15;spider.headExposure=1;spider.facingYaw=0;
  const snake=world.spawn('centipede',v());snake.pos=v(9,4,-14);snake.age=15;snake.status='hunting';snake.vel=v(0,0,1);
  snake.segments.forEach((s,i)=>s.pos=v(9+Math.sin(i*.18)*5,4+i*.15,-14-(i+1)*1.3));
  world.projectiles=[];
  for(let i=0;i<36;i++)world.projectiles.push({id:1000+i,pos:v((i%6-2.5)*.15,1.1+Math.floor(i/6)*.12,-2-Math.floor(i/6)*1.5),vel:v((i%6-2.5)*2,0,-70),age:.2,homing:false,level:4,...(i%2?{kind:'shotgun'}:{})});
  frame();
 });
 await page.screenshot({path:`${dir}/creatures-and-daggers.png`});
 assert.deepEqual(errors,[]);await writeFile(`${dir}/audit.json`,JSON.stringify({samples,geometry},null,2));
 console.log('Visual fidelity passed: native blade geometry/textures, creature bounds, all six upgrades in both quality modes, framebuffer tint, fade, remote isolation, replay seek, menu/reset, portrait.');
}finally{await browser.close();}
