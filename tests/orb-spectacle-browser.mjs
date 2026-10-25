import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='artifacts/orb-spectacle';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/orb-spectacle-review',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas>'}));await page.goto('http://127.0.0.1:5173/orb-spectacle-review');
 const result=await page.evaluate(async()=>{
  const [{World,idleInput},{GameRenderer},{enemyEmergenceScale},{ORB_RADIUS,ORB_HOVER_HEIGHT},THREE]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/enemy-presentation.ts'),import('/src/orb-scale.ts'),import('/node_modules/.vite/deps/three.js')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,mist:true,skyMotion:'reduced',movementMotion:0,screenShake:0});await game.prepare();
  const world=new World(71,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:1.7,z:22};
  const orb=world.spawn('orb',{x:0,y:5,z:0},false);orb.age=12;
  const draw=()=>game.render(world,0,Math.atan2(ORB_HOVER_HEIGHT-1.7,22),0,false,1,world.player.pos,false,false,idleInput());draw();
  const model=game.enemies.get(orb.id),heart=model.getObjectByName('rift-heart'),box=new THREE.Box3().setFromObject(heart,true),radius=(box.max.x-box.min.x)/2;
  const scaled=enemyEmergenceScale(orb);orb.age=2.1;const halfway=enemyEmergenceScale(orb);orb.age=0;const start=enemyEmergenceScale(orb);orb.age=12;
  const legacyWorld=new World(72,{schedule:false,legacyBalance:true}),legacy=legacyWorld.spawn('orb',{x:0,y:5,z:0},false);legacy.age=12;
  const corona=!!model.getObjectByName('orb-corona');
  const targetRadius=orb.radius;
  const top=new THREE.Vector3(0,orb.pos.y+ORB_RADIUS,0).project(game.camera),bottom=new THREE.Vector3(0,orb.pos.y-ORB_RADIUS,0).project(game.camera);
  // Fire across the newly added outer body, beyond the former 2.4-unit radius.
  const hp=orb.hp;world.projectiles.push({id:999,age:0,pos:{x:5,y:orb.pos.y,z:10},vel:{x:0,y:0,z:-120},life:2,homing:false,energy:1,level:1});world.step(idleInput(),.1);
  const outerHit=orb.hp<hp;orb.age=12;world.time=120;draw();window.orbSpectacle={game,world,draw};
  return {radius,targetRadius,height:orb.pos.y,scaled,halfway,start,legacyRadius:legacy.radius,legacyHeight:legacy.pos.y,legacyScale:enemyEmergenceScale(legacy),corona,screenHeight:(top.y-bottom.y)/2,outerHit};
 });
 assert.ok(Math.abs(result.radius-9.6)<.03);assert.equal(result.targetRadius,9.6);assert.equal(result.height,11.8);assert.equal(result.scaled,4);assert.equal(result.halfway,2);assert.equal(result.start,0);assert.equal(result.legacyRadius,2.4);assert.equal(result.legacyHeight,5);assert.equal(result.legacyScale,1);assert.ok(result.corona&&result.outerHit);assert.ok(result.screenHeight>.45,'boss dominates a player-height view');
 for(const quality of ['high','low']){await page.evaluate(quality=>{const {game,draw}=window.orbSpectacle;game.configure({quality,fov:75,mist:true,skyMotion:'reduced',movementMotion:0,screenShake:0});draw();},quality);await page.screenshot({path:`${dir}/${quality}.png`});}
 assert.deepEqual(errors,[]);await writeFile(dir+'/report.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
}finally{await browser.close();}
