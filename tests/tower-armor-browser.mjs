import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/tower-armor-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#10151e"></body>'}));
 await page.goto('http://127.0.0.1:5173/tower-armor-test');
 const result=await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,v,idleInput,STEP},{enemyYaw,enemyEmergenceScale,towerOutletHeight,towerRadius,towerOutlets,localToEnemy},{sweepArmor}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-presentation.ts'),import('/src/projectile-collision.ts')]);
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:99999';document.body.append(canvas);
  const game=new GameRenderer(canvas,{quality:'high',fov:80,mist:false});await game.prepare();
  let hits=0,rays=0,seed=71;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const kind of ['squid','squid2','squid3'])for(const age of [.7,184/60,12]){
   const world=new World(71,{schedule:false,invulnerable:true}),enemy=world.spawn(kind,v(0,5,0));enemy.age=age;enemy.facingYaw=.7;
   const model=game.originalEnemies.clone(kind);game.originalEnemies.animate(model,enemy,0,true);
   model.position.set(enemy.pos.x,enemy.pos.y,enemy.pos.z);model.rotation.y=enemyYaw(enemy,world.player.pos);model.scale.setScalar(enemyEmergenceScale(enemy));model.updateMatrixWorld(true);
   model.traverse(part=>{if(part.isMesh){if(part.name.startsWith('weak-point-'))part.visible=false;part.material=part.material.clone();part.material.side=THREE.DoubleSide;}});
   const armor=[];model.traverse(part=>{if(part.isMesh&&!part.name.startsWith('weak-point-'))armor.push(part);});
   const height=towerOutletHeight(kind)*enemyEmergenceScale(enemy),radius=towerRadius(kind)*enemyEmergenceScale(enemy);
   const exhausts=armor.filter(part=>part.name==='tower-exhaust');
   towerOutlets(kind).forEach((point,i)=>{
    const expected=localToEnemy(enemy,world.player.pos,{x:point.x*enemyEmergenceScale(enemy),y:(point.y-.06)*enemyEmergenceScale(enemy),z:point.z*enemyEmergenceScale(enemy)});
    if(exhausts[i].getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))>1e-5)throw Error('Spawn outlet detached from rendered chimney');
   });
   // Pitched shots, steep shots, opposite faces and finite path limits catch
   // mistakes hidden by horizontal rays through mature stationary towers.
   for(let i=0;i<700;i++){
    const angle=random()*Math.PI*2,tilt=(random()-.5)*1.6;
    const center=new THREE.Vector3((random()-.5)*radius*2.5,random()*(enemy.pos.y+height+2),(random()-.5)*radius*2.5);
    const delta=new THREE.Vector3(Math.sin(angle),tilt,Math.cos(angle)).normalize().multiplyScalar(25);
    const a=center.clone().add(delta),b=center.clone().sub(delta),direction=b.clone().sub(a).normalize();
    const ray=new THREE.Raycaster(a,direction,0,50),visual=ray.intersectObjects(armor,false)[0],hit=sweepArmor(enemy,world.player.pos,a,b,1,0,true);rays++;
    if(!visual){if(hit)throw Error(kind+' phantom pitched armor');continue;}
    if(!hit||Math.abs(hit.t-visual.distance/50)>1e-5)throw Error(kind+' mismatched pitched contact');
    const normal=visual.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(visual.object.matrixWorld));
    if(normal.dot(direction)>0)normal.negate();
    if(normal.distanceTo(new THREE.Vector3(hit.nx,hit.ny,hit.nz))>1e-4)throw Error(kind+' mismatched impact normal');
    if(sweepArmor(enemy,world.player.pos,a,b,hit.t*.8,0,true))throw Error(kind+' armor beyond the projectile path');
    hits++;
   }

   for(let y=.3;y<enemy.pos.y+height+2;y+=.37)for(let x=-radius*1.3;x<radius*1.3;x+=.31){
    const a=v(x,y,20),b=v(x,y,-20),ray=new THREE.Raycaster(new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(0,0,-1),0,40);
    const visual=ray.intersectObjects(armor,false)[0],hit=sweepArmor(enemy,world.player.pos,a,b,1,0,true);rays++;
    if(!visual){if(hit)throw Error(kind+' phantom armor');continue;}
    if(!hit||Math.abs(hit.t-visual.distance/40)>1e-5)throw Error(`${kind} age ${age}: shot passes visible armor at ${x},${y}: ${JSON.stringify({hit,visual:visual.distance/40,part:visual.object.name})}`);hits++;
   }
  }
  const world=new World(71,{schedule:false,invulnerable:true});world.player.pos=v(0,13,26);
  ['squid','squid2','squid3'].forEach((kind,i)=>world.spawn(kind,v((i-1)*12,5,-14)));
  while(world.time<3.5)world.step(idleInput(),STEP);
  game.render(world,0,.1,0,false);
  return {rays,hits,children:world.enemies.filter(e=>e.towerFlight).length};
 });
 await mkdir('artifacts/tower-collision-fix',{recursive:true});
 await page.screenshot({path:'artifacts/tower-collision-fix/ejection.png'});
 assert.deepEqual(errors,[]);assert.ok(result.hits>1000);assert.ok(result.children>0);console.log(result);
}finally{await browser.close();}
