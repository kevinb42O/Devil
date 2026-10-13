import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
await mkdir('artifacts',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [THREE,{World,v,idleInput,STEP},{GameRenderer},{weaponMuzzle,HAND_SOCKETS}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/weapon-origin.ts')]);
  const canvas=document.createElement('canvas');canvas.id='projectile-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999;width:100vw;height:100vh';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'low',fov:95});await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded]);
  const world=new World(91,{schedule:false,invulnerable:true});world.player.pos=v(4,5,2);const weapon=renderer.originalWeapon,check=(p,m)=>{if(!p)throw Error(m);};
  let maxScreenError=0,checks=0;
  for(let level=1;level<=4;level++)for(const fov of [70,95,120])for(const aspect of [1,16/9,9/16,21/9])for(const [yaw,pitch] of [[0,0],[1.2,.9],[-2.1,-1.2]]){
   world.level=level;weapon.clear();renderer.render(world,yaw,pitch,0,false);
   renderer.camera.fov=fov;renderer.camera.aspect=aspect;renderer.camera.updateProjectionMatrix();renderer.camera.updateMatrixWorld(true);weapon.update(world,0,false,renderer.camera);
   for(let i=0;i<HAND_SOCKETS[level-1].length;i++){
    const origin=weaponMuzzle(world.player.pos,yaw,pitch,level,i),worldScreen=new THREE.Vector3(origin.x,origin.y,origin.z).project(renderer.camera),handScreen=weapon.socketScreen(level,i);
    const error=Math.hypot(worldScreen.x-handScreen.x,worldScreen.y-handScreen.y);maxScreenError=Math.max(maxScreenError,error);check(error<1e-6,'world projectile and rendered fingertip align');checks++;
   }
  }
  // Short mounted flashes identify each socket only during the shot.
  weapon.clear();world.level=4;world.projectiles=[];world.effects=[];world.shoot(idleInput(),true,false);for(const event of world.effects)weapon.effect(event,world,0,0);weapon.update(world,0,false,renderer.camera);check(weapon.tipFlames.mesh.count===5,'five fingertip flames on hand IV burst');
  const tipMatrix=new THREE.Matrix4();weapon.tipFlames.mesh.getMatrixAt(4,tipMatrix);check(Math.abs(tipMatrix.elements[12]-HAND_SOCKETS[3][4].x)<1e-6,'flame attached to measured fingertip');weapon.clear();weapon.update(world,0,false,renderer.camera);check(weapon.tipFlames.mesh.count===0,'inactive fingertip flames disappear');
  // Interpolation retains the birth position and blends the actual swept path.
  weapon.clear();world.level=1;world.projectiles=[];world.shoot(idleInput(),false,false);const p=world.projectiles[0];world.updateProjectiles(STEP);
  weapon.update(world,0,false,renderer.camera,0);const matrix=new THREE.Matrix4();weapon.daggers[0].getMatrixAt(0,matrix);check(Math.abs(matrix.elements[12]-p.previous.x)<1e-6,'birth interpolation begins at hand');
  weapon.update(world,0,false,renderer.camera,.5);weapon.daggers[0].getMatrixAt(0,matrix);check(Math.abs(matrix.elements[14]-(p.previous.z+p.pos.z)/2)<1e-6,'half-tick interpolation');
  // Exceed the old per-family 2,500 limit without dropping or corrupting daggers.
  world.level=4;world.projectiles=Array.from({length:6000},(_,i)=>({id:10000+i,pos:v(i%100*.12-6,3,Math.floor(i/100)*-.3-3),vel:v(.3,0,-70),age:1,homing:false,level:4}));
  renderer.configure({quality:'low',fov:95});renderer.render(world,0,0,0,false);const dense={...weapon.projectileDiagnostics};check(dense.count===6000,'all dense daggers rendered');check(dense.capacities[4]>=6000,'capacity grows');check(dense.batches===1,'one draw for one projectile family');
  const last=new THREE.Matrix4();weapon.daggers[4].getMatrixAt(5999,last);check(Math.abs(last.elements[12]-world.projectiles[5999].pos.x)<1e-6,'last dagger transform');
  // Flight alignment and upright roll, including the old reverse-Z singularity.
  const directions=[v(0,0,0),v(0,0,-70),v(0,0,70),v(3,-4,5),v(-12,25,-8),v(0,9,0),v(0,.01,-70),v(.01,.01,-70)];
  const stored=world.projectiles;world.projectiles=directions.map((vel,i)=>({id:i,pos:v(i,3,-5),vel,age:.1,homing:i%2===0,level:4}));weapon.update(world,0,false,renderer.camera);
  const cursors=[0,0];let maxMatrixError=0;
  for(const p of world.projectiles){
   const matrix=new THREE.Matrix4(),type=p.homing?1:0;weapon.daggers[p.homing?5:4].getMatrixAt(cursors[type]++,matrix);
   const forward=new THREE.Vector3(p.vel.x,p.vel.y,p.vel.z);if(!forward.lengthSq())forward.z=1;forward.normalize();
   const tip=new THREE.Vector3(0,0,1).transformDirection(matrix),up=new THREE.Vector3(0,1,0).transformDirection(matrix);
   const error=tip.distanceTo(forward);maxMatrixError=Math.max(maxMatrixError,error);check(error<1e-6,'tip follows flight');
   const upright=new THREE.Vector3(0,1,0).addScaledVector(forward,-forward.y);if(upright.lengthSq()>1e-10)check(up.distanceTo(upright.normalize())<1e-6,'blade roll stays aligned with projected up');check(Math.abs(up.dot(tip))<1e-6,'orthogonal blade axes');
   check(Math.abs(matrix.determinant()-(p.homing?1.15**3:1))<1e-6,'rigid scale without mirroring');
  }
  // Fresh overlapping burst meshes and halos grow only after leaving the sockets.
  world.projectiles=[{id:1,pos:v(0,3,-1),previous:v(0,3,-1),vel:v(0,0,-70),age:STEP,homing:false,level:4}];
  weapon.update(world,0,false,renderer.camera,0);weapon.daggers[4].getMatrixAt(0,matrix);check(matrix.elements[0]===0,'no full-size mesh at birth');renderer.projectileLighting.update(world,false,0,720);check(renderer.projectileLighting.glow.geometry.attributes.shotSize.getX(0)===0,'no stacked halo at birth');
  world.projectiles[0].age=.03;weapon.update(world,0,false,renderer.camera);weapon.daggers[4].getMatrixAt(0,matrix);check(Math.abs(matrix.elements[0])===1,'full-size shot after launch');renderer.projectileLighting.update(world,false,1,720);check(renderer.projectileLighting.glow.geometry.attributes.shotSize.getX(0)===1,'full halo after clearing fingers');
  weapon.flashTime=0;weapon.update(world,0,false,renderer.camera);check(weapon.tipFlames.mesh.count===0,'no persistent mounted flame');
  world.projectiles=stored;
  const benchmark=(fn)=>{const times=[];for(let i=0;i<50;i++){const begin=performance.now();fn();if(i>=10)times.push(performance.now()-begin);}times.sort((a,b)=>a-b);return {median:times[20],p95:times[38]};};
  const optimized=benchmark(()=>weapon.update(world,0,false,renderer.camera));
  // Same matrix work as the prior implementation, with its two temporary
  // Vector3 allocations per dagger. Capacity is pre-grown for a fair comparison.
  const legacy=benchmark(()=>{let count=0;for(const p of world.projectiles){weapon.dummy.position.set(p.pos.x,p.pos.y,p.pos.z);weapon.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(p.vel.x,p.vel.y,p.vel.z).normalize());weapon.dummy.scale.setScalar(1);weapon.dummy.updateMatrix();weapon.daggers[4].setMatrixAt(count++,weapon.dummy.matrix);}weapon.daggers[4].count=count;weapon.daggers[4].instanceMatrix.needsUpdate=true;});
  world.projectiles=[];weapon.update(world,0,false,renderer.camera);const versions=weapon.daggers.map(d=>d.instanceMatrix.version);weapon.update(world,0,false,renderer.camera);check(weapon.daggers.every((d,i)=>versions[i]===d.instanceMatrix.version),'empty projectile batches do not upload');
  window.projectileFixture={world,renderer,idleInput,STEP,THREE};
  return {socketProjectionChecks:checks,maxScreenError,maxMatrixError,dense,transformBenchmarkMs:{optimized,legacy},emptyUploadFree:true};
 });
 assert.equal(result.dense.count,6000);assert.deepEqual(errors,[]);
 for(let level=1;level<=4;level++){
  await page.evaluate(level=>{const {world,renderer,idleInput,STEP}=window.projectileFixture;renderer.clear();world.projectiles=[];world.effects=[];world.level=level;world.reserve=100;world.player.pos={x:0,y:1.7,z:0};world.shoot({...idleInput(),pitch:.1},true,false);for(const e of world.effects)renderer.effect(e,world,0,.1);world.updateProjectiles(STEP);renderer.render(world,0,.1,0,false,0);},level);
  await page.locator('#projectile-test').screenshot({path:`artifacts/hand-origin-${level}.png`});
 }
 await writeFile('artifacts/projectile-audit.json',JSON.stringify(result,null,2)+'\n');console.log('Projectile browser passed:',JSON.stringify(result));
}finally{await browser.close();}
