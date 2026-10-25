import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/orb-attack';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/orb-attack-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/orb-attack-review');
 const result=await page.evaluate(async()=>{
  const [{World,idleInput,STEP},{GameRenderer},THREE]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/node_modules/.vite/deps/three.js')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:true,movementMotion:0,screenShake:0,skyMotion:'reduced'});await game.prepare();
  const world=new World(71,{schedule:false,invulnerable:true});world.time=120;world.tick=14400;world.player.pos={x:0,y:1.7,z:26};
  const orb=world.spawn('orb',{x:0,y:4,z:0},false);orb.age=12;orb.activeAt=0;orb.nextBeckon=13.2;
  for(const [x,z]of [[-6,2],[5,-4],[-11,-7],[13,4],[-19,7],[20,-8]]){const e=world.spawn('skull2',{x,y:2,z},false);e.age=20;}
  const lights=()=>{let count=0;game.scene.traverse(o=>{if(o.isLight)count++;});return count;};const initialLights=lights();
  for(let i=0;i<480;i++)world.step(idleInput(),STEP);
  assertWave();function assertWave(){if(!world.rings.length)throw Error('Orb never emitted its actual gameplay attack');}
  const draw=()=>game.render(world,0,-.30,0,false,1,{x:0,y:10,z:28},false,false,idleInput());
  const before=JSON.stringify(world.captureCrewCheckpoint());draw();const after=JSON.stringify(world.captureCrewCheckpoint());
  const wave=world.rings[0],entry=game.transmutationWaves.active.get(wave.id),positions=entry.curtain.geometry.getAttribute('position');
  const firstRadius=Math.hypot(positions.getX(0)-wave.pos.x,positions.getZ(0)-wave.pos.z);
  const original=[...positions.array];world.rings=[];draw();world.rings=[wave];draw();const restored=game.transmutationWaves.active.get(wave.id).curtain.geometry.getAttribute('position').array;
  const replayStable=original.every((v,i)=>v===restored[i]);
  const gl=game.renderer.getContext(),pixels=()=>{draw();const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  game.configure({quality:'low',fov:65,mist:true,skyMotion:'reduced',movementMotion:0,screenShake:0});
  const lit=pixels();world.rings=[];const unlit=pixels();let redPixels=0;for(let i=0;i<lit.length;i+=4)if(lit[i]>unlit[i]+15&&lit[i]>lit[i+1]*1.35)redPixels++;
  world.rings=[wave];draw();window.attackReview={game,world,idleInput,draw};
  const ringValues={id:wave.id,radius:wave.radius,age:wave.age};
  const attackDraws=game.transmutationWaves.active.size;
  return {ring:ringValues,firstRadius,stateUnchanged:before===after,replayStable,transmuted:world.stats.transmuted,redPixels,initialLights,finalLights:lights(),attackDraws};
 });
 assert.ok(result.stateUnchanged);assert.ok(result.replayStable);assert.ok(Math.abs(result.firstRadius-result.ring.radius)<1e-4,'visible leading edge matches collision radius');assert.ok(result.transmuted>0,'real wave transforms live enemies');assert.ok(result.redPixels>200,'attack remains visible without bloom');assert.equal(result.initialLights,result.finalLights);
 for(const quality of ['low','high']){await page.evaluate(quality=>{const {game,draw}=window.attackReview;game.configure({quality,fov:65,mist:true,skyMotion:'reduced',movementMotion:0,screenShake:0});draw();},quality);await page.screenshot({path:`${directory}/${quality}.png`});}
 await page.evaluate(()=>{const {game,world,idleInput}=window.attackReview;game.render(world,0,.03,0,false,1,{x:0,y:1.7,z:26},false,false,idleInput());});
 await page.screenshot({path:`${directory}/player-view.png`});
 const emission=await page.evaluate(()=>{
  const {game,world,draw}=window.attackReview,ring=world.rings[0];
  ring.age=.18;ring.radius=1.62;draw();const discharge=game.transmutationWaves.active.get(ring.id).discharge;
  const visible=discharge.visible;ring.age=.6;ring.radius=5.4;draw();const expired=!discharge.visible;
  ring.age=.18;ring.radius=1.62;draw();return {visible,expired,restored:discharge.visible};
 });assert.deepEqual(emission,{visible:true,expired:true,restored:true});
 await page.screenshot({path:`${directory}/source-discharge.png`});
 const cleanup=await page.evaluate(()=>{const {game}=window.attackReview;game.clear();return {active:game.transmutationWaves.active.size,ground:game.transmutationWaves.ground.every(v=>v.w===0)};});assert.deepEqual(cleanup,{active:0,ground:true});assert.deepEqual(errors,[]);
 await writeFile(directory+'/report.json',JSON.stringify({result,emission,cleanup,errors},null,2));console.log(JSON.stringify({result,emission,cleanup,errors}));
}finally{await browser.close();}
