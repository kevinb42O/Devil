import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
  const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
  const report=await page.evaluate(async()=>{
    const [{AbyssSky},THREE]=await Promise.all([import('/src/sky.ts'),import('/node_modules/three/build/three.module.js')]);
    const renderer=new THREE.WebGLRenderer(),camera=new THREE.PerspectiveCamera(90,1.6,.1,200),scene=new THREE.Scene(),sky=new AbyssSky();
    await sky.ready;renderer.setSize(960,600);scene.add(sky.mesh);sky.configure('high');
    const gl=renderer.getContext(),pixels=new Uint8Array(960*600*4);
    const read=time=>{sky.update(camera,time);renderer.render(scene,camera);gl.readPixels(0,0,960,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);};
    const elevation=()=>{
      let sum=0,weighted=0;
      // Broad light distribution, with single star outliers capped.
      for(let y=300;y<590;y++)for(let x=360;x<600;x++){
        const i=(y*960+x)*4,w=Math.min(45,pixels[i]+pixels[i+1]+pixels[i+2]);
        sum+=w;weighted+=w*y;
      }
      return weighted/sum;
    };
    const motion=[0,10,21].map(time=>{read(time);return {time,elevation:elevation()};});
    camera.rotation.x=Math.PI/2;read(0);
    let top=0;for(let y=260;y<340;y++)for(let x=440;x<520;x++){const i=(y*960+x)*4;top+=pixels[i]+pixels[i+1]+pixels[i+2];}
    const overheadMean=top/(80*80*3);
    camera.rotation.x=0;sky.configure('high','reduced');read(0);const reducedA=elevation();read(21);const reducedB=elevation();
    renderer.dispose();sky.mesh.geometry.dispose();sky.mesh.material.dispose();
    return {motion,overheadMean,reducedA,reducedB};
  });
  assert.deepEqual(errors,[]);
  for(let i=1;i<report.motion.length;i++)assert.ok(report.motion[i].elevation>report.motion[i-1].elevation+3,'galactic structures rise in rendered screen space as the platform descends');
  assert.ok(report.overheadMean<1,'overhead vacuum is black, with only sparse stars');
  assert.equal(report.reducedA,report.reducedB,'reduced motion stops vertical travel');
  await writeFile('artifacts/cosmic-descent/direction.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
