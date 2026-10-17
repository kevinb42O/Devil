import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:640,height:480}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 // This fixture mounts its own renderer; avoid loading the unrelated game UI.
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Projectile regression fixture</title>'}));
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [T,{World,v,idleInput},{OriginalWeapon},{ProjectileLighting}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/original-weapon.ts'),import('/src/projectile-lighting.ts')]);
  const scene=new T.Scene(),weapon=new OriginalWeapon(scene);await weapon.loaded;if(!weapon.ready)throw Error(weapon.error);
  const camera=new T.PerspectiveCamera(90,640/480,.05,100),world=new World(71,{schedule:false});world.player.pos=v(0,5,0);
  const check=(value,label)=>{if(!value)throw Error(label);};let handChecks=0;
  for(let level=1;level<=4;level++)for(const burst of [false,true])for(const homing of [false,true]){
   if(homing&&level<3)continue;weapon.clear();world.level=level;world.reserve=1000;world.projectiles=[];world.effects=[];
   world.shoot(idleInput(),burst,homing);const before=world.projectiles.map(p=>({...p.pos}));for(const e of world.effects)weapon.effect(e,world,0,0);
   weapon.update(world,0,false,camera,0);
   check(!weapon.handScene.getObjectByName('fingertip-flames'),'no attached flames');
   check(weapon.handMaterials[level-1].uniforms.originalTexture.value===weapon.flashTextures[level-1],'firing uses the original hand flash skin');
   check(weapon.fragments.length<=world.effects[0].muzzles.length,'at most one launch spark per socket');
   check(weapon.fragments.every(f=>f.family.startsWith('ember')&&f.size===.025&&f.life<=.045&&world.effects[0].muzzles.some(m=>f.pos.distanceTo(new T.Vector3(m.x,m.y,m.z))<1e-9)),'small sparks share the physical emitters beneath the hand');
   const kick=weapon.effectDiagnostics.recoil;check(kick>0,'firing kicks the hand');
   weapon.update(world,.5,false,camera,0);check(weapon.effectDiagnostics.recoil<kick*.001,'hand kick recovers promptly');
   check(world.projectiles.every((p,i)=>p.pos.x===before[i].x&&p.pos.y===before[i].y&&p.pos.z===before[i].z),'visual clearance never moves physical shots');handChecks++;
  }
  weapon.clear();world.projectiles=[];world.player.pos=v(0,0,0);weapon.update(world,0,false,camera);
  const canvas=document.createElement('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:false});renderer.setSize(640,480);renderer.setClearColor(0);
  const pixels=new Uint8Array(640*480*4),countPixels=()=>{const gl=renderer.getContext();gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let n=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>0)n++;return n;};
  const sampleMesh=distance=>{world.projectiles=Array.from({length:60},(_,id)=>({id,pos:v(0,0,-distance),vel:v(0,0,-70),age:0,homing:false,level:3}));weapon.update(world,0,false,camera);renderer.render(scene,camera);return countPixels();};
  const nearMeshPixels=sampleMesh(.65),farMeshPixels=sampleMesh(3);check(nearMeshPixels===0,'overlapping launch meshes cannot form a solid object near the hand');check(farMeshPixels>0,'full-size flying daggers remain visible');
  world.projectiles=[];weapon.update(world,0,false,camera);const lighting=new ProjectileLighting(scene,new T.MeshBasicMaterial());
  const sampleGlow=distance=>{world.projectiles=Array.from({length:60},(_,id)=>({id,pos:v(0,0,-distance),vel:v(0,0,-70),age:0,homing:false,level:3}));lighting.update(world,false,0,480);renderer.render(scene,camera);return countPixels();};
  const nearGlowPixels=sampleGlow(.65),farGlowPixels=sampleGlow(3);check(nearGlowPixels===0,'stacked launch halos cannot coat the fingers');check(farGlowPixels>0,'flying projectile glow remains visible');
  renderer.dispose();return {handChecks,nearMeshPixels,farMeshPixels,nearGlowPixels,farGlowPixels};
 });
 assert.deepEqual(errors,[]);await mkdir('artifacts',{recursive:true});await writeFile('artifacts/projectile-muzzle-audit.json',JSON.stringify(result,null,2)+'\n');console.log('Muzzle regression checks passed:',result);
}finally{await browser.close();}
