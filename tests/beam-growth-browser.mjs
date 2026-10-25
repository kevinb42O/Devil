import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(url+'/beam-test',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));await page.goto(url+'/beam-test');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,STEP},{projectileVisualIndex},T]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/projectile-presentation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:95,movementMotion:0,screenShake:0});await renderer.prepare();
  window.beam={renderer,World,idleInput,STEP,projectileVisualIndex,T};
 });
 await mkdir('artifacts/beam-growth',{recursive:true});const report=[];
 for(const level of [4,5,6,7]){
  const result=await page.evaluate(level=>{
   const {renderer:r,World,idleInput,STEP,projectileVisualIndex}=window.beam;
   r.clear();const w=new World(71,{schedule:false});w.level=level;w.player.pos={x:0,y:20,z:0};let checks=0;
   const check=(ok,label)=>{if(!ok)throw Error(label);};
   for(let tick=0;tick<24;tick++){
    if(tick%6===0){w.shoot(idleInput(),false,false);for(const e of w.effects)r.effect(e,w,0,0);w.effects=[];}
    r.render(w,0,0,STEP,false,1,null,false,false,idleInput());
    const mesh=r.originalWeapon.daggers[projectileVisualIndex(w.projectiles[0])],matrix=mesh.instanceMatrix.array,glow=r.projectileLighting.glow.geometry.attributes,trail=r.projectileLighting.trail.geometry.attributes;
    for(let i=0;i<w.projectiles.length;i++){
     const p=w.projectiles[i],expected=1,size=Math.hypot(matrix[i*16],matrix[i*16+1],matrix[i*16+2]);
     check(Math.abs(size-expected)<1e-6,'Beam dagger changed size during flight');
     check(!glow.shotScale&&!trail.shotScale,'Growth buffer still active');
     const view=r.originalWeapon.projectileView(p,{...p.pos});
     check(Math.hypot(matrix[i*16+12]-view.x,matrix[i*16+13]-view.y,matrix[i*16+14]-view.z)<1e-5,'Mesh detached from its assigned emitter');checks++;
    }
    if(tick<23){w.updateProjectiles(STEP);w.time+=STEP;}
   }
   return {level,checks,count:w.projectiles.length,diagnostics:r.originalWeapon.projectileDiagnostics};
  },level);
  report.push(result);await page.locator('canvas').screenshot({path:`artifacts/beam-growth/hand-${level}.png`});
 }
 assert.deepEqual(errors,[]);await writeFile('artifacts/beam-growth/audit.json',JSON.stringify({report,errors},null,2)+'\n');console.log('Constant beam size rendering passed',JSON.stringify(report));
}finally{await browser.close();}
