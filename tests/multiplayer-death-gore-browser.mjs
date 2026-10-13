import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/crew-gore-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/crew-gore-test');
 const report=await page.evaluate(async()=>{
  const [{World,v,idleInput},{GameRenderer},{FriendsSession,applySnapshot}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/multiplayer.ts')]);
  const session=new FriendsSession('host');session.start();session.startAt=0;
  const w=session.world;w.enemies=[];w.addCrew('alice');w.addCrew('bob');w.selectCrew('host');
  w.crew[0].player.pos=v(0,1.7,8);w.crew[1].player.pos=v(-1.5,1.7,1);w.crew[2].player.pos=v(1.5,1.7,1);
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const r=new GameRenderer(canvas,{quality:'high',fov:90});await r.prepare();
  const guestCanvas=document.createElement('canvas');guestCanvas.style.display='none';document.body.append(guestCanvas);
  const guestRenderer=new GameRenderer(guestCanvas,{quality:'low',fov:90});await guestRenderer.prepare();
  const guest=new World(1,{schedule:false});
  const snapshot=()=>JSON.parse(JSON.stringify(session.snapshot()));
  applySnapshot(guest,snapshot(),'bob');r.render(w,0,0,1/60,false);guestRenderer.render(guest,0,0,1/60,false);
  const originalCamera=r.camera.position.toArray(),guestCamera=guestRenderer.camera.position.toArray();
  const enemy=w.spawn('skull',{...w.crew[1].player.pos});enemy.age=12;
  session.step(idleInput());w.selectCrew('host');
  const death=w.effects.find(e=>e.kind==='death');if(!death)throw Error('Fixture did not kill Alice');
  // Host receives the event before its next frame; guest receives the snapshot first.
  r.effect(death,w,0,0);r.effect(death,w,0,0);r.render(w,0,0,1/60,false);
  applySnapshot(guest,snapshot(),'bob');guestRenderer.render(guest,0,0,1/60,false);
  guestRenderer.effect(death,guest,0,0);guestRenderer.effect(death,guest,0,0);guestRenderer.render(guest,0,0,1/60,false);
  const first={host:r.crewDeathPresentation,guest:guestRenderer.crewDeathPresentation,hostDrops:r.blood.diagnostics.active,guestDrops:guestRenderer.blood.diagnostics.active,hostCamera:r.camera.position.toArray(),guestCamera:guestRenderer.camera.position.toArray(),state:w.state,hostAlive:w.crew[0].alive};
  const cameraHeld=originalCamera.every((n,i)=>Math.abs(n-r.camera.position.toArray()[i])<.02)&&guestCamera.every((n,i)=>Math.abs(n-guestRenderer.camera.position.toArray()[i])<.02);
  // A second concurrent death still owns its own burst, even if only state arrives.
  w.crew[2].alive=false;w.crew[2].cause='SKULL';r.render(w,0,0,1/60,false);
  const concurrent=r.crewDeathPresentation.map(p=>p.id);
  w.time+=.5;r.render(w,0,0,1/60,false);const grown=r.crewDeathPresentation[0].age>=.49;
  const beforeFinal=w.time;w.crew[0].alive=false;w.crew[0].cause='SKULL';w.state='dead';
  for(let i=0;i<100;i++)r.render(w,0,0,1/60,false);
  const wipe={timeFrozen:w.time===beforeFinal,ages:r.crewDeathPresentation.map(p=>p.age),landings:r.blood.diagnostics.landings,ghost:!!r.scene.getObjectByName('death-analysis-victim')?.visible};
  r.clear();const cleared=r.crewDeathPresentation.length===0&&r.blood.diagnostics.active===0;
  // Dead players in a newly loaded snapshot and disconnects are not fresh kills.
  r.render(w,0,0,1/60,false);const staleSuppressed=r.crewDeathPresentation.length===0;
  w.state='playing';w.crew.forEach(p=>p.alive=true);r.render(w,0,0,1/60,false);
  w.crew[1].alive=false;w.crew[1].cause='DISCONNECTED';r.render(w,0,0,1/60,false);
  const disconnectSuppressed=r.crewDeathPresentation.length===0;
  r.clear();w.crew.forEach(p=>p.alive=true);r.render(w,0,0,1/60,false);
  w.crew[1].alive=false;w.crew[1].cause='SKULL';r.render(w,0,0,1/60,false);w.time+=.25;r.render(w,0,0,1/60,false);
  const restart=r.crewDeathPresentation.length===1;
  session.close();return {first,cameraHeld,concurrent,grown,wipe,cleared,staleSuppressed,disconnectSuppressed,restart};
 });
 for(const role of ['host','guest']){assert.equal(report.first[role].length,1);assert.equal(report.first[role][0].id,'alice');assert.equal(report.first[role][0].visible,true);assert.equal(report.first[role][0].assetsReady,true);}
 assert.equal(report.first.hostDrops,480);assert.equal(report.first.guestDrops,480);assert.equal(report.first.state,'playing');assert.equal(report.first.hostAlive,true);
 assert.deepEqual(report.concurrent,['alice','bob']);
 for(const key of ['cameraHeld','grown','cleared','staleSuppressed','disconnectSuppressed','restart'])assert.equal(report[key],true,key);
 assert.equal(report.wipe.timeFrozen,true);assert.ok(report.wipe.ages.every(a=>a>1.5));assert.ok(report.wipe.landings>100);assert.equal(report.wipe.ghost,false);
 await page.screenshot({path:'artifacts/multiplayer-death-gore.png'});
 assert.deepEqual(errors,[]);console.log('Multiplayer death gore passed:',JSON.stringify(report));
}finally{await browser.close();}
