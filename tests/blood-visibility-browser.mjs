import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.env.BLOOD_VISIBILITY_LABEL||'current',directory=`artifacts/blood-visibility/${label}`;await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/');
 await page.evaluate(async()=>{
  const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true});world.player.pos=v(0,4,3.7);window.visibility={world,renderer,v};
 });
 const reports=[];
 for(const [name,base,quality]of [['cosmic',5,'high'],['unlit',480,'high'],['unlit-low',480,'low']]){
  const report=await page.evaluate(({base,quality})=>{
   const {world,renderer,v}=visibility;renderer.clear();renderer.configure({quality,fov:75});world.time=base;
   renderer.blood.effect({kind:'kill',bloodId:777,enemyId:1,pos:v(0,3,0),amount:.65,direction:v(.35,.05,-1)},world);world.time=base+.15;
   const render=()=>{renderer.render(world,0,-.25,0,false);const gl=renderer.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,w:gl.drawingBufferWidth,h:gl.drawingBufferHeight};};
   const {droplets,spray}=renderer.blood;droplets.visible=spray.visible=false;const background=render();droplets.visible=spray.visible=true;const frame=render();
   let changed=0,red=0,brightRedPixels=0,contrast=0;
   for(let y=Math.floor(frame.h*.32);y<frame.h*.72;y++)for(let x=Math.floor(frame.w*.36);x<frame.w*.64;x++){
    const i=(y*frame.w+x)*4,r=frame.pixels[i],g=frame.pixels[i+1],b=frame.pixels[i+2];
    const delta=Math.abs(r-background.pixels[i])+Math.abs(g-background.pixels[i+1])+Math.abs(b-background.pixels[i+2]);
    if(delta<6)continue;changed++;red+=r;contrast+=delta/3;
    if(r>75&&r>g*1.5&&r>b*1.25)brightRedPixels++;
   }
   return {changed,meanRed:red/Math.max(1,changed),brightRedPixels,meanContrast:contrast/Math.max(1,changed),...renderer.blood.diagnostics};
  },{base,quality});
  assert.ok(report.changed>20,'airborne blood is present');
  if(label!=='before'&&name.startsWith('unlit')){
   assert.ok(report.meanRed>70,'red liquid body must remain readable in the Unlit Depth');
   assert.ok(report.brightRedPixels>2000,'the burst must have substantial visible red area');
  }
  await page.screenshot({path:`${directory}/${name}.png`});reports.push({name,...report});
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/audit.json`,JSON.stringify({reports,errors},null,2)+'\n');console.log(JSON.stringify({reports,errors}));
}finally{await browser.close();}
