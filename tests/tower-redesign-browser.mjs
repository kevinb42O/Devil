import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const directory=process.env.TOWER_OUTPUT||'artifacts/tower-redesign';await mkdir(directory,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/tower-material-test',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body style="margin:0;background:#10151e"><canvas></canvas></body>'}));
 await page.goto(base+'/tower-material-test');
 const inventory=await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{crystalToEnemy,enemyEmergenceScale}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-presentation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,mist:false});await game.prepare();
  const assets=game.originalEnemies,scene=new THREE.Scene();scene.background=new THREE.Color(0x111720);
  scene.add(new THREE.HemisphereLight(0xb9d4ec,0x29201c,1.5));
  const key=new THREE.DirectionalLight(0xffdfb0,3.2);key.position.set(-6,11,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0x82b3e5,2.2);rim.position.set(5,7,-5);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x171c23,roughness:.94}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(36,1,.05,300),world=new World(71,{schedule:false});
  window.towerTest={THREE,game,assets,scene,camera,world,World,idleInput,crystalToEnemy,enemyEmergenceScale,floor};
  return ['squid','squid2','squid3'].map(kind=>{
   const model=assets.clone(kind),materials=new Set();let meshes=0;
   model.traverse(n=>{if(n.isMesh){meshes++;if(n.material.userData.towerSurface)materials.add(n.material);}});
   return {kind,meshes,finishes:[...materials].map(m=>m.userData.towerSurface),shared:[...materials].every(m=>{const second=assets.clone(kind);let shared=false;second.traverse(node=>{if(node.isMesh&&node.material===m)shared=true;});return shared;})};
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
   floor.position.y=-.02;camera.position.copy(center).add(new THREE.Vector3(...(kind==='squid'?[.63,.28,-1]:kind==='squid2'?[1,.28,.45]:[1,.35,1])).normalize().multiplyScalar(size.y*1.95));camera.lookAt(center);
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
 const structureChecks=await page.evaluate(()=>{
  const {assets,THREE}=window.towerTest;
  return ['squid','squid2','squid3'].map((kind,index)=>{
   const model=assets.clone(kind);if(model.getObjectByName('tower-foundation')||model.getObjectByName('tower-plinth'))throw Error('Floating creature has a base');model.updateMatrixWorld(true);let radius=0;
   model.traverse(node=>{if(!node.isMesh||node.name.startsWith('weak-point-'))return;const p=node.geometry.getAttribute('position'),v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld);radius=Math.max(radius,Math.hypot(v.x,v.z));}});
   return {kind,radius,limit:[1.8,2.5,3.2][index]*1.65};
  });
 });
 for(const check of structureChecks)assert.ok(check.radius<=check.limit,`${check.kind} armor escapes collision broad phase: ${check.radius}`);
 const anatomyChecks=await page.evaluate(()=>{
  const {assets,World,THREE,enemyEmergenceScale}=window.towerTest,world=new World(71,{schedule:false});
  return ['squid','squid2','squid3'].map(kind=>{
   const enemy=world.spawn(kind,{x:0,y:0,z:0}),model=assets.clone(kind);enemy.age=12;model.scale.setScalar(enemyEmergenceScale(enemy));
   const joints=[];model.traverse(n=>{if(n.userData.towerOrganicMotion?.kind==='tendril')joints.push(n);});
   const tip=joints.find(n=>n.userData.towerOrganicMotion.index===0&&n.userData.towerOrganicMotion.segment===4);
   const samples=[];let maxRadius=0;
   for(let frame=0;frame<40;frame++){
    enemy.age=12+frame*.15;assets.animate(model,enemy,enemy.age,true);model.updateMatrixWorld(true);
    samples.push(tip.localToWorld(new THREE.Vector3(0,-.3,0)));
    model.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.getAttribute('position'),v=new THREE.Vector3();for(let j=0;j<p.count;j++){v.fromBufferAttribute(p,j).applyMatrix4(n.matrixWorld);maxRadius=Math.max(maxRadius,Math.hypot(v.x,v.z));}});
   }
   const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),motion=Math.max(...samples.map(p=>p.distanceTo(samples[0]))),scale=enemyEmergenceScale(enemy);
   return {kind,joints:joints.length,tipTravel:motion,height:size.y,width:Math.max(size.x,size.z),scale,increasePercent:(scale/.62-1)*100,maxRadius,limit:({squid:1.8,squid2:2.5,squid3:3.2})[kind]*1.65*scale};
  });
 });
 for(const check of anatomyChecks){assert.ok(check.tipTravel>.35,`${check.kind} tendril motion is unreadable`);assert.ok(check.maxRadius<check.limit,`${check.kind} animated tips escape collision bounds`);}
 // Record the actual authored models and shared opening animation.
 const movie=await page.evaluate(async()=>{
  const {game,assets,scene,camera,THREE,World,enemyEmergenceScale}=window.towerTest;
  scene.remove(window.towerTest.model);const world=new World(71,{schedule:false});
  const models=['squid','squid2','squid3'].map((kind,i)=>{const enemy=world.spawn(kind,{x:(i-1)*10,y:0,z:0}),model=assets.clone(kind);enemy.age=12;model.position.set((i-1)*10,0,0);scene.add(model);return {model,enemy};});
  game.renderer.setSize(1600,900);camera.aspect=1600/900;camera.fov=43;camera.updateProjectionMatrix();camera.position.set(21,16,37);camera.lookAt(0,6,0);
  const chunks=[],recorder=new MediaRecorder(game.renderer.domElement.captureStream(30),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6000000});recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  const start=performance.now();await new Promise(resolve=>{const frame=()=>{const t=(performance.now()-start)/1000;for(const {model,enemy}of models){enemy.age=2.3+t;assets.animate(model,enemy,enemy.age,true);model.rotation.y=.8;model.scale.setScalar(enemyEmergenceScale(enemy));model.position.y=.85+Math.sin(enemy.age*.95)*.18;}game.renderer.render(scene,camera);if(t<8)requestAnimationFrame(frame);else resolve();};frame();});
  recorder.stop();await done;const data=await new Blob(chunks,{type:'video/webm'}).arrayBuffer();let binary='';for(const byte of new Uint8Array(data))binary+=String.fromCharCode(byte);return btoa(binary);
 });
 await writeFile(`${directory}/towers-in-motion.webm`,Buffer.from(movie,'base64'));
 const panels=await Promise.all(['squid','squid2','squid3'].map(async kind=>`data:image/png;base64,${(await readFile(`${directory}/${kind}.png`)).toString('base64')}`));
 const sheet=await browser.newPage({viewport:{width:1800,height:700},deviceScaleFactor:1});
 await sheet.setContent(`<body style="margin:0;background:#111720;color:#e1e5e7;font-family:Arial"><div style="display:flex">${panels.map((src,i)=>`<div style="width:600px"><img style="display:block;width:600px;height:600px" src="${src}"><div style="padding:12px 30px;font-size:24px">${['Maw Lantern','Bifanged Broodmother','Crowned Abomination'][i]}</div></div>`).join('')}</div></body>`);await sheet.screenshot({path:`${directory}/all-towers.png`});await sheet.close();
 assert.equal(gameChecks.texturedDraws,gameChecks.baselineDraws);assert.ok(gameChecks.maximumCrystalError<1e-6);assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({inventory,gameChecks,crystalChecks,structureChecks,anatomyChecks,errors},null,2));console.log(JSON.stringify({inventory,gameChecks,crystalChecks,structureChecks,anatomyChecks,errors}));
}finally{await browser.close();}
