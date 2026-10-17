import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const directory='artifacts/enemy-materials';await mkdir(`${directory}/before`,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/enemy-materials-test',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body style="margin:0;background:#10151e"><canvas></canvas></body>'}));
 await page.goto(base+'/enemy-materials-test');
 const inventory=await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{ENEMY_KINDS,isPede},{REMAKE_NAMES},{ENEMY_SURFACE_PROFILES}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-kinds.ts'),import('/src/remake-enemies.ts'),import('/src/enemy-material-profiles.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,screenShake:0,movementMotion:0,mist:false,skyMotion:'reduced'});await game.prepare();
  const assets=game.originalEnemies,scene=new THREE.Scene();scene.background=new THREE.Color(0x10151e);
  scene.add(new THREE.HemisphereLight(0xc0d1e0,0x39302c,1.6));
  const key=new THREE.DirectionalLight(0xffe1b7,3.0);key.position.set(-5,8,7);scene.add(key);
  const rim=new THREE.DirectionalLight(0x8cacdc,2.2);rim.position.set(5,4,-5);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:0x171e26,roughness:.9}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(38,960/800,.01,500);
  window.enemySurfaces={THREE,game,assets,World,idleInput,ENEMY_KINDS,isPede,REMAKE_NAMES,profiles:ENEMY_SURFACE_PROFILES,scene,camera,floor};
  return ENEMY_KINDS.map(kind=>{
   const model=assets.clone(kind),entries=[];
   const inspect=node=>{if(!node.isMesh)return;const material=node.material,surface=material.userData.enemySurface;
    if(!surface&&!material.userData.towerSurface&&!material.name.startsWith('remake-tower-crystal'))throw Error('Untextured part '+kind+'/'+node.name+'/'+material.name);
    if(surface){for(const attribute of ['creatureCoord','creatureRegion']){
     const a=node.geometry.getAttribute(attribute);if(!a||a.count!==node.geometry.attributes.position.count||![...a.array].every(Number.isFinite))throw Error('Missing or invalid '+attribute+' on '+kind+'/'+node.name);
    }}
    entries.push({part:node.name,material:material.name,role:surface?.role??'tower',regions:[...new Set(node.geometry.getAttribute('creatureRegion')?.array??[])]});
   };
   model.traverse(inspect);if(isPede(kind))assets.segment(true,kind).traverse(inspect);
   return {kind,name:REMAKE_NAMES[kind],description:ENEMY_SURFACE_PROFILES[kind]?.description??'Carved masonry, engraved weathered metal and amber crystals.',parts:entries};
  });
 });
 for(const entry of inventory){
  await page.evaluate(kind=>{
   const {THREE,game,assets,World,isPede,scene,camera,floor}=window.enemySurfaces;
   if(window.enemySurfaces.model)scene.remove(window.enemySurfaces.model);
   const world=new World(71,{schedule:false}),enemy=world.spawn(kind,{x:0,y:0,z:0},false);enemy.age=12;enemy.headExposure=1;
   const model=assets.clone(kind);assets.animate(model,enemy,12,true);model.position.copy(enemy.pos);
   if(isPede(kind))for(let i=0;i<5;i++){const segment=assets.segment(i!==3,kind);segment.position.set(Math.sin(i*.4)*.35,0,-2.1*(i+1));model.add(segment);}
   scene.add(model);window.enemySurfaces.model=model;model.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
   floor.position.y=box.min.y-.06;
   camera.position.copy(center).add(new THREE.Vector3(.48,.25,1).normalize().multiplyScalar(Math.max(size.x/1.2,size.y,size.z*.8)*1.75));camera.lookAt(center);
   game.renderer.setSize(960,800);game.renderer.render(scene,camera);
  },entry.kind);
  await page.screenshot({path:`${directory}/${entry.kind}.png`});
  await page.evaluate(kind=>{
   const {game,assets,model,scene,camera}=window.enemySurfaces,saved=[];
   model.traverse(node=>{
    if(!node.isMesh)return;const surface=node.material.userData.enemySurface;if(!surface)return;
    const role=surface.role;let color=0x798f9f,map=false;
    if(role==='body'){map=true;color=kind.startsWith('transmuted')?0xaab8ff:kind==='spider'?0xd2cbc0:kind==='spider2'?0xa4b9cf:kind==='spiderling'?0xa1b4a1:kind==='ghostpede'?0x9af1df:kind==='orb'?0xbe9bff:0xffffff;}
    else if(role==='jewel')color=node.material.name.includes('-green')?0x84ef55:0xff9d55;
    else if(role==='rift')color=0xa68bff;
    else if(role==='halo')color=kind.startsWith('transmuted')?0x8b83db:kind==='ghostpede'?0x84ef55:0xff9d55;
    else if(role==='shell')color=kind==='egg'?0x4b696a:kind==='egg2'?0x667d8d:kind==='gigapede'?0xb49a68:kind==='ghostpede'?0x6d9d9a:kind==='thorn'?0x697689:0x728c9c;
    else if(kind==='leviathan')color=0xc79961;
    else if(kind==='orb')color=0x697eae;
    saved.push([node,node.material]);node.material=assets.material(`reference-${kind}-${node.name}`,color,map);
   });
   window.enemySurfaces.referenceMaterials=saved;game.renderer.render(scene,camera);
  },entry.kind);
  await page.screenshot({path:`${directory}/before/${entry.kind}.png`});
  await page.evaluate(()=>{for(const [node,material]of window.enemySurfaces.referenceMaterials)node.material=material;});

 }
 // Close inspection of body heads and repeated armor, not only full-body views.
 for(const kind of ['centipede','gigapede','ghostpede']){
  for(const part of ['head','segment']){
   await page.evaluate(({kind,part})=>{
    const {THREE,game,assets,scene,camera,floor}=window.enemySurfaces;
    scene.remove(window.enemySurfaces.model);const model=part==='head'?assets.clone(kind):assets.segment(true,kind);scene.add(model);window.enemySurfaces.model=model;
    model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    floor.position.y=box.min.y-.06;camera.position.copy(center).add(new THREE.Vector3(.4,.3,1).normalize().multiplyScalar(Math.max(size.x/1.2,size.y,size.z*.8)*1.8));camera.lookAt(center);game.renderer.render(scene,camera);
   },{kind,part});await page.screenshot({path:`${directory}/${kind}-${part}.png`});
  }
 }
 const checks=await page.evaluate(async()=>{
  const {THREE,game,assets,World,idleInput,ENEMY_KINDS}=window.enemySurfaces;
  const {EnemyHitFlash}=await import('/src/enemy-hit-flash.ts');const flash=new EnemyHitFlash(),model=assets.clone('skull4');
  const original=model.getObjectByName('community-dragon').material;flash.apply(model);const hit=model.getObjectByName('community-dragon').material;flash.restore(model);
  const feedback={distinctHit:hit!==original,restored:model.getObjectByName('community-dragon').material===original};
  const swarm=assets.createSwarmBatch('skull',4);const coordinatesBefore=[...swarm[0].geometry.getAttribute('creatureCoord').array];
  swarm[0].setMatrixAt(0,new THREE.Matrix4().makeTranslation(3,0,-7));swarm[0].setMatrixAt(1,new THREE.Matrix4().makeTranslation(-3,0,-7));
  const stableCoordinates=coordinatesBefore.every((value,i)=>value===swarm[0].geometry.getAttribute('creatureCoord').array[i]);
  game.clear();const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:20};
  ENEMY_KINDS.forEach((kind,i)=>{const e=world.spawn(kind,{x:(i%6-2.5)*8,y:kind==='leviathan'?14:kind.startsWith('squid')?0:3,z:-Math.floor(i/6)*15},false);e.age=12;e.headExposure=1;});world.time=12;
  game.renderer.setSize(960,800);game.render(world,0,.05,0,false,1,null,false,false,idleInput());
  window.enemySurfaces.playWorld=world;
  return {feedback,stableCoordinates,allKinds:world.enemies.length,draws:game.renderer.info.render.calls};
 });
 await page.screenshot({path:`${directory}/in-game.png`});
 assert.equal(inventory.length,22);assert.ok(checks.feedback.distinctHit&&checks.feedback.restored&&checks.stableCoordinates);
 // GPU-synchronized baseline and textured measurements at a fixed resolution.
 // Cached materials are swapped in place, keeping population, lights and poses.
 const performanceCheck=await page.evaluate(async()=>{
  const {game,World,idleInput,THREE}=window.enemySurfaces;
  const {performance:perf}=window;game.clear();game.configure({quality:'low',fov:90,screenShake:0,movementMotion:0,mist:false,skyMotion:'reduced'});
  const world=new World(72,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:18};world.time=12;
  for(let i=0;i<1000;i++){const e=world.spawn(i%3===0?'skull2':'skull',{x:(i%40-20)*.5,y:1+Math.floor(i/40)%7,z:-2-Math.floor(i/40)*.7},false);e.age=12;}
  const gl=game.renderer.getContext(),sample=()=>{for(let i=0;i<3;i++)game.render(world,0,.12,0,false);gl.finish();const frames=[];for(let i=0;i<9;i++){const start=perf.now();game.render(world,0,.12,0,false);gl.finish();frames.push(perf.now()-start);}frames.sort((a,b)=>a-b);return {draws:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,medianMs:frames[4]};};
  const textured=sample(),saved=[];
  for(const batch of game.swarmBatches.values())for(const mesh of batch.meshes){const source=mesh.material,surface=source.userData.enemySurface;if(!surface)continue;saved.push([mesh,source]);mesh.material=game.originalEnemies.material(`material-baseline-${surface.kind}`,0xffffff,true);}
  const baseline=sample();for(const [mesh,material]of saved)mesh.material=material;game.render(world,0,.12,0,false);
  return {enemies:world.enemies.length,textured,baseline};
 });
 await page.screenshot({path:`${directory}/dense-swarm.png`});
 assert.equal(performanceCheck.textured.draws,performanceCheck.baseline.draws);assert.ok(performanceCheck.textured.triangles<1500000);assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({inventory,checks,performanceCheck,errors},null,2));console.log(JSON.stringify({models:inventory.length,checks,performanceCheck,errors}));
}finally{await browser.close();}
