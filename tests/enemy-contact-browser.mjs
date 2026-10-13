import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.abyss?.originalEnemies&&window.abyss.originalAssets);
 const report=await page.evaluate(async()=>{
  const {World,v,idleInput,STEP}=await import('/src/simulation.ts');
  const {GameRenderer}=await import('/src/renderer.ts');
  const {enemyYaw}=await import('/src/enemy-presentation.ts');
  const deaths=[];
  for(const kind of ['centipede','gigapede','egg','egg2','spiderling']){
   const w=new World(1,{schedule:false});w.player.pos=v(0,1.7,0);
   if(kind==='centipede'||kind==='gigapede'){const e=w.spawn(kind,v(0,3,0));e.age=4;e.status='hunting';e.pos=v(0,2.2,0);e.statusUntil=20;e.nextMove=6;}else w.spawn(kind,v(0,.55,0)).age=2;
   for(let i=0;i<1200&&w.state==='playing';i++)w.step(idleInput());
   deaths.push({kind,state:w.state,cause:w.cause});
  }
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:9999;width:100%;height:100%';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'low',fov:90});await renderer.prepare();
  const rigs=[];
  for(const kind of ['centipede','gigapede','ghostpede']){
   const w=new World(3,{schedule:false,invulnerable:true}),e=w.spawn(kind,v(6,3,-12));e.age=3;
   for(let i=0;i<240;i++)w.step(idleInput());
   renderer.render(w,0,0,STEP,false,1,v(0,8,15));
   const model=renderer.enemies.get(e.id),nodes=renderer.segmentNodes.get(model);
   rigs.push({kind,headYaw:model.children[0].rotation.y,expectedYaw:enemyYaw(e,w.player.pos),segments:nodes.length,expectedSegments:e.segments.length,finite:nodes.every(({node})=>[...node.position.toArray(),node.rotation.x,node.rotation.y].every(Number.isFinite))});
  }
  return {deaths,rigs};
 });
 for(const result of report.deaths)assert.equal(result.state,'dead',result.kind+' must damage standing players');
 for(const rig of report.rigs){assert.equal(rig.headYaw,rig.expectedYaw,rig.kind+' head faces movement');assert.equal(rig.segments,rig.expectedSegments);assert.equal(rig.finite,true);}
 assert.deepEqual(errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
