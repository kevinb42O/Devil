import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory=process.env.TOWER_OUTPUT||'artifacts/tower-low-hover';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/hover-proof',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/hover-proof');
 const checks=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput},{constrainEnemyFloor,towerFloorHeight},{enemyEmergenceScale,enemyYaw},{Vector3}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-floor.ts'),import('/src/enemy-presentation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,screenShake:0,movementMotion:0,skyMotion:'reduced'});await game.prepare();game.renderer.setSize(1440,900);
  const world=new World(71,{schedule:false,invulnerable:true}),results=[];
  for(const kind of ['squid','squid2','squid3']){
   const enemy=world.spawn(kind,{x:12,y:0,z:0}),model=game.originalEnemies.clone(kind),points=new Vector3();let minimum=Infinity,maximum=-Infinity;
   for(let frame=0;frame<64;frame++){
    enemy.age=1.1+frame*.7;const time=frame%3===0?180:12;enemy.pos.x=frame%2?12:0;
    constrainEnemyFloor(enemy,time);game.originalEnemies.animate(model,enemy,time,true);model.position.copy(enemy.pos);model.scale.setScalar(enemyEmergenceScale(enemy));model.rotation.y=enemyYaw(enemy,world.player.pos);model.updateMatrixWorld(true);
    let bottom=Infinity;model.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.getAttribute('position');for(let i=0;i<p.count;i++){points.fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld);bottom=Math.min(bottom,points.y);}});
    const gap=bottom-towerFloorHeight(enemy,time);minimum=Math.min(minimum,gap);maximum=Math.max(maximum,gap);
   }
   results.push({kind,poses:64,minimumGap:minimum,maximumGap:maximum});
  }
  world.enemies=[];world.player.pos={x:0,y:1.7,z:19};world.time=12;
  const towers=['squid','squid2','squid3'].map((kind,i)=>{const e=world.spawn(kind,{x:(i-1)*12,y:0,z:-12});e.age=12;constrainEnemyFloor(e,12);return e;});
  window.hoverProof={game,world,towers,idleInput,constrainEnemyFloor,towerFloorHeight};return results;
 });
 for(const e of checks){assert.ok(e.minimumGap>=.29,`${e.kind} clips the floor`);assert.ok(e.maximumGap<.65,`${e.kind} still hovers too high`);}
 for(const before of [true,false]){
  await page.evaluate(before=>{const {game,world,towers,idleInput,constrainEnemyFloor,towerFloorHeight}=window.hoverProof;for(const e of towers){if(before)e.pos.y=towerFloorHeight(e,12)+.28+.85+Math.sin(e.age*.95+(e.kind==='squid3'?1.7:e.kind==='squid2'?.8:0))*.18;else constrainEnemyFloor(e,12);}game.render(world,0,.17,0,false,1,null,false,false,idleInput());},before);
  await page.screenshot({path:`${directory}/${before?'before':'after'}.png`});
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
