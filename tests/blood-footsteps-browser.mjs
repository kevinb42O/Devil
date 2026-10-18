import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='artifacts/bloody-footsteps';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/bloody-step-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><button>Start</button><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/bloody-step-test');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer},{floorHeight},{Sound},{WET_FOOTSTEP_SOUNDS},{BLOOD_SPAN}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/arena.ts'),import('/src/audio.ts'),import('/src/footstep-audio.ts'),import('/src/blood.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true}),sound=new Sound();
  window.fixture={renderer,world,v,floorHeight,sound,WET_FOOTSTEP_SOUNDS,BLOOD_SPAN};
  document.querySelector('button').onclick=async()=>{await sound.start();await Promise.all(WET_FOOTSTEP_SOUNDS.map(n=>sound.load(n)));window.ready=true;};
 });
 await page.click('button');await page.waitForFunction(()=>window.ready);
 const report=await page.evaluate(async()=>{
  const {renderer,world,v,floorHeight,sound,BLOOD_SPAN}=fixture;world.time=8;
  const ground=floorHeight(0,0,8,0);renderer.blood.effect({kind:'kill',bloodId:777,enemyId:1,pos:v(0,ground+1.1,0),amount:2},world);renderer.blood.advance(11);world.time=11;
  const field=renderer.blood.field;let best=0,index=0;for(let i=0;i<field.pixels.length;i+=4)if(field.pixels[i]>best){best=field.pixels[i];index=i/4;}
  const x=((index%field.size+.5)/field.size-.5)*BLOOD_SPAN,z=((Math.floor(index/field.size)+.5)/field.size-.5)*BLOOD_SPAN;
  world.player.pos=v(x,floorHeight(x,z,11,0)+1.6,z);world.player.vel=v(0,0,11);world.player.grounded=true;
  const calls=[],real=sound.oneShot.bind(sound);sound.oneShot=(name,...args)=>{if(name.startsWith('footstep-'))calls.push(name);return real(name,...args);};
  renderer.render(world,0,-.8,1/60,false);sound.listener(world.player.pos,0,0);sound.updateFootsteps(world);
  let previous=performance.now(),elapsed=0;
  while(elapsed<2.8){await new Promise(requestAnimationFrame);const now=performance.now(),dt=Math.min(.05,(now-previous)/1000);previous=now;elapsed+=dt;world.time=11+elapsed;world.player.pos.z=z-elapsed*6;world.player.vel.z=-6;renderer.render(world,Math.PI,-.8,dt,false);sound.listener(world.player.pos,Math.PI,0);sound.updateFootsteps(world);}
  const prints=renderer.blood.footsteps.trail.prints.map(p=>({...p}));
  world.player.pos=v(x+4,ground+12,z-6);world.player.vel=v(0,0,0);world.player.grounded=false;
  renderer.render(world,Math.PI/2,-1.05,0,false);
  return {prints,calls,puddleCoverage:best,diagnostics:renderer.blood.diagnostics};
 });
 assert.ok(report.prints.length>=5);assert.ok(report.prints[0].strength>report.prints.at(-1).strength);
 assert.ok(report.calls.some(n=>n.startsWith('footstep-wet')),'actual puddle contact plays wet recordings in dry weather');
 await page.screenshot({path:`${directory}/trail.png`});assert.deepEqual(errors,[]);
 await writeFile(`${directory}/audit.json`,JSON.stringify({...report,errors},null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
