import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/blood-weather';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/blood-weather-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/blood-weather-test');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v},{floorHeight}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/arena.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:65,mist:false,screenShake:0,movementMotion:0});await renderer.prepare();
  const world=new World(42,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,8);
  const render=()=>renderer.render(world,0,-.9,1/60,false,1,v(0,6,4.5));
  const fill=born=>{
   renderer.clear();world.time=born;
   for(let i=0;i<12;i++)renderer.blood.effect({kind:'kill',enemyId:1,bloodId:i+1,pos:v((i%4-1.5)*.6,floorHeight(0,0,born,0)+.4,(Math.floor(i/4)-1)*.6),amount:2},world);
   renderer.blood.advance(born+2);world.time=born+2;
  };
  window.fixture={renderer,world,render,fill,v};fill(45);
 });
 const rain=[];
 for(const time of [50,72,92,144,200]){
  const report=await page.evaluate(time=>{
   const {renderer,world,render}=fixture;world.time=time;render();const field=renderer.blood.field;
   let covered=0,max=0,total=0;for(let z=-2;z<=2;z+=.08)for(let x=-2;x<=2;x+=.08){const c=field.coverageAt(x,z);total+=c;if(c>.05)covered++;max=Math.max(max,c);}
   return {time,covered,max,total,body:renderer.blood.handBlood.sample(world)};
  },time);rain.push(report);await page.screenshot({path:`${directory}/rain-${time}.png`});
 }
 assert.ok(rain[0].covered>500);assert.ok(rain[2].total<rain[0].total*.2);assert.equal(rain[3].covered,0);assert.equal(rain[4].covered,0);
 await page.evaluate(()=>{fixture.fill(303);fixture.world.time=305;});
 const fire=[];
 for(const enabled of [false,true]){
  const report=await page.evaluate(enabled=>{
   const {renderer,render}=fixture;renderer.blood.surface.bloodHeatTransmission.value=enabled?1:0;render();
   const gl=renderer.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let red=0,luminance=0;for(let i=0;i<pixels.length;i+=4){luminance+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;if(pixels[i]>100&&pixels[i]>pixels[i+1]*1.6&&pixels[i]>pixels[i+2]*2)red++;}
   return {enabled,red,luminance};
  },enabled);fire.push(report);await page.screenshot({path:`${directory}/fire-${enabled?'through-blood':'blocked'}.png`});
 }
 assert.ok(fire[1].luminance>fire[0].luminance+1000,'molten fissures illuminate blood');assert.ok(fire[1].red>fire[0].red+100,'warm cracks remain visible through pools');
 assert.deepEqual(errors,[]);await writeFile(`${directory}/audit.json`,JSON.stringify({rain,fire,errors},null,2)+'\n');console.log(JSON.stringify({rain,fire,errors}));
}finally{await browser.close();}
