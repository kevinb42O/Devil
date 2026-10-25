import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
const directory='artifacts/skull-horror';await mkdir(`${directory}/before`,{recursive:true});
// Snapshot the committed incumbent for an isolated development-only A/B. No
// production module imports these files; the working tree is never swapped.
for(const name of ['skull-anatomy','enemy-material-profiles','enemy-surface-material']){
 let source=execFileSync('git',['show',`HEAD:src/${name}.ts`],{encoding:'utf8'});
 source=source.replace(/from '\.\/([^']+)'/g,(match,path)=>path==='enemy-material-profiles'?match:`from '/src/${path}'`);
 if(name==='enemy-surface-material')source=source.replace('enemy-authored-surfaces-v7-', 'enemy-authored-surfaces-before-horror-');
 await writeFile(`${directory}/before/${name}.ts`,source);
}
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/skull-horror-benchmark',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/skull-horror-benchmark');
 const result=await page.evaluate(async()=>{
  const [T,{GameRenderer},{World,idleInput},{createSkullAnatomy},{createEnemySurfaceMaterial}]=await Promise.all([
   import('/node_modules/.vite/deps/three.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),
   import('/artifacts/skull-horror/before/skull-anatomy.ts'),import('/artifacts/skull-horror/before/enemy-surface-material.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:75,mist:false,skyMotion:'reduced',screenShake:0,movementMotion:0});await game.prepare();
  const assets=game.originalEnemies,kinds=['skull','skull2','skull3','transmuted1','transmuted2','transmuted3'];
  const saved=new Map(kinds.map(k=>[k,assets.templates.get(k)])),before=new Map();
  for(const kind of kinds){
   const tier=Number(kind.match(/[123]$/)?.[0]??1),root=new T.Group(),rig=new T.Group();root.add(rig);
   const material=createEnemySurfaceMaterial(kind,'body',assets.environment,assets.clock),mesh=createSkullAnatomy(tier,material);
   if(kind==='skull')mesh.scale.multiplyScalar(.78);rig.add(mesh);assets.templates.set(kind,root);
   before.set(kind,{meshes:assets.createSwarmBatch(kind,512),capacity:512});
  }
  for(const [kind,template]of saved)assets.templates.set(kind,template);
  const after=new Map(kinds.map(kind=>[kind,{meshes:assets.createSwarmBatch(kind,512),capacity:512}]));
  const world=new World(72,{schedule:false,invulnerable:true});world.time=120;world.player.pos={x:0,y:2,z:32};
  for(let i=0;i<1000;i++){const e=world.spawn(kinds[i%kinds.length],{x:(i%40-20)*.6,y:1+Math.floor(i/200)*.6,z:-Math.floor(i/40)*.8});e.age=12;e.vel={x:0,y:0,z:6};}
  const gl=game.renderer.getContext(),input=idleInput(),samples={before:[],after:[]},rounds=[],counts={};
  let frame=0;
  const draw=()=>{world.time=120+(frame++%120)/60;game.render(world,0,0,1/60,false,1,null,false,false,input);gl.finish();};
  for(let round=0;round<4;round++)for(const name of round%2?['after','before']:['before','after']){
   game.clear();game.skullMotion.clear();
   for(const kind of kinds){for(const m of game.swarmBatches.get(kind).meshes)game.scene.remove(m);const batch=(name==='before'?before:after).get(kind);game.swarmBatches.set(kind,batch);for(const m of batch.meshes)game.scene.add(m);}
   frame=0;for(let i=0;i<24;i++)draw();
   const times=[];for(let i=0;i<60;i++){const start=performance.now();draw();times.push(performance.now()-start);}
   const sorted=[...times].sort((a,b)=>a-b);rounds.push({round,name,median:sorted[30],p95:sorted[57]});samples[name].push(...times);
   counts[name]={draws:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,shown:kinds.reduce((sum,k)=>sum+game.swarmBatches.get(k).meshes[0].count,0)};
  }
  const stats=Object.fromEntries(Object.entries(samples).map(([name,times])=>{times.sort((a,b)=>a-b);return[name,{median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)]}];}));
  return {measurement:'Synchronous total render wall time including gl.finish; 960x640, low quality, 1000 mixed base/transmuted skulls, 4 alternating rounds, 24 warmup + 60 measured frames per round. Incumbent HEAD geometry, profiles and shader versus working-tree versions.',stats,rounds,counts,medianChangePercent:(stats.after.median/stats.before.median-1)*100,p95ChangePercent:(stats.after.p95/stats.before.p95-1)*100};
 });
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(`${directory}/performance.json`,JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
