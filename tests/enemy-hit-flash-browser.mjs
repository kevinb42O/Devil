import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [{World,v},{GameRenderer},{enemyHitFlash}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/enemy-hit-flash.ts')]);
  const canvas=document.createElement('canvas');canvas.id='hit-flash-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'low',fov:90});await Promise.all([renderer.originalEnemies.loaded,renderer.originalWeapon.loaded]);
  const world=new World(1,{schedule:false,invulnerable:true});world.time=20;world.player.pos=v(0,1.7,0);
  const a=world.spawn('skull2',v(-2,2,-9)),b=world.spawn('skull2',v(2,2,-9));a.age=b.age=20;
  const draw=()=>renderer.render(world,0,0,0,false);
  const pixels=()=>{const gl=renderer.renderer.getContext(),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  draw();const before=pixels();world.damageEnemy(a,1);draw();const hit=pixels();
  const batch=renderer.swarmBatches.get('skull2'),flags=Array.from(batch.meshes[0].instanceColor.array.slice(0,6));
  let changed=0;for(let i=0;i<hit.length;i+=4)if(hit[i]>before[i]+20)changed++;
  world.time+=.075;draw();const gap=Array.from(batch.meshes[0].instanceColor.array.slice(0,3));
  world.time+=.03;draw();const second=enemyHitFlash(a,world.time);
  world.time+=.1;draw();const expired=enemyHitFlash(a,world.time);
  // Grow a batch after setting the first enemy's flag; it must survive reallocation.
  world.damageEnemy(a,1);for(let i=0;i<130;i++){const e=world.spawn('skull2',v(2,2,-9));e.age=20;}draw();
  const growthFlag=renderer.swarmBatches.get('skull2').meshes[0].instanceColor.array[0];
  world.enemies=[];
  const checks=[];
  for(const kind of ['spider','squid','squid2','squid3','centipede','orb','thorn']){
   const e=world.spawn(kind,v(0,3,-12));e.age=20;draw();const model=renderer.enemies.get(e.id);
   let body;model.traverse(o=>{if(!body&&o.isMesh&&!o.name.includes('weak-point')&&o.name!=='spider-held-gem')body=o;});
   const original=body.material,segment=e.weakpoints.length?0:e.segments.length?0:-1;
   world.damageEnemy(e,1,e.pos,segment,!!e.weakpoints.length);draw();const flashed=body.material!==original;
   world.time+=.2;draw();checks.push({kind,flashed,restored:body.material===original});world.enemies=[];
  }
  world.gems=[];const e=world.spawn('spider',v(0,2,-9));e.pos=v(0,0,-9);e.facingYaw=0;e.age=20;e.headExposure=1;draw();world.damageEnemy(e,1);draw();
  window.hitFixture={world,renderer};
  return {flags,gap,second,expired,changed,growthFlag,checks};
 });
 assert.deepEqual(result.flags,[1,1,1,0,0,0],'only the struck instance flashes');
 assert.deepEqual(result.gap,[0,0,0]);assert.equal(result.second,true);assert.equal(result.expired,false);
 assert.equal(result.growthFlag,1);assert.ok(result.changed>50,'flash must visibly brighten rendered pixels');
 for(const check of result.checks)assert.ok(check.flashed===!check.kind.startsWith('squid')&&check.restored,JSON.stringify(check));
 await mkdir('artifacts/hit-flash',{recursive:true});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{const {world,renderer}=window.hitFixture;renderer.render(world,0,0,0,false);resolve();})));
 await page.locator('#hit-flash-test').screenshot({path:'artifacts/hit-flash/hit.png'});
 await page.evaluate(()=>{const {world,renderer}=window.hitFixture;world.time+=.2;renderer.render(world,0,0,0,false);});
 await page.locator('#hit-flash-test').screenshot({path:'artifacts/hit-flash/normal.png'});
 assert.deepEqual(errors,[]);console.log('Enemy hit flash passed:',JSON.stringify(result));
}finally{await browser.close();}
