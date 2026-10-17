import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='artifacts/tower-clearance-kick';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/tower-kick-check',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:black}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/tower-kick-check');
 const clearance=await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,idleInput},{constrainEnemyFloor,towerFloorHeight},{Box3}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-floor.ts'),import('/node_modules/.vite/deps/three.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,mist:false});await renderer.prepare();
  const world=new World(1,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,0);
  window.towerKick={renderer,world,v,idleInput,frame:(dt=0)=>renderer.render(world,0,.12,dt,false)};
  const results=[];
  for(const kind of ['squid','squid2','squid3'])for(const age of [.05,.6,1.1,2.8,3.1,8,20]){
   renderer.clear();world.enemies=[];const e=world.spawn(kind,v(0,3,-14));e.age=age;e.nextSpawn=Infinity;constrainEnemyFloor(e,world.time);
   window.towerKick.frame();const model=renderer.enemies.get(e.id),bottom=new Box3().setFromObject(model).min.y,ground=towerFloorHeight(e,world.time);
   if(bottom<ground+.2)throw Error(`${kind} visible armor still intersects terrain: ${bottom-ground}`);
   results.push({kind,age,bottom,ground,clearance:bottom-ground});
  }
  renderer.clear();world.enemies=[];
  for(const [i,kind] of ['squid','squid2','squid3'].entries()){const e=world.spawn(kind,v((i-1)*8,3,-16-i*3));e.age=10;constrainEnemyFloor(e,world.time);}
  window.towerKick.frame();return results;
 });
 await page.screenshot({path:`${dir}/towers-clear.png`});
 const kicks=[];
 for(let level=1;level<=7;level++){
  const result=await page.evaluate(level=>{
   const {renderer,world,idleInput,frame}=window.towerKick;renderer.clear();world.level=level;world.projectiles=[];world.effects=[];frame();
   const weapon=renderer.originalWeapon,root=level>=5?weapon.handModels[level-1]:weapon.pose;
   const restPosition=root.position.clone(),restRotation=root.quaternion.clone();
   root.updateWorldMatrix(true,true);const palms=level>=5?weapon.twinPoses[level-5]:[root];const palmDepths=palms.map(p=>p.matrixWorld.elements[14]);
   const camera=renderer.camera.quaternion.toArray();world.shoot({...idleInput(),pitch:.12},true,false);const trajectories=JSON.stringify(world.projectiles);
   for(const e of world.effects)renderer.effect(e,world,0,.12);world.effects=[];frame();
   if(JSON.stringify(world.projectiles)!==trajectories)throw Error('Kick changed trajectories');
   if(JSON.stringify(camera)!==JSON.stringify(renderer.camera.quaternion.toArray()))throw Error('Kick deflected aim');
   root.updateWorldMatrix(true,true);
   for(let i=0;i<palms.length;i++)if(Math.abs(palms[i].matrixWorld.elements[14]-palmDepths[i]-weapon.effectDiagnostics.recoil)>1e-7)throw Error('A palm did not receive the full depth kick');
   if(root.quaternion.angleTo(restRotation)>1e-7)throw Error(`Tier ${level} tilted during shotgun recoil`);
   if(Math.abs(root.position.x-restPosition.x)>1e-8||Math.abs(root.position.y-restPosition.y)>1e-8)throw Error('Kick moved sideways or vertically');
   if(Math.abs(root.position.z-restPosition.z-weapon.effectDiagnostics.recoil)>1e-8)throw Error('Kick did not move toward camera');
   const visiblePalms=[0,0];
   for(let i=0;i<(level>=5?10:level===4?5:level);i++){const p=weapon.socketScreen(level,i);if(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>=-1&&p.z<=1)visiblePalms[level>=5?i%2:0]++;}
   if(level>=5&&visiblePalms.some(n=>n===0))throw Error('A recoiling twin hand left the screen entirely');
   return {level,kick:renderer.originalWeapon.effectDiagnostics.recoil,hands:renderer.originalWeapon.effectDiagnostics.visibleHands,visiblePalms};
  },level);
  assert.ok(result.kick>(kicks.at(-1)?.kick??.04));assert.equal(result.hands,level>=5?2:1);
  await page.screenshot({path:`${dir}/shotgun-${level}-peak.png`});
  await page.evaluate(()=>window.towerKick.frame(.03));
  if(level>=3)assert.ok(await page.evaluate(()=>window.towerKick.renderer.originalWeapon.effectDiagnostics.recoil)>result.kick*.97,'strong blast holds its impact');
  await page.evaluate(()=>window.towerKick.frame(.1));
  if(level>=3)await page.screenshot({path:`${dir}/shotgun-${level}-recovery.png`});
  await page.evaluate(()=>window.towerKick.frame(.37));
  assert.ok(await page.evaluate(()=>window.towerKick.renderer.originalWeapon.effectDiagnostics.recoil)<result.kick*.001);
  kicks.push(result);
 }
 assert.deepEqual(errors,[]);await writeFile(`${dir}/audit.json`,JSON.stringify({clearance,kicks},null,2));
 console.log('Rendered tower clearance at 21 poses and progressively stronger shotgun kicks I–VII passed:',JSON.stringify(kicks));
}finally{await browser.close();}
