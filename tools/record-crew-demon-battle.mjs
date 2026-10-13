import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory=process.argv[2]||'/tmp/crew-demon-battle-frames',fps=30,frames=300;
await mkdir(directory,{recursive:true});await mkdir('artifacts/crew-demon',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/crew-battle-recording',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body style="margin:0;background:black"><canvas></canvas><div id="caption" style="position:fixed;left:24px;top:22px;color:#ece6d8;font:18px system-ui;text-shadow:0 2px 4px black"></div><div style="position:fixed;left:24px;bottom:20px;color:#b8b5aa;font:13px system-ui">SCRIPTED MULTIPLAYER TEST · Guest snapshot view · 120 Hz simulation / 30 FPS recording</div>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/crew-battle-recording');
 await page.evaluate(async()=>{
  const [{World,v,idleInput,STEP},{GameRenderer},{FriendsSession,applySnapshot},{encodeState,decodeState},{SnapshotTimeline}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/multiplayer.ts'),import('/src/network-state.ts'),import('/src/network-presentation.ts')]);
  const session=new FriendsSession('host');session.start();session.startAt=0;session.world=new World(24,{schedule:false,invulnerable:true});session.world.addCrew('host');
  const w=session.world;w.addCrew('friend');w.selectCrew('host');w.crew[0].player.pos=v(0,1.7,7.5);w.crew[1].player.pos=v(-2,1.7,2);w.crew[1].level=2;
  const guest=new World(1,{schedule:false}),timeline=new SnapshotTimeline();
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75});await renderer.prepare();renderer.setCrewNames([{id:'friend',name:'Your friend'}]);
  const samples=[];let death=null,spawned=0,frameId=0;
  window.recordBattle=frame=>{
   for(let step=0;step<4;step++){
    if(death&&w.time>death.time+.25)w.enemies=[];
    const t=w.time,p=w.crew[1],fire=t>1&&t<6.7&&!(t>3.5&&t<4.1),input={...idleInput(),strafe:t<1?0:Math.cos((t-1)*1.3)*.3,yaw:Math.sin(t*.8)*.18,pitch:t>4.1&&t<5.3?.35:0,fire,jump:t>2.8&&t<2.84};
    if(t>1.2+spawned*.9&&spawned<6){const e=w.spawn('skull',v((spawned%3-1)*2.5,2.1,-10-spawned));e.age=12;spawned++;}
    if(t>=6.8&&p.alive){w.enemies=[];w.options.invulnerable=false;const e=w.spawn('skull',{...p.player.pos});e.age=12;}
    w.stepCrew(new Map([['host',idleInput()],['friend',input]]),STEP);w.selectCrew('host');
    if(!p.alive&&death===null)death={time:w.time,position:{...p.player.pos},cause:p.cause};
   }
   const snapshot=decodeState(encodeState(session.snapshot(),++frameId,0),new Map()).snapshot;
   applySnapshot(guest,snapshot,'host');timeline.push(snapshot,w.time*1000);const view=timeline.view(guest,'host',w.time*1000,v());
   for(const effect of w.effects)renderer.effect(effect,view,0,-.08);w.effects=[];
   renderer.render(view,0,-.08,1/30,false,1,null,true);
   document.querySelector('#caption').textContent=death?'Friend killed by skull — body removed, blood burst and fragments':w.time<1?'Demon teammate — idle':w.time<2.8?'Strafing and firing':w.time<3.5?'Jumping while firing':w.time<4.1?'Release fire — arm returns to rest':w.time<5.4?'Aiming upward while firing':'Battle — skulls closing in';
   if(frame%15===0||Math.abs(w.time-6.8)<.04)samples.push({frame,time:w.time,alive:w.crew[1].alive,pitch:guest.crew[1].input.pitch,fire:guest.crew[1].input.fire,modelVisible:renderer.crewPresentation.some(m=>m.id==='friend'),bursts:renderer.crewDeathPresentation,blood:renderer.blood.diagnostics,drawCalls:renderer.renderer.info.render.calls});
   return {death};
  };
  window.battleRenderer=renderer;
  window.battleReport=()=>({death,samples,shots:w.stats.shots,kills:w.stats.kills,friendAlive:w.crew[1].alive,hostAlive:w.crew[0].alive,crew:renderer.crewPresentation,bursts:renderer.crewDeathPresentation});
  window.closeBattle=()=>session.close();
 });
 for(let frame=0;frame<frames;frame++){
  await page.evaluate(frame=>window.recordBattle(frame),frame);if(!process.env.AUDIT_ONLY)await page.screenshot({path:`${directory}/${String(frame).padStart(4,'0')}.png`});
  if(process.env.AUDIT_ONLY&&frame===215){

   await page.screenshot({path:'artifacts/crew-demon/gore-all.png'});
   await page.evaluate(()=>{const r=window.battleRenderer;r.scene.getObjectByName('blood-droplets').visible=false;r.composer.render();r.originalWeapon.render(r.renderer,false);});
   await page.screenshot({path:'artifacts/crew-demon/gore-without-droplets.png'});
   await page.evaluate(()=>{const r=window.battleRenderer;for(const mesh of r.scene.children)if(mesh.name.startsWith('death-analysis-gore')||mesh.name==='death-analysis-blood-explosion')mesh.visible=false;r.composer.render();r.originalWeapon.render(r.renderer,false);});
   await page.screenshot({path:'artifacts/crew-demon/gore-cloud-only.png'});
   await page.evaluate(()=>window.battleRenderer.scene.getObjectByName('blood-droplets').visible=true);
  }
  if(frame%60===0)console.log(`Recorded ${frame}/${frames}`);
 }
 const report=await page.evaluate(()=>window.battleReport());assert.ok(report.death);assert.ok(report.shots>0);assert.equal(report.friendAlive,false);assert.equal(report.hostAlive,true);assert.equal(report.crew.length,0);assert.ok(report.samples.some(s=>s.bursts.length===1));assert.ok(report.samples.some(s=>s.pitch>.3&&s.fire));assert.ok(report.samples.every(s=>s.alive||!s.modelVisible));assert.deepEqual(errors,[]);
 await writeFile('artifacts/crew-demon/battle-report.json',JSON.stringify({fps,frames,report,errors},null,2));await page.evaluate(()=>window.closeBattle());console.log(JSON.stringify({fps,frames,death:report.death,shots:report.shots,kills:report.kills,errors}));
}finally{await browser.close();}
