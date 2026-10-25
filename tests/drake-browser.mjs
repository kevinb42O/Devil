import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
await mkdir('artifacts/drake-ground',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/drake-check',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto(base+'/drake-check');
 const report=await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{enemyFloorHeight},{EnemyGlowSources}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-floor.ts'),import('/src/enemy-glow-sources.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:75,mist:false});await renderer.prepare();
  if(!renderer.originalEnemies.ready)throw Error(renderer.originalEnemies.error);
  const sizes={},glows=new EnemyGlowSources(renderer.originalEnemies);
  for(const kind of ['skull4','transmuted4']){
   const model=renderer.originalEnemies.clone(kind);model.updateMatrixWorld(true);
   const e=new World(1,{schedule:false}).spawn(kind,{x:0,y:2,z:0});e.age=12;
   if(glows.sources(e,{x:0,y:1.7,z:10},renderer.camera).length)throw Error('Drake still has billboard dots');
   const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());sizes[kind]={size:size.toArray(),bottom:box.min.y};
   const skull=model.getObjectByName('drake-skull');
   if(!skull||new THREE.Box3().setFromObject(skull).getSize(new THREE.Vector3()).x<3)throw Error('Missing broad replacement skull');
   const wings=model.getObjectByName('community-dragon'),wingRegion=wings.geometry.getAttribute('creatureRegion');
   for(const index of wings.geometry.index.array)if(Math.abs(wingRegion.getX(index)-2)>.5)throw Error('Original smiling face remains in wing geometry');
  }
  const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:15};
  const drake=world.spawn('skull4',{x:0,y:8,z:-16});drake.age=12;
  for(let i=0;i<360;i++){world.step(idleInput());world.effects=[];}
  renderer.render(world,0,0,0,false,1,null,false,false,idleInput());
  window.drakeCheck={renderer,world};
  drake.kind='transmuted4';renderer.render(world,0,0,0,false,1,null,false,false,idleInput());
  drake.kind='skull4';renderer.render(world,0,0,0,false,1,null,false,false,idleInput());
  return {sizes,position:drake.pos,floor:enemyFloorHeight(drake,world.time),radius:drake.radius,drawCalls:renderer.renderer.info.render.calls};
 });
 for(const value of Object.values(report.sizes)){assert.ok(Math.abs(Math.max(...value.size)-6)<1e-5,'six-unit model span');assert.ok(value.bottom>=-1.30001,'body and halo stay above the collision floor');}
 assert.ok(Math.abs(report.position.y-report.floor-report.radius-.02)<1e-8,'landed floor chase');
 await page.screenshot({path:'artifacts/drake-ground/ground-chase.png'});
 await page.evaluate(()=>{const {renderer,world}=window.drakeCheck;world.enemies[0].vel={x:3,y:0,z:8};renderer.render(world,0,0,0,false,1,null,false,false,{forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false});});
 await page.screenshot({path:'artifacts/drake-ground/three-quarter.png'});
 assert.deepEqual(errors,[]);await writeFile('artifacts/drake-ground/report.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
