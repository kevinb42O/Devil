import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='artifacts/blood-puddle-splash';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/puddle-splash-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/puddle-splash-test');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer},{floorHeight},{BLOOD_SPAN}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/arena.ts'),import('/src/blood.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true});world.time=8;
  renderer.blood.effect({kind:'kill',bloodId:88,enemyId:1,pos:v(0,1.1,0),amount:2},world);renderer.blood.advance(11);world.time=11;
  const field=renderer.blood.field;let best=0,index=0;
  // Find a real puddle with room for both feet.
  for(let i=0;i<field.pixels.length;i+=4)if(field.pixels[i]>best){best=field.pixels[i];index=i/4;}
  const x=((index%field.size+.5)/field.size-.5)*BLOOD_SPAN,z=((Math.floor(index/field.size)+.5)/field.size-.5)*BLOOD_SPAN;
  const ground=floorHeight(x,z,11,0);world.player.pos=v(x,ground+1.6,z);world.player.vel=v();world.player.grounded=false;
  const observer=v(x+1.6,ground+1.2,z+2.5),yaw=Math.atan2(1.6,2.5);
  const frame=()=>renderer.render(world,yaw,-.28,1/60,false,1,observer);
  // Observe descent, then the actual grounded transition with velocity already reset by physics.
  for(let i=0;i<10;i++){world.time=11+i/60;world.player.vel.y=-8;frame();}
  world.time=11.17;world.player.grounded=true;world.player.vel.y=0;frame();
  window.fixture={renderer,world,v,frame,born:world.time};
 });
 const reports=[];
 for(const age of [.05,.13,.27,.45,.8]){
  const report=await page.evaluate(age=>{const {renderer,world,frame,born}=fixture;world.time=born+age;frame();return {age,...renderer.blood.diagnostics};},age);
  reports.push(report);await page.screenshot({path:`${directory}/splash-${age}.png`});
 }
 assert.ok(reports[0].puddleSplashes>=1);assert.ok(reports[0].puddleSplashDrops>10);assert.ok(reports[0].dropletActive>10);
 assert.equal(reports.at(-1).puddleSplashes,0);assert.deepEqual(errors,[]);
 await writeFile(`${directory}/audit.json`,JSON.stringify({reports,errors},null,2)+'\n');console.log(JSON.stringify({reports,errors}));
}finally{await browser.close();}
