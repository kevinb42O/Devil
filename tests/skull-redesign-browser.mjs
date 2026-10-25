import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/skull-redesign';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/skull-redesign-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#10151e"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/skull-redesign-review');
 const inventory=await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{REMAKE_NAMES},{EnemyGlowSources}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/remake-enemies.ts'),import('/src/enemy-glow-sources.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,screenShake:0,movementMotion:0,skyMotion:'reduced'});await game.prepare();
  const assets=game.originalEnemies,scene=new THREE.Scene();scene.background=new THREE.Color(0x10151e);
  scene.add(new THREE.HemisphereLight(0xb5c7df,0x241b19,1.15));
  const key=new THREE.DirectionalLight(0xffdfbe,2.6);key.position.set(-5,7,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0x6d93c1,2.1);rim.position.set(4,3,-5);scene.add(rim);
  const camera=new THREE.PerspectiveCamera(38,1.5,.01,200),kinds=['skull','skull2','skull3','transmuted1','transmuted2','transmuted3'];
  window.skulls={THREE,game,assets,World,idleInput,REMAKE_NAMES,scene,camera,kinds,EnemyGlowSources};
  return kinds.map(kind=>{
   const batches=assets.createSwarmBatch(kind,1);let triangles=0;
   for(const mesh of batches){const g=mesh.geometry;triangles+=(g.index?.count??g.attributes.position.count)/3;for(const name of ['position','normal','creatureCoord','creatureRegion','motionWeight'])if(!g.getAttribute(name)||![...g.getAttribute(name).array].every(Number.isFinite))throw Error('Invalid '+kind+'/'+name);}
   return {kind,name:REMAKE_NAMES[kind],draws:batches.length,triangles};
  });
 });
 for(const kind of inventory.map(e=>e.kind))for(const angle of ['front','quarter']){
  await page.evaluate(({kind,angle})=>{
   const {THREE,game,assets,scene,camera}=window.skulls;if(window.skulls.model)scene.remove(window.skulls.model);
   const model=assets.clone(kind);scene.add(model);window.skulls.model=model;model.updateMatrixWorld(true);assets.setTime(18);
   const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
   camera.position.copy(center).add(new THREE.Vector3(angle==='front'?0:.48,.12,1).normalize().multiplyScalar(Math.max(size.y,size.x/1.5)*1.95));camera.lookAt(center);game.renderer.setSize(1200,800);game.renderer.render(scene,camera);
  },{kind,angle});await page.screenshot({path:`${directory}/${kind}-${angle}.png`});
 }
 const darkness=[];
 for(const kind of ['skull','skull2','skull3']){
  const result=await page.evaluate(kind=>{
   const {THREE,game,assets,scene,camera}=window.skulls;
   if(window.skulls.model)scene.remove(window.skulls.model);
   const model=assets.clone(kind);scene.add(model);window.skulls.model=model;model.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
   camera.position.copy(center).add(new THREE.Vector3(.48,.12,1).normalize().multiplyScalar(Math.max(size.y,size.x/1.5)*1.95));camera.lookAt(center);
   scene.traverse(o=>{if(o.isLight){o.userData.originalIntensity=o.intensity;o.intensity=0;}});
   const gl=game.renderer.getContext(),sample=()=>{game.renderer.render(scene,camera);const pixels=new Uint8Array(1200*800*4);gl.readPixels(0,0,1200,800,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
   const normal=sample();model.traverse(o=>{if(o.isMesh&&o.material.userData.skullLight)o.material.userData.skullLight.value=0;});const disabled=sample();
   let lifted=0;for(let i=0;i<normal.length;i+=4)if(Math.max(normal[i]-disabled[i],normal[i+1]-disabled[i+1],normal[i+2]-disabled[i+2])>12)lifted++;
   model.traverse(o=>{if(o.isMesh&&o.material.userData.skullLight)o.material.userData.skullLight.value=1;});sample();
   return {kind,lifted};
  },kind);
  darkness.push(result);await page.screenshot({path:`${directory}/${kind}-unlit.png`});
  await page.evaluate(()=>window.skulls.scene.traverse(o=>{if(o.isLight)o.intensity=o.userData.originalIntensity;}));
 }
 const checks=await page.evaluate(()=>{
  const {game,World,idleInput,EnemyGlowSources}=window.skulls;
  game.clear();game.configure({quality:'low',fov:75,mist:false,screenShake:0,movementMotion:0});
  const world=new World(71,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:1.7,z:12};
  ['skull','skull2','skull3'].forEach((kind,i)=>{const e=world.spawn(kind,{x:(i-1)*2.8,y:2.1,z:0});e.age=12;});
  game.render(world,0,0,0,false,1,null,false,false,idleInput());window.skulls.world=world;
  const noFloatingLights=world.enemies.every(e=>new EnemyGlowSources(game.originalEnemies).sources(e,world.player.pos,game.camera).length===0);
  const victim=world.enemies[1];world.damageEnemy(victim,1);game.render(world,0,0,0,false);
  const hitFlag=game.swarmBatches.get('skull2').meshes[0].instanceColor.array[0];world.time+=.3;game.render(world,0,0,0,false);
  const restoredFlag=game.swarmBatches.get('skull2').meshes[0].instanceColor.array[0];
  return {noFloatingLights,hitFlag,restoredFlag};
 });
 await page.screenshot({path:`${directory}/arena.png`});
 for(const quality of ['low','high'])for(const [chapter,time]of [['storm',120],['furnace',300],['depths',475]]){
  await page.evaluate(({quality,time})=>{const {game,world,idleInput}=window.skulls;game.configure({quality,fov:75,mist:true,screenShake:0,movementMotion:0,skyMotion:'reduced'});world.time=time;game.render(world,0,0,0,false,1,null,false,false,idleInput());},{quality,time});
  await page.screenshot({path:`${directory}/${chapter}-${quality}.png`});
 }

 const dense=await page.evaluate(()=>{
  const {game,World,idleInput}=window.skulls;game.clear();game.configure({quality:'low',mist:false});const world=new World(72,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:2,z:32};
  for(let i=0;i<1000;i++){const e=world.spawn(['skull','skull2','skull3'][i%3],{x:(i%40-20)*.6,y:1+Math.floor(i/200)*.6,z:-Math.floor(i/40)*.8});e.age=12;}
  game.render(world,0,0,0,false,1,null,false,false,idleInput());const shown=[...game.swarmBatches.values()].reduce((n,b)=>n+b.meshes[0].count,0);
  let lights=0;game.scene.traverse(o=>{if(o.isLight)lights++;});return {shown,draws:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,lights};
 });await page.screenshot({path:`${directory}/dense.png`});
 assert.ok(darkness.every(e=>e.lifted>800),'each skull retains visible shaded surfaces without scene lights: '+JSON.stringify(darkness));
 assert.ok(inventory.every(e=>e.draws===1&&e.triangles<2400));assert.equal(dense.shown,1000);assert.ok(dense.triangles<2400000);assert.ok(dense.draws<70);assert.ok(checks.noFloatingLights);assert.equal(checks.hitFlag,1);assert.equal(checks.restoredFlag,0);assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({inventory,checks,darkness,dense,errors},null,2));console.log(JSON.stringify({inventory,checks,darkness,dense,errors}));
}finally{await browser.close();}
