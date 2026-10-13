import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 const report=await page.evaluate(async()=>{
  const [{World,v},{DeathHistory},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/death-analysis.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:9999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'high',fov:90});await renderer.prepare();
  const w=new World(1,{schedule:false}),history=new DeathHistory(),enemy=w.spawn('skull',v(0,1.7,0));enemy.age=12;w.player.pos=v(0,1.7,1);
  history.capture(w,0,0,true);w.time=1/30;w.tick=4;w.die('contact',enemy);history.capture(w,0,0,true);
  const clip=history.clip(w.deathSource);clip.sample(clip.duration);
  const render=(impact,age)=>{renderer.setDeathGhost(clip.view.player.pos,clip.victimYaw,impact,age,clip.end);renderer.render(clip.view,clip.camera.yaw,clip.camera.pitch,0,false,1,clip.camera.position);};
  render(false,0);const ghost=renderer.scene.getObjectByName('death-analysis-victim');
  const before=ghost.visible;render(true,.22);const burst=renderer.scene.getObjectByName('death-analysis-blood-explosion');
  const first=Array.from(burst.instanceMatrix.array),hidden=!ghost.visible;
  const assetsReady=renderer.deathBurst.diagnostics.assetsReady,variants=renderer.deathBurst.diagnostics.goreVariants;
  const map=burst.material.map;
  const textured=!!map&&burst.geometry.getAttribute('uv').count>0;
  const initialLandings=renderer.blood.diagnostics.landings;
  render(true,.22);const paused=first.every((n,i)=>n===burst.instanceMatrix.array[i])&&initialLandings===renderer.blood.diagnostics.landings;
  render(true,.85);const advanced=first.some((n,i)=>n!==burst.instanceMatrix.array[i]);
  render(true,1.6);const floorLandings=renderer.blood.diagnostics.landings;
  const floorStains=renderer.blood.field.pixels.some((n,i)=>i%4===0&&n>0);
  renderer.clear();const cleared=!burst.visible&&renderer.blood.diagnostics.landings===0;
  render(false,0);render(true,.22);const restarted=first.every((n,i)=>n===burst.instanceMatrix.array[i]);
  window.burstFixture={renderer,clip,render};
  return {before,hidden,visible:burst.visible,count:burst.count,assetsReady,variants,textured,floorLandings,floorStains,paused,advanced,cleared,restarted};
 });
 assert.equal(report.before,true);assert.equal(report.hidden,true);assert.equal(report.visible,true);assert.equal(report.count,16);assert.equal(report.variants,11);assert.equal(report.assetsReady,true);assert.equal(report.textured,true);assert.ok(report.floorLandings>100);assert.equal(report.floorStains,true);
 for(const key of ['paused','advanced','cleared','restarted'])assert.equal(report[key],true,key);
 await page.screenshot({path:'artifacts/player-death-blood-explosion.png'});
 await page.evaluate(()=>window.burstFixture.render(true,1.6));
 await page.screenshot({path:'artifacts/player-death-blood-splatter.png'});
 assert.deepEqual(errors,[]);console.log('Player death blood explosion passed:',JSON.stringify(report));
}finally{await browser.close();}
