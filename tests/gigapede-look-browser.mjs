import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='artifacts/gigapede-identity';await mkdir(dir,{recursive:true});
const label=process.env.LOOK_LABEL||'after';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/gigapede-look',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/gigapede-look');
 await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput,v},{OriginalEnemies}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/original-enemies.ts')]);
  // This isolated serpent review does not exercise unfinished Drake swarm geometry.
  const batch=OriginalEnemies.prototype.createSwarmBatch;OriginalEnemies.prototype.createSwarmBatch=function(kind,capacity){return kind==='skull4'||kind==='transmuted4'?[]:batch.call(this,kind,capacity);};
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:65,mist:false,screenShake:0,movementMotion:0,skyMotion:'reduced'});await game.prepare();assertReady();
  function assertReady(){if(!game.originalEnemies.ready)throw Error(game.originalEnemies.error);}
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x0b1017);scene.add(new THREE.HemisphereLight(0xc5dbff,0x342a24,2));
  for(const [color,power,p] of [[0xffe4c5,3.8,[-7,9,9]],[0x81b8ff,3,[8,6,-9]]]){const light=new THREE.DirectionalLight(color,power);light.position.set(...p);scene.add(light);}
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:0x131a22,roughness:.75}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(34,1280/850,.05,500);window.look={THREE,game,scene,floor,camera,World,idleInput,v};
 });
 const report=[];
 for(const kind of ['centipede','gigapede','ghostpede'])for(const view of kind==='gigapede'?['head','segment','body']:['segment']){
  const stats=await page.evaluate(({kind,view})=>{
   const {THREE,game,scene,floor,camera,World}=window.look;if(window.look.model)scene.remove(window.look.model);
   const assets=game.originalEnemies,world=new World(11,{schedule:false}),e=world.spawn(kind,{x:0,y:0,z:0},false);e.age=12;
   const model=view==='segment'?assets.segment(true,kind):assets.clone(kind);
   if(view==='body'){
    for(let i=0;i<11;i++){const part=assets.segment(i!==7,kind);part.name='segment';const t=i/10;part.position.set(Math.sin(t*3)*4,Math.sin(t*2)*.6,-(i+1)*1.95);part.rotation.y=-Math.cos(t*3)*.45;model.add(part);}
   }
   if(view!=='segment')assets.animate(model,e,12);scene.add(model);window.look.model=model;
   const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());floor.position.y=box.min.y-.1;
   const direction=view==='body'?new THREE.Vector3(1,.9,1.1):new THREE.Vector3(.9,.6,1.4);
   camera.position.copy(center).add(direction.normalize().multiplyScalar(size.length()*(view==='body'?1.14:1.5)));camera.lookAt(center);game.renderer.render(scene,camera);
   let triangles=0;model.traverse(n=>{if(n.isMesh){assertFinite(n.geometry);triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;}});
   function assertFinite(g){if(![...g.attributes.position.array].every(Number.isFinite))throw Error('Invalid geometry');}
   if(view==='segment'){
    const crystal=model.getObjectByName('segment-weak-point');if(crystal.getWorldPosition(new THREE.Vector3()).length()>1e-7)throw Error('Shifted crystal');
    if(assets.segment(false,kind).getObjectByName('segment-weak-point').visible)throw Error('Destroyed crystal remains visible');
   }
   return {kind,view,triangles,draws:game.renderer.info.render.calls,size:size.toArray()};
  },{kind,view});report.push(stats);await page.screenshot({path:`${dir}/${label}-${kind}-${view}.png`});
 }
 const gameplay=await page.evaluate(()=>{
  const {game,World,idleInput,v}=window.look;game.clear();const world=new World(32,{schedule:false,invulnerable:true});const e=world.spawnAt('gigapede',0,.4);
  for(let i=0;i<120*12;i++){world.step(idleInput());world.effects=[];}
  const camera=v(32,21,40),target=v(0,8,0),yaw=Math.atan2(camera.x-target.x,camera.z-target.z),pitch=Math.atan2(target.y-camera.y,Math.hypot(target.x-camera.x,target.z-camera.z));
  game.render(world,yaw,pitch,1/60,false,1,camera);const batches=game.scene.children.filter(n=>n.name==='centipede-segment-batch');
  return {head:e.pos,draws:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,batches:batches.length};
 });
 await page.screenshot({path:`${dir}/${label}-in-game.png`});assert.deepEqual(errors,[]);assert.ok(gameplay.batches<=6);
 if(process.env.LOOK_VIDEO==='1'){
  const video=await page.evaluate(async()=>{
   const {game,World,idleInput,v}=window.look;game.clear();const world=new World(32,{schedule:false,invulnerable:true});world.spawnAt('gigapede',0,.4);
   for(let i=0;i<120*3;i++){world.step(idleInput());world.effects=[];}
   const canvas=game.renderer.domElement,stream=canvas.captureStream(30),mimeType='video/mp4;codecs=avc1.42001E';
   const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:5500000}),chunks=[];
   recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
   const camera=v(32,21,40),target=v(0,8,0),yaw=Math.atan2(camera.x-target.x,camera.z-target.z),pitch=Math.atan2(target.y-camera.y,Math.hypot(target.x-camera.x,target.z-camera.z));
   for(let frame=0;frame<480;frame++){
    for(let tick=0;tick<4;tick++){world.step(idleInput());world.effects=[];}
    game.render(world,yaw,pitch,1/30,false,1,camera);await new Promise(resolve=>setTimeout(resolve,1000/30));
   }
   recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   const bytes=new Uint8Array(await new Blob(chunks,{type:mimeType}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);
  });
  await writeFile(`${dir}/gigapede-cobalt.mp4`,Buffer.from(video,'base64'));assert.deepEqual(errors,[]);
 }
 await writeFile(`${dir}/${label}-report.json`,JSON.stringify({report,gameplay,errors},null,2));console.log({report,gameplay,errors});
}finally{await browser.close();}
