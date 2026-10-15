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
 await page.waitForFunction(()=>window.skinTest.renderer.crewModels.get('gold').getObjectByName('crew-gold-crown'));
 const crownChecks=await page.evaluate(()=>{
  const {renderer,render}=window.skinTest,gold=renderer.crewModels.get('gold'),silver=renderer.crewModels.get('silver'),crown=gold.getObjectByName('crew-gold-crown');
  const dark=model=>model.getObjectByName('Demon_2');
  render(0);const before=crown.matrixWorld.toArray(),mount=crown.matrix.toArray();render(.75);const after=crown.matrixWorld.toArray();
  let crownMeshes=0;crown.traverse(o=>{if(o.isMesh)crownMeshes++;});
  render(0);crown.visible=false;render(0);const without=renderer.renderer.info.render.calls;crown.visible=true;render(0);const drawCallCost=renderer.renderer.info.render.calls-without;const bounds=crown.geometry.boundingBox.clone().applyMatrix4(crown.matrixWorld);return {drawCallCost,triangles:crown.geometry.index.count/3,bounds:[bounds.min.toArray(),bounds.max.toArray()],parent:crown.parent.name,haloFacesRemoved:(dark(silver).geometry.index.count-dark(gold).geometry.index.count)/3,crownMeshes,groups:crown.geometry.groups.length,sharedMaterial:crown.material.name,headFollows:JSON.stringify(before)!==JSON.stringify(after),mountStable:JSON.stringify(mount)===JSON.stringify(crown.matrix.toArray())};
 });
 assert.equal(crownChecks.parent,'Head');assert.equal(crownChecks.drawCallCost,1);assert.ok(Math.abs((crownChecks.bounds[0][0]+crownChecks.bounds[1][0])/2+2.15)<.08,'crown is centered on the head');assert.ok(crownChecks.bounds[0][1]>1.6&&crownChecks.bounds[0][1]<1.78,'bottom band is sunk into the head, not floating');assert.ok(crownChecks.haloFacesRemoved>0);assert.equal(crownChecks.crownMeshes,1);assert.equal(crownChecks.groups,0);assert.equal(crownChecks.mountStable,true);assert.equal(crownChecks.headFollows,true);
 await page.evaluate(()=>window.skinTest.render(0));
 const presentation=await page.evaluate(()=>window.skinTest.renderer.crewPresentation);assert.deepEqual(presentation.map(p=>p.skinRank),[1,2,3]);assert.ok(presentation.every(p=>p.skin==='ascendant'));
 const first=await page.screenshot({path:'artifacts/ascendant/crowned-gold.png'});
 await page.evaluate(()=>window.skinTest.render(1.35));const second=await page.screenshot({path:'artifacts/ascendant/crowned-gold-animated.png'});assert.equal(first.equals(second),false,'the shader changes with simulation time');
 const paused=await page.evaluate(()=>{const {render,renderer}=window.skinTest;render(1.35);return renderer.crewPresentation.map(p=>p.skinTime);});assert.deepEqual(paused,[1.35,1.35,1.35]);
 await page.evaluate(()=>{const {world,render}=window.skinTest;world.player.pos={x:-2.15,y:1.6,z:-2.25};world.crew[1].input.yaw=Math.PI;render(.2);});
 await page.screenshot({path:'artifacts/ascendant/gold-crown-closeup.png'});
 await page.evaluate(()=>{const {renderer,render}=window.skinTest;renderer.setCrewNames([{id:'gold',name:'Jade',color:'jade'},{id:'silver',name:'Silver',skin:'ascendant',skinRank:2},{id:'bronze',name:'Bronze',skin:'ascendant',skinRank:3}]);render(2);});
 assert.equal((await page.evaluate(()=>window.skinTest.renderer.crewPresentation))[0].skin,undefined);assert.equal(await page.evaluate(()=>window.skinTest.renderer.crewModels.get('gold').getObjectByName('crew-gold-crown').visible),false);
 assert.deepEqual(errors,[]);console.log(crownChecks);console.log('Crowned Gold Ascendant passed: async GLB replacement, three metal variants, real compiled animated shader, stable pause time, normal-color restoration, no shader/browser errors.');
}finally{await browser.close();}
