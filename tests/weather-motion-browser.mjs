import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/weather-motion-fixture',route=>route.fulfill({contentType:'text/html',body:'<html><head><link rel="icon" href="data:,"></head><body style="margin:0;background:#000"></body></html>'}));
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/weather-motion-fixture');
  const result=await page.evaluate(async depth=>{
    const [{AbyssSky},THREE]=await Promise.all([import('/src/sky.ts'),import('/node_modules/three/build/three.module.js')]);
    const sky=new AbyssSky();await sky.ready;const r=new THREE.WebGLRenderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(90,1.6,.1,200);
    r.setSize(640,400);scene.add(sky.mesh);const gl=r.getContext();
    const capture=time=>{sky.update(camera,time);r.render(scene,camera);const p=new Uint8Array(640*400*4);gl.readPixels(0,0,640,400,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    const motion=[];
    for(const [start,end] of (depth?[[259,289],[380,410]]:[[30,45],[69,100]])){
      const a=capture(start),b=capture(end);let bestShift=0,bestError=Infinity;
      for(let shift=-25;shift<=25;shift++){
        let error=0;
        for(let y=70;y<330;y+=4)for(let x=100;x<540;x+=4)error+=Math.abs(a[(y*640+x)*4+1]-b[((y+shift)*640+x)*4+1]);
        if(error<bestError){bestError=error;bestShift=shift;}
      }
      motion.push({start,end,bestShift,bestError});
    }
    sky.configure('low','reduced');const a=capture(depth?380:30),b=capture(depth?410:45);let reducedDifference=0;
    for(let i=0;i<a.length;i++)reducedDifference+=Math.abs(a[i]-b[i]);
    r.setSize(641,401);camera.aspect=641/401;camera.updateProjectionMatrix();
    const point=(time,yaw,pitch=0)=>{camera.rotation.set(pitch,yaw,0,'YXZ');sky.update(camera,time);r.render(scene,camera);const p=new Uint8Array(4);gl.readPixels(320,200,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
    const wraps=(depth?[289,380]:[30,69]).map(time=>({time,left:point(time,Math.PI/2-.0001),right:point(time,Math.PI/2+.0001)}));
    const poles={top:point(depth?380:69,0,Math.PI/2),bottom:point(depth?380:69,0,-Math.PI/2)};
    sky.mesh.material.dispose();sky.mesh.geometry.dispose();r.dispose();
    return {motion,reducedDifference,wraps,poles};
  },!!process.env.DEPTH_SKY_AUDIT);
  for(const row of result.motion)assert.ok(row.bestShift>0,'cloud structures move upward in bottom-origin screen coordinates');
  assert.equal(result.reducedDifference,0);
  for(const row of result.wraps)assert.ok(row.left.slice(0,3).every((value,i)=>Math.abs(value-row.right[i])<3),'continuous left/right panorama wrap: '+JSON.stringify(row));
  if(process.env.DEPTH_SKY_AUDIT)assert.ok(result.poles.top.slice(0,3).every(value=>value<2),'dark cathedral zenith has no flat purple cap');
  assert.deepEqual(errors,[]);
  await writeFile((process.env.DEPTH_SKY_AUDIT?'artifacts/depth-skies':'artifacts/weather-skies')+'/motion.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
