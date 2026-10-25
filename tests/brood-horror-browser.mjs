import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output='artifacts/brood-horror';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
 await page.route('**/brood-gameplay-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/brood-gameplay-review');
 const report=await page.evaluate(async()=>{
  const [T,{GameRenderer},{World,idleInput},{enemyFloorHeight},{SPIDER_GEM,spiderLocalPoint,enemyEmergenceScale,enemyYaw},{EnemyGlowSources}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-floor.ts'),import('/src/enemy-presentation.ts'),import('/src/enemy-glow-sources.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});await game.prepare();
  const glows=new EnemyGlowSources(game.originalEnemies);
  for(const kind of ['egg','egg2','spiderling']){const e=new World(1,{schedule:false}).spawn(kind,{x:0,y:1,z:0});if(glows.sources(e,{x:0,y:2,z:8},game.camera).length)throw Error('Brood anatomy has a floating glow dot');}
  const inventory=[],kinds=['skull4','transmuted4','spider','spider2','spiderling','egg','egg2'];
  for(const kind of kinds){
   const model=game.originalEnemies.clone(kind);let triangles=0;
   model.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const [name,a]of Object.entries(o.geometry.attributes))if(![...a.array].every(Number.isFinite))throw Error(`${kind} has invalid ${name}`);}});
   const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());
   if(kind==='egg'||kind==='egg2'){
    if(model.getObjectByName('capsule-seam')||model.getObjectByName('capsule-tip'))throw Error('Retired ring/tip remains');
    if(Math.abs(size.y-(kind==='egg'?1.56:1.95))>1e-5)throw Error('Egg clearance envelope changed');
   }
   let draws=null,swarmTriangles=null;
   if(kind!=='spider'&&kind!=='spider2'){
    const meshes=game.originalEnemies.createSwarmBatch(kind,1);draws=meshes.length;swarmTriangles=meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
    if(draws!==1||swarmTriangles>2400)throw Error(`${kind} exceeds its instanced budget`);
   }
   inventory.push({kind,triangles,draws,swarmTriangles,size:size.toArray(),bottom:bounds.min.y});
  }
  // Functional mouth targets must track all exposed/folded poses, independent
  // of the newly authored skull face and surrounding tusks.
  let targetError=0;
  for(const kind of ['spider','spider2'])for(const exposure of [0,.3,.7,1])for(const yaw of [0,.8,2.5]){
   const world=new World(71,{schedule:false,invulnerable:true}),e=world.spawn(kind,{x:0,y:0,z:0});e.age=12;e.headExposure=exposure;e.facingYaw=yaw;
   const model=game.originalEnemies.clone(kind);game.originalEnemies.animate(model,e,12);model.position.copy(e.pos);model.scale.setScalar(enemyEmergenceScale(e));model.rotation.y=enemyYaw(e,world.player.pos);model.updateMatrixWorld(true);
   const actual=model.getObjectByName('spider-held-gem').getWorldPosition(new T.Vector3()),expected=spiderLocalPoint(e,world.player.pos,SPIDER_GEM);targetError=Math.max(targetError,actual.distanceTo(new T.Vector3(expected.x,expected.y,expected.z)));
  }
  const hatch=[];
  for(const kind of ['egg','egg2']){
   const world=new World(77,{schedule:false,invulnerable:true}),egg=world.spawn(kind,{x:0,y:1,z:-8});egg.age=9.99;world.step(idleInput());world.step(idleInput());
   const children=world.enemies.filter(e=>e.kind==='spiderling');hatch.push({kind,count:children.length,finite:children.every(e=>Object.values(e.pos).every(Number.isFinite)),remaining:world.enemies.filter(e=>e.kind===kind&&e.hp>0).length});
  }
  const hit=[];
  for(const kind of ['egg','egg2']){
   game.clear();const w=new World(72,{schedule:false,invulnerable:true});w.time=120;w.player.pos={x:0,y:1.7,z:8};const e=w.spawn(kind,{x:0,y:1,z:0});e.age=4;
   game.render(w,0,0,0,false,1,null,false,false,idleInput());w.damageEnemy(e,1);game.render(w,0,0,0,false,1,null,false,false,idleInput());
   const flagged=game.swarmBatches.get(kind).meshes[0].instanceColor.array[0];w.time+=.4;game.render(w,0,0,0,false,1,null,false,false,idleInput());
   const restored=game.swarmBatches.get(kind).meshes[0].instanceColor.array[0];w.damageEnemy(e,100);game.render(w,0,0,0,false,1,null,false,false,idleInput());hit.push({kind,flagged,restored,dead:e.hp<=0});
  }
  window.broodGameplay={T,game,World,idleInput,enemyFloorHeight};return {inventory,targetError,hatch,hit};
 });
 assert.ok(report.targetError<1e-5);assert.ok(report.hatch.every(h=>h.count===5&&h.finite&&h.remaining===0));assert.ok(report.hit.every(h=>h.flagged===1&&h.restored===0&&h.dead));
 const scenes=[];
 for(const [name,quality,time]of [['storm','high',120],['furnace','low',300],['depths','low',475]]){
  const counts=await page.evaluate(({quality,time})=>{
   const {game,World,idleInput,enemyFloorHeight}=window.broodGameplay;game.clear();game.configure({quality,fov:65,mist:true,skyMotion:'reduced',screenShake:0,movementMotion:0});const w=new World(72,{schedule:false,invulnerable:true});w.time=time;w.player.pos={x:0,y:1.7,z:18};
   for(const [kind,x,z]of [['skull4',-6,3],['transmuted4',3,-1],['spider',-12,-13],['spider2',17,-32],['egg',-2,7],['egg2',2,7]]){
    const e=w.spawn(kind,{x,y:1,z});e.age=kind.startsWith('egg')?4:12;e.headExposure=1;e.facingYaw=0;e.vel={x:0,y:0,z:6};
    e.pos.y=kind==='spider'?2.7*e.size*.62:kind==='spider2'?2.7*e.size*.62:enemyFloorHeight(e,w.time)+e.radius+.02;
   }
   for(let i=0;i<18;i++){const e=w.spawn('spiderling',{x:(i%6-2.5)*.8,y:.5,z:4-Math.floor(i/6)*1.1});e.age=12;}
   for(let i=0;i<6;i++)game.render(w,0,0,1/60,false,1,null,false,false,idleInput());
   const pixels=new Uint8Array(1280*800*4),colors=new Set(),gl=game.renderer.getContext();gl.finish();gl.readPixels(0,0,1280,800,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   for(let i=0;i<pixels.length;i+=116)colors.add((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]);
   return {calls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,screenColors:colors.size,camera:game.camera.position.toArray(),projectionFinite:game.camera.projectionMatrix.elements.every(Number.isFinite)};
  },{quality,time});scenes.push({name,...counts});await page.screenshot({path:`${output}/${name}-gameplay.png`});
 }
 assert.ok(scenes.every(s=>s.screenColors>30&&s.projectionFinite),'actual arena captures must contain visible scene detail: '+JSON.stringify(scenes));
 const dense=await page.evaluate(()=>{
  const {game,World,idleInput,enemyFloorHeight}=window.broodGameplay;game.clear();game.configure({quality:'low',fov:65,mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});const w=new World(73,{schedule:false,invulnerable:true});w.time=120;w.player.pos={x:0,y:2,z:32};
  for(let i=0;i<500;i++){const e=w.spawn('spiderling',{x:(i%30-15)*.65,y:.5,z:-Math.floor(i/30)*.8});e.age=12;}
  for(let i=0;i<120;i++){const e=w.spawn(i%2?'egg':'egg2',{x:(i%20-10)*1.2,y:1,z:-Math.floor(i/20)*2.1});e.age=4;}
  for(let i=0;i<8;i++){const e=w.spawn(i%2?'skull4':'transmuted4',{x:(i%4-1.5)*6,y:1.5,z:-15-Math.floor(i/4)*7});e.age=12;e.vel={x:0,y:0,z:6};}
  for(let i=0;i<12;i++){w.time=120+i/60;game.render(w,0,0,1/60,false,1,null,false,false,idleInput());}
  const gl=game.renderer.getContext(),times=[];
  for(let i=0;i<40;i++){const start=performance.now();w.time+=1/60;game.render(w,0,0,1/60,false,1,null,false,false,idleInput());gl.finish();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);return {calls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,shown:[...game.swarmBatches.values()].reduce((n,b)=>n+b.meshes[0].count,0),medianMs:times[20],p95Ms:times[38],measurement:'Local synchronous render wall time, 1280x800 low quality, GPU synchronization; diagnostic, not a cross-device FPS claim'};
 });await page.screenshot({path:`${output}/dense-gameplay.png`});
 assert.equal(dense.shown,628);assert.ok(dense.calls<80&&dense.triangles<1500000);assert.deepEqual(errors,[]);
 assert.equal(requests.filter(url=>/\/assets\/original\/devil-daggers\/(meshes|textures)\/(boid|spider|gigaegg)/.test(url)).length,0);
 await writeFile(`${output}/report.json`,JSON.stringify({...report,scenes,dense,errors},null,2));console.log(JSON.stringify({...report,scenes,dense,errors}));
}finally{await browser.close();}
