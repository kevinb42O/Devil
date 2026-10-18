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
 const result=await page.evaluate(async()=>{
  const [THREE,{OpeningMist},{descentDistance}]=await Promise.all([
   import('/node_modules/three/build/three.module.js'),import('/src/opening-mist.ts'),import('/src/descent-motion.ts')]);
  const mist=new OpeningMist(),renderer=new THREE.WebGLRenderer();renderer.setSize(128,64);
  // Sample the production floor-density shader directly. This isolates ground
  // attachment from the surrounding nebula, camera, and optical integration.
  const fragment=mist.material.fragmentShader.split('vec3 cosmicGas')[0]+`
   uniform float testGround;
   void main(){
    vec3 p=vec3((uvScreen.x-.5)*60.,testGround+uvScreen.y*11.-.5,-7.);
    mistColor=vec4(cosmicFloorCloud(p),1.);
   }`;
  const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,
   uniforms:{...mist.uniforms,testGround:{value:0}},vertexShader:mist.material.vertexShader,fragmentShader:fragment});
  const scene=new THREE.Scene(),camera=new THREE.Camera(),geometry=new THREE.PlaneGeometry(2,2);
  scene.add(new THREE.Mesh(geometry,material));
  const render=(fall,ground=0,time=8)=>{
   material.uniforms.cosmicFall.value=fall;material.uniforms.cosmicTime.value=time;material.uniforms.testGround.value=ground;
   const texture=material.uniforms.nebulaGround.value;texture.image.data.fill(ground);texture.needsUpdate=true;
   renderer.render(scene,camera);
   const gl=renderer.getContext(),pixels=new Uint8Array(128*64*4);gl.readPixels(0,0,128,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  };
  const diff=(a,b)=>a.reduce((sum,n,i)=>sum+Math.abs(n-b[i]),0)/a.length;
  const base=render(0),fallDifference=diff(base,render(descentDistance(20)));
  const tileDifference=diff(base,render(0,-2));
  const lateralMotion=diff(base,render(0,0,16));
  let density=0,overheadDensity=0,overheadSamples=0;
  for(let y=0;y<64;y++)for(let x=0;x<128;x++){
   const value=base[(y*128+x)*4],height=(y+.5)/64*11.-.5;density+=value;
   if(height>=4&&height<=7){overheadDensity+=value;overheadSamples++;}
  }
  const glError=renderer.getContext().getError();
  geometry.dispose();material.dispose();mist.dispose();renderer.dispose();
  return {fallDifference,tileDifference,lateralMotion,density,overheadDensity:overheadDensity/overheadSamples,glError};
 });
 assert.deepEqual(errors,[]);assert.equal(result.glError,0);
 assert.ok(result.density>0,'the sampled ground mist must be visible');
 assert.ok(result.overheadDensity>40,'thick banks must extend well above player height');
 assert.equal(result.fallDifference,0,'space descent must not lift the ground mist');
 assert.equal(result.tileDifference,0,'mist must follow the tile at the same local height');
 assert.ok(result.lateralMotion>0,'ground mist retains gentle sideways motion');
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
