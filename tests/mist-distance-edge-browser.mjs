import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const errors=[];
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 const results=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {OpeningMist}=await import('/src/opening-mist.ts');
  const renderer=new THREE.WebGLRenderer(),mist=new OpeningMist();
  // Constant integrated mist must remain constant when reconstructed over a
  // perspective floor. Only the depth weights vary, isolating distant seams.
  const fog=new THREE.DataTexture(new Float32Array([.1,.12,.15,.7]),1,1,THREE.RGBAFormat,THREE.FloatType);
  fog.needsUpdate=true;
  const surface=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);surface.needsUpdate=true;
  const read={texture:surface},pass=mist.composite,near=.05,far=180,results=[];
  pass.uniforms.volume.value=fog;pass.uniforms.nearFar.value.set(near,far);pass.renderToScreen=true;
  for(const [width,height] of [[1280,720],[853,479]])for(const eyeHeight of [1.7,8]){
   renderer.setSize(width,height);mist.setSize(width,height);
   const data=new Float32Array(width*height*4);
   for(let y=0;y<height;y++){
    // Horizontal rays reach the far plane; the floor approaches it rapidly.
    const distance=Math.min(far,eyeHeight*height/Math.max(1,height/2-y));
    const depth=(far-near*far/distance)/(far-near);
    for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=depth;data[i+3]=1;}
   }
   const depth=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);depth.needsUpdate=true;
   pass.uniforms.sceneDepth.value=depth;pass.render(renderer,null,read,0,false);
   const gl=renderer.getContext(),pixels=new Uint8Array(width*height*4);
   gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let maxDeviation=0,blackPixels=0;
   for(let i=0;i<pixels.length;i+=4){
    if(pixels[i]===0)blackPixels++;
    for(let channel=0;channel<3;channel++)maxDeviation=Math.max(maxDeviation,Math.abs(pixels[i+channel]-[26,31,38][channel]));
   }
   results.push({width,height,eyeHeight,maxDeviation,blackPixels,glError:gl.getError()});depth.dispose();
  }
  fog.dispose();surface.dispose();mist.dispose();renderer.dispose();return results;
 });
 for(const row of results){
  assert.equal(row.glError,0);
  assert.equal(row.blackPixels,0,`mist must not disappear at a distance: ${JSON.stringify(row)}`);
  assert.ok(row.maxDeviation<=1,`depth reconstruction must preserve constant mist: ${JSON.stringify(row)}`);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
