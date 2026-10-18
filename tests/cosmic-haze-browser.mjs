import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/cosmic-haze';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v},THREE]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/three/build/three.module.js')]);
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
  const r=new GameRenderer(canvas,{quality:'high',fov:85,mist:true});await r.prepare();
  const w=new World(17,{schedule:false,invulnerable:true});w.player.pos=v(0,2,7);
  for(const [kind,x,y,z]of [['squid',-9,3.3,-12],['skull',-3,3,-6],['skull2',5,6,-9]]){const e=w.spawn(kind,v(x,y,z));e.age=10;}w.effects=[];
  const gl=r.renderer.getContext();
  const read=()=>{const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
  const volume=()=>{const target=r.openingMist.volumeTarget,pixels=new Uint16Array(target.width*target.height*4);r.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);return Array.from(pixels,THREE.DataUtils.fromHalfFloat);};
  window.haze={r,w,read,volume,gl};
  window.drawHaze=(time,yaw=0,pitch=-.12)=>{w.time=time;r.render(w,yaw,pitch,0,false);return read();};
 });
 for(const [name,time,yaw,pitch]of [['arrival',0,0,-.12],['banks',8,0,-.12],['rising',16,0,-.12],['overhead',16,-.4,.65],['passing',21,0,-.12],['transition',26,0,-.12],['side',12,.8,.1]]){
  await page.evaluate(({time,yaw,pitch})=>drawHaze(time,yaw,pitch),{time,yaw,pitch});await page.screenshot({path:`${dir}/${name}.png`});
 }
 for(const [name,z]of [['walk-before',7],['walk-enter',3],['walk-inside',-1],['walk-through',-5]]){
  await page.evaluate(z=>{haze.w.player.pos.z=z;drawHaze(8);},z);await page.screenshot({path:`${dir}/${name}.png`});
 }
 await page.evaluate(()=>{haze.w.player.pos.z=7;});
 const result=await page.evaluate(async()=>{
  const {r,w,read,volume,gl}=haze,diff=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
  const on=drawHaze(8),paused=drawHaze(8),motion=drawHaze(9);drawHaze(24);const rewind=drawHaze(8);
  r.openingMist.uniforms.cosmicGroundAmount.value=0;r.composer.render();r.originalWeapon.render(r.renderer,false);const floorOff=read();r.openingMist.uniforms.cosmicGroundAmount.value=1;
  let cyanFloor=0,violetFloor=0,floorChange=0,floorChannels=0;const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
  for(let y=0;y<height*.62;y++)for(let x=0;x<width*.6;x++){
   const i=(y*width+x)*4,red=on[i]-floorOff[i],green=on[i+1]-floorOff[i+1],blue=on[i+2]-floorOff[i+2];
   if(green>2&&green>red&&on[i+2]>on[i]*1.2)cyanFloor++;if(red>2&&red>green&&on[i+2]>on[i+1]*1.2)violetFloor++;
   floorChange+=Math.abs(red)+Math.abs(green)+Math.abs(blue);floorChannels+=3;
  }
  drawHaze(8);const field=volume(),opacity=[],light=[];
  for(let i=0;i<field.length;i+=4){opacity.push(1-field[i+3]);if(field[i+3]<.98)light.push(field[i]+field[i+1]+field[i+2]);}
  opacity.sort((a,b)=>a-b);light.sort((a,b)=>a-b);
  const quantile=(a,p)=>a[Math.floor((a.length-1)*p)];
  r.openingMist.enabled=false;r.composer.render();r.originalWeapon.render(r.renderer,false);const off=read();
  const nearOcclusion=(()=>{let sum=0,count=0;const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;for(let y=0;y<height*.15;y++)for(let x=width*.35;x<width*.65;x++){const i=(y*width+Math.floor(x))*4;for(let c=0;c<3;c++)sum+=Math.abs(on[i+c]-off[i+c]);count+=3;}return sum/count;})();
  const stats=a=>{if(!a.length)return null;a.sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],samples:a.length};};
  const timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),performanceRows=[];
  for(const quality of ['high','low']){
   r.configure({quality,fov:85});drawHaze(8);const wall={off:[],on:[]},gpu={off:[],on:[]};
   for(let i=0;i<22;i++)for(const mode of i%2?['on','off']:['off','on']){
    r.openingMist.enabled=mode==='on';const q=timer&&gl.createQuery();if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
    const start=performance.now();r.composer.render();if(q)gl.endQuery(timer.TIME_ELAPSED_EXT);gl.finish();const elapsed=performance.now()-start;
    if(i>=8)wall[mode].push(elapsed);
    if(q){for(let wait=0;wait<30&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);wait++)await new Promise(resolve=>setTimeout(resolve,1));if(i>=8&&gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(timer.GPU_DISJOINT_EXT))gpu[mode].push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
   }
   performanceRows.push({quality,diagnostics:r.openingMist.diagnostics,offGpuMs:stats(gpu.off),onGpuMs:stats(gpu.on),offFencedMs:stats(wall.off),onFencedMs:stats(wall.on)});
  }
  r.configure({quality:'high',fov:85,skyMotion:'reduced'});drawHaze(8);r.openingMist.uniforms.litMedium.value=0;r.composer.render();const reducedA=volume();
  // Hold collapsing tile heights fixed with the rest of the scene while isolating atmospheric motion.
  const ground=r.openingMist.uniforms.nebulaGround.value,fixedGround=ground.image.data.slice();
  r.openingMist.update(r.camera,16);ground.image.data.set(fixedGround);ground.needsUpdate=true;r.composer.render();const reducedB=volume();
  r.openingMist.update(r.camera,90);const later=r.openingMist.diagnostics;
  // A uniform bank and a depth-writing wall isolate optical path length from
  // sky, noise and gameplay motion. Even 40 cm from the wall must contain fog.
  const [{OpeningMist},{descentDistance},THREE,{ARENA_TILES,ARENA_DIMENSION,tileHeight}]=await Promise.all([import('/src/opening-mist.ts'),import('/src/descent-motion.ts'),import('/node_modules/three/build/three.module.js'),import('/src/arena.ts')]);
  const mist=new OpeningMist();mist.configure('high',false);mist.setSize(128,128);
  const camera=new THREE.PerspectiveCamera(85,1,.05,180);camera.position.y=2;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x222222);
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial());scene.add(wall);
  const target=new THREE.WebGLRenderTarget(128,128,{depthTexture:new THREE.DepthTexture(128,128)});
  const output=new THREE.WebGLRenderTarget(128,128);
  mist.uniforms.densityField.value.image.data.fill(166);mist.uniforms.densityField.value.needsUpdate=true;
  const opticalPaths=[];
  for(const distance of [.4,1,4,8]){
   camera.position.z=distance;camera.updateMatrixWorld();mist.update(camera,8);
   mist.uniforms.nebulaGround.value.image.data.fill(0);mist.uniforms.nebulaGround.value.needsUpdate=true;
   r.renderer.setRenderTarget(target);r.renderer.render(scene,camera);
   mist.uniforms.cosmicGroundAmount.value=0;mist.render(r.renderer,output,target,0,false);
   const sample=()=>{const p=new Uint16Array(4);r.renderer.readRenderTargetPixels(mist.volumeTarget,16,16,1,1,p);return THREE.DataUtils.fromHalfFloat(p[3]);};
   const background=sample();mist.uniforms.cosmicGroundAmount.value=1;mist.render(r.renderer,output,target,0,false);
   opticalPaths.push({distance,opacity:1-sample()/background});
  }
  mist.update(camera,8.1);mist.update(camera,8.2);
  const heights=mist.uniforms.nebulaGround.value.image.data;
  const groundError=Math.max(...ARENA_TILES.map(tile=>Math.abs(heights[tile.z*ARENA_DIMENSION+tile.x]-Math.fround(tileHeight(tile.x,tile.z,8.2)))));
  mist.update(camera,.1);const fallAtRelease=mist.uniforms.cosmicFall.value;
  mist.update(camera,8);const fallAtSpeed=mist.uniforms.cosmicFall.value;
  mist.configure('high',true);mist.update(camera,16);const reducedFall=mist.uniforms.cosmicFall.value;
  target.dispose();output.dispose();wall.geometry.dispose();wall.material.dispose();mist.dispose();
  const fall={release:fallAtRelease,atSpeed:fallAtSpeed,expected:descentDistance(8),reduced:reducedFall};
  return {opticalPaths,fall,groundError,floorClouds:{cyanPixels:cyanFloor,violetPixels:violetFloor,meanDifference:floorChange/floorChannels},difference:diff(on,off),motion:diff(on,motion),paused:diff(on,paused),rewind:diff(on,rewind),reducedDifference:diff(reducedA,reducedB),nearOcclusion,opacity:{p10:quantile(opacity,.1),p50:quantile(opacity,.5),p95:quantile(opacity,.95)},cloudLight:{p10:quantile(light,.1),p90:quantile(light,.9)},later,performance:performanceRows,timerQueries:!!timer,glError:gl.getError()};
 });
 writeFileSync(`${dir}/report.json`,JSON.stringify({...result,errors},null,2));
 console.log(JSON.stringify(result,null,2));
 assert.ok(result.opticalPaths[0].opacity>.005,'fog persists within 40 cm of the eye');
 for(let i=1;i<result.opticalPaths.length;i++)assert.ok(result.opticalPaths[i].opacity>result.opticalPaths[i-1].opacity,'fog optical depth grows continuously with path length');
 assert.equal(result.groundError,0,'fog tracks tile heights between quarter-second boundaries');
 assert.equal(result.fall.atSpeed,result.fall.expected);assert.ok(result.fall.release>0&&result.fall.release<.02);assert.equal(result.fall.reduced,0);
 assert.ok(result.difference>1,'haze visibly changes the scene');assert.ok(result.motion>.1);assert.equal(result.paused,0);assert.equal(result.rewind,0);assert.equal(result.reducedDifference,0);assert.ok(result.floorClouds.meanDifference>.1&&result.floorClouds.meanDifference<8,'field clouds remain subtle');assert.ok(result.floorClouds.cyanPixels>100,'cyan clouds reach the field');assert.ok(result.floorClouds.violetPixels>100,'violet clouds reach the field');assert.ok(result.opacity.p95-result.opacity.p10>.15,'cloud banks leave clear gaps');assert.ok(result.cloudLight.p90>result.cloudLight.p10*2,'illumination varies through the cloud');assert.equal(result.later.cosmic,0);assert.equal(result.later.steps,40);assert.equal(result.glError,0);assert.deepEqual(errors,[]);
}finally{await browser.close();}
