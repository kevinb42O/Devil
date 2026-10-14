import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 const rows=await page.evaluate(async()=>{
  const [{GameRenderer},{World}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const r=new GameRenderer(document.body.appendChild(document.createElement('canvas')),{quality:'low',fov:90});await r.prepare();
  const w=new World(17,{schedule:false,invulnerable:true}),rows=[];
  for(const entrance of [true,false])for(const time of entrance?[0]:[0,39,114,229,350,442]){
   w.time=time;const settings={quality:'low',fov:90};
   r.configure({...settings,mist:true});r.render(w,0,0,0,false,1,null,false,entrance);const onCalls=r.renderer.info.render.calls;
   r.configure({...settings,mist:false});r.render(w,0,0,0,false,1,null,false,entrance);const off={...r.openingMist.diagnostics},offCalls=r.renderer.info.render.calls;
   // Changing another setting cannot turn mist back on while the opt-out remains set.
   r.configure({...settings,skyMotion:'reduced',mist:false});r.render(w,0,0,0,false,1,null,false,entrance);const stillOff=r.openingMist.diagnostics.enabled;
   r.configure({...settings,mist:true});r.render(w,0,0,0,false,1,null,false,entrance);const restored=r.openingMist.diagnostics.enabled;
   rows.push({entrance,time,onCalls,offCalls,off,stillOff,restored});
  }
  return rows;
 });
 for(const row of rows){assert.equal(row.off.enabled,false);assert.equal(row.off.lights,0);assert.equal(row.stillOff,false);assert.equal(row.restored,true);assert.equal(row.onCalls-row.offCalls,2,'off skips both fog draws');}
 assert.deepEqual(errors,[]);console.log('Mist toggle passed: entrance and every phase, immediate disable/restore, and no fog rendering while off.');
}finally{await browser.close();}
