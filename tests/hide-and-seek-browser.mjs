import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const browser=await chromium.launch({headless:true,...executablePath?{executablePath}:{},args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
await mkdir('artifacts/hide-and-seek',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/models/'))missing.push(r.url());});
 await page.route('**/hide-and-seek-rig',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:#090b11}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>'}));
 await page.goto(base+'/hide-and-seek-rig');
 const setup=await page.evaluate(async()=>{
  const {GameRenderer}=await import('/src/renderer.ts'),{World,idleInput}=await import('/src/simulation.ts'),{createCourtyard}=await import('/src/courtyard-state.ts');
  const layout=await import('/src/courtyard-hide-and-seek.ts');
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,movementMotion:0,screenShake:0,mist:false});
  await Promise.all([renderer.courtyard.ready,renderer.crewAvatarReady,renderer.originalEnemies.loaded,renderer.originalWeapon.loaded]);
  const world=new World(1,{schedule:false});world.courtyard=createCourtyard(1);world.addCrew('host');world.addCrew('guest');world.selectCrew('host');
  renderer.setCrewNames([{id:'host',name:'Seeker'},{id:'guest',name:'Hidden friend'}]);
  world.crew[1].player.pos={x:-75,y:1.7,z:-16.6};
  window.rig={renderer,world,idleInput,layout};
  window.view=(x,z,yaw,pitch=0,y=1.7)=>{world.player.pos={x,y,z};world.player.vel={x:0,y:0,z:0};renderer.resetFeedback();for(let i=0;i<3;i++)renderer.render(world,yaw,pitch,1/60,false,1,null,true,true,idleInput());};
  window.view(-20,2,Math.PI/2);
  return renderer.courtyard.diagnostics;
 });
 assert.equal(setup.hideAndSeek.loaded,true);assert.equal(setup.hideAndSeek.spots,30);
 const views=[['entrance',0,3,Math.PI/2,.1],['arrival',-20,4.9,Math.PI/2,.08],['crypts',-58,-11,Math.PI/2,.02],['stores',-38,-12,0,.03],['watchers',-58,8,Math.PI/2,.03],['shrine',-60,16,Math.PI,-.02],['crooked-way',-36,15,Math.PI,.02]];
 const stats=[];
 for(const [name,x,z,yaw,pitch]of views){await page.evaluate(([x,z,yaw,pitch])=>window.view(x,z,yaw,pitch),[x,z,yaw,pitch]);await page.screenshot({path:`artifacts/hide-and-seek/${name}.png`});stats.push(await page.evaluate(name=>({name,calls:window.rig.renderer.renderer.info.render.calls,triangles:window.rig.renderer.renderer.info.render.triangles}),name));}
 const labels=await page.evaluate(()=>{
  const {renderer:r,world:w}=window.rig;
  window.view(-73,-14,0);const hidden=r.crewPresentation.find(p=>p.id==='guest');w.crew[1].player.pos={x:3,y:1.7,z:8};window.view(0,8,0);const outside=r.crewPresentation.find(p=>p.id==='guest');return {hidden:hidden.label,outside:outside.label};
 });
 assert.equal(labels.hidden,false);assert.equal(labels.outside,true);
 // Same avatar and exact viewpoint, with/without the hider: opaque cover must erase every pixel.
 const concealment=await page.evaluate(async()=>{
  const {renderer:r,world:w,layout}=window.rig;const results=[];
  const difference=()=>{
   const scene=r.courtyard.scene,guest=r.crewModels.get('guest'),gl=r.renderer.getContext();
   const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,a=new Uint8Array(width*height*4),b=new Uint8Array(a.length);
   r.renderer.setRenderTarget(null);r.renderer.render(scene,r.camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,a);
   if(!guest)throw Error('Missing guest avatar');guest.visible=false;r.renderer.render(scene,r.camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,b);guest.visible=true;
   let changed=0;for(let j=0;j<a.length;j+=4)if(a[j]!==b[j]||a[j+1]!==b[j+1]||a[j+2]!==b[j+2])changed++;return changed;
  };
  for(const s of layout.HIDE_SPOTS){
   const yaw=Math.atan2(s.concealedFrom.x-s.x,s.concealedFrom.z-s.z);
   w.crew[1].player.pos={x:s.x,y:1.7,z:s.z};window.view(s.concealedFrom.x,s.concealedFrom.z,yaw);
   const changed=difference();
   const inspectYaw=Math.atan2(s.inspectFrom.x-s.x,s.inspectFrom.z-s.z);window.view(s.inspectFrom.x,s.inspectFrom.z,inspectYaw);const revealed=difference();
   results.push({id:s.id,changed,revealed});
  }return results;
 });
 assert.ok(concealment.every(s=>s.changed===0),JSON.stringify(concealment.filter(s=>s.changed)));
 assert.ok(concealment.every(s=>s.revealed>25),'A seeker rounding the corner must actually see each hider: '+JSON.stringify(concealment.filter(s=>s.revealed<=25)));
 const edgeChecks=await page.evaluate(()=>{
  const {renderer:r,world:w,layout,idleInput}=window.rig,checks=[];
  r.setCrewNames([{id:'host',name:'Seeker'},{id:'guest',name:'Bright gold',skin:'ascendant',skinRank:1}]);
  r.baseFov=r.camera.fov=145;r.camera.updateProjectionMatrix();
  for(const s of layout.HIDE_ZONES.map(zone=>layout.HIDE_SPOTS.find(spot=>spot.zone===zone.id))){
   w.crew[1].player.pos={x:s.x,y:3.26,z:s.z};w.crew[1].input={...idleInput(),leftArm:true,rightArm:true};
   w.tick+=120;
   const yaw=Math.atan2(s.concealedFrom.x-s.x,s.concealedFrom.z-s.z);window.view(s.concealedFrom.x,s.concealedFrom.z,yaw,0,3.26);
   const scene=r.courtyard.scene,guest=r.crewModels.get('guest'),gl=r.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,a=new Uint8Array(width*height*4),b=new Uint8Array(a.length);
   r.renderer.setRenderTarget(null);r.renderer.render(scene,r.camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,a);guest.visible=false;r.renderer.render(scene,r.camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,b);guest.visible=true;
   let changed=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;checks.push({id:s.id,changed,raised:guest.userData.emotes});
  }
  // Walking into a pocket while looking steeply down cannot lean through its back wall.
  w.player.pos={x:-64,y:1.7,z:-18-.325-.22};r.resetFeedback();for(let i=0;i<90;i++)r.render(w,Math.PI,-1.3,1/60,false,1,null,true,true,idleInput());
  const cameraClear=r.camera.position.z<=-18-.325-.06+.0001;return {checks,cameraClear};
 });
 assert.ok(edgeChecks.checks.every(c=>c.changed===0&&c.raised.left>.99&&c.raised.right>.99),JSON.stringify(edgeChecks));assert.ok(edgeChecks.cameraClear);
 const sixPlayer=await page.evaluate(()=>{
  const {renderer:r,world:w,layout}=window.rig;for(let i=2;i<6;i++)w.addCrew('friend-'+i);
  w.crew.forEach((p,i)=>{if(i===0)return;const spot=layout.HIDE_SPOTS[i*4];p.player.pos={x:spot.x,y:1.7,z:spot.z};});
  r.baseFov=r.camera.fov=50;r.camera.updateProjectionMatrix();
  // Cutaway is a review image only: the game's roof stays solid and visible.
  const roof=r.courtyard.scene.getObjectByName('repository-vault'),ribs=r.courtyard.scene.getObjectByName('repository-roof-ribs');roof.visible=ribs.visible=false;
  window.view(-50,42,0,-.876,48);
  r.emoteHands.visible=false;r.renderer.setRenderTarget(null);r.renderer.render(r.courtyard.scene,r.camera);
  return {players:w.crew.length,calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles};
 });
 await page.screenshot({path:'artifacts/hide-and-seek/layout-cutaway.png'});
 await page.evaluate(()=>{const r=window.rig.renderer;r.courtyard.scene.getObjectByName('repository-vault').visible=true;r.courtyard.scene.getObjectByName('repository-roof-ribs').visible=true;});
 assert.equal(sixPlayer.players,6);
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const report={setup,labels,stats,concealment,edgeChecks,sixPlayer};await writeFile('artifacts/hide-and-seek/browser-results.json',JSON.stringify(report,null,2)+'\n');
 console.log('Passed: 30 concealed avatars, 30 visible inspection routes, bright gold/jump/FOV/raised-arm checks, camera clearance, name restoration and seven screenshots.');
}finally{await browser.close();}
