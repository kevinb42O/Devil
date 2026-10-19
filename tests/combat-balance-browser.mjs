import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output='artifacts/balance-audit/fixes';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/combat-balance-browser',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/combat-balance-browser');
 const report=await page.evaluate(async()=>{
  const [THREE,{World,v},{GameRenderer},{crystalToEnemy,spiderLocalPoint,SPIDER_GEM,enemyEmergenceScale,spiderCrystalRadius,towerCrystalRadius}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/enemy-presentation.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:85,mist:false});await renderer.prepare();
  const world=new World(71,{schedule:false,invulnerable:true});world.time=300;world.player.pos=v(0,1.7,14);
  const enemies=['squid','squid2','squid3','spider','spider2','centipede'].map((kind,i)=>{
   const e=world.spawn(kind,v((i%3-1)*11,0,-8-Math.floor(i/3)*14));e.age=20;e.headExposure=1;e.nextSpawn=Infinity;e.facingYaw=0;if(kind.startsWith('spider'))e.pos=v((i%3-1)*11,2.7*e.size*.62,-22);
   if(kind==='centipede'){e.pos=v(11,4,-22);e.vel=v(0,0,8);e.segments.forEach((s,j)=>s.pos=v(11,4,-23-j*1.3));}
   return e;
  });
  renderer.render(world,0,.22,0,false);
  const points=[],segments=[];
  for(const e of enemies){
   const model=renderer.enemies.get(e.id);if(!model)throw Error('Missing rendered '+e.kind);model.updateWorldMatrix(true,true);
   for(let i=0;i<e.weakpoints.length;i++){
    const node=model.getObjectByName('weak-point-'+i),position=node.getWorldPosition(new THREE.Vector3()),expected=crystalToEnemy(e,world.player.pos,e.weakpoints[i].local),scale=node.getWorldScale(new THREE.Vector3()).x;
    points.push({kind:e.kind,error:position.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z)),radiusError:Math.abs(scale-towerCrystalRadius(e.kind)*enemyEmergenceScale(e)),visualRadius:scale,hitRadius:towerCrystalRadius(e.kind,true)*enemyEmergenceScale(e),height:position.y});
   }
   if(e.kind.startsWith('spider')){
    const node=model.getObjectByName('spider-held-gem'),position=node.getWorldPosition(new THREE.Vector3()),expected=spiderLocalPoint(e,world.player.pos,SPIDER_GEM),scale=node.getWorldScale(new THREE.Vector3()).x;
    points.push({kind:e.kind,error:position.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z)),radiusError:Math.abs(scale-spiderCrystalRadius(e)*enemyEmergenceScale(e)),height:position.y});
   }
   if(e.kind==='centipede')model.children.filter(n=>n.name==='segment').forEach((node,i)=>{
    const position=node.getWorldPosition(new THREE.Vector3()),expected=e.segments[i].pos,crystal=node.getObjectByName('segment-weak-point');
    segments.push({error:position.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z)),radiusError:Math.abs(crystal.getWorldScale(new THREE.Vector3()).x-.53*e.size)});
   });
  }
  window.balanceAudit={renderer,world};return {points,segments,drawCalls:renderer.renderer.info.render.calls};
 });
 for(const p of [...report.points,...report.segments]){assert.ok(p.error<1e-6,JSON.stringify(p));assert.ok(p.radiusError<1e-6,JSON.stringify(p));}
 for(const p of report.points.filter(p=>p.kind.startsWith('squid'))){assert.ok(p.visualRadius<=.56,'crown jewels stay proportionate');assert.ok(p.hitRadius>=1,'aiming tolerance remains forgiving');}
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/gameplay.png'});
 await writeFile(output+'/render-alignment.json',JSON.stringify({...report,errors},null,2)+'\n');console.log('Enemy rigs and crystal centers align; tower jewel visuals stay compact with independent aiming tolerance.',report.points);
}finally{await browser.close();}
