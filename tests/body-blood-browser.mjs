import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/bloody-body';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/body-blood-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/body-blood-test');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,v},THREE]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,screenShake:0,movementMotion:0});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true});world.addCrew('near');world.addCrew('far');world.selectCrew('near');world.player.pos=v(0,1.7,0);world.crew[1].player.pos=v(20,1.7,0);world.time=200;world.level=world.crew[0].level=3;
  renderer.crewReplayMode=true;
  // A broad neutral studio fill makes skin and blood readable on both sides for material review.
  const fill=new THREE.HemisphereLight(0xffffff,0x5b3e3e,2);renderer.scene.add(fill);
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-2,4,-3);renderer.scene.add(light);
  const render=(back=false)=>renderer.render(world,back?0:Math.PI,-.04,1/60,false,1,v(0,1.1,back?3.8:-3.8),false,false,idleInput());
  for(let i=0;i<15;i++)render();window.fixture={renderer,world,render,v,id:0};
 });
 const reports=[];
 for(const [label,kills,back]of [['clean',0,false],['hands-first',8,false],['body-building',5,false],['fully-soaked',17,false],['fully-soaked-back',0,true],['dried',0,false],['new-spatter',0,false],['reset',0,false]]){
  const report=await page.evaluate(({label,kills,back})=>{
   const f=fixture,{renderer,world,render,v}=f;
   if(label==='dried')world.time+=84;
   if(label==='reset')renderer.blood.clear();
   if(label==='new-spatter')renderer.blood.effect({kind:'hit',bloodId:++f.id,enemyId:1,pos:v(0,1.6,-1)},world);
   for(let i=0;i<kills;i++)renderer.blood.effect({kind:'kill',bloodId:++f.id,enemyId:1,pos:v(0,1.6,-1),amount:1},world);
   renderer.blood.field.drops.length=0;render(back);
   const model=renderer.crewModels.get('near'),materials=model.userData.avatarMaterials;
   const uniforms=materials.map(m=>({name:m.name,amount:m.userData.combatFeedback?.uniforms.combatBloodAmount.value,body:m.userData.combatFeedback?.uniforms.combatBloodBody.value,skin:m.userData.combatFeedback?.uniforms.combatSkin.value}));
   const far=renderer.blood.handBlood.sample(world,world.crew[1].player);
   const gl=renderer.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let red=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>pixels[i+1]*1.8&&pixels[i]>pixels[i+2]*1.4&&pixels[i]>35)red++;
   return {label,...renderer.blood.handBlood.sample(world),far,uniforms,red};
  },{label,kills,back});reports.push(report);await page.screenshot({path:`${directory}/${label}.png`});
 }
 await writeFile(`${directory}/audit.json`,JSON.stringify({reports,errors},null,2)+'\n');
 assert.equal(reports[1].amount,1);assert.ok(reports[1].bodyAmount<.6);assert.ok(reports[2].bodyAmount>reports[1].bodyAmount&&reports[2].bodyAmount<1);
 assert.equal(reports[3].bodyAmount,1);assert.equal(reports[4].bodyAmount,1);assert.ok(reports[3].red>reports[0].red+500,'whole body visibly coats');
 for(const u of reports[3].uniforms)assert.equal(u.body,1,'skin and dark horns/claws share full coverage '+JSON.stringify(reports[3].uniforms));
 assert.equal(reports[3].far.amount,0);assert.ok(reports[5].freshness<.06);assert.ok(reports[6].freshness<.15);assert.equal(reports[7].bodyAmount,0);
 assert.deepEqual(errors,[]);await writeFile(`${directory}/audit.json`,JSON.stringify({reports,errors},null,2)+'\n');console.log(JSON.stringify({reports,errors}));
}finally{await browser.close();}
