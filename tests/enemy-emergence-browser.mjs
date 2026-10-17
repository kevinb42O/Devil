import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/enemy-emergence';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/emergence-visual-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto('http://127.0.0.1:5173/emergence-visual-test');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:75,mist:false,screenShake:0});await game.prepare();game.renderer.setSize(1280,800);
  window.audit={game,World,idleInput};
 });
 const results=[];
 for(const kind of ['squid','squid2','squid3','centipede','gigapede','ghostpede']){
  for(const age of kind.startsWith('squid')?[.35,1.2,4]:[2.5,3.35,4.2,10]){
   const result=await page.evaluate(({kind,age})=>{
    const {game,World,idleInput}=window.audit;game.clear();
    const w=new World(71,{schedule:false,invulnerable:true});w.player.pos={x:0,y:2,z:22};const e=w.spawn(kind,{x:0,y:0,z:0});
    // Establish the exit before the head starts travelling.
    game.render(w,0,.05,0,false,1,null,false,false,idleInput());
    while(w.time+1e-6<age){w.step(idleInput());w.effects=[];}
    game.render(w,0,.05,0,false,1,null,false,false,idleInput());
    const state={kind,age,...game.enemyEmergence.diagnostics,draws:game.renderer.info.render.calls};
    // Rendering and a paused frame must not alter simulation or the rupture.
    const before=JSON.stringify(w.captureCrewCheckpoint());game.render(w,0,.05,0,false,1,null,false,false,idleInput());
    if(before!==JSON.stringify(w.captureCrewCheckpoint()))throw Error('Presentation mutated simulation');
    if(JSON.stringify(game.enemyEmergence.diagnostics)!==JSON.stringify({exits:state.exits,cracks:state.cracks,waves:state.waves,debris:state.debris,dust:state.dust}))throw Error('Paused emergence changed');
    return state;
   },{kind,age});results.push(result);
   if(age<5)await page.screenshot({path:`${directory}/${kind}-${age}.png`});
   if(age<3.5)assert.ok(result.cracks>0&&result.debris>0&&result.dust>0,`${kind} has visible emergence`);
   if(age===4&&kind.startsWith('squid')||age===10)assert.equal(result.debris,0,'settled enemies stop emitting');
  }
 }
 const lifecycle=await page.evaluate(()=>{
  const {game,World,idleInput}=window.audit;game.clear();const w=new World(12,{schedule:false,invulnerable:true});
  const e=w.spawn('centipede',{x:3,y:0,z:4});e.age=2.5;
  game.render(w,0,0,0,false,1,null,false,false,idleInput());
  const initial=game.enemyEmergence.diagnostics;game.enemyEmergence.update(null,game.camera);
  if(game.enemyEmergence.diagnostics.debris!==0||game.enemyEmergence.diagnostics.exits!==0)throw Error('Null world retained effects');
  e.age=25;e.activeAt=26;game.enemyEmergence.update(w,game.camera);
  if(game.enemyEmergence.diagnostics.dust===0)throw Error('Repeated breach lost its warning');
  e.age=0;e.activeAt=3;game.enemyEmergence.update(w,game.camera);
  if(game.enemyEmergence.diagnostics.cracks===0)throw Error('Backward seek lost its warning');
  game.clear();if(game.enemyEmergence.diagnostics.debris!==0)throw Error('Restart retained effects');
  return {initial,repeatedBreach:true,backwardSeek:true,nullWorld:true,restart:true};
 });
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({results,lifecycle,errors},null,2));console.log(JSON.stringify({results,lifecycle,errors},null,2));
}finally{await browser.close();}
