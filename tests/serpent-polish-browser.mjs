import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
const directory='artifacts/serpent-polish';await mkdir(directory,{recursive:true});
for(const kind of ['centipede','gigapede','ghostpede'])await copyFile(`artifacts/enemy-materials/${kind}.png`,`${directory}/${kind}-before.png`).catch(()=>{});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/serpent-polish',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/serpent-polish');
 await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,mist:false,screenShake:0,movementMotion:0,skyMotion:'reduced'});await game.prepare();if(!game.originalEnemies.ready)throw Error(game.originalEnemies.error);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x0b1118);scene.add(new THREE.HemisphereLight(0xa5c5de,0x28201b,1.4));
  for(const [color,power,pos] of [[0xffd4a0,3,[-7,10,8]],[0x77b6e8,3,[7,5,-9]]]){const light=new THREE.DirectionalLight(color,power);light.position.set(...pos);scene.add(light);}
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:0x101923,roughness:.6}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(36,1440/1000,.05,500);game.renderer.setSize(1440,1000);
  window.serpents={THREE,game,World,idleInput,scene,camera,floor,assets:game.originalEnemies};
 });
 const inventory=[];
 for(const kind of ['centipede','gigapede','ghostpede']){
  for(const view of ['body','head','segment']){
   const stats=await page.evaluate(({kind,view})=>{
    const {THREE,game,World,assets,scene,camera,floor}=window.serpents;if(window.serpents.model)scene.remove(window.serpents.model);
    const size=kind==='gigapede'?1.5:kind==='ghostpede'?2:1,world=new World(11,{schedule:false}),enemy=world.spawn(kind,{x:0,y:0,z:0},false);enemy.age=12;
    if(view==='body')enemy.segments=enemy.segments.slice(0,12);
    const model=view==='segment'?assets.segment(true,kind):assets.clone(kind);
    if(view==='body')for(let i=0;i<enemy.segments.length;i++){const segment=assets.segment(i!==7,kind);segment.name='segment';const t=i/Math.max(1,enemy.segments.length-1);segment.position.set(Math.sin(t*2.8)*2.5*size,Math.sin(t*3)*.4*size,-(i+1)*1.3*size);segment.rotation.y=-Math.cos(t*2.8)*.35;model.add(segment);}
    if(view!=='segment')assets.animate(model,enemy,12);scene.add(model);window.serpents.model=model;
    const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),extent=box.getSize(new THREE.Vector3());floor.position.y=box.min.y-.08;
    const direction=view==='body'?new THREE.Vector3(1.0,.85,1.25):new THREE.Vector3(.82,.48,1.3),distance=view==='body'?extent.length()*1.18:extent.length()*1.5;
    camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));camera.lookAt(center);game.renderer.render(scene,camera);
    let triangles=0,meshes=0;model.traverse(n=>{if(n.isMesh){meshes++;triangles+=n.geometry.attributes.position.count/3;if(![...n.geometry.attributes.position.array].every(Number.isFinite))throw Error('Invalid serpent geometry');}});
    if(view==='head'&&(!model.getObjectByName('serpent-mandible')||model.getObjectByName('convoy-head-ring')))throw Error('Missing sculpted head');
    if(view==='segment'){
     const crystal=model.getObjectByName('segment-weak-point');if(crystal.getWorldPosition(new THREE.Vector3()).length()>1e-7)throw Error('Crystal moved');
     if(assets.segment(false,kind).getObjectByName('segment-weak-point').visible)throw Error('Dead crystal visible');
    }
    return {kind,view,triangles,meshes};
   },{kind,view});inventory.push(stats);await page.screenshot({path:`${directory}/${kind}-${view}.png`});
  }
 }
 const gameplay=await page.evaluate(()=>{
  const {THREE,game,World,idleInput}=window.serpents;game.clear();const world=new World(11,{schedule:false,invulnerable:true});world.time=12;world.player.pos={x:0,y:1.7,z:18};
  for(const [i,kind]of ['centipede','gigapede','ghostpede'].entries()){
   const e=world.spawn(kind,{x:(i-1)*11,y:4,z:0},false);e.age=12;e.pos={x:(i-1)*11,y:3,z:-2};e.vel={x:0,y:0,z:1};
   e.segments.forEach((s,j)=>{s.pos={x:e.pos.x+Math.sin(j*.23)*3,y:3+Math.sin(j*.18)*1.8,z:-2-(j+1)*1.3*e.size};});e.segments[4].hp=0;
  }
  for(let i=0;i<3;i++)game.render(world,0,.10,0,false,1,null,false,false,idleInput());
  // Animation must leave every damage target at its simulation coordinate.
  let maxAnchorError=0;for(const e of world.enemies){const model=game.enemies.get(e.id);const nodes=model.children.filter(n=>n.name==='segment');for(let i=0;i<nodes.length;i++){const p=nodes[i].getObjectByName('segment-weak-point').getWorldPosition(new THREE.Vector3());const s=e.segments[i].pos;maxAnchorError=Math.max(maxAnchorError,p.distanceTo(new THREE.Vector3(s.x,s.y,s.z)));}}
  const draws=game.renderer.info.render.calls,triangles=game.renderer.info.render.triangles;const frames=[],gl=game.renderer.getContext();for(let i=0;i<7;i++){const start=performance.now();game.render(world,0,.10,0,false,1,null,false,false,idleInput());gl.finish();frames.push(performance.now()-start);}frames.sort((a,b)=>a-b);
  const batches=game.scene.children.filter(n=>n.name==='centipede-segment-batch');return {segments:world.enemies.reduce((n,e)=>n+e.segments.length,0),draws,triangles,segmentBatches:batches.length,maxAnchorError,medianGpuSynchronizedMs:frames[3]};
 });
 await page.screenshot({path:`${directory}/in-game.png`});assert.ok(gameplay.maxAnchorError<1e-6);assert.ok(gameplay.segmentBatches<=18,'bounded draws per surface across 85 segments');assert.ok(gameplay.triangles<1500000);assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({inventory,gameplay,errors},null,2));console.log(JSON.stringify({inventory,gameplay,errors}));
}finally{await browser.close();}
