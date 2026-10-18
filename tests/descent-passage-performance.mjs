import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/artifacts/descent/preview.html');await page.waitForFunction(()=>!!window.descentPreview,{},{polling:100,timeout:60000});
 const report=await page.evaluate(()=>{
  const {renderer:r,setTime}=window.descentPreview,gl=r.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const cases=[],probe=new Uint8Array(4);
  const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
  for(const quality of ['high','low'])for(const time of [8,64,410]){
   r.configure({quality,fov:90,skyMotion:'full',mist:true});setTime(time);
   const samples={on:[],off:[]};
   for(let i=0;i<20;i++)for(const enabled of (i%2?[false,true]:[true,false])){
    r.descentPassage.group.visible=enabled;gl.finish();const start=performance.now();r.composer.render();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,probe);gl.finish();
    if(i>=6)samples[enabled?'on':'off'].push(performance.now()-start);
   }
   const on=median(samples.on),off=median(samples.off);cases.push({quality,time,onMs:on,offMs:off,overheadMs:on-off});
  }
  return {gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],cases};
 });
 await mkdir('artifacts/descent-passage',{recursive:true});await writeFile('artifacts/descent-passage/performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
