import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/tower-lifecycle';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/tower-lifecycle',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/tower-lifecycle');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,STEP},{enemyYaw,crystalToEnemy},{Vector3}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-presentation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,screenShake:0,movementMotion:0,skyMotion:'reduced'});await game.prepare();
  game.renderer.setSize(1440,900);const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:2.6,z:19};
  const towers=['squid','squid2','squid3'].map((kind,i)=>world.spawn(kind,{x:(i-1)*12,y:0,z:-12}));
  world.time=2.35;for(const e of towers)e.age=2.35;
  const chunks=[],recorder=new MediaRecorder(game.renderer.domElement.captureStream(30),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6500000});
  recorder.ondataavailable=e=>chunks.push(e.data);const finished=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  const start=performance.now();let last=start,accumulator=0,killed=false,maximumTargetError=0;const poses=[];
  await new Promise(resolve=>{const frame=()=>{
   const now=performance.now(),t=(now-start)/1000;accumulator+=Math.min(.1,(now-last)/1000);last=now;
   while(accumulator>=STEP){world.step(idleInput(),STEP);world.effects=[];accumulator-=STEP;}
   if(t>=4.2&&!killed){for(const e of towers)for(let i=0;i<e.weakpoints.length;i++)world.damageEnemy(e,100,e.pos,i,true);killed=true;}
   game.render(world,0,.17,1/30,false,1,null,false,false,idleInput());
   if(!killed)for(const e of towers){
    const model=game.enemies.get(e.id);if(!model)continue;
    if(Math.abs(model.rotation.y-enemyYaw(e,world.player.pos))>1e-9)throw Error('rendered spit yaw detached');model.updateMatrixWorld(true);
    for(let i=0;i<e.weakpoints.length;i++){const expected=crystalToEnemy(e,world.player.pos,e.weakpoints[i].local),actual=model.getObjectByName(`weak-point-${i}`).getWorldPosition(new Vector3());maximumTargetError=Math.max(maximumTargetError,actual.distanceTo(new Vector3(expected.x,expected.y,expected.z)));}
   }
   if(poses.length<Math.floor(t*5))poses.push({t,age:towers[0].age,live:game.enemies.size,dying:game.dyingTowers.size,yaw:towers.map(e=>game.enemies.get(e.id)?.rotation.y)});
   if(t<6.9)requestAnimationFrame(frame);else resolve();
  };frame();});
  recorder.stop();await finished;const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  return {video:btoa(binary),maximumTargetError,poses,remainingDying:game.dyingTowers.size};
 });
 await writeFile(`${directory}/spit-and-death.webm`,Buffer.from(result.video,'base64'));delete result.video;
 assert.ok(result.maximumTargetError<1e-6);assert.equal(result.remainingDying,0);assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({maximumTargetError:result.maximumTargetError,remainingDying:result.remainingDying,errors}));
}finally{await browser.close();}
