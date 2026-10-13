import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('artifacts/pede-fixes',{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.abyss?.originalEnemies);
 await page.evaluate(async()=>{
  const {World,v,idleInput,STEP}=await import('/src/simulation.ts');const {GameRenderer}=await import('/src/renderer.ts');
  const {pedeContactCenter}=await import('/src/pede-contact.ts');const THREE=await import('/node_modules/three/build/three.module.js');
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:9999;width:100%;height:100%';document.body.append(canvas);
  const r=new GameRenderer(canvas,{quality:'low',fov:85});await r.prepare();
  const w=new World(32,{schedule:false,invulnerable:true});w.player.pos=v(-15,1.7,-15);
  const snakes=[w.spawnAt('gigapede',0,.4),w.spawnAt('gigapede',Math.PI,.4)];
  window.pedeTest={w,r,snakes,v,idleInput,STEP,pedeContactCenter,THREE};
 });
 const report=[];
 for(const age of [3.7,8,15]){
  const result=await page.evaluate(age=>{
   const {w,r,snakes,v,idleInput,STEP,pedeContactCenter,THREE}=window.pedeTest;
   while(snakes[0].age<age){w.step(idleInput());for(const f of w.effects)r.effect(f,w,0,0);w.effects=[];}
   const camera=v(24,15,26),target=v(0,3,0);
   r.render(w,Math.atan2(camera.x-target.x,camera.z-target.z),Math.atan2(target.y-camera.y,Math.hypot(target.x-camera.x,target.z-camera.z)),STEP,false,1,camera);
   let maxCenterError=0,maxDirectionError=0;
   for(const e of snakes){
    const model=r.enemies.get(e.id),nodes=r.segmentNodes.get(model);model.updateMatrixWorld(true);
    for(let i=0;i<nodes.length;i++){
     const {node}=nodes[i],s=e.segments[i],lead=i===0?e.pos:e.segments[i-1].pos;
     const forward=v(lead.x-s.pos.x,lead.y-s.pos.y,lead.z-s.pos.z),length=Math.hypot(forward.x,forward.y,forward.z);
     const center=pedeContactCenter(s.pos,forward,e.size),visual=node.localToWorld(new THREE.Vector3(0,.43*e.size,0));
     maxCenterError=Math.max(maxCenterError,Math.hypot(center.x-visual.x,center.y-visual.y,center.z-visual.z));
     const m=node.matrixWorld.elements,scale=Math.hypot(m[8],m[9],m[10]);
     maxDirectionError=Math.max(maxDirectionError,Math.hypot(m[8]/scale-forward.x/length,m[9]/scale-forward.y/length,m[10]/scale-forward.z/length));
    }
   }
   return {age:snakes[0].age,maxCenterError,maxDirectionError,snakes:snakes.map(e=>({head:{...e.pos},above:e.segments.filter(s=>s.pos.y>0).length,below:e.segments.filter(s=>s.pos.y<0).length}))};
  },age);
  assert.ok(result.maxCenterError<1e-6,'contact offset follows actual model rotation');assert.ok(result.maxDirectionError<1e-6);
  report.push(result);await page.screenshot({path:`artifacts/pede-fixes/double-gigapede-${age}.png`});
 }
 assert.ok(report[0].snakes.every(e=>e.above>0&&e.below>0),'tail emerges separately');assert.ok(report[2].snakes.every(e=>e.below===0));
 assert.deepEqual(errors,[]);writeFileSync('artifacts/pede-fixes/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
