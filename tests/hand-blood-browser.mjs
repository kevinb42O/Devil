import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/bloody-hands';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/hand-blood-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/hand-blood-test');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,mist:false,screenShake:0,movementMotion:0});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,0);world.time=10;world.level=5;
  const input={...idleInput(),leftArm:true,rightArm:true};const render=()=>renderer.render(world,0,-.25,1/60,false,1,null,false,false,{...input,pitch:-.25});
  for(let i=0;i<60;i++)render();
  window.fixture={renderer,world,input,render,v,id:0};
 });
 const reports=[];
 for(const [label,kills]of [['clean',0],['spattered',2],['soaked',12],['dried',0],['tier-7',0],['reset',0]]){
  const report=await page.evaluate(({label,kills})=>{
   const f=fixture,{renderer,world,render,v}=f;
   if(label==='dried')world.time+=84;
   if(label==='tier-7')world.level=7;
   if(label==='reset')renderer.blood.clear();
   for(let i=0;i<kills;i++)renderer.blood.effect({kind:'kill',bloodId:++f.id,enemyId:1,pos:v(0,1.7,-1),amount:1},world);
   renderer.blood.field.drops.length=0;render();
   const material=renderer.emoteHands.userData.avatarMaterials.find(m=>m.name==='Demon_Main'),u=material.userData.combatFeedback.uniforms;
   const gl=renderer.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let red=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>pixels[i+1]*1.7&&pixels[i]>pixels[i+2]*1.4&&pixels[i]>35)red++;
   return {label,amount:u.combatBloodAmount.value,freshness:u.combatBloodFresh.value,tier:u.combatTier.value,red};
  },{label,kills});
  reports.push(report);await page.screenshot({path:`${directory}/${label}.png`});
 }
 assert.equal(reports[0].amount,0);assert.ok(reports[1].amount>0&&reports[1].amount<1);assert.equal(reports[2].amount,1);
 assert.ok(reports[1].red>reports[0].red+100,'early spatter is visible');
 assert.ok(reports[2].red>reports[1].red+100,'visible red staining grows');
 assert.equal(reports[3].amount,1);assert.ok(reports[3].freshness<.06);assert.equal(reports[4].amount,1);assert.equal(reports[4].tier,7);assert.equal(reports[5].amount,0);
 assert.deepEqual(errors,[]);await writeFile(`${directory}/audit.json`,JSON.stringify({reports,errors},null,2)+'\n');console.log(JSON.stringify({reports,errors}));
}finally{await browser.close();}
