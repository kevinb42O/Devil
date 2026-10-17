import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const directory='artifacts/arm-materials';
await mkdir(directory,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('**/arm-materials-test',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas></body>'}));
 await page.goto(base+'/arm-materials-test');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,screenShake:0,movementMotion:0,mist:false,skyMotion:'reduced'});
  await renderer.prepare();const world=new World(971,{schedule:false});world.player.pos={x:0,y:1.7,z:0};
  const pose=()=>{for(let i=0;i<4;i++)renderer.render(world,0,0,1/60,false,1,null,false,false,idleInput());};
  window.armTest={renderer,world,idleInput,pose};pose();
 });
 const tiers=[];
 for(let level=1;level<=7;level++){
  const result=await page.evaluate(level=>{
   const {renderer:r,world:w,pose}=window.armTest;w.level=level;r.originalWeapon.clear();pose();
   const materials=r.emoteHands.userData.avatarMaterials;
   const u=materials.find(material=>material.name==='Demon_Main').userData.combatFeedback.uniforms;
   return {level,tier:u.combatTier.value,active:u.combatActive.value,draws:r.renderer.info.render.calls,geometries:r.renderer.info.memory.geometries,textures:r.renderer.info.memory.textures};
  },level);
  assert.equal(result.tier,level);assert.equal(result.active,1);tiers.push(result);
  await page.screenshot({path:`${directory}/tier-${level}.png`});
 }
 // Returning to the courtyard must restore the player's own skin.
 const lifecycle=await page.evaluate(async()=>{
  const {renderer:r,world:w,idleInput,pose}=window.armTest;
  const {updateCrewAvatar}=await import('/src/crew-avatar.ts');
  const main=r.emoteHands.userData.avatarMaterials.find(m=>m.name==='Demon_Main');
  updateCrewAvatar(r.emoteHands,idleInput(),{x:0,y:0,z:0},true,w.time,false,true);
  const courtyard=main.userData.combatFeedback.uniforms.combatActive.value;
  pose();return {courtyard,combat:main.userData.combatFeedback.uniforms.combatActive.value};
 });
 assert.deepEqual(lifecycle,{courtyard:0,combat:1});
 assert.equal(new Set(tiers.map(t=>t.draws)).size,1,'tiers share a render budget');
 assert.equal(new Set(tiers.map(t=>t.textures)).size,1,'tiers do not allocate textures');
 assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({tiers,lifecycle,errors},null,2));
 // An in-browser contact sheet keeps the seven in-game views easy to compare.
 const names=['AWAKENED · CHARRED HIDE','KINDLED · EMBERSTONE','ASCENDANT · BLACKENED STEEL','UNBOUND · ANCIENT BRONZE','TWINFLAME · BLOOD OBSIDIAN','DOMINION · AMETHYST ALLOY','ECLIPSE · IVORY & GOLD'];
 await page.route('**/arm-materials-gallery',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><body style="margin:0;padding:32px;background:#0c0d10;color:#ece5d7;font-family:Arial,sans-serif"><div style="font-size:12px;letter-spacing:4px;color:#af9271">ABYSS DAGGERS / ARM MATERIALS</div><h1 style="font-size:32px;font-weight:500;margin:12px 0 24px">Seven stages of corruption</h1><main style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px">${names.map((name,i)=>`<section style="background:#17181e;border:1px solid #333039"><div style="padding:12px 16px;font-size:13px;letter-spacing:1px"><span style="color:#b59a76;margin-right:14px">0${i+1}</span>${name}</div><img style="display:block;width:100%;height:220px;object-fit:cover;object-position:bottom" src="/artifacts/arm-materials/tier-${i+1}.png"></section>`).join('')}</main></body>`}));
 await page.setViewportSize({width:1440,height:2000});await page.goto(base+'/arm-materials-gallery');
 await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));
 await page.screenshot({path:`${directory}/all-tiers.png`,fullPage:true});
 console.log(JSON.stringify({tiers,lifecycle,errors}));
}finally{await browser.close();}
