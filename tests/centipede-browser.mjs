import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('artifacts/centipede',{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.abyss?.originalEnemies);
 await page.evaluate(async()=>{
  const {World,v,idleInput,STEP}=await import('/src/simulation.ts');const {GameRenderer}=await import('/src/renderer.ts');
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:9999;width:100%;height:100%';document.body.append(canvas);
  const r=new GameRenderer(canvas,{quality:'low',fov:90});await r.prepare();
  const w=new World(32,{schedule:false,invulnerable:true});w.player.pos=v(-15,1.7,-15);const e=w.spawn('centipede',v(0,3,-12));
  window.centiTest={w,e,r,v,idleInput,STEP};
 });
 const report=[];
 for(const phase of ['emergence','flight','dive','underground','reemergence']){
  const state=await page.evaluate(phase=>{
   const {w,e,r,v,idleInput,STEP}=window.centiTest;
   const ready=()=>phase==='emergence'?e.age>=3.7:phase==='flight'?e.age>=8:phase==='dive'?e.centipedeMotion?.stage==='diving'&&e.pos.y<-1&&e.segments.some(s=>s.pos.y>0):phase==='underground'?e.centipedeMotion?.stage==='underground':e.centipedeMotion?.stage==='rising'&&e.age>20&&e.pos.y>1;
   if(phase==='dive')e.statusUntil=e.age;
   for(let i=0;i<120*60&&!ready();i++){w.effects=[];w.step(idleInput());for(const f of w.effects)r.effect(f,w,0,0);}
   if(!ready())throw Error('Did not reach '+phase);
   const camera=v(e.pos.x+15,9,e.pos.z+20),target=v(e.pos.x,3,e.pos.z);
   const yaw=Math.atan2(camera.x-target.x,camera.z-target.z),pitch=Math.atan2(target.y-camera.y,Math.hypot(target.x-camera.x,target.z-camera.z));
   r.render(w,yaw,pitch,STEP,false,1,camera);
   const model=r.enemies.get(e.id),nodes=r.segmentNodes.get(model);
   model.updateMatrixWorld(true);
   let maxDirectionError=0;
   for(let i=0;i<nodes.length;i++){
    const lead=i===0?e.pos:e.segments[i-1].pos,s=e.segments[i].pos,dx=lead.x-s.x,dy=lead.y-s.y,dz=lead.z-s.z,length=Math.hypot(dx,dy,dz);
    if(length<.001)continue;
    // Third matrix column is the segment's forward axis after yaw and pitch.
    const matrix=nodes[i].node.matrixWorld.elements,scale=Math.hypot(matrix[8],matrix[9],matrix[10]);
    maxDirectionError=Math.max(maxDirectionError,Math.hypot(matrix[8]/scale-dx/length,matrix[9]/scale-dy/length,matrix[10]/scale-dz/length));
   }
   return {phase,age:e.age,stage:e.centipedeMotion.stage,head:{...e.pos},above:e.segments.filter(s=>s.pos.y>0).length,below:e.segments.filter(s=>s.pos.y<0).length,active:w.active(e),maxDirectionError,finite:nodes.every(({node})=>[...node.position.toArray(),...node.rotation.toArray().slice(0,3)].every(Number.isFinite))};
  },phase);
  assert.equal(state.finite,true);assert.ok(state.maxDirectionError<1e-6,phase+' segment forward axes match the trail');report.push(state);await page.screenshot({path:`artifacts/centipede/${phase}.png`});
 }
 assert.ok(report[0].above>0&&report[0].below>0);assert.ok(report[2].above>0&&report[2].head.y<0);assert.equal(report[3].active,false);assert.notEqual(report[4].head.x,report[0].head.x);assert.deepEqual(errors,[]);
 writeFileSync('artifacts/centipede/browser-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
