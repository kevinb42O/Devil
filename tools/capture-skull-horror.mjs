import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const stage=process.argv[2]??'after',directory=`artifacts/skull-horror/${stage}`;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/skull-horror-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#10151e"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/skull-horror-review');
 await page.evaluate(async()=>{
  const [T,{GameRenderer},{OBJLoader}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/node_modules/three/examples/jsm/loaders/OBJLoader.js')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});await game.prepare();
  game.renderer.setSize(1200,800);
  const scene=new T.Scene();scene.background=new T.Color(0x10151e);
  scene.add(new T.HemisphereLight(0xb5c7df,0x241b19,1.15));
  const key=new T.DirectionalLight(0xffdfbe,2.6);key.position.set(-5,7,8);scene.add(key);
  const rim=new T.DirectionalLight(0x6d93c1,2.1);rim.position.set(4,3,-5);scene.add(rim);
  const camera=new T.PerspectiveCamera(38,1.5,.01,200),originals=[];
  const loader=new OBJLoader(),textures=new T.TextureLoader();
  for(const names of [['boid'],['boid2','boid2horns'],['boid3','boid3horns','boid3jaw']]){
   const group=new T.Group();
   for(const name of names){
    const model=await loader.loadAsync(`/assets/original/devil-daggers/meshes/${name}.obj`),map=await textures.loadAsync(`/assets/original/devil-daggers/textures/${name}.png`);
    map.colorSpace=T.SRGBColorSpace;map.magFilter=T.NearestFilter;
    model.traverse(o=>{if(o.isMesh)o.material=new T.MeshStandardMaterial({map,roughness:.8,side:T.DoubleSide});});group.add(model);
   }originals.push(group);
  }
  window.review={T,game,scene,camera,originals};
 });
 for(const source of ['current','original','clay'])for(let tier=1;tier<=3;tier++)for(const angle of ['front','quarter','side']){
  const bounds=await page.evaluate(({source,tier,angle})=>{
   const {T,game,scene,camera,originals}=window.review;
   if(window.review.model)scene.remove(window.review.model);
   const model=source!=='current'?originals[tier-1]:game.originalEnemies.clone(tier===1?'skull':`skull${tier}`);
   if(source==='clay')model.traverse(o=>{if(o.isMesh)o.material=new T.MeshStandardMaterial({color:0xb5a393,roughness:.85,side:T.DoubleSide});});
   scene.add(model);window.review.model=model;model.updateMatrixWorld(true);game.originalEnemies.setTime(18);
   const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
   const distance=Math.max(size.y,size.x/1.5,size.z)*2.1;
   camera.position.copy(center).add(new T.Vector3(angle==='side'?1:angle==='quarter'?.6:0,.12,angle==='side'?.1:1).normalize().multiplyScalar(distance));camera.lookAt(center);
   game.renderer.render(scene,camera);return size.toArray();
  },{source,tier,angle});
  await page.screenshot({path:`${directory}/${source}-${tier}-${angle}.png`});
  if(angle==='front')console.log(source,tier,bounds);
 }
 if(stage==='after'){
  for(const [name,time,quality,distance]of [['arena',120,'high',12],['storm-low',120,'low',12],['furnace-low',300,'low',12],['depths-low',475,'low',12],['near',120,'high',5],['far',120,'high',30]]){
   await page.evaluate(async({time,quality,distance})=>{
    const {game}=window.review,{World,idleInput}=await import('/src/simulation.ts');game.clear();game.configure({quality,fov:65,mist:true,skyMotion:'reduced'});
    const world=new World(71,{schedule:false,invulnerable:true});world.time=time;world.player.pos={x:0,y:2.1,z:distance};
    ['skull','skull2','skull3'].forEach((kind,i)=>{const e=world.spawn(kind,{x:(i-1)*3.1,y:2.25,z:0});e.age=12;e.vel={x:0,y:0,z:6};});
    for(let i=0;i<3;i++)game.render(world,0,0,0,false,1,{x:0,y:2.1,z:distance},false,false,idleInput());
   },{time,quality,distance});
   await page.screenshot({path:`${directory}/${name}.png`});
  }
 }
 await writeFile(`${directory}/errors.json`,JSON.stringify(errors));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
