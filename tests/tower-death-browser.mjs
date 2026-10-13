import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [{World,v,idleInput,STEP},{GameRenderer},{Box3},{floorHeight}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/node_modules/three/build/three.module.js'),import('/src/arena.ts')]);
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'low',fov:90});await renderer.prepare();
  const world=new World(7,{schedule:false,invulnerable:true});world.time=5;world.player.pos=v(0,6,6);
  const towers=['squid','squid2','squid3'].map((kind,i)=>{const e=world.spawn(kind,v((i-1)*7,kind==='squid'?3.3:kind==='squid2'?5.2:7,-15));e.age=5;return e;});
  renderer.render(world,0,0,0,false);
  const models=towers.map(e=>renderer.enemies.get(e.id)),start=models.map(m=>({y:m.position.y,yaw:m.rotation.y}));
  for(const tower of towers)for(let i=0;i<tower.weakpoints.length;i++)world.damageEnemy(tower,100,tower.pos,i,true);
  world.step(idleInput(),STEP);renderer.render(world,0,0,0,false);
  const started=world.time,samples=[];
  for(const elapsed of [0,.5,1,1.5,1.99,2.01]){
   world.time=started+elapsed;renderer.render(world,0,0,0,false);
   samples.push({elapsed,poses:models.map(m=>({y:m.position.y,yaw:m.rotation.y,present:!!m.parent,top:new Box3().setFromObject(m).max.y,crystals:(()=>{let n=0;m.traverse(o=>{if(o.name.startsWith('weak-point-')&&o.visible)n++;});return n;})()}))});
  }
  // A paused simulation leaves the pose fixed, and reset removes an unfinished death.
  world.time=8;const tower=world.spawn('squid',v(0,3.3,-15));tower.age=5;renderer.render(world,0,0,0,false);
  world.damageEnemy(tower,100);world.step(idleInput(),STEP);renderer.render(world,0,0,0,false);
  const death=renderer.dyingTowers.get(tower.id),paused=death.model.position.y;renderer.render(world,0,0,.5,false);
  const pauseStable=death.model.position.y===paused;renderer.clear();
  return {start,samples,liveTowers:world.enemies.filter(e=>e.kind.startsWith('squid')&&e.hp>0).length,pauseStable,cleared:renderer.dyingTowers.size===0&&!death.model.parent,floors:towers.map(e=>floorHeight(e.pos.x,e.pos.z,started))};
 });
 for(let i=0;i<3;i++){
  assert.equal(result.samples[0].poses[i].y,result.start[i].y);
  assert.equal(result.samples[0].poses[i].yaw,result.start[i].yaw);
  for(let j=0;j<5;j++){assert.equal(result.samples[j].poses[i].present,true);assert.equal(result.samples[j].poses[i].crystals,0);}
  for(let j=1;j<5;j++)assert.ok(result.samples[j].poses[i].y<result.samples[j-1].poses[i].y);
  const spin=result.samples.slice(0,4).map(s=>s.poses[i].yaw);
  assert.ok(Math.abs(spin[3]-spin[2])>Math.abs(spin[2]-spin[1]));assert.ok(Math.abs(spin[2]-spin[1])>Math.abs(spin[1]-spin[0]));
  assert.ok(result.samples[4].poses[i].top<result.floors[i]);
  assert.equal(result.samples[5].poses[i].present,false);
 }
 assert.equal(result.liveTowers,0);assert.equal(result.pauseStable,true);assert.equal(result.cleared,true);assert.deepEqual(errors,[]);
 console.log('All three tower tiers accelerate, sink fully, and disappear after two seconds; pause and reset verified.');
}finally{await browser.close();}
