import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const directory='artifacts/tower-materials';await mkdir(directory,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/tower-material-test',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body style="margin:0;background:#10151e"><canvas></canvas></body>'}));
 await page.goto(base+'/tower-material-test');
 const inventory=await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{crystalToEnemy}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-presentation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,mist:false});await game.prepare();
  const assets=game.originalEnemies,scene=new THREE.Scene();scene.background=new THREE.Color(0x111720);
  scene.add(new THREE.HemisphereLight(0xb9d4ec,0x29201c,1.5));
  const key=new THREE.DirectionalLight(0xffdfb0,3.2);key.position.set(-6,11,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0x82b3e5,2.2);rim.position.set(5,7,-5);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x171c23,roughness:.94}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(36,1,.05,300),world=new World(71,{schedule:false});
  window.towerTest={THREE,game,assets,scene,camera,world,World,idleInput,crystalToEnemy,floor};
  return ['squid','squid2','squid3'].map(kind=>{
   const model=assets.clone(kind),materials=new Set();let meshes=0;
   model.traverse(n=>{if(n.isMesh){meshes++;if(n.material.userData.towerSurface)materials.add(n.material);}});
   return {kind,meshes,finishes:[...materials].map(m=>m.userData.towerSurface),shared:[...materials].every(m=>{const second=assets.clone(kind);return second.getObjectByName(model.getObjectByProperty('material',m).name).material===m;})};
  });
 });
 for(const entry of inventory){
  assert.equal(entry.finishes.length,3);assert.ok(entry.shared);
  await page.evaluate(kind=>{
   const {THREE,game,assets,scene,camera,world,floor}=window.towerTest;
   if(window.towerTest.model)scene.remove(window.towerTest.model);
   const enemy=world.spawn(kind,{x:0,y:0,z:0});enemy.age=12;
   const model=assets.clone(kind);assets.animate(model,enemy,12,true);model.position.copy(enemy.pos);scene.add(model);model.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
   floor.position.y=box.min.y-.02;camera.position.copy(center).add(new THREE.Vector3(.63,.28,1).normalize().multiplyScalar(size.y*1.95));camera.lookAt(center);
   game.renderer.setSize(1000,1000);game.renderer.render(scene,camera);window.towerTest.model=model;
  },entry.kind);
  await page.screenshot({path:`${directory}/${entry.kind}.png`});
 }
 const gameChecks=await page.evaluate(()=>{
  const {game,World,idleInput,THREE,crystalToEnemy}=window.towerTest;
  game.clear();game.configure({quality:'high',fov:75,screenShake:0,movementMotion:0,mist:false,skyMotion:'reduced'});
  const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:20};
  ['squid','squid2','squid3'].forEach((kind,i)=>{const e=world.spawn(kind,{x:(i-1)*12,y:0,z:-12});e.age=12;});
  world.time=12;game.renderer.setSize(1000,1000);game.render(world,0,.22,0,false,1,null,false,false,idleInput());
  const texturedDraws=game.renderer.info.render.calls;let maximumCrystalError=0;
  for(const enemy of world.enemies){
   const model=game.enemies.get(enemy.id);model.updateMatrixWorld(true);
   enemy.weakpoints.forEach((point,i)=>{const actual=model.getObjectByName(`weak-point-${i}`).getWorldPosition(new THREE.Vector3()),expected=crystalToEnemy(enemy,world.player.pos,point.local);maximumCrystalError=Math.max(maximumCrystalError,actual.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z)));});
  }
  const saved=[];for(const model of game.enemies.values())model.traverse(node=>{const surface=node.material?.userData?.towerSurface;if(surface){saved.push([node,node.material]);node.material=game.originalEnemies.material(`tower-baseline-${surface.finish}`,surface.finish==='metal'?0x82959b:surface.finish==='stone'?0x344552:0x101820);}else if(node.material?.name.startsWith('remake-tower-crystal')){saved.push([node,node.material]);node.material=game.originalEnemies.core();}});
  game.render(world,0,.22,0,false,1,null,false,false,idleInput());const baselineDraws=game.renderer.info.render.calls;
  window.towerTest.restore=()=>{for(const [node,material]of saved)node.material=material;game.render(world,0,.22,0,false,1,null,false,false,idleInput());};
  return {texturedDraws,baselineDraws,maximumCrystalError};
 });
 await page.screenshot({path:`${directory}/in-game-before.png`});
 await page.evaluate(()=>window.towerTest.restore());await page.screenshot({path:`${directory}/in-game-after.png`});
 const crystalChecks=await page.evaluate(()=>{
  const {assets,World}=window.towerTest;
  return ['squid','squid2','squid3'].map(kind=>{
   const world=new World(71,{schedule:false}),enemy=world.spawn(kind,{x:0,y:0,z:0});enemy.age=12;enemy.weakpoints[0].hp=2;
   const model=assets.clone(kind),node=model.getObjectByName('weak-point-0');assets.animate(model,enemy,12,true);
   const normal=node.material.name;enemy.weakpoints[0].hp=1;assets.animate(model,enemy,12.05,true);const hit=node.material.name;
   assets.animate(model,enemy,12.4,true);const settled=node.material.name;
   enemy.weakpoints[0].hp=0;assets.animate(model,enemy,12.5,true);
   return {kind,normal,hit,settled,destroyedHidden:!node.visible};
  });
 });
 for(const crystal of crystalChecks){assert.equal(crystal.normal,'remake-tower-crystal');assert.equal(crystal.hit,'remake-tower-crystal-hit');assert.equal(crystal.settled,crystal.normal);assert.equal(crystal.destroyedHidden,true);}
 assert.equal(gameChecks.texturedDraws,gameChecks.baselineDraws);assert.ok(gameChecks.maximumCrystalError<1e-6);assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({inventory,gameChecks,crystalChecks,errors},null,2));console.log(JSON.stringify({inventory,gameChecks,crystalChecks,errors}));
}finally{await browser.close();}
