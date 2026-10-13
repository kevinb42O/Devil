import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5173');
 const results=await page.evaluate(async()=>{
  const [{OriginalWeapon},{World,idleInput,STEP},THREE]=await Promise.all([
   import('/src/original-weapon.ts'),import('/src/simulation.ts'),import('/node_modules/three/build/three.module.js'),
  ]);
  const weapon=new OriginalWeapon(new THREE.Scene());await weapon.loaded;
  if(!weapon.ready)throw Error(weapon.error);
  const results=[];
  for(let level=1;level<=4;level++){
   const world=new World(91,{schedule:false,invulnerable:true});world.level=level;
   const state=()=>{
    const material=weapon.handMaterials[level-1];
    return {texture:material.uniforms.originalTexture.value.image.src.split('/').pop(),brightness:material.uniforms.brightness.value,recoil:weapon.effectDiagnostics.recoil};
   };
   weapon.clear();weapon.update(world,0,false);const idle=state();
   let firing;
   for(let tick=0;tick<60;tick++){
    world.step({...idleInput(),fire:true},STEP);
    const shot=world.effects.some(effect=>effect.kind==='shot'||effect.kind==='burst');
    for(const effect of world.effects)weapon.effect(effect,world,0,0);
    world.effects=[];weapon.update(world,STEP,false);
    if(shot){const current=state();if(current.brightness<=1||current.recoil<=0)throw Error(`Level ${level} did not animate`);firing=current;}
   }
   weapon.update(world,.2,false);const released=state();
   weapon.effect({kind:'burst',level,pos:world.player.pos},world,0,0);weapon.update(world,STEP,false);const burst=state();
   weapon.update(world,.2,false);const afterBurst=state();
   // Another player's shot must not animate the local hand.
   weapon.effect({kind:'shot',level,pos:world.player.pos},world,0,0,false);weapon.update(world,STEP,false);const remote=state();
   results.push({level,idle,firing,released,burst,afterBurst,remote});
  }
  return results;
 });
 const idleTextures=['hand.png','hand2.png','hand3.png','hand5.png'];
 const firingTextures=['hand.png','hand2.png','hand4.png','hand6.png'];
 for(const result of results){
  const index=result.level-1;
  assert.equal(result.idle.texture,idleTextures[index]);
  assert.equal(result.firing.texture,firingTextures[index]);
  assert.equal(result.burst.texture,firingTextures[index]);
  assert.ok(result.burst.brightness>1);
  for(const state of [result.released,result.afterBurst,result.remote]){
   assert.equal(state.texture,idleTextures[index]);assert.equal(state.brightness,1);
  }
 }
 assert.deepEqual(errors,[]);
 console.log('All four hands animate during stream/burst fire and return to idle; remote shots leave the local hand idle.');
}finally{await browser.close();}
