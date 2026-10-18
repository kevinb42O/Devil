import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('console',m=>{if(m.type()==='error')console.log(m.text());});
 await page.route('**/enemy-integration-preview',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/enemy-integration-preview');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,mist:true,skyMotion:'reduced',screenShake:0,movementMotion:0});await game.prepare();
  const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:12};
  for(const [kind,x,y,z]of [['skull2',-2,2,5],['skull4',3,3,0],['spider',-5,0,-3],['spider2',6,0,-11],['transmuted3',-1,5,-6],['squid',-12,0,-19],['squid3',12,0,-30]]){const e=world.spawn(kind,{x,y,z},false);e.age=20;e.headExposure=1;}
  window.preview={game,world,idleInput};
 });
 for(const [name,time]of [['cosmic',12],['day',40],['veil',180],['furnace',280],['cathedral',400],['depth',510]]){
  await page.evaluate(time=>{const {game,world,idleInput}=window.preview;world.time=time;game.render(world,0,.04,0,false,1,null,false,false,idleInput());},time);
  await page.screenshot({path:`artifacts/enemy-scene-lighting/${process.argv[2]||'after'}-${name}.png`});
 }
}finally{await browser.close();}
