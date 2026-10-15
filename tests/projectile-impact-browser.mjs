import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // This fixture mounts its own renderer; avoid loading the unrelated game UI.
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Projectile regression fixture</title>'}));
 await page.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const [{World,v,STEP},{GameRenderer},{sweepArmor},{localToEnemy}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/projectile-collision.ts'),import('/src/enemy-presentation.ts')]);
  const canvas=document.createElement('canvas');canvas.id='impact-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'low',fov:95});await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded]);
  const world=new World(1,{schedule:false,invulnerable:true});world.player.pos=v(0,5,10);
  const check=(p,m)=>{if(!p)throw Error(m);};let contacts=0;
  for(const kind of ['squid','squid2','squid3']){
   world.enemies=[];world.effects=[];const e=world.spawn(kind,v(0,7,-5));e.age=2;
   const a=localToEnemy(e,world.player.pos,v(0,-1.4,8)),b=localToEnemy(e,world.player.pos,v(0,-1.4,-8));
   check(sweepArmor(e,world.player.pos,a,b),'mesh contact');
   world.projectiles=[{id:900,pos:a,vel:v((b.x-a.x)/STEP,0,(b.z-a.z)/STEP),age:0,homing:false,level:1}];
   world.updateProjectiles(STEP);const impact=world.effects.find(e=>e.kind==='impact');check(impact,'impact effect');check(world.projectiles.length===0,'projectile dies');
   renderer.effect(impact,world,0,0);renderer.render(world,0,0,0,false,.5);
   check(renderer.originalWeapon.projectileDiagnostics.count===0,'physical dagger gone');check(renderer.projectileLighting.diagnostics.count===0,'glow gone');contacts++;
  }
  check(renderer.originalWeapon.fragments.some(f=>f.life<=.16),'short impact animation');
  world.enemies=[];world.effects=[];world.projectiles=[{id:1,pos:v(0,1,-4),vel:v(20,-200,0),age:0,homing:false,level:1}];world.updateProjectiles(STEP);
  check(world.projectiles.length===1&&world.projectiles[0].vel.y>0,'floor still bounces');
  const ricochet=world.effects.find(e=>e.kind==='ricochet');check(ricochet,'ricochet event');
  const before=renderer.originalWeapon.fragments.length;
  renderer.effect(ricochet,world,0,0);
  check(renderer.originalWeapon.fragments.length===before+3,'three ricochet sparks');
  const spark=renderer.originalWeapon.fragments.at(-1);
  check(spark.life<=.14&&spark.vel.y>0,'brief upward sparks');
  check(spark.emitter.start[1]===1,'hand-colored sparks');
  let maxAlignmentError=0;
  for(const alpha of [0,.2,.5,.8,1]){
   renderer.render(world,0,0,0,false,alpha);
   const matrix=renderer.originalWeapon.daggers[0].instanceMatrix.array,centers=renderer.projectileLighting.glow.geometry.getAttribute('shotCenter').array;
   for(let axis=0;axis<3;axis++)maxAlignmentError=Math.max(maxAlignmentError,Math.abs(matrix[12+axis]-centers[axis]));
  }
  check(maxAlignmentError<1e-6,'dagger and glow follow same bounce');
  // 1,000 actual armor impacts across eight towers in a single fixed tick.
  world.enemies=[];const starts=[];
  for(let i=0;i<8;i++){
   const e=world.spawn(['squid','squid2','squid3'][i%3],v((i%4-1.5)*12,8,-Math.floor(i/4)*15));e.age=2;
   const a=localToEnemy(e,world.player.pos,v(0,-1.4,8)),b=localToEnemy(e,world.player.pos,v(0,-1.4,-8)),hit=sweepArmor(e,world.player.pos,a,b);check(hit,'benchmark contact');
   const t=hit.t-.015;starts.push({pos:v(a.x+(b.x-a.x)*t,a.y,a.z+(b.z-a.z)*t),vel:v((b.x-a.x)/16*70,0,(b.z-a.z)/16*70)});
  }
  const times=[];let impacts=0;
  for(let iteration=0;iteration<35;iteration++){
   world.effects=[];world.projectiles=Array.from({length:1000},(_,i)=>({id:10000+i,pos:{...starts[i%8].pos},vel:{...starts[i%8].vel},age:0,homing:false,level:1}));
   const start=performance.now();world.updateProjectiles(STEP);const elapsed=performance.now()-start;if(iteration>=5)times.push(elapsed);
   impacts=world.effects.filter(e=>e.kind==='impact').length;check(impacts===1000,'all dense shots stopped');
  }
  times.sort((a,b)=>a-b);world.enemies=[];world.effects=[];world.projectiles=[];renderer.render(world,0,0,0,false);
  window.impactFixture={renderer,world,v};return {towerContacts:contacts,allImpactsRemoveDaggerAndGlow:true,floorBounce:true,maxAlignmentError,denseImpacts:impacts,collisionMedianMs:times[15],collisionP95Ms:times[28],glowDrawCalls:renderer.projectileLighting.diagnostics.drawCalls};
 });
 assert.deepEqual(errors,[]);assert.equal(result.denseImpacts,1000);
 await writeFile('artifacts/projectile-impact-audit.json',JSON.stringify(result,null,2)+'\n');console.log('Projectile impacts passed:',JSON.stringify(result));
}finally{await browser.close();}
