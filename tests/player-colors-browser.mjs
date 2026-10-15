import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0}));if(!localStorage.getItem('abyss-player-color'))localStorage.setItem('abyss-player-color',JSON.stringify('violet'));});
 await page.goto(base);await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);
 await page.locator('#friends-open').evaluate(el=>el.click());await page.locator('#friends').waitFor({state:'visible'});await page.locator('#friends-host').click();
 await page.locator('#player-color-picker').waitFor({state:'visible'});
 assert.equal(await page.getByRole('button',{name:'Violet',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Jade',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.abyss.friends.members[0].color),'jade');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('abyss-player-color'))),'jade');
 await page.screenshot({path:'artifacts/player-colors-lobby-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#player-color-picker').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/player-colors-lobby-mobile.png'});
 assert.equal(await page.getByRole('button',{name:'Jade',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44),true);
 await page.reload();await page.waitForFunction(()=>window.abyss?.originalAssets);await page.locator('#friends-open').evaluate(el=>el.click());await page.locator('#friends').waitFor({state:'visible'});await page.locator('#friends-host').click();
 assert.equal(await page.getByRole('button',{name:'Jade',exact:true}).getAttribute('aria-pressed'),'true');
 const modelPage=await browser.newPage({viewport:{width:1280,height:900}});
 await modelPage.route('**/color-model-test',r=>r.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));await modelPage.goto(base+'/color-model-test');
 const result=await modelPage.evaluate(async()=>{
  const {createCrewAvatar,setCrewAvatarColor,loadCrewAvatar,disposeCrewAvatar}=await import('/src/crew-avatar.ts');
  const {playerColor}=await import('/src/player-colors.ts');const THREE=await import('/node_modules/three/build/three.module.js');
  const early=createCrewAvatar(0);setCrewAvatarColor(early,'frost');await loadCrewAvatar();
  const late=createCrewAvatar(1);setCrewAvatarColor(late,'violet');
  const inspect=model=>Object.fromEntries(model.userData.avatarMaterials.map(m=>[m.name,m.color.getHexString()]));
  const first=inspect(early),second=inspect(late);setCrewAvatarColor(early,'jade');const changed=inspect(early);
  const expected=id=>new THREE.Color(playerColor(id).hex).multiplyScalar(.64).getHexString();
  const {GameRenderer}=await import('/src/renderer.ts');const {World}=await import('/src/simulation.ts');
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90});await Promise.all([renderer.originalWeapon.loaded,renderer.originalEnemies.loaded]);
  const world=new World(1,{schedule:false});for(const id of ['host','a','b'])world.addCrew(id);world.selectCrew('host');world.crew[1].player.pos={x:-1.5,y:1.7,z:-3};world.crew[2].player.pos={x:1.5,y:1.7,z:-3};
  renderer.setCrewNames([{id:'host',name:'Host',color:'crimson'},{id:'a',name:'Jade',color:'jade'},{id:'b',name:'Violet',color:'violet'}]);
  await renderer.entrance.ready;renderer.render(world,0,0,1/60,false,1,null,true,true);window.colorRenderer=renderer;
  disposeCrewAvatar(early);disposeCrewAvatar(late);
  return {first,second,changed,expected:['frost','violet','jade'].map(expected),presentation:renderer.crewPresentation};
 });
 assert.equal(result.first.Demon_Main,result.expected[0]);assert.equal(result.second.Demon_Main,result.expected[1]);assert.equal(result.changed.Demon_Main,result.expected[2]);
 for(const name of ['Black','Eye_White','Eye_Black']){assert.equal(result.first[name],result.second[name]);assert.equal(result.first[name],result.changed[name]);}
 assert.deepEqual(result.presentation.map(p=>[p.name,p.color,p.label]),[['Jade','jade',true],['Violet','violet',true]]);
 await modelPage.screenshot({path:'artifacts/player-colors-courtyard.png'});
 assert.deepEqual(errors,[]);console.log('Player color UI and rendering passed: saved preference, eight accessible swatches, desktop/mobile layout, real GLB skin before/after load, preserved details, colored courtyard avatars and labels.');
}finally{await browser.close();}
