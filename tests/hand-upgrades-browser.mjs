import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Hand upgrade regression</title>'}));
 // Simulate a first visit on a slow connection, beyond the old 100 ms cutoff.
 await page.route('**/audio/levelup*.wav',async route=>{await new Promise(resolve=>setTimeout(resolve,250));await route.continue();});
 await page.goto(url);
 const result=await page.evaluate(async()=>{
  const [T,{World,idleInput},{OriginalWeapon},{Sound}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/original-weapon.ts'),import('/src/audio.ts')]);
  const check=(value,label)=>{if(!value)throw Error(label);};
  const sound=new Sound();await sound.start();const world=new World(1,{schedule:false});
  const weapon=new OriginalWeapon(new T.Scene());await weapon.loaded;check(weapon.ready,weapon.error);
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(640,480);weapon.resize(640,480);
  const screenshots=[];
  for(let level=2;level<=4;level++){
   weapon.clear();world.level=level-1;world.reserve=200;world.shoot(idleInput(),false,false);
   weapon.effect(world.effects.at(-1),world,0,0);
   world.level=level;const upgrade={kind:'upgrade',level,amount:level,pos:world.player.pos};
   weapon.effect(upgrade,world,0,0);sound.play(upgrade,world);
   await sound.pending.get('levelup'+level);
   check(sound.diagnostics.oneShotNames.includes('levelup'+level),'cold upgrade cue survives delayed decode '+level);
   weapon.update(world,.1,false);
   check(weapon.effectDiagnostics.visibleLevel===level,'mesh switches in upgrade frame '+level);
   check(weapon.handMaterials[level-1].uniforms.originalTexture.value===weapon.handTextures[level-1],'old shot does not flash new hand '+level);
   check(weapon.effectDiagnostics.upgradeTime===weapon.effectDiagnostics.upgradeDuration,'first upgrade animation frame survives stall');
   check(weapon.handMaterials[level-1].uniforms.brightness.value>1,'upgrade lights the idle hand');
   renderer.clear();weapon.render(renderer,false);screenshots.push(renderer.domElement.toDataURL());
   weapon.update(world,2,false);check(weapon.effectDiagnostics.upgradeTime===0,'upgrade animation settles');
   world.effects=[];world.shoot(idleInput(),true,false);weapon.effect(world.effects.at(-1),world,0,0);
   weapon.update(world,.1,false);
   check(weapon.handMaterials[level-1].uniforms.originalTexture.value===weapon.flashTextures[level-1],'first firing flash survives slow frame '+level);
   check(weapon.effectDiagnostics.recoil>0,'recoil survives first frame');
   check(weapon.handMaterials[level-1].uniforms.upgradePower.value===0,'firing suppresses upgrade emission');
   weapon.update(world,.2,false);check(weapon.effectDiagnostics.flashTime===0,'flash settles after release');
   world.effects=[];sound.clear();
  }
  sound.update(world);await Promise.all([...sound.pending.values()]);
  check(sound.buffers.has('rapid4')&&sound.buffers.has('shot4alt1')&&sound.buffers.has('magentashot'),'hand weapon sounds predecoded');
  const crew=new World(2,{schedule:false});crew.addCrew('host');crew.addCrew('guest');crew.selectCrew('host');
  const remote={kind:'upgrade',level:4,amount:4,shooterId:'guest',pos:{x:20,y:2,z:0}};
  weapon.clear();weapon.effect(remote,crew,0,0,false);weapon.update(crew,0,false);
  check(weapon.effectDiagnostics.upgradeTime===0&&weapon.effectDiagnostics.visibleLevel===1,'remote upgrade cannot pulse or switch local hand');
  sound.play(remote,crew);check([...sound.shots].find(v=>v.name==='levelup4')?.panner?.positionX.value===20,'remote upgrade sound is positional');
  sound.clear();sound.buffers.delete('levelup2');sound.play({kind:'upgrade',amount:2,pos:world.player.pos},world);const pending=sound.pending.get('levelup2');sound.clear();await pending;
  check(sound.diagnostics.oneShots===0,'restart cancels delayed upgrade cue');
  weapon.clear();weapon.update(null,0,false);check(weapon.effectDiagnostics.visibleLevel===1,'clear resets remembered hand');
  renderer.dispose();sound.clear();return {screenshots,levelsChecked:3,delayedAudio:true};
 });
 assert.deepEqual(errors,[]);
 const {mkdir,writeFile}=await import('node:fs/promises');await mkdir('test-results/hand-upgrades',{recursive:true});
 for(let i=0;i<result.screenshots.length;i++)await writeFile(`test-results/hand-upgrades/level-${i+2}.png`,Buffer.from(result.screenshots[i].split(',')[1],'base64'));
 console.log('Hand upgrade browser checks passed:',{levelsChecked:result.levelsChecked,delayedAudio:result.delayedAudio});
}finally{await browser.close();}
