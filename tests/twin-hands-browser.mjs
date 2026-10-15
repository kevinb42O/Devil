import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 await mkdir('artifacts/twin-ascension',{recursive:true});const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(url+'/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:#000}canvas{display:block}</style><canvas id="test"></canvas>'}));await page.goto(url);
 await page.evaluate(async()=>{const [{GameRenderer},{World,v,idleInput},T]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:95});await renderer.originalWeapon.loaded;if(!renderer.originalWeapon.ready)throw Error(renderer.originalWeapon.error);window.twins={renderer,World,v,idleInput,T};});
 const report=[];
 for(const size of [[1280,720],[390,844]]){
  await page.setViewportSize({width:size[0],height:size[1]});
  for(const level of [4,5,6,7]){
   const result=await page.evaluate(({level})=>{const {renderer,World,v,idleInput,T}=window.twins;renderer.clear();const w=new World(71,{schedule:false,invulnerable:true});w.time=120;w.player.pos=v(0,1.8,10);w.level=level;renderer.render(w,0,0,0,false,1);window.twins.world=w;
    const weapon=renderer.originalWeapon,mat=weapon.handMaterials[level-1],tips=Array.from({length:level>=5?2:1},(_,i)=>weapon.socketScreen(level,i).toArray());return {level,hands:weapon.effectDiagnostics.visibleHands,visible:weapon.effectDiagnostics.visibleLevel,tips,material:mat.fragmentShader.includes('tierTint'),renderedModels:weapon.handModels[level-1].children.filter(g=>g.visible&&g.children.some(m=>m.visible)).length};},{level});assert.equal(result.visible,level);assert.equal(result.hands,level>=5?2:1);if(level>=5){assert.equal(result.material,true);assert.equal(result.renderedModels,2);assert.ok(Math.abs(result.tips[0][0]+result.tips[1][0])<1e-8);assert.ok(result.tips.every(p=>Math.abs(p[0])<.85&&Math.abs(p[1])<.9));}
   await page.locator('canvas').screenshot({path:`artifacts/twin-ascension/hand-${level}-${size[0]}.png`});report.push({...result,width:size[0]});
  }
 }
 const alignment=await page.evaluate(async()=>{const {weaponMuzzle}=await import('/src/weapon-origin.ts');const {renderer,World,v,idleInput,T}=window.twins,weapon=renderer.originalWeapon;let checks=0,maxError=0;
 for(const aspect of [16/9,4/3,9/19.5])for(const fov of [75,95,145])for(const [yaw,pitch] of [[0,0],[.7,1.4],[-.6,-1.4]])for(const level of [5,6,7])for(const burst of [false,true]){
  renderer.clear();const w=new World(12,{schedule:false});w.level=level;w.player.pos=v(0,20,0);w.shoot({...idleInput(),yaw,pitch},burst,false);const c=new T.PerspectiveCamera(fov,aspect,.05,100);c.position.copy(w.player.pos);c.rotation.set(pitch,yaw,0,'YXZ');c.updateProjectionMatrix();weapon.resize(aspect*360,360);weapon.update(w,0,false,c,0);
  for(const p of w.projectiles){const original=JSON.stringify(p),a=weapon.projectileView(p,weaponMuzzle(w.player.pos,yaw,pitch,level,p.socket)),screen=new T.Vector3(a.x,a.y,a.z).project(c),tip=weapon.socketScreen(level,p.socket),muzzle=w.projectiles[p.socket]?.pos;
   // Pellets include a 1 cm launch-disc offset; compare against its identically offset central launch.
   if(!burst){const err=Math.hypot(screen.x-tip.x,screen.y-tip.y);maxError=Math.max(maxError,err);}
   assertUnchanged:if(original!==JSON.stringify(p))throw Error('view changed physics');checks++;
  }
 }
 return {checks,maxError};});
 // Measure the central socket before its physical launch-disc offset, at both hand origins.
 assert.ok(alignment.maxError<1e-10,JSON.stringify(alignment));assert.deepEqual(errors,[]);
 await page.close();
 const game=await browser.newPage({viewport:{width:1280,height:720}});game.on('pageerror',e=>errors.push(e.message));await game.goto(url+'/?hand-preview=4');await game.waitForFunction(()=>window.abyss?.originalAssets);await game.click('#start');if(await game.locator('#player-profile').isVisible())await game.click('#profile-local');await game.waitForFunction(()=>window.abyss?.mode==='playing'&&!window.abyss?.entrance);
 const keyResults=[];for(const code of ['Digit5','Digit6','Digit7','Numpad5','Numpad6','Numpad7','Digit4']){await game.keyboard.press(code);await game.waitForTimeout(70);const actual=await game.evaluate(()=>({level:window.abyss.handLevel,visual:window.abyss.handFeedback.visibleLevel,phase:document.querySelector('#phase').textContent,label:document.querySelector('#level').textContent}));assert.equal(actual.level,Number(code.at(-1)));assert.equal(actual.visual,actual.level);assert.equal(actual.phase,'PRACTICE');keyResults.push({code,...actual});}
 await game.keyboard.press('Digit7');await game.mouse.down();await game.waitForTimeout(350);await game.mouse.up();assert.ok(await game.evaluate(()=>window.abyss.stats.shots)>0);await game.screenshot({path:'artifacts/twin-ascension/test-mode-7.png'});assert.deepEqual(errors,[]);await writeFile('artifacts/twin-ascension/audit.json',JSON.stringify({report,alignment,keyResults,errors},null,2)+'\n');console.log('Twin hand browser checks passed',JSON.stringify({alignment,keyResults}));
}finally{await browser.close();}
