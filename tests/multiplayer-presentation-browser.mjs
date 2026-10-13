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
 await page.evaluate(()=>window.presentation.renderer.clear());assert.deepEqual(await page.evaluate(()=>window.presentation.renderer.crewPresentation),[]);assert.deepEqual(errors,[]);
 console.log('Multiplayer presentation passed: named teammates, near/distant remote firing without local recoil, local recoil, death and cleanup.');
}finally{await browser.close();}
