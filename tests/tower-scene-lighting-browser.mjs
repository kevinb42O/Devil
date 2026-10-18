import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/tower-scene-lighting';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/tower-scene-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/tower-scene-test');
 await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{descentAt},{SceneLighting}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/descent.ts'),import('/src/scene-lighting.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:65,mist:false});await game.prepare();
  const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:18};
  for(const [i,kind]of ['squid','squid2','squid3'].entries()){const e=world.spawn(kind,{x:(i-1)*10,y:0,z:-10});e.age=12;}
  window.fixture={THREE,game,world,idleInput,descentAt,SceneLighting};
 });
 const results=[];
 for(const quality of ['low','high'])for(const [chapter,time]of [['cosmic',12],['sky',40],['cloud',100],['veil',180],['furnace',280],['cathedral',400],['depth',510]]){
  const result=await page.evaluate(({time,quality})=>{
   const {game,world,idleInput}=window.fixture;game.configure({quality,fov:65,mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});world.time=time;
   game.render(world,0,.14,0,false,1,null,false,false,idleInput());
   return {calls:game.renderer.info.render.calls,lights:[game.skyLight,game.moonLight,game.rimLight,game.infernalLight].map(l=>({color:l.color.toArray(),intensity:l.intensity,position:l.position.toArray()}))};
  },{time,quality});
  results.push({chapter,quality,...result});await page.screenshot({path:`${directory}/${chapter}-${quality}.png`});
 }
 const checks=await page.evaluate(()=>{
  const {THREE,game,descentAt,SceneLighting}=window.fixture;
  // Isolate the body from crystals and render to a linear floating point target.
  const scene=new THREE.Scene();scene.background=new THREE.Color(0);const camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,0,4);camera.lookAt(0,0,0);
  const material=[...game.originalEnemies.towerMaterials.values()].find(m=>m.userData.towerSurface.finish==='stone');
  const body=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material);scene.add(body);
  const target=new THREE.WebGLRenderTarget(96,96,{type:THREE.FloatType});
  const sample=()=>{game.renderer.setRenderTarget(target);game.renderer.render(scene,camera);const data=new Float32Array(96*96*4);game.renderer.readRenderTargetPixels(target,0,0,96,96,data);let sum=0;for(let i=0;i<data.length;i+=4)sum+=data[i]+data[i+1]+data[i+2];game.renderer.setRenderTarget(null);return sum;};
  game.environment.update(510);const dark=sample();
  const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(0,0,4);scene.add(key);const lit=sample();
  key.position.set(0,0,-4);const back=sample();
  const sky=new THREE.HemisphereLight(),rim=new THREE.DirectionalLight(),fire=new THREE.PointLight(),lighting=new SceneLighting();
  const snapshot=t=>{lighting.update(descentAt(t),false,sky,key,rim,fire);return JSON.stringify([sky.color.toArray(),sky.intensity,key.color.toArray(),key.intensity,rim.position.toArray(),rim.intensity]);};
  const original=snapshot(180);snapshot(510);snapshot(12);const replay=snapshot(180);
  let continuity=0;for(const t of [51,69,126,144,241,259,362,380,454,472]){lighting.update(descentAt(t-.001),false,sky,key,rim,fire);const before=[sky.intensity,key.intensity,rim.intensity,...sky.color.toArray()];lighting.update(descentAt(t+.001),false,sky,key,rim,fire);const after=[sky.intensity,key.intensity,rim.intensity,...sky.color.toArray()];continuity=Math.max(continuity,...after.map((v,i)=>Math.abs(v-before[i])));}
  target.dispose();body.geometry.dispose();return {dark,lit,back,replayMatches:original===replay,continuity};
 });
 assert.ok(checks.dark<.001,`stone emits light in darkness: ${checks.dark}`);
 assert.ok(checks.lit>checks.dark+1,'body must receive scene illumination');
 assert.ok(checks.lit>checks.back*2,'world light direction must affect the visible faces');
 assert.ok(checks.replayMatches);assert.ok(checks.continuity<.002);
 const low=results.filter(r=>r.quality==='low');assert.equal(new Set(low.map(r=>JSON.stringify(r.lights))).size,7);
 assert.ok(low.find(r=>r.chapter==='depth').lights[0].intensity<low.find(r=>r.chapter==='veil').lights[0].intensity/2);
 assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({checks,results,errors},null,2));console.log(JSON.stringify({checks,results,errors}));
}finally{await browser.close();}
