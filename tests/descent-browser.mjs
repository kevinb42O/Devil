import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

const directory='artifacts/descent';await mkdir(directory,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export const createHotContext=()=>({accept(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const injectQuery=url=>url;export const removeStyle=id=>document.getElementById(id)?.remove();export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s)}s.textContent=content}'}));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  // The fixture renders explicitly; the normal application must not animate concurrently.
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
  const result=await page.evaluate(async()=>{
    const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
    const canvas=document.createElement('canvas');canvas.id='descent-fixture';canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);
    const renderer=new GameRenderer(canvas,{quality:'high',fov:90,skyMotion:'full'});await renderer.prepare();
    const world=new World(17,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,7);
    for(const [kind,x,y,z] of [['squid',-9,3.3,-12],['spider',8,2,-11],['skull',-3,3,-5],['skull2',5,6,-9],['skull3',0,8,-18],['skull4',-6,6,-15]]){
      const e=world.spawn(kind,v(x,y,z));e.pos=v(x,y,z);e.age=20;e.headExposure=.7;
    }
    for(let i=0;i<8;i++)world.gems.push({id:1000+i,pos:v(-4+i,1,-4),vel:v(),age:2});
    world.effects=[];
    window.descentFixture={renderer,world};
    const frames=[];
    for(const time of [0,39,114,229,259,350,442,520]){
      world.time=time;renderer.render(world,0,0,0,false);
      frames.push({time,...renderer.skyDiagnostics,calls:renderer.renderer.info.render.calls});
    }
    // Changes to renderer age, render dt, local respawn age and spectator position
    // must not move the environment away from the match/replay timestamp.
    world.time=350;renderer.render(world,0,0,.5,false);const first={...renderer.skyDiagnostics};
    renderer.render(world,.8,-.4,3,false,1,v(4,12,8));const second={...renderer.skyDiagnostics};
    renderer.render(world,0,0,0,false);const paused={...renderer.skyDiagnostics};
    world.time=114;renderer.render(world,0,0,0,false);const scrub={...renderer.skyDiagnostics};
    world.time=0;renderer.render(world,0,0,0,false);const restart={...renderer.skyDiagnostics};
    renderer.configure({quality:'low',fov:90,skyMotion:'reduced'});
    world.time=259;renderer.render(world,0,0,1,false);const reduced={...renderer.skyDiagnostics};
    const skyProgram=renderer.renderer.properties.get(renderer.sky.mesh.material).currentProgram.id;
    world.time=350;renderer.render(world,0,0,1,false);const reducedLater={...renderer.skyDiagnostics};
    world.time=442;renderer.render(world,0,0,0,false);const final={...renderer.skyDiagnostics};
    renderer.render(null,0,0,0,true);const menu={...renderer.skyDiagnostics};
    return {frames,first,second,paused,scrub,restart,reduced,reducedLater,final,menu,skyProgram,finalSkyProgram:renderer.renderer.properties.get(renderer.sky.mesh.material).currentProgram.id};
  });
  assert.deepEqual(result.first,result.second);assert.deepEqual(result.first,result.paused);
  assert.equal(result.scrub.chapter,'The Bruised Veil');assert.equal(result.restart.chapter,'The Last Sky');
  assert.equal(result.reduced.travel,0);assert.equal(result.reducedLater.travel,0);assert.equal(result.reduced.octaves,2);
  assert.equal(result.final.chapter,'The Unlit Depth');assert.equal(result.menu.menu,true);
  assert.equal(result.skyProgram,result.finalSkyProgram,'time and chapter changes must not compile the sky shader');
  for(const quality of ['high','low'])for(const time of [0,39,114,229,259,350,442])for(const [view,pitch] of [['front',0],['up',.8]]){
    await page.evaluate(({quality,time,pitch})=>{const {renderer,world}=window.descentFixture;renderer.configure({quality,fov:90,skyMotion:'full'});world.time=time;renderer.render(world,0,pitch,0,false);},{quality,time,pitch});
    await page.screenshot({path:`${directory}/${quality}-${time}-${view}.png`});
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${directory}/integration.json`,JSON.stringify(result,null,2));
  console.log('Descent browser passed:',JSON.stringify(result));
}finally{await browser.close();}
