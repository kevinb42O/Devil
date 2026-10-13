import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173');
 const results=await page.evaluate(async()=>{
  const [{World,v},{GameRenderer},{ENEMY_KINDS}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/enemy-kinds.ts')]);
  const canvas=document.createElement('canvas');canvas.id='enemy-light-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'low',fov:90});await Promise.all([renderer.originalEnemies.loaded,renderer.originalWeapon.loaded]);
  const world=new World(1,{schedule:false,invulnerable:true}),lighting=renderer.enemyLighting;
  const lightCount=()=>{let count=0;renderer.scene.traverse(o=>{if(o.isLight)count++;});return count;};
  world.player.pos=v(0,1.7,0);const initialLights=lightCount();
  const e=world.spawn('skull',v(0,2,-14));e.age=20;renderer.render(world,0,0,0,false);
  const singleCalls=renderer.renderer.info.render.calls,singleField=Array.from(lighting.pixels);
  for(let i=1;i<1000;i++){const e=world.spawn('skull',v(0,2,-14));e.age=20;}
  renderer.render(world,0,0,0,false);
  const swarmCalls=renderer.renderer.info.render.calls,swarmCount=lighting.aura.count;
  const overlapBounded=singleField.every((value,i)=>value===lighting.pixels[i]);
  const swarmLights=lightCount(),fieldBytes=lighting.pixels.byteLength;
  const gl=renderer.renderer.getContext(),frames=[];
  for(let i=0;i<12;i++){const start=performance.now();renderer.render(world,0,0,1/60,false);gl.finish();if(i>=3)frames.push(performance.now()-start);}
  frames.sort((a,b)=>a-b);
  world.enemies=[];
  for(let i=0;i<400;i++){const e=world.spawn('skull',v((i%20)*6-57,3,Math.floor(i/20)*6-57));e.age=20;}
  renderer.render(world,0,0,0,false);const dispersedSources=lighting.aura.count;
  world.enemies=[];
  for(const [i,kind] of ENEMY_KINDS.entries()){const e=world.spawn(kind,v((i%7-3)*8,kind.startsWith('squid')?5:kind==='leviathan'?10:2,-15-Math.floor(i/7)*15));e.age=20;}
  renderer.render(world,0,-.12,0,false);
  const kinds=world.enemies;const allKinds=kinds.every(e=>{e.pos=v(0,3,-14);world.enemies=[e];renderer.render(world,0,0,0,false);return lighting.aura.count>0&&lighting.pixels.some(v=>v>0);});world.enemies=kinds;
  renderer.clear();const cleared=lighting.aura.count===0&&lighting.pixels.every(v=>v===0);
  world.enemies=[];
  for(const [kind,pos] of [['squid',[-5,3.3,-12]],['squid2',[0,5.2,-15]],['squid3',[6,7,-20]],['skull',[-2,2,-7]],['skull2',[3,2,-9]]]){const e=world.spawn(kind,v(...pos));e.age=20;e.pos=v(...pos);}
  window.enemyLightingFixture={renderer,world};renderer.render(world,0,0,0,false);
  // Verify the source is visibly bright at its projected on-screen position.
  const [{Matrix4,Vector3}]=await Promise.all([import('/node_modules/.vite/deps/three.js')]);renderer.render(world,0,0,0,false);
  const positions=Array.from({length:lighting.aura.count},(_,i)=>new Vector3().setFromMatrixPosition(new Matrix4().fromArray(lighting.aura.instanceMatrix.array,i*16)).project(renderer.camera));
  const sample=source=>{const pixel=new Uint8Array(4);gl.readPixels(Math.round((source.x+1)*.5*gl.drawingBufferWidth),Math.round((source.y+1)*.5*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];};
  const lit=positions.map(sample);lighting.aura.visible=false;renderer.composer.render();renderer.originalWeapon.render(renderer.renderer,false);const unlit=positions.map(sample);lighting.aura.visible=true;renderer.render(world,0,0,0,false);
  const best=lit.reduce((best,p,i)=>p[0]-unlit[i][0]>lit[best][0]-unlit[best][0]?i:best,0),sourceLit=lit[best],sourceUnlit=unlit[best];

  return {initialLights,swarmLights,singleCalls,swarmCalls,swarmCount,overlapBounded,fieldBytes,allKinds,cleared,dispersedSources,sourceLit,sourceUnlit,swarmMedianMs:frames[4]};
 });
 assert.ok(results.sourceLit[0]>results.sourceUnlit[0]+30,'the crystal source must brighten the actual screen pixel');
 assert.equal(results.dispersedSources,800,'every dispersed skull keeps both source dots');
 assert.equal(results.initialLights,results.swarmLights,'population must not add scene lights');
 assert.equal(results.singleCalls,results.swarmCalls,'draw calls must stay constant for swarm growth');
 assert.equal(results.swarmCount,2,'coincident skulls share the two source dots');assert.equal(results.overlapBounded,true);assert.equal(results.fieldBytes,128*128*4);assert.equal(results.allKinds,true);assert.equal(results.cleared,true);
 for(const quality of ['low','high']){await page.evaluate(quality=>{const {renderer,world}=window.enemyLightingFixture;renderer.configure({quality,fov:90});renderer.render(world,0,0,0,false);},quality);await page.locator('#enemy-light-test').screenshot({path:`artifacts/enemy-lighting-${quality}.png`});}
 assert.deepEqual(errors,[]);console.log('Enemy lighting browser passed:',JSON.stringify(results));
}finally{await browser.close();}
