import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const output='artifacts/player-body';await mkdir(output,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text()))errors.push(m.text());});
 await page.route('**/body-audit',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/body-audit');
 const lighting=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),{configureFirstPersonMaterial}=await import('/src/first-person-material.ts');
  const renderer=new T.WebGLRenderer(),scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.01,20),target=new T.WebGLRenderTarget(8,8);
  camera.position.z=1;const material=new T.MeshStandardMaterial({color:0xb24646,roughness:.85});scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));const light=new T.PointLight(0xffffff,24,20,2);scene.add(light);
  const pixel=distance=>{light.position.z=distance;renderer.setRenderTarget(target);renderer.render(scene,camera);const bytes=new Uint8Array(4);renderer.readRenderTargetPixels(target,4,4,1,1,bytes);return [...bytes].slice(0,3);};
  const near=pixel(.2),far=pixel(3);configureFirstPersonMaterial(material);const softened=pixel(.2),farSoftened=pixel(3);
  material.dispose();target.dispose();renderer.dispose();return {near,softened,far,farSoftened};
 });
 assert.ok(lighting.softened[0]<lighting.near[0]*.8,'close point lights retain skin shading');assert.deepEqual(lighting.farSoftened,lighting.far,'distant lighting remains unchanged');
 await page.evaluate(async()=>{
  const [{GameRenderer},S,{createCourtyard}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/courtyard-state.ts')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,movementMotion:0,screenShake:0,mist:false});await r.prepare();await r.courtyard.ready;
  const w=new S.World(1,{schedule:false});w.player.pos={x:0,y:1.7,z:5};w.playerStarts.clear();window.bodyAudit={r,w,S,createCourtyard};
 });
 let poses=0;
 for(const location of ['combat','entrance','courtyard'])for(const fov of [75,90,120,145])for(const pitch of [-1.5,-.8,0,1.2]){
  await page.evaluate(({location,fov,pitch})=>{
   const {r,w,S,createCourtyard}=window.bodyAudit;w.courtyard=location==='courtyard'?createCourtyard(1):undefined;r.configure({quality:'high',fov,movementMotion:0,screenShake:0,mist:false});
   for(let frame=0;frame<4;frame++)r.render(w,0,pitch,1/60,false,1,null,false,location!=='combat',{...S.idleInput(),pitch});
   if(r.emoteHands.userData.firstPersonWingVertices!==884)throw Error('Wing frames and membranes were not removed completely');
   if(!r.emoteHands.visible||r.emoteHands.getObjectByName('first-person-shoulder'))throw Error('Missing body or artificial shoulder spheres');
   const material=r.emoteHands.userData.avatarMaterials.find(m=>m.name==='Demon_Main'),hook=material.onBeforeCompile;
   for(let i=0;i<4;i++)r.render(w,0,pitch,1/60,false,1,null,false,location!=='combat',{...S.idleInput(),pitch});
   if(hook!==material.onBeforeCompile)throw Error('Material recompiles every frame');
  },{location,fov,pitch});poses++;
  if(fov===90&&pitch===-1.5)await page.screenshot({path:`${output}/after-${location}-down.png`});
 }
 // Inspect every tier both looking down and on the complete external rig.
 const tiers=[];
 for(let level=1;level<=7;level++){
  const result=await page.evaluate(async level=>{
   const {r,w,S}=window.bodyAudit;w.courtyard=undefined;w.level=level;r.originalWeapon.clear();
   r.configure({quality:'high',fov:90,movementMotion:0,screenShake:0,mist:false});
   for(let i=0;i<4;i++)r.render(w,0,-1.5,1/60,false,1,null,false,false,{...S.idleInput(),pitch:-1.5});
   const materials=r.emoteHands.userData.avatarMaterials,main=materials.find(m=>m.name==='Demon_Main');
   if(materials.some(m=>m!==main&&m.userData.combatFeedback))throw Error('Tier surface overwrote a detail material');
   return {level,tier:main.userData.combatFeedback.uniforms.combatTier.value};
  },level);
  assert.equal(result.tier,level);tiers.push(result);
  await page.screenshot({path:`${output}/tier-${level}-down.png`});
 }
 await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),A=await import('/src/crew-avatar.ts');
  await A.loadCrewAvatar();
  const scene=new T.Scene();scene.background=new T.Color(0x10151c);
  scene.add(new T.HemisphereLight(0xdce8ff,0x30221b,2));
  const key=new T.DirectionalLight(0xffe2bc,4);key.position.set(-3,5,4);scene.add(key);
  const rim=new T.DirectionalLight(0x8ebfff,3);rim.position.set(3,2,-3);scene.add(rim);
  const camera=new T.PerspectiveCamera(36,1280/800,.01,100);camera.position.set(2,1.2,5.2);camera.lookAt(0,1,0);
  const model=A.createCrewAvatar(0);model.position.y=1.7;model.rotation.y=Math.PI;scene.add(model);
  window.bodyGallery={scene,camera,model,A};
 });
 for(let level=1;level<=7;level++){
  await page.evaluate(level=>{
   const {r,S}=window.bodyAudit,{scene,camera,model,A}=window.bodyGallery;
   A.updateCrewAvatar(model,S.idleInput(),{x:0,y:0,z:0},true,0,false,false,level);
   const main=model.userData.avatarMaterials.find(m=>m.name==='Demon_Main'),hook=main.onBeforeCompile;
   A.updateCrewAvatar(model,S.idleInput(),{x:0,y:0,z:0},true,0,false,false,level);
   if(main.onBeforeCompile!==hook)throw Error('External body recompiles every frame');
   if(main.userData.combatFeedback.uniforms.combatTier.value!==level)throw Error('External body tier mismatch');
   if(model.userData.avatarMaterials.some(m=>m!==main&&m.userData.combatFeedback))throw Error('External detail overwritten');
   r.renderer.setRenderTarget(null);r.renderer.render(scene,camera);
  },level);
  await page.screenshot({path:`${output}/tier-${level}-full.png`});
 }
 assert.deepEqual(errors,[]);const result={lighting,poses,tiers,errors};await writeFile(output+'/audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
