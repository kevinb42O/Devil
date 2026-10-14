import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/multiplayer-presentation-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/multiplayer-presentation-test');
 await page.evaluate(async()=>{
  document.body.innerHTML='<canvas id="test-game"></canvas>';document.body.style.margin='0';
  const {GameRenderer}=await import('/src/renderer.ts');const {World,idleInput}=await import('/src/simulation.ts');
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90});await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded,document.fonts.ready]);
  const world=new World(1,{schedule:false});for(const id of ['host','alice','bob'])world.addCrew(id);world.selectCrew('host');
  world.crew[1].player.pos={x:-1.5,y:world.player.pos.y,z:5};world.crew[2].player.pos={x:1.5,y:world.player.pos.y,z:5};
  renderer.setCrewNames([{id:'host',name:'Host'},{id:'alice',name:'Alice'},{id:'bob',name:'Bob'}]);renderer.render(world,0,0,1/60,false,1);
  window.presentation={renderer,world,idleInput};
 });
 const labels=await page.evaluate(()=>window.presentation.renderer.crewPresentation);assert.deepEqual(labels.map(p=>[p.id,p.name,p.label]),[['alice','Alice',true],['bob','Bob',true]]);
 const effects=await page.evaluate(()=>{
  const {renderer,world,idleInput}=window.presentation;
  // Near teammate must not recoil the local hand; distant teammate must emit particles.
  for(const [id,pos]of [['alice',{...world.player.pos}],['bob',{x:12,y:2,z:0}]])renderer.effect({kind:'burst',shooterId:id,pos,direction:{x:0,y:0,z:-1},level:1},world,0,0);
  const remote=renderer.originalWeapon.effectDiagnostics;
  renderer.effect({kind:'burst',shooterId:'host',pos:{...world.player.pos},direction:{x:0,y:0,z:-1},level:1},world,0,0);
  return {remote,local:renderer.originalWeapon.effectDiagnostics};
 });
 assert.equal(effects.remote.recoil,0);assert.equal(effects.remote.flashTime,0);assert.ok(effects.remote.particles>0);assert.ok(effects.local.recoil>0);
 await page.evaluate(()=>{const {renderer,world}=window.presentation;renderer.render(world,0,0,1/60,false,1);});
 await page.screenshot({path:'artifacts/multiplayer-names-and-shots.png'});
 await page.evaluate(()=>{const {renderer,world}=window.presentation;world.crew[1].alive=false;renderer.render(world,0,0,1/60,false,1);});
 assert.deepEqual(await page.evaluate(()=>window.presentation.renderer.crewPresentation.map(p=>p.id)),['bob']);
 const spectatorView=await page.evaluate(async()=>{
  const {renderer,world}=window.presentation;const {SpectatorCamera}=await import('/src/spectator.ts');
  world.crew[0].alive=false;world.crew[2].alive=true;const camera=new SpectatorCamera();camera.start(world.player.pos);
  camera.move(.05,.5,.3,1,1,1);const position={...camera.position},body={...world.player.pos};
  let handHidden=false;const originalRender=renderer.originalWeapon.render.bind(renderer.originalWeapon);
  renderer.originalWeapon.render=(gpu,hidden)=>{handHidden=hidden;originalRender(gpu,hidden);};
  renderer.render(world,.5,.3,1/60,false,1,camera.position);
  const first=renderer.camera.position.toArray();world.crew[2].player.pos.x+=5;
  renderer.render(world,.5,.3,1/60,false,1,camera.position);
  return {first,second:renderer.camera.position.toArray(),expected:[position.x,position.y,position.z],body,afterBody:world.player.pos,handHidden,crew:renderer.crewPresentation.map(p=>p.id)};
 });
 assert.deepEqual(spectatorView.first,spectatorView.expected);assert.deepEqual(spectatorView.second,spectatorView.expected);
 assert.deepEqual(spectatorView.body,spectatorView.afterBody);assert.equal(spectatorView.handHidden,true);assert.deepEqual(spectatorView.crew,['bob']);
 const courtyard=await page.evaluate(async()=>{
  const {renderer,world}=window.presentation;await renderer.entrance.ready;
  world.crew.forEach(p=>p.alive=true);world.selectCrew('host');world.player.pos={x:0,y:1.7,z:0};
  world.crew[1].player.pos={x:-1.5,y:1.7,z:-3};world.crew[2].player.pos={x:1.5,y:1.7,z:-3};
  renderer.render(world,0,0,1/60,false,1,null,true,true);
  return {names:renderer.crewPresentation.map(p=>[p.id,p.name,p.label]),parents:[...renderer.crewModels.values()].every(model=>model.parent===renderer.entrance.scene)};
 });
 assert.deepEqual(courtyard.names,[['bob','Bob',true],['alice','Alice',true]]);assert.equal(courtyard.parents,true);
 await page.screenshot({path:'artifacts/multiplayer-courtyard-teammates.png'});
 await page.evaluate(()=>{const {renderer,world}=window.presentation;renderer.render(world,0,0,1/60,false,1);});
 assert.equal(await page.evaluate(()=>[...window.presentation.renderer.crewModels.values()].every(model=>model.parent===window.presentation.renderer.scene)),true,'teammates move back to the arena scene');
 await page.evaluate(()=>window.presentation.renderer.clear());assert.deepEqual(await page.evaluate(()=>window.presentation.renderer.crewPresentation),[]);assert.deepEqual(errors,[]);
 console.log('Multiplayer presentation passed: named teammates, near/distant remote firing without local recoil, local recoil, death, independent spectator camera with hidden weapon, and cleanup.');
}finally{await browser.close();}
