import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:#030508}canvas{display:block}</style>'}));
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [T,{OriginalWeapon},{World,v},{ProjectileLighting},{PROJECTILE_HAND_CLEARANCE}]=await Promise.all([
   import('/node_modules/.vite/deps/three.js'),import('/src/original-weapon.ts'),import('/src/simulation.ts'),import('/src/projectile-lighting.ts'),import('/src/weapon-tuning.ts'),
  ]);
  const scene=new T.Scene(),weapon=new OriginalWeapon(scene);await weapon.loaded;
  if(!weapon.ready)throw Error(weapon.error);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,720);
  renderer.setClearColor(0x030508);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;document.body.append(renderer.domElement);
  const camera=new T.PerspectiveCamera(48,1280/720,.05,100);camera.position.set(0,0,0);
  const key=new T.DirectionalLight(0xdceaff,4);key.position.set(-3,5,4);scene.add(key);
  const fill=new T.HemisphereLight(0x7184b4,0x21101a,1.3);scene.add(fill);
  const world=new World(91,{schedule:false});
  world.projectiles=[
   {id:1,level:1,homing:false,pos:v(-1.05,.22,-3.8),vel:v(30,7,-30),age:1},
   {id:2,level:3,homing:true,pos:v(0,.22,-3.8),vel:v(30,7,-30),age:1},
   {id:3,level:4,homing:true,pos:v(1.05,.22,-3.8),vel:v(30,7,-30),age:1},
   {id:4,level:4,homing:false,kind:'shotgun',pos:v(-.7,-.6,-4),vel:v(20,5,-35),age:1},
   {id:5,level:7,homing:true,pos:v(.7,-.6,-4),vel:v(20,5,-35),age:1},
  ];
  weapon.update(world,0,false);
  const read=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(1280*720*4);gl.readPixels(0,0,1280,720,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
  const lit=read();key.intensity=fill.intensity=0;const dark=read();let response=0,visible=0;
  for(let i=0;i<lit.length;i+=4){response+=Math.abs(lit[i]-dark[i])+Math.abs(lit[i+1]-dark[i+1])+Math.abs(lit[i+2]-dark[i+2]);if(dark[i]>30||dark[i+1]>30||dark[i+2]>30)visible++;}
  key.intensity=4;fill.intensity=1.3;
  const lighting=new ProjectileLighting(scene,new T.MeshBasicMaterial());lighting.update(world,false,1,720);read();
  window.projectileMaterialFixture={renderer,scene,camera,weapon,world,lighting,read,T,v};
  return {lightResponse:response,selfLitPixels:visible,materialsLit:weapon.daggers.every(b=>b.material.isMeshStandardMaterial),count:weapon.projectileDiagnostics.count,clearance:PROJECTILE_HAND_CLEARANCE};
 });
 assert.ok(result.lightResponse>10000,JSON.stringify(result));assert.ok(result.selfLitPixels>500,JSON.stringify(result));assert.ok(result.materialsLit);assert.equal(result.count,5);
 await mkdir('artifacts/projectile-polish',{recursive:true});
 await page.locator('canvas').screenshot({path:'artifacts/projectile-polish/blades.png'});
 const shotgun=await page.evaluate(async()=>{
  const {weapon,lighting,read,T}=window.projectileMaterialFixture;
  const [{World,idleInput,STEP},{projectileVisualIndex}]=await Promise.all([import('/src/simulation.ts'),import('/src/projectile-presentation.ts')]);
  const world=new World(7,{schedule:false});window.projectileMaterialFixture.world=world;
  world.player.pos={x:0,y:0,z:0};world.level=4;world.shoot(idleInput(),true,false);
  for(let i=0;i<14;i++)world.updateProjectiles(STEP);
  weapon.update(world,0,false);lighting.update(world,false,1,720);read();
  const cursors=new Map(),colors=new Set();let maxColorError=0;
  for(let i=0;i<world.projectiles.length;i++){
   const p=world.projectiles[i],style=projectileVisualIndex(p,world.level),slot=cursors.get(style)??0;cursors.set(style,slot+1);
   const mesh=weapon.daggers[style].instanceColor,glow=lighting.glow.geometry.getAttribute('shotColor');
   const a=[mesh.getX(slot),mesh.getY(slot),mesh.getZ(slot)],b=[glow.getX(i),glow.getY(i),glow.getZ(i)];
   colors.add(a.join(','));maxColorError=Math.max(maxColorError,...a.map((c,j)=>Math.abs(c-b[j])));
  }
  const primary=weapon.daggers[0].geometry,pellet=weapon.daggers[12].geometry;
  primary.computeBoundingBox();pellet.computeBoundingBox();
  const a=primary.boundingBox.getSize(new T.Vector3()),b=pellet.boundingBox.getSize(new T.Vector3());
  return {pellets:world.projectiles.length,colors:colors.size,maxColorError,widthRatio:b.x/a.x,lengthRatio:b.z/a.z};
 });
 assert.equal(shotgun.colors,8);assert.equal(shotgun.maxColorError,0);assert.ok(shotgun.widthRatio>1.29&&shotgun.lengthRatio>1.29);
 await page.locator('canvas').screenshot({path:'artifacts/projectile-polish/shotgun-rainbow.png'});
 const clearance=await page.evaluate(()=>{
  const {world,weapon,lighting,read,v}=window.projectileMaterialFixture;
  world.projectiles=[{id:1,level:1,homing:false,pos:v(0,0,-.65),vel:v(0,0,-70),age:0}];weapon.update(world,0,false);lighting.update(world,false,1,720);
  const near=read();world.projectiles=[];weapon.update(world,0,false);lighting.update(world,false,1,720);const empty=read();
  return near.every((value,i)=>value===empty[i]);
 });
 assert.ok(clearance,'launch geometry and glow stay clear of the fingers');assert.deepEqual(errors,[]);
 await writeFile('artifacts/projectile-polish/report.json',JSON.stringify({...result,shotgun,clearance,errors},null,2)+'\n');
 console.log('Projectile materials passed',JSON.stringify({...result,shotgun,clearance}));
}finally{await browser.close();}
