import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const local='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(local)?{executablePath:local}:{})});
try {
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173/');
 const audit=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {OriginalEnemies}=await import('/src/original-enemies.ts');
  const {World,v}=await import('/src/simulation.ts');
  const {SPIDER_SIZE,SPIDER_GEM,spiderLocalPoint,SPIDER_HIT_FLASH_DURATION,enemyEmergenceScale,spiderCrystalVisualRadius}=await import('/src/enemy-presentation.ts');
  const originals=new OriginalEnemies();await originals.loaded;if(!originals.ready)throw Error(originals.error);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x141118);scene.add(new THREE.HemisphereLight(0xb5c7df,0x241b19,1.15));const key=new THREE.DirectionalLight(0xffdfbe,2.6);key.position.set(-5,7,8);scene.add(key);
  const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(1200,800);renderer.outputColorSpace=THREE.SRGBColorSpace;
  document.body.append(renderer.domElement);renderer.domElement.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:100000';
  const camera=new THREE.PerspectiveCamera(45,1.5,.1,200);camera.position.set(0,6,16);camera.lookAt(0,3.5,0);
  const w=new World(1,{schedule:false}),e=w.spawn('spider',v());e.pos=v(0,2.7*e.size,0);e.headExposure=1;e.age=12;e.facingYaw=0;
  const model=originals.clone('spider');model.position.set(e.pos.x,e.pos.y,e.pos.z);model.scale.setScalar(enemyEmergenceScale(e));scene.add(model);originals.animate(model,e,w.time);model.updateMatrixWorld(true);
  const gem=model.getObjectByName('spider-held-gem'),gemSize=new THREE.Box3().setFromObject(gem).getSize(new THREE.Vector3());
  const gemPos=gem.getWorldPosition(new THREE.Vector3()),target=spiderLocalPoint(e,w.player.pos,SPIDER_GEM);
  const normalMaterial=gem.material,other=originals.clone('spider');
  const otherGem=other.getObjectByName('spider-held-gem');
  let otherMax=0;
  for(const kind of ['squid','squid2','squid3','leviathan']){
   const template=originals.clone(kind);template.updateMatrixWorld(true);
   template.traverse(n=>{if(n.name.startsWith('weak-point-')){const size=new THREE.Box3().setFromObject(n).getSize(new THREE.Vector3());otherMax=Math.max(otherMax,size.x,size.y,size.z);}});
  }
  const render=()=>renderer.render(scene,camera);
  let greenMask=null;
  const greenReading=()=>{
   const pixels=new Uint8Array(1200*800*4),gl=renderer.getContext();gl.readPixels(0,0,1200,800,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   if(!greenMask){greenMask=[];for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>80&&pixels[i+1]>pixels[i]*1.5&&pixels[i+1]>pixels[i+2]*1.5)greenMask.push(i);}
   let brightness=0,red=0,blue=0;for(const i of greenMask){red+=pixels[i];brightness+=pixels[i+1];blue+=pixels[i+2];}
   return {count:greenMask.length,brightness:brightness/Math.max(1,greenMask.length),red:red/Math.max(1,greenMask.length),blue:blue/Math.max(1,greenMask.length)};
  };
  render();const normalGreen=greenReading();
  window.spiderCheck={w,e,model,gem,originals,render,normalMaterial};
  w.damageEnemy(e,1,spiderLocalPoint(e,w.player.pos,SPIDER_GEM));originals.animate(model,e,w.time);render();
  const hitGreen=greenReading();
  const big=w.spawn('spider2',v()),bigModel=originals.clone('spider2');big.pos=v(0,2.7*big.size,0);big.headExposure=.6;big.age=12;big.facingYaw=0;
  bigModel.position.set(big.pos.x,big.pos.y,big.pos.z);bigModel.scale.setScalar(enemyEmergenceScale(big));originals.animate(bigModel,big,w.time);bigModel.updateMatrixWorld(true);
  const bigPos=bigModel.getObjectByName('spider-held-gem').getWorldPosition(new THREE.Vector3()),bigTarget=spiderLocalPoint(big,w.player.pos,SPIDER_GEM);
  const bigGemSpan=2*bigModel.getObjectByName('spider-held-gem').getWorldScale(new THREE.Vector3()).x;
  const bigTargetError=Math.hypot(bigPos.x-bigTarget.x,bigPos.y-bigTarget.y,bigPos.z-bigTarget.z);
  const exposedGem=[];
  for(const candidate of [model,bigModel]){
   const held=candidate.getObjectByName('spider-held-gem'),center=held.getWorldPosition(new THREE.Vector3()),scale=held.getWorldScale(new THREE.Vector3()).x;
   const origin=center.clone().add(new THREE.Vector3(0,0,scale*8)),direction=center.clone().sub(origin).normalize();
   const first=new THREE.Raycaster(origin,direction).intersectObject(candidate,true)[0];exposedGem.push(first?.object.name==='spider-held-gem');
  }
  const greenMaterial=gem.material,isolated=otherGem.material===normalMaterial;
  originals.animate(model,e,w.time+SPIDER_HIT_FLASH_DURATION+.001);
  const restored=gem.material===normalMaterial;
  originals.animate(model,e,w.time);render();
  return {exposedGem,normalGreen,hitGreen,bigTargetError,bigGemSpan,bigSize:big.size,size:e.size,expectedSize:SPIDER_SIZE,expectedGemSpan:2*spiderCrystalVisualRadius(e)*enemyEmergenceScale(e),gemSize:gemSize.toArray(),otherMax,targetError:Math.hypot(gemPos.x-target.x,gemPos.y-target.y,gemPos.z-target.z),flashed:greenMaterial!==normalMaterial,isolated,restored,hp:e.hp};
 });
 assert.ok(audit.exposedGem.every(Boolean),'both crystal centers remain visible through the feeding opening');
 assert.equal(audit.size,audit.expectedSize);
 assert.equal(audit.bigSize,audit.expectedSize*2);
 assert.ok(audit.bigTargetError<1e-6,'larger spider crystal tracks the moving head');
 assert.ok(audit.normalGreen.count>150,'resting crystal has a visible green surface');
 assert.ok(audit.hitGreen.brightness>audit.hitGreen.red*1.1&&audit.hitGreen.brightness>audit.hitGreen.blue*1.1,'the same crystal surface remains green-dominant on hit');
 assert.ok(audit.hitGreen.brightness>audit.normalGreen.brightness+40,'hit visibly brightens the green crystal');
 assert.ok(Math.abs(Math.max(...audit.gemSize)-audit.expectedGemSpan)<1e-5,'crystal uses its visual radius and production rig scale');
 assert.ok(Math.abs(audit.bigGemSpan/audit.expectedGemSpan-2.5)<1e-5,'adult gems have matching proportions to their differently sized feeding faces');
 assert.ok(audit.targetError<1e-6,'damage target matches animated crystal center');
 assert.ok(audit.flashed&&audit.isolated&&audit.restored,'hit flash changes only struck crystal and resets');
 assert.equal(audit.hp,24);
 await page.screenshot({path:'artifacts/spider-crystal-green-hit.png'});
 await page.evaluate(()=>{const {w,e,model,originals,render}=window.spiderCheck;originals.animate(model,e,w.time+.3);render();});
 await page.screenshot({path:'artifacts/spider-crystal-enlarged.png'});
 assert.deepEqual(errors,[]);
 console.log('Spider size, crystal prominence, aligned target, isolated green hit shader and reset passed:',audit);
} finally {await browser.close();}
