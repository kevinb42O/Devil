import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const label=process.argv[2]??'after',url=process.env.GAME_URL??'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/combat-fps',r=>r.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));await page.goto(url+'/combat-fps');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});await cdp.send('Profiler.start');
 const result=await page.evaluate(async label=>{
  const [{World,idleInput,v},{GameRenderer}]=await Promise.all([import(label==='before'?'/artifacts/fps-deep-audit/simulation-before.ts':'/src/simulation.ts'),import('/src/renderer.ts')]);
  const stats=a=>{a.sort((x,y)=>x-y);return{median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90});await r.prepare();const results=[];
  for(const [name,count,crew,fire,homing]of [['solo-idle',300,1,false,false],['solo-primary',300,1,true,false],['solo-homing',150,1,false,true],['crew-primary',300,6,true,false],['crew-homing',150,6,false,true]]){
   r.clear();const w=new World(71,{schedule:false,invulnerable:true,legacyBeamHold:true});w.time=120;w.level=7;w.reserve=10000;w.player.pos=v(0,2,25);
   if(crew>1)for(let i=0;i<crew;i++){w.addCrew('p'+i);const p=w.crew[i];p.level=7;p.reserve=10000;p.player.pos=v((i-2.5)*3,2,25);}
   for(let i=0;i<count;i++){const e=w.spawn(['skull','skull2','skull3'][i%3],v(Math.sin(i*2.399)*22,3+i%5,Math.cos(i*2.399)*22-8));e.age=20;e.towerFlight={gravity:18,height:2,descentSpeed:6,agility:2.5,curl:.5};}
   for(let i=0;i<6;i++){const e=w.spawn(['squid','squid2','squid3'][i%3],v((i%3-1)*14,5,-8-Math.floor(i/3)*15));e.age=20;}
   const samples={cadence:[],cpu:[],simulation:[],effects:[],render:[]};let peakProjectiles=0,peakEffects=0,last,frame=0;
   await new Promise(resolve=>{const tick=now=>{
    const interval=last===undefined?0:now-last;last=now;const input={...idleInput(),fire,homing,yaw:Math.sin(frame*.01)*.3};const start=performance.now();
    for(let i=0;i<2;i++){if(crew>1)w.stepCrew(new Map(w.crew.map((p,i)=>[p.id,{...input,yaw:input.yaw+(i-2.5)*.1}])));else w.step(input);}
    const simulated=performance.now();peakProjectiles=Math.max(peakProjectiles,w.projectiles.length);peakEffects=Math.max(peakEffects,w.effects.length);
    for(const e of w.effects)r.effect(e,w,input.yaw,0);w.effects=[];const effected=performance.now();r.render(w,input.yaw,0,1/60,false,1,null,false,false,input);const rendered=performance.now();
    if(frame>=20){samples.cadence.push(interval);samples.cpu.push(rendered-start);samples.simulation.push(simulated-start);samples.effects.push(effected-simulated);samples.render.push(rendered-effected);}
    if(++frame<(label.includes('soak')?620:140))requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
   results.push({name,enemies:w.enemies.length,peakProjectiles,peakEffects,frames:samples.cpu.length,over20ms:samples.cadence.filter(t=>t>20).length,over33ms:samples.cadence.filter(t=>t>33.5).length,timingsMs:Object.fromEntries(Object.entries(samples).map(([k,a])=>[k,stats(a)]))});
  }
  return results;
 },label);
 const {profile}=await cdp.send('Profiler.stop');const nodes=new Map(profile.nodes.map(n=>[n.id,n])),hot=new Map();for(const id of profile.samples??[]){const f=nodes.get(id).callFrame,key=f.functionName+' '+f.url.split('/').slice(-1)[0]+':'+(f.lineNumber+1);hot.set(key,(hot.get(key)??0)+1);}
 const topSamples=[...hot].sort((a,b)=>b[1]-a[1]).slice(0,35);
 await writeFile(`artifacts/fps-deep-audit/combat-${label}.json`,JSON.stringify({result,topSamples,errors},null,2));console.log(JSON.stringify({result,topSamples,errors}));
}finally{await browser.close();}
