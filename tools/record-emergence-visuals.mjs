import {chromium} from '@playwright/test';
import {mkdir,rename} from 'node:fs/promises';
const directory='artifacts/enemy-emergence';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:directory,size:{width:1280,height:800}}});
 const page=await context.newPage();
 await page.route('**/emergence-film',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas></body>'}));
 await page.goto('http://127.0.0.1:5173/emergence-film');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,mist:false,screenShake:0});await game.prepare();game.renderer.setSize(1280,800);
  const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:3,z:35};
  ['squid','squid2','squid3'].forEach((kind,i)=>world.spawn(kind,{x:(i-1)*13,y:0,z:0}));
  let previous=performance.now(),accumulator=0;const end=previous+5600;
  function frame(now){const dt=Math.min(.05,(now-previous)/1000);previous=now;accumulator+=dt;
   while(accumulator>=1/60){world.step(idleInput());world.effects=[];accumulator-=1/60;}
   game.render(world,0,.13,dt,false,1,null,false,false,idleInput());if(now<end)requestAnimationFrame(frame);else window.filmDone=true;
  }requestAnimationFrame(frame);
 });
 await page.waitForFunction(()=>window.filmDone,{timeout:30000});
 const video=page.video();await context.close();await rename(await video.path(),`${directory}/all-towers-polished.webm`);
}finally{await browser.close();}
