import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');console.log('Page loaded');
  await page.evaluate(async()=>{
    const [{GameRenderer},{World,v}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
    const canvas=document.body.appendChild(document.createElement('canvas'));canvas.style.cssText='position:fixed;inset:0;z-index:99999';
    const r=new GameRenderer(canvas,{quality:'high',fov:90});await r.prepare();
    const w=new World(17,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,9);
    for(const [kind,x,y,z] of [['squid',-8,3.3,-12],['spider',8,2,-9],['skull',-3,3,-5],['skull2',5,5,-9]]){
      const e=w.spawn(kind,v(x,y,z));e.pos=v(x,y,z);e.age=20;e.headExposure=.7;
    }
    w.effects=[];
    const gl=r.renderer.getContext(),read=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    window.nebulaFixture={r,w,read};
  });
  console.log('Renderer prepared');
  await mkdir('artifacts/cosmic-descent',{recursive:true});const frames=[];
  for(const time of [0,8,16,21,25,30]){
    const result=await page.evaluate(time=>{
      const {r,w,read}=window.nebulaFixture;w.time=time;r.render(w,0,0,0,false);const on=read(),mist=r.openingMist.diagnostics;
      r.openingMist.enabled=false;r.composer.render();r.originalWeapon.render(r.renderer,false);const off=read();
      let difference=0;for(let i=0;i<on.length;i+=4)for(let c=0;c<3;c++)difference+=Math.abs(on[i+c]-off[i+c]);
      r.render(w,0,0,0,false);let red=0,blue=0,n=0;
      const width=r.renderer.getContext().drawingBufferWidth;
      for(let y=40;y<140;y++)for(let x=200;x<420;x++){const i=(y*width+x)*4;red+=on[i];blue+=on[i+2];n++;}
      return {time,mist,floorRed:red/n,floorBlue:blue/n,volumeDifference:difference/(on.length*.75)};
    },time);
    assert.ok(result.volumeDifference>.2,'nebula must actually contribute to the rendered image');
    frames.push(result);await page.screenshot({path:`artifacts/cosmic-descent/nebula-${time}.png`});
  }
  assert.ok(frames[0].floorBlue>frames[0].floorRed*1.25,'the actual stone receives cold space light');
  const volumeMotion=await page.evaluate(()=>{
    const {r,w,read}=window.nebulaFixture,rows=[];
    for(const time of [0,8,16]){
      w.time=time;r.render(w,0,0,0,false);
      const meshes=[];r.scene.traverse(node=>{if(node.isMesh){meshes.push([node,node.visible]);node.visible=false;}});
      r.openingMist.uniforms.litMedium.value=0;r.composer.render();const pixels=read();
      let sum=0,weighted=0;const width=r.renderer.getContext().drawingBufferWidth,height=r.renderer.getContext().drawingBufferHeight;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,weight=pixels[i]+pixels[i+1]+pixels[i+2];sum+=weight;weighted+=weight*y;}
      meshes.forEach(([node,visible])=>node.visible=visible);rows.push({time,elevation:weighted/sum});
    }
    return rows;
  });
  for(let i=1;i<volumeMotion.length;i++)assert.ok(volumeMotion[i].elevation>volumeMotion[i-1].elevation+5,'foreground nebula rises in the rendered volume');
  await page.evaluate(()=>{const {r,w}=window.nebulaFixture;w.time=8;r.render(w,0,.8,0,false);});
  await page.screenshot({path:'artifacts/cosmic-descent/nebula-up.png'});
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/cosmic-descent/nebula.json',JSON.stringify({frames,volumeMotion,errors},null,2));
  console.log(JSON.stringify(frames.map(({time,volumeDifference})=>({time,volumeDifference})),null,2));
}finally{await browser.close();}
