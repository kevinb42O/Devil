import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer},{floorHeight},THREE]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/arena.ts'),import('/node_modules/.vite/deps/three.js')]);
  const canvas=document.createElement('canvas');canvas.id='gem-test';canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);const renderer=new GameRenderer(canvas,{quality:'low',fov:90});await Promise.all([renderer.originalEnemies.loaded,renderer.originalWeapon.loaded]);
  const world=new World(1,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,0);world.dropGems(v(-3,.55,-7),1);world.dropGems(v(2,.55,-8),1);world.dropGems(v(0,.55,-11),1);world.gems.forEach(g=>{g.vel=v();});window.gemFixture={renderer,world,floorHeight,THREE};
 });
 for(const quality of ['low','high']){
  const result=await page.evaluate(quality=>{
   const {world,renderer,floorHeight,THREE}=window.gemFixture;renderer.configure({quality,fov:90});
   const sample=()=>{const gl=renderer.renderer.getContext(),point=new THREE.Vector3(-1.5,floorHeight(-1.5,-7,0),-7).project(renderer.camera),pixel=new Uint8Array(4);gl.readPixels(Math.round((point.x+1)*.5*gl.drawingBufferWidth),Math.round((point.y+1)*.5*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];};
   const gems=world.gems;world.gems=[];renderer.render(world,0,0,0,false);const dark=sample();world.gems=gems;renderer.render(world,0,0,0,false);const lit=sample();
   const matrix=new THREE.Matrix4();renderer.gemMesh.getMatrixAt(0,matrix);const scale=new THREE.Vector3();matrix.decompose(new THREE.Vector3(),new THREE.Quaternion(),scale);
   return{dark,lit,size:scale.x,halos:renderer.gemLighting.halo.count};
  },quality);
  assert.ok(result.lit[0]>result.dark[0]+10,JSON.stringify(result));assert.ok(Math.abs(result.size-1.4)<1e-5);assert.equal(result.halos,3);await page.locator('#gem-test').screenshot({path:`artifacts/gems-light-${quality}.png`});console.log('Gem browser',quality,JSON.stringify(result));
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
