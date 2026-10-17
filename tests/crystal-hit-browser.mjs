import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [{World,v,idleInput,STEP},{OriginalEnemies},{crystalToEnemy}]=await Promise.all([import('/src/simulation.ts'),import('/src/original-enemies.ts'),import('/src/enemy-presentation.ts')]);
  const assets=new OriginalEnemies();await assets.loaded;
  if(!assets.ready)throw Error(assets.error);
  const world=new World(7,{schedule:false,invulnerable:true});world.time=5;world.player.pos=v(0,6,6);
  const samples=[];let sharedFlash;
  for(const kind of ['squid','squid2','squid3']){
   world.enemies=[];world.projectiles=[];
   const enemy=world.spawn(kind,v(0,6,-15));enemy.age=10;
   const model=assets.clone(kind),gems=[];
   model.traverse(o=>{if(o.name.startsWith('weak-point-'))gems.push(o);});
   gems.sort((a,b)=>a.name.localeCompare(b.name));
   assets.animate(model,enemy,world.time);
   const normal=gems[0].material,point=crystalToEnemy(enemy,world.player.pos,enemy.weakpoints[0].local),before=enemy.weakpoints[0].hp;
   // Shoot a real dagger from just outside the socket toward the attached crystal.
   world.shoot(idleInput(),false,false);
   const p=world.projectiles[0],dx=point.x-enemy.pos.x,dz=point.z-enemy.pos.z,length=Math.hypot(dx,dz);
   p.pos=v(point.x+dx/length*.8,point.y,point.z+dz/length*.8);p.previous={...p.pos};p.vel=v(-dx/length*70,0,-dz/length*70);
   world.updateProjectiles(STEP);
   if(enemy.weakpoints[0].hp>=before)throw Error(`${kind}: dagger missed crystal`);
   assets.animate(model,enemy,world.time);
   const flash=gems[0].material;
   sharedFlash??=flash;
   const phases=[0,.06,.10,.15,.20].map(dt=>{assets.animate(model,enemy,world.time+dt);return gems[0].material!==normal;});
   const isolated=gems.slice(1).every(g=>g.material===normal);
   // Further damage retriggers; destruction hides the crystal immediately.
   world.time+=.25;world.damageEnemy(enemy,1,point,0,true);assets.animate(model,enemy,world.time);
   const retrigger=gems[0].material===flash;
   world.damageEnemy(enemy,100,point,0,true);assets.animate(model,enemy,world.time);
   samples.push({kind,phases,isolated,retrigger,hidden:!gems[0].visible,shared:flash===sharedFlash,sameProgram:flash.customProgramCacheKey()===normal.customProgramCacheKey(),sameTexture:flash.map===normal.map});
  }
  return samples;
 });
 // Remake tower crystals retain their existing continuous 160 ms hit pulse.
 for(const sample of result){assert.deepEqual(sample.phases,[true,true,true,true,false]);for(const field of ['isolated','retrigger','hidden','shared','sameProgram','sameTexture'])assert.equal(sample[field],true,`${sample.kind}: ${field}`);}
 assert.deepEqual(errors,[]);
 console.log('Attached crystals: real bullet hits, isolated 160 ms pulse, retrigger, destruction, and shared material/texture/shader verified across all tower tiers.');
}finally{await browser.close();}
