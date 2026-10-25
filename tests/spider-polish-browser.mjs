import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.SPIDER_OUTPUT||'artifacts/spider-polish';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.route('**/spider-polish',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#0e131b"><canvas></canvas><div id="label" style="position:absolute;bottom:32px;left:40px;color:#d8c8ae;font:24px system-ui;letter-spacing:3px"></div></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/spider-polish');
 const report=await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{SPIDER_GEM,spiderLocalPoint,enemyYaw,enemyEmergenceScale}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-presentation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,mist:false,screenShake:0,movementMotion:0});await game.prepare();
  const assets=game.originalEnemies;if(!assets.ready)throw Error(assets.error);const scene=new THREE.Scene();scene.background=new THREE.Color(0x0e131b);
  scene.add(new THREE.HemisphereLight(0x9ab5d2,0x30221a,1.25));const key=new THREE.DirectionalLight(0xffd7a0,3.4);key.position.set(-6,10,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0x789ec6,3.8);rim.position.set(6,5,-5);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(500,500),new THREE.MeshStandardMaterial({color:0x141922,roughness:.8}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(37,1200/900,.01,1000),checks=[];
  for(const kind of ['spider','spider2','spiderling']){
   const world=new World(71,{schedule:false}),enemy=world.spawn(kind,{x:0,y:0,z:0},false);enemy.age=12;enemy.headExposure=1;
   const model=assets.clone(kind);model.position.copy(enemy.pos);let triangles=0;model.traverse(n=>{if(n.isMesh){triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;for(const a of Object.values(n.geometry.attributes)){if(![...a.array].every(Number.isFinite))throw Error('Invalid anatomy '+kind);}}});
   if(!model.getObjectByName('spider-face-and-fangs'))throw Error('Missing authored anatomy');
   let targetError=0;
   if(kind!=='spiderling')for(const exposure of [0,.3,.7,1])for(const yaw of [0,.8,2.5]){
    enemy.headExposure=exposure;enemy.facingYaw=yaw;assets.animate(model,enemy,12);model.scale.setScalar(enemyEmergenceScale(enemy));model.rotation.y=enemyYaw(enemy,world.player.pos);model.updateMatrixWorld(true);
    const actual=model.getObjectByName('spider-held-gem').getWorldPosition(new THREE.Vector3()),expected=spiderLocalPoint(enemy,world.player.pos,SPIDER_GEM);targetError=Math.max(targetError,actual.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z)));
   }
   model.scale.setScalar(enemyEmergenceScale(enemy));model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);checks.push({kind,triangles,targetError,size:bounds.getSize(new THREE.Vector3()).toArray()});
  }
  const swarm=assets.createSwarmBatch('spiderling',400);if(swarm.length!==1)throw Error('Juveniles must use one instanced draw');if(swarm[0].geometry.index.count/3>1600)throw Error('Juvenile swarm exceeds geometry budget');
  window.spiders={THREE,game,assets,scene,camera,floor,World,idleInput,enemyEmergenceScale};return checks;
 });
 for(const kind of ['spider','spider2','spiderling']){
  await page.evaluate(kind=>{
   const s=window.spiders,{THREE,game,assets,scene,camera,floor,World,enemyEmergenceScale}=s;if(s.model)scene.remove(s.model);
   const world=new World(1,{schedule:false}),e=world.spawn(kind,{x:0,y:0,z:0},false);e.age=12;e.headExposure=1;const model=assets.clone(kind);assets.animate(model,e,12);model.scale.setScalar(enemyEmergenceScale(e));scene.add(model);s.model=model;s.enemy=e;
   const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());floor.position.y=box.min.y-.03;
   camera.position.copy(center).add(new THREE.Vector3(.65,.4,1).normalize().multiplyScalar(size.x*1.55));camera.lookAt(center);game.renderer.setSize(1200,900);game.renderer.render(scene,camera);
   document.querySelector('#label').textContent=kind==='spider'?'BROOD WEAVER':kind==='spider2'?'ARMORED MATRIARCH':'SKITTER';
  },kind);
  await page.screenshot({path:`${output}/${kind}.png`});
  const gait=await page.evaluate(()=>{
   const {THREE,game,assets,scene,camera,model,enemy}=window.spiders;
   const target=new THREE.WebGLRenderTarget(240,180),a=new Uint8Array(240*180*4),b=new Uint8Array(a.length);
   game.renderer.setRenderTarget(target);assets.setTime(12);game.renderer.render(scene,camera);game.renderer.readRenderTargetPixels(target,0,0,240,180,a);
   assets.setTime(12.2);game.renderer.render(scene,camera);game.renderer.readRenderTargetPixels(target,0,0,240,180,b);
   let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>20)changed++;
   game.renderer.setRenderTarget(null);target.dispose();assets.setTime(12);return changed;
  });
  assert.ok(gait>25,kind+' visibly animates its legs');
 }
 const gameplay=await page.evaluate(()=>{
  const {game,assets,World,idleInput}=window.spiders;game.clear();const world=new World(72,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:20};
  for(const [kind,x,z] of [['spider',-11,-5],['spider2',14,-21]]){const e=world.spawn(kind,{x,y:kind==='spider'?4.45:8.9,z},false);e.pos={x,y:2.7*e.size*.62,z};e.age=12;e.headExposure=1;}
  for(let i=0;i<400;i++){const e=world.spawn('spiderling',{x:(i%25-12)*.85,y:.55,z:-Math.floor(i/25)*1.1},false);e.age=12;}
  const start=performance.now();for(let i=0;i<15;i++){world.time=12+i/60;game.render(world,0,.08,1/60,false,1,null,false,false,idleInput());}
  document.querySelector('#label').textContent='400 SKITTERS + BOTH ADULT VARIANTS';
  return {calls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,cpuMeanMs:(performance.now()-start)/15};
 });
 await page.screenshot({path:`${output}/gameplay.png`});
 const weaver=report.find(x=>x.kind==='spider'),matriarch=report.find(x=>x.kind==='spider2');
 assert.ok(matriarch.size[0]>weaver.size[0]*2.4&&matriarch.size[1]>weaver.size[1]*2.4,'matriarch has a substantially larger silhouette than the weaver');
 assert.ok(report.every(x=>x.targetError<1e-5),'all head poses track combat crystal');
 assert.ok(report.find(x=>x.kind==='spiderling').triangles<5000,'bounded juvenile geometry');assert.ok(gameplay.calls<100,'dense swarm remains batched');assert.deepEqual(errors,[]);
 await writeFile(`${output}/report.json`,JSON.stringify({report,gameplay,errors},null,2));console.log(JSON.stringify({report,gameplay,errors}));
}finally{await browser.close();}
