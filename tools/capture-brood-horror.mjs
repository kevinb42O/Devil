import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const stage=process.argv[2]??'after',directory=`artifacts/brood-horror/${stage}`;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/brood-horror-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#10151e"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/brood-horror-review');
 await page.evaluate(async()=>{
  const [T,{GameRenderer},{OBJLoader},{World}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/node_modules/three/examples/jsm/loaders/OBJLoader.js'),import('/src/simulation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});await game.prepare();game.renderer.setSize(1200,800);
  const scene=new T.Scene();scene.background=new T.Color(0x10151e);scene.add(new T.HemisphereLight(0xb5c7df,0x241b19,1.15));
  const key=new T.DirectionalLight(0xffdfbe,2.6);key.position.set(-5,7,8);scene.add(key);
  const rim=new T.DirectionalLight(0x6d93c1,2.1);rim.position.set(4,3,-5);scene.add(rim);
  const camera=new T.PerspectiveCamera(38,1.5,.01,500),references=new Map(),loader=new OBJLoader();
  const parts={skull4:['boid4','boid4jaw'],spider:['spiderbody','spiderhead','spiderjaw','spiderfangs'],spider2:['gigaspiderbody','gigaspiderhead','gigaspiderjaw','gigaspiderfangs','gigaspidercrest'],spiderling:['spiderling','spiderlingpalms'],egg:['spideregg1'],egg2:['spideregg2']};
  for(const [kind,names]of Object.entries(parts)){
   const root=new T.Group();for(const name of names){const obj=await loader.loadAsync(`/assets/original/devil-daggers/meshes/${name}.obj`);obj.traverse(o=>{if(o.isMesh)o.material=new T.MeshStandardMaterial({color:0xb5a393,roughness:.85,side:T.DoubleSide});});root.add(obj);}references.set(kind,root);
  }
  window.brood={T,game,scene,camera,references,World};
 });
 const inventory=[];
 for(const source of ['current','reference'])for(const kind of ['skull4','transmuted4','spider','spider2','spiderling','egg','egg2'])for(const angle of ['front','quarter','side']){
  if(source==='reference'&&kind==='transmuted4')continue;
  const bounds=await page.evaluate(({source,kind,angle})=>{
   const {T,game,scene,camera,references,World}=window.brood;if(window.brood.model)scene.remove(window.brood.model);
   const model=source==='current'?game.originalEnemies.clone(kind):references.get(kind);scene.add(model);window.brood.model=model;
   if(source==='current'){const e=new World(71,{schedule:false}).spawn(kind,{x:0,y:0,z:0});e.age=12;e.headExposure=1;game.originalEnemies.animate(model,e,12);}
   model.updateMatrixWorld(true);game.originalEnemies.setTime(12);
   const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
   const view=new T.Vector3(angle==='side'?1:angle==='quarter'?.65:0,kind.startsWith('egg')?.28:.2,angle==='side'?.12:1).normalize();
   camera.position.copy(center).addScaledVector(view,Math.max(size.y,size.x/1.5,size.z)*2.15);camera.lookAt(center);game.renderer.render(scene,camera);
   let triangles=0;model.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
   return {kind,source,size:size.toArray(),triangles};
  },{source,kind,angle});
  await page.screenshot({path:`${directory}/${source}-${kind}-${angle}.png`});if(angle==='front')inventory.push(bounds);
 }
 await writeFile(`${directory}/inventory.json`,JSON.stringify({inventory,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify(inventory));
}finally{await browser.close();}
