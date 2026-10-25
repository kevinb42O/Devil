import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const output='artifacts/spider-gem-proportions';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});
 await page.route('**/spider-gem-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#10151e"><canvas></canvas></body>'}));await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/spider-gem-review');
 await page.evaluate(async()=>{
  const [T,{GameRenderer},{World}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,skyMotion:'reduced',movementMotion:0,screenShake:0});await game.prepare();game.renderer.setSize(1200,800);
  const scene=new T.Scene();scene.background=new T.Color(0x10151e);scene.add(new T.HemisphereLight(0xb5c7df,0x241b19,1.15));const key=new T.DirectionalLight(0xffdfbe,2.6);key.position.set(-5,7,8);scene.add(key);const rim=new T.DirectionalLight(0x6d93c1,2.1);rim.position.set(4,3,-5);scene.add(rim);
  window.gems={T,game,World,scene,camera:new T.PerspectiveCamera(38,1.5,.01,500)};
 });
 for(const kind of ['spider','spider2']){
  await page.evaluate(kind=>{
   const {T,game,World,scene,camera}=window.gems;if(window.gems.model)scene.remove(window.gems.model);const model=game.originalEnemies.clone(kind);window.gems.model=model;scene.add(model);
   const e=new World(71,{schedule:false}).spawn(kind,{x:0,y:0,z:0});e.age=12;e.headExposure=1;game.originalEnemies.animate(model,e,12);model.updateMatrixWorld(true);game.originalEnemies.setTime(12);
   const box=new T.Box3().setFromObject(model.getObjectByName('spider-head-pivot')),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());camera.position.copy(center).addScaledVector(new T.Vector3(.35,.1,1).normalize(),Math.max(size.y,size.x/1.5,size.z)*1.7);camera.lookAt(center);game.renderer.render(scene,camera);
  },kind);await page.screenshot({path:`${output}/${kind}-mouth.png`});
 }
 await writeFile(`${output}/index.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Spider crystal proportions</title><style>*{box-sizing:border-box}body{margin:0;background:#10151e;color:#e9e3d8;font:16px/1.6 Arial,sans-serif}main{max-width:1440px;margin:auto;padding:28px}h1{font-size:28px;font-weight:500;margin:0 0 12px}p{color:#adb7c2}section{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{display:block;width:100%}figcaption{padding:8px 0}a{color:#d1ad87}@media(max-width:600px){section{grid-template-columns:1fr}}</style><main><h1>Matched spider crystal proportions</h1><p>Both crystals now follow the size of their feeding face. Target positions and combat hit radii are unchanged.</p><section id="comparison"><figure><img src="spider-mouth.png" alt="Spider I feeding face and resized gem"><figcaption>Spider I · reduced crystal</figcaption></figure><figure><img src="spider2-mouth.png" alt="Spider II feeding face and enlarged gem"><figcaption>Spider II · enlarged, exposed crystal</figcaption></figure></section><p>Individually framed for shape comparison. <a href="../brood-horror/index.html">Full enemy gallery and updated simulation clip</a></p></main></html>`);
 await page.setViewportSize({width:1440,height:900});await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+`/${output}/index.html`);await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));await page.locator('#comparison').screenshot({path:`${output}/comparison.png`});
}finally{await browser.close();}
