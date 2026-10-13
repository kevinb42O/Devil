import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 const report=await page.evaluate(async()=>{
  const [{World,v},{DeathHistory},{GameRenderer},{ENEMY_KINDS,isPede}]=await Promise.all([import('/src/simulation.ts'),import('/src/death-analysis.ts'),import('/src/renderer.ts'),import('/src/enemy-kinds.ts')]);
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:9999;width:100%;height:100%';document.body.append(canvas);const renderer=new GameRenderer(canvas,{quality:'low',fov:90});await renderer.prepare();
  const rows=[];
  for(const kind of ENEMY_KINDS){
   renderer.clear();const w=new World(1,{schedule:false}),h=new DeathHistory(),e=w.spawn(kind,v(0,kind==='leviathan'?15:kind==='squid3'?7:kind==='squid2'?5.2:3,0));e.age=12;e.vel=v(0,0,2);e.pos.x=0;e.pos.z=0;w.player.pos=v(0,1.7,6);e.status='hunting';
   if(isPede(kind)){e.pos.y=3;for(let n=0;n<e.segments.length;n++)e.segments[n].pos=v(Math.sin(n*.25)*6,2.5,-n*1.1);}
   h.capture(w,0,0,true);w.time=1/30;w.tick=4;w.die('contact',e,isPede(kind)?0:-1);h.capture(w,0,0);const a=h.clip(w.deathSource);a.sample(a.duration);renderer.setDeathGhost(a.view.player.pos,a.victimYaw);renderer.render(a.view,a.camera.yaw,a.camera.pitch,0,false,1,a.camera.position);const marker=renderer.projectDeathMarker(a.killerPosition,true);
   const victim=renderer.deathProjection.clone().set(w.player.pos.x,w.player.pos.y,w.player.pos.z).project(renderer.camera);
   rows.push({kind,killerInFrame:marker.visible,victimInFrame:Math.abs(victim.x)<1&&Math.abs(victim.y)<1&&victim.z<1,finite:renderer.camera.position.toArray().every(Number.isFinite),calls:renderer.renderer.info.render.calls});
   if(kind==='squid3'||kind==='gigapede'){window.cameraFixture={renderer,kind};await new Promise(resolve=>requestAnimationFrame(resolve));}
  }return rows;
 });
 for(const row of report){assert.ok(row.killerInFrame,row.kind+' killer is framed');assert.ok(row.victimInFrame,row.kind+' victim is framed');assert.ok(row.finite);}
 assert.deepEqual(errors,[]);console.log('All 22 killer camera families passed:',JSON.stringify(report));
}finally{await browser.close();}
