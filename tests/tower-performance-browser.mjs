import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 const before=await page.evaluate(async()=>{
  const [{World,v,idleInput,STEP},{GameRenderer},{enemyYaw,localToEnemy}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/enemy-presentation.ts')]);
  const canvas=document.createElement('canvas');canvas.id='tower-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999;width:100vw;height:100vh';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'high',fov:90});await Promise.all([renderer.originalEnemies.loaded,renderer.originalWeapon.loaded]);
  const world=new World(1,{schedule:false,invulnerable:true});world.player.pos=v(0,5,0);
  const towers=['squid','squid2','squid3'].map((kind,i)=>{const e=world.spawn(kind,v((i-1)*7,kind==='squid'?3.3:kind==='squid2'?5.2:7,-17));e.age=2;e.nextSpawn=Infinity;return e;});
  renderer.render(world,0,0,0,false);
  window.towerFixture={world,renderer,towers,idleInput,STEP,enemyYaw,localToEnemy};
  return towers.map(e=>renderer.enemies.get(e.id).rotation.y);
 });
 await page.locator('#tower-test').screenshot({path:'artifacts/towers-rotation-before.png'});
 const after=await page.evaluate(()=>{
  const {world,renderer,towers,enemyYaw,localToEnemy,idleInput,STEP}=window.towerFixture;
  const positions=towers.map(e=>({...e.pos})),player={...world.player.pos};
  for(let i=0;i<600;i++)world.step(idleInput(),STEP);
  // Restore positions solely for the screenshots, isolating axial spin from orbiting.
  const drift=towers.map((e,i)=>({inward:Math.hypot(positions[i].x,positions[i].z)-Math.hypot(e.pos.x,e.pos.z),cross:e.pos.x*positions[i].z-e.pos.z*positions[i].x}));
  towers.forEach((e,i)=>Object.assign(e.pos,positions[i]));Object.assign(world.player.pos,player);
  renderer.render(world,0,0,0,false);
  return towers.map((e,i)=>({...drift[i],yaw:renderer.enemies.get(e.id).rotation.y,expected:enemyYaw(e,world.player.pos),target:localToEnemy(e,world.player.pos,e.weakpoints[0].local)}));
 });
 await page.locator('#tower-test').screenshot({path:'artifacts/towers-rotation-after.png'});
 for(let i=0;i<3;i++){assert.ok(Math.abs(after[i].yaw-before[i]+1.4)<1e-9);assert.equal(after[i].yaw,after[i].expected);assert.ok(Math.abs(after[i].inward-2.5)<1e-8);assert.ok(Math.abs(after[i].cross)<1e-8);}
 const performanceResult=await page.evaluate(()=>{
  const {renderer,world,idleInput,STEP}=window.towerFixture;world.enemies=[];world.player.pos={x:0,y:1.7,z:0};world.level=4;
  for(let i=0;i<300;i++){const e=world.spawn('skull',{x:Math.sin(i)*20,y:2,z:Math.cos(i)*20});e.age=2;}
  for(let i=0;i<280;i++)world.projectiles.push({id:1000+i,pos:{x:i%20-10,y:4,z:-i%25},vel:{x:0,y:0,z:-70},age:0,homing:false,level:4});
  const start=performance.now();for(let i=0;i<60;i++){world.step(idleInput(),STEP);world.effects=[];}const simulationTickMs=(performance.now()-start)/60;
  for(let i=0;i<12;i++)renderer.effect({kind:'shot',pos:world.player.pos},world,0,0);
  const gl=renderer.renderer.getContext(),frames=[];
  for(let i=0;i<25;i++){const start=performance.now();renderer.render(world,0,0,1/60,false);gl.finish();if(i>=5)frames.push(performance.now()-start);}
  frames.sort((a,b)=>a-b);
  // Empty batches must not upload their capacity every frame.
  renderer.originalWeapon.clear();world.projectiles=[];renderer.render(world,0,0,0,false);
  const versions=[...renderer.originalWeapon.batches.values()].map(b=>b.mesh.instanceMatrix.version);
  renderer.render(world,0,0,0,false);
  const emptyUploadFree=versions.every((v,i)=>v===[...renderer.originalWeapon.batches.values()][i].mesh.instanceMatrix.version);
  return{simulationTickMs,renderMedianMs:frames[10],renderP95Ms:frames[19],pixelRatio:renderer.renderer.getPixelRatio(),emptyUploadFree};
 });
 assert.ok(performanceResult.emptyUploadFree);assert.deepEqual(errors,[]);
 const resolution=await page.evaluate(()=>{
  const {renderer}=window.towerFixture,full=renderer.renderer.getPixelRatio();
  for(let i=0;i<900;i++)renderer.trackFrame(1/30);
  const degraded=renderer.renderer.getPixelRatio();renderer.clear();
  return {full,degraded,reset:renderer.renderer.getPixelRatio()};
 });
 assert.ok(resolution.degraded<resolution.full);assert.equal(resolution.reset,resolution.full,'new runs restore full configured resolution');
 const result={rotationRadiansInFiveSeconds:after.map((a,i)=>a.yaw-before[i]),...performanceResult,resolution};
 await writeFile('artifacts/tower-performance.json',JSON.stringify(result,null,2));console.log('Tower rotation and performance browser passed:',JSON.stringify(result));
}finally{await browser.close();}
