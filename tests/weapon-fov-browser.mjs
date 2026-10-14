import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Weapon FOV regression</title>'}));
 await page.goto(url);
 const result=await page.evaluate(async()=>{
  const [T,{World},{OriginalWeapon}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/original-weapon.ts')]);
  const weapon=new OriginalWeapon(new T.Scene());await weapon.loaded;if(!weapon.ready)throw Error(weapon.error);
  const world=new World(1,{schedule:false}),camera=new T.PerspectiveCamera(90,16/9,.05,100);
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setClearColor(0);
  const checks=[],screenshots=[];
  for(const [width,height] of [[640,360],[640,480],[360,640]]){
   renderer.setSize(width,height);weapon.resize(width,height);camera.aspect=width/height;
   const pixels=new Uint8Array(width*height*4);let baseline;
   for(let level=1;level<=4;level++)for(const fov of [90,75,115,145]){
    world.level=level;camera.fov=fov;camera.updateProjectionMatrix();weapon.update(world,0,false,camera);
    renderer.clear();weapon.render(renderer,false);
    const gl=renderer.getContext();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    if(fov===90)baseline=pixels.slice();
    else if(!pixels.every((v,i)=>v===baseline[i]))throw Error(`Arm framing changed at FOV ${fov}, level ${level}, ${width}x${height}`);
    let bottom=0;for(let x=0;x<width;x++){const i=x*4;if(pixels[i]+pixels[i+1]+pixels[i+2]>0)bottom++;}
    if(!bottom)throw Error(`Arm detached from bottom edge at FOV ${fov}, level ${level}, ${width}x${height}`);
    if(camera.fov!==fov||weapon.handCamera.fov!==90||weapon.handCamera.aspect!==camera.aspect)throw Error('World and arm camera settings incorrect');
    checks.push({width,height,level,fov,bottomPixels:bottom});
    if(fov===145&&level===1&&width===640&&height===360)screenshots.push(renderer.domElement.toDataURL());
   }
  }
  renderer.dispose();return {checks,screenshots};
 });
 assert.deepEqual(errors,[]);
 await mkdir('test-results/weapon-fov',{recursive:true});
 await writeFile('test-results/weapon-fov/arm-145.png',Buffer.from(result.screenshots[0].split(',')[1],'base64'));
 console.log('Weapon FOV checks passed:',result.checks.length,'rendered cases; all arms touch the bottom edge and retain identical framing.');
}finally{await browser.close();}
