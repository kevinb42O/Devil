import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
await mkdir('artifacts/remake-models',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:720,height:520}}),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
 await page.route('**/remake-model-gallery',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#10151e"><canvas></canvas><div id="label" style="position:absolute;bottom:24px;left:24px;font:22px sans-serif;color:#edf1f6"></div></body>'}));
 await page.goto(base+'/remake-model-gallery');
 const inventory=await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{ENEMY_KINDS,isPede},{REMAKE_NAMES},{crystalToEnemy,spiderLocalPoint,SPIDER_GEM,enemyYaw,towerOutletHeight},{towerFloorHeight}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-kinds.ts'),import('/src/remake-enemies.ts'),import('/src/enemy-presentation.ts'),import('/src/enemy-floor.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90});await game.prepare();const assets=game.originalEnemies;
  if(!assets.ready)throw Error(assets.error);const inventory=[];
  for(const kind of ENEMY_KINDS){
   const world=new World(1,{schedule:false}),enemy=world.spawn(kind,{x:0,y:0,z:0},false);enemy.age=12;enemy.headExposure=1;
   const model=assets.clone(kind);assets.animate(model,enemy,12,true);model.position.set(enemy.pos.x,enemy.pos.y,enemy.pos.z);model.rotation.y=enemyYaw(enemy,world.player.pos);model.updateMatrixWorld(true);
   let triangles=0;model.traverse(node=>{if(node.isMesh){triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;if(!Array.from(node.geometry.attributes.position.array).every(Number.isFinite))throw Error('Invalid geometry '+kind);}});
   if(kind.startsWith('squid')){
    const tier=Number(kind.slice(5))||1;let shafts=0;
    model.traverse(node=>{if(node.name==='tower-chimney')shafts++;});
    if(shafts!==tier||!model.getObjectByName('tower-plinth')||!model.getObjectByName('tower-exhaust'))throw Error('Missing tower architecture '+kind);
    const crown=model.getObjectByName('warden-crest'),rest=crown.position.y;
    assets.animate(model,{...enemy,age:3},12,false);const open=crown.position.y;
    assets.animate(model,{...enemy,age:5},12,false);const closed=crown.position.y;
    if(Math.abs(open-closed-.4)>1e-6)throw Error('Tower crown does not open '+kind);
    crown.position.y=rest;
    model.updateMatrixWorld(true);
    const foot=model.getObjectByName('tower-plinth'),bottom=foot.getWorldPosition(new THREE.Vector3()).y-.3;
    if(Math.abs(bottom-towerFloorHeight(enemy,12))>1e-6)throw Error('Floating tower foundation '+kind);
    if(enemy.weakpoints.some(p=>Math.abs(p.local.y-(towerOutletHeight(kind)-.4))>1e-6))throw Error('Crystals below crown '+kind);

   }
   const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());if(size.length()<.1||!Number.isFinite(size.length()))throw Error('Empty model '+kind);
   if(model.userData.source!=='licensed-community-remake')throw Error('Original template '+kind);
   for(let i=0;i<enemy.weakpoints.length;i++){
    const node=model.getObjectByName('weak-point-'+i);if(!node)throw Error('Missing weakpoint '+kind);
    const p=node.getWorldPosition(new THREE.Vector3()),expected=crystalToEnemy(enemy,world.player.pos,enemy.weakpoints[i].local);
    if(p.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))>1e-6)throw Error('Weakpoint mismatch '+JSON.stringify({kind,actual:p.toArray(),expected,enemyPos:enemy.pos,local:enemy.weakpoints[i].local}));
   }
   if(kind==='spider'||kind==='spider2'){
    const expected=spiderLocalPoint(enemy,world.player.pos,SPIDER_GEM),actual=model.getObjectByName('spider-held-gem').getWorldPosition(new THREE.Vector3());
    if(actual.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))>1e-6)throw Error('Spider weakpoint mismatch '+kind);
   }
   inventory.push({kind,name:REMAKE_NAMES[kind],triangles,size:size.toArray(),weakpoints:enemy.weakpoints.length});
  }
  const gallery=new THREE.Scene();gallery.background=new THREE.Color(0x10151e);const camera=new THREE.PerspectiveCamera(38,720/520,.01,500);
  const grid=new THREE.GridHelper(100,50,0x293849,0x1b2633);gallery.add(grid);
  window.gallery={THREE,game,assets,World,idleInput,ENEMY_KINDS,isPede,REMAKE_NAMES,scene:gallery,camera,grid};return inventory;
 });
 for(const entry of inventory){
  await page.evaluate(kind=>{
   const {THREE,game,assets,World,isPede,REMAKE_NAMES,scene,camera,grid}=window.gallery;
   if(window.gallery.model)scene.remove(window.gallery.model);
   const world=new World(1,{schedule:false}),enemy=world.spawn(kind,{x:0,y:0,z:0},false);enemy.age=12;enemy.headExposure=1;
   const model=assets.clone(kind);assets.animate(model,enemy,12,true);model.position.set(enemy.pos.x,enemy.pos.y,enemy.pos.z);
   if(isPede(kind))for(let i=0;i<7;i++){const segment=assets.segment(i!==4,kind);segment.position.set(Math.sin(i*.5)*.4,0,-2.1*(i+1));model.add(segment);}
   scene.add(model);window.gallery.model=model;model.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),distance=Math.max(size.x,size.y,size.z)*1.85;
   grid.position.y=box.min.y-.08;camera.position.copy(center).add(new THREE.Vector3(.55,.3,1).normalize().multiplyScalar(distance));camera.lookAt(center);
   game.renderer.setSize(720,520);game.renderer.render(scene,camera);document.querySelector('#label').textContent=REMAKE_NAMES[kind];
  },entry.kind);
  await page.screenshot({path:`artifacts/remake-models/${entry.kind}.png`});
 }
 // Exercise the actual game renderer, including instancing, segment batching,
 // blood replacement, surface shaders and all 22 enemy paths.
 const play=await page.evaluate(()=>{
  const {game,World,idleInput,ENEMY_KINDS}=window.gallery,world=new World(71,{schedule:false});world.player.pos={x:0,y:1.7,z:18};
  ENEMY_KINDS.forEach((kind,i)=>{const e=world.spawn(kind,{x:(i%6-2.5)*8,y:kind==='leviathan'?14:kind.startsWith('squid')?5:3,z:-Math.floor(i/6)*15},false);e.age=12;e.headExposure=1;});
  for(let i=0;i<4;i++){world.time=12+i/60;game.render(world,0,.08,1/60,false,1,null,false,false,idleInput());}
  document.querySelector('#label').textContent='22 replacement models · in-game renderer';
  return {enemies:world.enemies.length,drawCalls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles};
 });
 await page.screenshot({path:'artifacts/remake-models/in-game.png'});
 await page.setViewportSize({width:1280,height:720});
 const towerScale=await page.evaluate(()=>{
  const {game,World,idleInput}=window.gallery;game.clear();const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:20};
  ['squid','squid2','squid3'].forEach((kind,i)=>{const enemy=world.spawn(kind,{x:(i-1)*12,y:0,z:-12});enemy.age=12;});
  game.renderer.setSize(1280,720);game.configure({quality:'low',fov:75,screenShake:0,movementMotion:0,mist:false});
  game.render(world,0,.22,0,false,1,null,false,false,idleInput());document.querySelector('#label').textContent='Grounded towers · view from player eye height (1.7 m)';
  return world.enemies.map(e=>({kind:e.kind,crystalWorldHeight:e.pos.y+e.weakpoints[0].local.y}));
 });
 await page.screenshot({path:'artifacts/remake-models/tower-scale.png'});
 await page.setViewportSize({width:720,height:520});
 const dense=await page.evaluate(()=>{
  const {game,World,idleInput}=window.gallery;game.clear();game.renderer.setSize(720,520);const world=new World(72,{schedule:false});world.player.pos={x:0,y:1.7,z:18};
  for(let i=0;i<1000;i++){const enemy=world.spawn(i%3===0?'skull2':'skull',{x:(i%40-20)*.5,y:1+Math.floor(i/40)%7,z:-2-Math.floor(i/40)*.7},false);enemy.age=12;}
  const started=performance.now();for(let i=0;i<20;i++){world.time=12+i/60;game.render(world,0,.12,1/60,false,1,null,false,false,idleInput());}
  document.querySelector('#label').textContent='1,000 replacement swarm enemies';
  return {enemies:world.enemies.length,drawCalls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,cpuRenderMeanMs:(performance.now()-started)/20};
 });
 assert.ok(dense.drawCalls<70,'swarm draws remain batched: '+JSON.stringify(dense));assert.ok(dense.triangles<1500000,'bounded swarm geometry');
 await page.screenshot({path:'artifacts/remake-models/dense-swarm.png'});
 const oldModels=requests.filter(url=>/\/assets\/original\/devil-daggers\/(meshes|textures)\//.test(url)&&!/(?:\/meshes\/(?:dagger|flame[1-8]|ember[1-3])\.obj|\/textures\/(?:dagger[2-6]?|emberflame)\.png)$/.test(url));
 assert.deepEqual(oldModels,[],'no old enemy, floor, hand, blood or smoke model requests');assert.deepEqual(errors,[]);
 await writeFile('artifacts/remake-models/report.json',JSON.stringify({inventory,play,towerScale,dense,oldModels,errors},null,2));console.log(JSON.stringify({models:inventory.length,play,dense,oldModels,errors}));
}finally{await browser.close();}
