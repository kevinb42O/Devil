import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Hand firing animation</title>'}));
 await page.goto('http://127.0.0.1:5173');
 const results=await page.evaluate(async()=>{
  const [{OriginalWeapon},{World,idleInput,STEP},THREE]=await Promise.all([
   import('/src/original-weapon.ts'),import('/src/simulation.ts'),import('/node_modules/three/build/three.module.js'),
  ]);
  const weapon=new OriginalWeapon(new THREE.Scene());await weapon.loaded;
  if(!weapon.ready)throw Error(weapon.error);
  const results=[];
  const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(400,300);weapon.resize(400,300);
  const sheet=document.createElement('canvas');sheet.width=400*5;sheet.height=300*5;const context=sheet.getContext('2d');
  const render=(level,column,label)=>{renderer.clear();weapon.render(renderer,false);context.drawImage(renderer.domElement,column*400,(level-3)*300);context.fillStyle='white';context.font='16px sans-serif';context.fillText(`Hand ${level}: ${label}`,column*400+12,(level-3)*300+22);};
  for(let level=1;level<=7;level++){
   const world=new World(91,{schedule:false,invulnerable:true});world.level=level;
   const state=()=>{
    const material=weapon.handMaterials[level-1];
    return {texture:material.uniforms.originalTexture.value.image.src.split('/').pop(),mix:material.uniforms.fireMix.value,brightness:material.uniforms.brightness.value,recoil:weapon.effectDiagnostics.recoil};
   };
   weapon.clear();weapon.update(world,0,false);const idle=state();
   let firing,bright=0,dark=0;
   for(let tick=0;tick<60;tick++){
    world.step({...idleInput(),fire:true},STEP);
    const shot=world.effects.some(effect=>effect.kind==='shot'||effect.kind==='burst');
    for(const effect of world.effects)weapon.effect(effect,world,0,0);
    world.effects=[];weapon.update(world,STEP,false);
    const current=state();
    if(current.mix>0){firing=current;if(tick>20)bright++;}else if(tick>20)dark++;
    if(shot&&current.recoil<=0)throw Error(`Level ${level} did not recoil`);
   }
   if(!bright||!dark)throw Error(`Level ${level} stream skin stuck: ${bright}/${dark}`);
   weapon.update(world,.2,false);const released=state();
   if(level>=3)render(level,0,'idle');
   weapon.effect({kind:'burst',level,pos:world.player.pos},world,0,0);weapon.update(world,STEP,false);const burst=state();
   if(level>=3)render(level,1,'shotgun impact');
   weapon.update(world,.06,false);const pulse=state();
   if(!(pulse.mix>0&&pulse.mix<1))throw Error(`Level ${level} missing shotgun fade`);
   if(level>=3)render(level,2,'shotgun fade');
   weapon.update(world,.2,false);const afterBurst=state();
   // Another player's shot must not animate the local hand.
   weapon.effect({kind:'shot',level,pos:world.player.pos},world,0,0,false);weapon.update(world,STEP,false);const remote=state();
   // Render the real stream's two skin states, including recolored twins.
   weapon.clear();let capturedBright=false,capturedDark=false;
   for(let tick=0;tick<90;tick++){
    if(tick%6===0)weapon.effect({kind:'shot',level,pos:world.player.pos},world,0,0);
    weapon.update(world,STEP,false);
    const mix=state().mix;
    if(level>=3&&mix===1&&!capturedBright){render(level,3,'stream bright');capturedBright=true;}
    if(level>=3&&mix===0&&!capturedDark){render(level,4,'stream base');capturedDark=true;}
   }
   if(level>=3&&(!capturedBright||!capturedDark))throw Error(`Level ${level} missing rendered stream phase`);
   // The real secondary fire channel must also alternate, despite its slower cadence.
   weapon.clear();const secondary=new World(92,{schedule:false,invulnerable:true});secondary.level=level;secondary.reserve=1000;
   let secondaryBright=0,secondaryDark=0;
   for(let tick=0;tick<180;tick++){
    secondary.step({...idleInput(),homing:true},STEP);
    for(const effect of secondary.effects)weapon.effect(effect,secondary,0,0);
    secondary.effects=[];weapon.update(secondary,STEP,false);
    if(tick>30){if(state().mix>0)secondaryBright++;else secondaryDark++;}
   }
   if(level>=3&&(!secondaryBright||!secondaryDark))throw Error(`Level ${level} homing skin stuck`);
   results.push({level,idle,firing,released,burst,pulse,afterBurst,remote,bright,dark});
  }
  renderer.dispose();return {results,sheet:sheet.toDataURL()};
 });
 const idleTextures=['hand.png','hand2.png','hand3.png','hand5.png','hand5.png','hand5.png','hand5.png'];
 const firingTextures=['hand.png','hand2.png','hand4.png','hand6.png','hand6.png','hand6.png','hand6.png'];
 for(const result of results.results){
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
 await mkdir('artifacts/hand-firing',{recursive:true});await writeFile('artifacts/hand-firing/skin-phases.png',Buffer.from(results.sheet.split(',')[1],'base64'));
 console.log('All seven hands: primary/homing stream alternates, shotgun blends, release settles, remote shots stay isolated.');
}finally{await browser.close();}
