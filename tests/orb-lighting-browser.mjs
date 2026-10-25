import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const baseline=process.env.ORB_BASELINE==='1',directory='artifacts/orb-lighting';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/orb-lighting-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#10151e"><canvas></canvas>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/orb-lighting-review');
 await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,idleInput},{sweepArmor},{EnemyGlowSources}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/projectile-collision.ts'),import('/src/enemy-glow-sources.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,screenShake:0,movementMotion:0,mist:true,skyMotion:'reduced'});await game.prepare();
  const world=new World(71,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:1.7,z:14};
  for(const [x,z] of [[0,0]]){const e=world.spawn('orb',{x,y:3.3,z},false);e.age=12;}
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x10151e);
  scene.add(new THREE.HemisphereLight(0x9db6d4,0x211813,.8));
  const key=new THREE.DirectionalLight(0xffd8b1,1.8);key.position.set(-5,8,7);scene.add(key);
  const rim=new THREE.DirectionalLight(0x8cacdc,1.5);rim.position.set(5,4,-5);scene.add(rim);
  const model=game.originalEnemies.clone('orb');game.originalEnemies.animate(model,world.enemies[0],120,true);scene.add(model);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x171e26,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-2.5;scene.add(floor);
  const camera=new THREE.PerspectiveCamera(38,1.5,.01,200);camera.position.set(6,2.5,12);camera.lookAt(0,0,0);
  window.orbReview={THREE,game,world,idleInput,sweepArmor,EnemyGlowSources,scene,model,camera};
  game.originalEnemies.setTime(120);game.renderer.setSize(1440,960);game.renderer.render(scene,camera);
 });
 const prefix=baseline?'before-':'';
 await page.screenshot({path:`${directory}/${prefix}studio.png`});
 const poleCheck=await page.evaluate(()=>{
  const {THREE,game,scene,model,camera}=window.orbReview;
  model.updateMatrixWorld(true);const heart=model.getObjectByName('rift-heart'),axis=new THREE.Vector3(0,1,0).transformDirection(heart.matrixWorld),center=heart.getWorldPosition(new THREE.Vector3());
  camera.position.copy(center).addScaledVector(axis,7.8);camera.lookAt(center);camera.updateMatrixWorld();game.renderer.render(scene,camera);
  const gl=game.renderer.getContext(),sample=point=>{const p=point.project(camera),x=Math.round((p.x+1)*.5*gl.drawingBufferWidth),y=Math.round((p.y+1)*.5*gl.drawingBufferHeight),bytes=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return [...bytes];};
  const well=sample(new THREE.Vector3(0,2.4,0).applyMatrix4(heart.matrixWorld));
  const lip=sample(new THREE.Vector3(Math.sin(.177)*2.4,Math.cos(.177)*2.4,0).applyMatrix4(heart.matrixWorld));
  return {well,lip};
 });
 await mkdir('artifacts/orb-poles',{recursive:true});
 await page.screenshot({path:'artifacts/orb-poles/pole-closeup.png'});
 assert.ok(poleCheck.lip[0]>poleCheck.well[0]+30,'polar well stays dark inside its luminous red lip');
 await page.evaluate(()=>{const {camera}=window.orbReview;camera.position.set(6,2.5,12);camera.lookAt(0,0,0);});

 for(const quality of ['low','high']){
  await page.evaluate(quality=>{const {game,world,idleInput}=window.orbReview;game.configure({quality,fov:65,screenShake:0,movementMotion:0,mist:true,skyMotion:'reduced'});game.render(world,0,.11,0,false,1,null,false,false,idleInput());},quality);
  await page.screenshot({path:`${directory}/${prefix}arena-${quality}.png`});
 }
 const checks=await page.evaluate(()=>{
  const {THREE,game,world,model,sweepArmor,EnemyGlowSources,scene,camera}=window.orbReview;
  const bounds=new THREE.Box3().setFromObject(model.getObjectByName('rift-heart'),true),e=world.enemies[0];
  const orbMeshes=[];model.traverse(o=>{if(o.isMesh)orbMeshes.push(o.name);});
  const heart=model.getObjectByName('rift-heart'),initialRotation=heart.quaternion.clone(),initialAxis=new THREE.Vector3(0,1,0).applyQuaternion(initialRotation),initialPosition=heart.position.clone();
  game.originalEnemies.animate(model,e,122,true);
  const spinAngle=initialRotation.angleTo(heart.quaternion),axisDrift=initialAxis.distanceTo(new THREE.Vector3(0,1,0).applyQuaternion(heart.quaternion)),centerDrift=initialPosition.distanceTo(heart.position);
  game.originalEnemies.animate(model,e,120,true);const replayRotationError=initialRotation.angleTo(heart.quaternion);

  const countLights=()=>{let n=0;game.scene.traverse(o=>{if(o.isLight)n++;});return n;};
  const initialLights=countLights(),sources=new EnemyGlowSources(game.originalEnemies).sources(e,world.player.pos,game.camera,game.enemies.get(e.id)).map(s=>({position:s.pos.toArray(),size:s.size}));
  const gl=game.renderer.getContext(),sample=()=>{const p=new Uint8Array(1440*960*4);game.renderer.render(scene,camera);gl.readPixels(0,0,1440,960,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const normal=sample(),saved=[];
  const lights=[];scene.traverse(o=>{if(o.isLight){lights.push([o,o.intensity]);o.intensity=0;}});
  const selfLit=sample();game.originalEnemies.setTime(121);const pulse=sample();game.originalEnemies.setTime(120);
  for(const [light,intensity] of lights)light.intensity=intensity;
  let selfLitBands=0,pulsePixels=0;
  for(let i=0;i<selfLit.length;i+=4){
   if(selfLit[i]>70&&selfLit[i]>selfLit[i+1]*1.8)selfLitBands++;
   if(Math.abs(selfLit[i]-pulse[i])>2)pulsePixels++;
  }
  model.traverse(o=>{if(o.isMesh){saved.push([o,o.material]);o.material=new THREE.MeshStandardMaterial({color:0x10151e,roughness:.4});}});
  const dark=sample();for(const [node,material] of saved){node.material.dispose();node.material=material;}
  let bandPixels=0;for(let i=0;i<normal.length;i+=4)if(normal[i]>dark[i]+35&&normal[i]>normal[i+1]*1.8)bandPixels++;
  for(let i=0;i<40;i++){const e=world.spawn('orb',{x:i%8*4-14,y:0,z:-Math.floor(i/8)*5},false);e.age=12;}
  game.render(world,0,.11,0,false);return {top:bounds.max.y,bottom:bounds.min.y,orbMeshes,spinAngle,axisDrift,centerDrift,replayRotationError,initialLights,denseLights:countLights(),sources,bandPixels,selfLitBands,pulsePixels};
 });
 if(!baseline){assert.deepEqual(checks.orbMeshes,['rift-heart','orb-corona']);assert.ok(Math.abs(checks.spinAngle-.48)<1e-6);assert.ok(checks.axisDrift<1e-6&&checks.centerDrift===0);assert.ok(checks.replayRotationError<1e-6);assert.ok(Math.abs(checks.top-2.4)<.02&&Math.abs(checks.bottom+2.4)<.02,'sphere matches combat radius');assert.equal(checks.initialLights,checks.denseLights);assert.ok(checks.bandPixels>100,'red bands visibly light the orb');assert.ok(checks.sources.length===2);assert.ok(checks.selfLitBands>100,'orb emits without scene lights or bloom');assert.ok(checks.pulsePixels>100,'orb pulse changes surface light');}
 assert.deepEqual(errors,[]);await writeFile(`${directory}/${prefix}report.json`,JSON.stringify({checks,poleCheck,errors},null,2));console.log(JSON.stringify({checks,poleCheck,errors}));
}finally{await browser.close();}
