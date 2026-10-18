import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='artifacts/blood-size';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75});await renderer.prepare();
  window.bloodSizeFixture={renderer,World,v};
 });
 const reports=[];
 for(const kind of ['skull','skull4','orb']){
  const report=await page.evaluate(kind=>{
   const {renderer,World,v}=bloodSizeFixture;renderer.clear();
   const world=new World(42,{schedule:false,invulnerable:true});world.time=480;world.player.pos=v(0,7,14);
   const enemy=world.spawn(kind,v(0,6,0));world.damageEnemy(enemy,enemy.hp);
   for(const effect of world.effects){effect.direction=v(.3,.1,-1);renderer.effect(effect,world,0,0);}
   world.effects=[];world.enemies=[];world.gems=[];renderer.originalWeapon.clear();world.time+=.15;renderer.render(world,0,-.08,0,false);
   const maximumAxis=(mesh,axis)=>{let maximum=0;const a=mesh.instanceMatrix.array;for(let i=0;i<mesh.count;i++){const k=i*16+axis*4;maximum=Math.max(maximum,Math.hypot(a[k],a[k+1],a[k+2]));}return maximum;};
   return {radius:enemy.radius,scale:renderer.blood.field.drops.find(drop=>drop.enemyBurst).sprayScale,maxDropletWidth:maximumAxis(renderer.blood.droplets,0),maxLigamentLength:maximumAxis(renderer.blood.spray,1),...renderer.blood.diagnostics};
  },kind);
  assert.equal(report.dropletDrawCalls,1);assert.equal(report.sprayDrawCalls,1);
  if(reports.length){const previous=reports.at(-1);assert.ok(report.maxDropletWidth>previous.maxDropletWidth*1.8,'larger enemy has substantially larger droplets');assert.ok(report.maxLigamentLength>previous.maxLigamentLength*1.8,'larger enemy has substantially larger spray ligaments');}
  await page.screenshot({path:`${directory}/${kind}.png`});reports.push({kind,...report});
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/audit.json`,JSON.stringify({reports,errors},null,2)+'\n');console.log(JSON.stringify({reports,errors}));
}finally{await browser.close();}
