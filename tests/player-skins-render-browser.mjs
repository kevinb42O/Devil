import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});mkdirSync('artifacts/ascendant',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/skin-render',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:#000}canvas{display:block}</style><canvas></canvas>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/skin-render');
 await page.evaluate(async()=>{
  const {GameRenderer}=await import('/src/renderer.ts'),{World,idleInput}=await import('/src/simulation.ts'),{loadCrewAvatar,createCrewAvatar,setCrewAvatarSkin,updateCrewAvatar,disposeCrewAvatar}=await import('/src/crew-avatar.ts');
  // Install the effect before the real GLB arrives, then verify the skin uniform survives replacement.
  const early=createCrewAvatar(0);setCrewAvatarSkin(early,'ascendant',1);await loadCrewAvatar();updateCrewAvatar(early,idleInput(),{x:0,y:0,z:0},true,2);
  if(early.userData.avatarMaterials.find(m=>m.name==='Demon_Main').userData.ascendantRank!==1)throw Error('Skin lost across model loading');disposeCrewAvatar(early);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:75});await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded,renderer.entrance.ready]);
  const world=new World(1,{schedule:false});for(const id of ['host','gold','silver','bronze'])world.addCrew(id);world.selectCrew('host');world.player.pos={x:0,y:1.7,z:-.5};
  for(let i=1;i<4;i++)world.crew[i].player.pos={x:(i-2)*2.15,y:1.7,z:-5};
  renderer.setCrewNames([{id:'host',name:'Host'},...['gold','silver','bronze'].map((id,i)=>({id,name:['I · GOLD','II · SILVER','III · BRONZE'][i],skin:'ascendant',skinRank:i+1}))]);
  const render=time=>{world.tick=Math.round(time*120);renderer.render(world,0,0,1/60,false,1,null,true,true);};window.skinTest={renderer,world,render};render(0);
 });
 const presentation=await page.evaluate(()=>window.skinTest.renderer.crewPresentation);assert.deepEqual(presentation.map(p=>p.skinRank),[1,2,3]);assert.ok(presentation.every(p=>p.skin==='ascendant'));
 const first=await page.screenshot({path:'artifacts/ascendant/three-ranks.png'});
 await page.evaluate(()=>window.skinTest.render(1.35));const second=await page.screenshot({path:'artifacts/ascendant/three-ranks-animated.png'});assert.equal(first.equals(second),false,'the shader changes with simulation time');
 const paused=await page.evaluate(()=>{const {render,renderer}=window.skinTest;render(1.35);return renderer.crewPresentation.map(p=>p.skinTime);});assert.deepEqual(paused,[1.35,1.35,1.35]);
 await page.evaluate(()=>{const {renderer,render}=window.skinTest;renderer.setCrewNames([{id:'gold',name:'Jade',color:'jade'},{id:'silver',name:'Silver',skin:'ascendant',skinRank:2},{id:'bronze',name:'Bronze',skin:'ascendant',skinRank:3}]);render(2);});
 assert.equal((await page.evaluate(()=>window.skinTest.renderer.crewPresentation))[0].skin,undefined);
 assert.deepEqual(errors,[]);console.log('Ascendant rendering passed: async GLB replacement, three metal variants, real compiled animated shader, stable pause time, normal-color restoration, no shader/browser errors.');
}finally{await browser.close();}
