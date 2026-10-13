import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

// Exercise sustained fire at real cadence, rather than a single muzzle flash.
const label=process.env.WEAPON_CAPTURE_LABEL||'after';
await mkdir('artifacts/weapon-readability',{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 // Keep Vite hot reload from replacing a running screenshot fixture.
 await page.routeWebSocket('**',socket=>socket.close());
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{World,v,idleInput,STEP},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const canvas=document.createElement('canvas');canvas.id='readability-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const renderer=new GameRenderer(canvas,{quality:'high',fov:90});await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded]);
  // Repeatable presentation randomness for comparable before/after captures.
  window.readabilityFixture={renderer,World,v,idleInput,STEP};
 });
 const captures=[];
 for(const level of [3,4])for(const range of [4,12,30]){
  const result=await page.evaluate(({level,range})=>{
   const {renderer,World,v,idleInput,STEP}=window.readabilityFixture;
   renderer.clear();let random=73;const originalRandom=Math.random;Math.random=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
   try{
    const world=new World(91,{schedule:false,invulnerable:true});world.level=level;world.player.pos=v(0,1.7,0);
    const target=world.spawn('skull3',v(0,1.7,-range));target.age=2;target.hp=100000;
    let peakFragments=0;
    for(let frame=0;frame<180;frame++){
     for(let tick=0;tick<2;tick++){world.step({...idleInput(),fire:true},STEP);target.pos=v(0,1.7,-range);}
     for(const e of world.effects)renderer.effect(e,world,0,0);world.effects=[];
     renderer.render(world,0,0,1/60,false);peakFragments=Math.max(peakFragments,renderer.originalWeapon.fragments.length);
    }
    const count=renderer.originalWeapon.projectileDiagnostics.count;
    if(!(target.hp>0))throw Error('Target must survive the fixture');
    window.readabilityWorld=world;
    return {level,range,shots:world.stats.shots,visibleDaggers:count,peakFragments};
   }finally{Math.random=originalRandom;}
  },{level,range});
  assert.ok(result.visibleDaggers>0);assert.ok(result.shots>100);
  await page.locator('#readability-test').screenshot({path:`artifacts/weapon-readability/hand-${level}-${range}m-${label}.png`});captures.push(result);
 }
 assert.deepEqual(errors,[]);
 await writeFile(`artifacts/weapon-readability/${label}.json`,JSON.stringify(captures,null,2)+'\n');
 console.log('Sustained weapon readability captures:',JSON.stringify(captures));
}finally{await browser.close();}
