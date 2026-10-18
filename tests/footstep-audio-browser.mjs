import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
await mkdir('artifacts/footsteps',{recursive:true});
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/footstep-test',r=>r.fulfill({contentType:'text/html',body:'<button>Start audio</button>'}));
  await page.goto(base+'/footstep-test');
  await page.evaluate(async()=>{
   const [{Sound},{World},{FOOTSTEP_SOUNDS,WET_FOOTSTEP_SOUNDS}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts'),import('/src/footstep-audio.ts')]);
   window.sound=new Sound();window.world=new World(1,{schedule:false});window.names=FOOTSTEP_SOUNDS;window.wetNames=WET_FOOTSTEP_SOUNDS;
   document.querySelector('button').onclick=async()=>{await sound.start();window.ready=true;};
  });
  await page.click('button');await page.waitForFunction(()=>window.ready);
  const report=await page.evaluate(async()=>{
   const s=window.sound,w=window.world,calls=[],real=s.oneShot.bind(s);
   s.oneShot=(...args)=>{if(args[0].startsWith('footstep-')){const v=real(...args);calls.push({name:args[0],position:args[1],rate:args[6],gain:v?.gain.gain.value,played:!!v,panner:!!v?.panner});return v;}return real(...args);};
   const decoded=names.every(n=>s.buffers.has(n));
   s.listener(w.player.pos,0,0);s.updateFootsteps(w);
   let replayWrappers=false;
   async function frames(n,move){for(let i=0;i<n;i++){await new Promise(requestAnimationFrame);move(i);s.listener(w.player.pos,0,0);s.updateFootsteps(replayWrappers?Object.assign(Object.create(Object.getPrototypeOf(w)),w):w);}}
   w.player.vel.x=11;let previous=performance.now();
   await frames(150,()=>{const now=performance.now(),dt=Math.min(.05,(now-previous)/1000);previous=now;w.player.pos.x+=11*dt;});
   const local=calls.splice(0);w.player.grounded=false;
   await frames(18,()=>w.player.pos.x+=.15);const airborne=calls.splice(0);
   w.player.grounded=true;w.player.vel.x=0;await frames(20,()=>{});const idle=calls.splice(0);
   s.clear();w.addCrew('local');w.addCrew('remote');w.selectCrew('local');replayWrappers=true;
   const remote=w.crew[1];remote.player.pos={x:w.player.pos.x+4,y:w.player.pos.y,z:w.player.pos.z};remote.player.vel.z=5;
   previous=performance.now();await frames(90,()=>{const now=performance.now();remote.player.pos.z+=5*Math.min(.05,(now-previous)/1000);previous=now;});
   const positional=calls.splice(0);s.clear();
   // Keep the same gait alive through rain, fade-in, drying and rewind.
   replayWrappers=false;w.crew=[];w.player.vel.x=11;w.player.vel.z=0;
   await Promise.all(wetNames.map(name=>s.load(name)));
   const wetDecoded=wetNames.every(name=>s.buffers.has(name)),weather=[];
   for(const time of [100,65,180,241,100]){
    w.time=time;previous=performance.now();
    await frames(50,()=>{const now=performance.now();w.player.pos.x+=11*Math.min(.05,(now-previous)/1000);previous=now;});
    weather.push({time,calls:calls.splice(0)});
   }
   s.clear();
   return {decoded,wetDecoded,failed:s.diagnostics.failed,local,airborne,idle,positional,weather};
  });
  assert.equal(report.decoded,true);assert.deepEqual(report.failed,[]);assert.ok(report.local.length>=6);
  assert.ok(report.local.every(c=>c.played&&!c.panner&&c.rate===1&&c.gain<=.0136),'native pitch and subdued voice gain');
  assert.equal(new Set(report.local.slice(0,Math.min(12,report.local.length)).map(c=>c.name)).size,Math.min(12,report.local.length),'shuffle bag has no repeated sample');
  assert.deepEqual(report.airborne,[]);assert.deepEqual(report.idle,[]);
  assert.ok(report.positional.length>=3);assert.ok(report.positional.every(c=>c.played&&c.panner&&c.position));assert.deepEqual(errors,[]);
  assert.equal(report.wetDecoded,true);
  for(const stage of report.weather){
   assert.ok(stage.calls.length>=2,'weather stage produces contacts');
   assert.ok(stage.calls.every(c=>c.played&&c.rate===1&&c.gain<=.0136));
   if(stage.time===100)assert.ok(stage.calls.every(c=>c.name.startsWith('footstep-wet')),'storm and rewind use wet bank');
   else if(stage.time===241)assert.ok(stage.calls.every(c=>c.name.startsWith('footstep-stone')),'dry chapter restores stone');
   else{
    assert.equal(stage.calls.length%2,0);
    for(let i=0;i<stage.calls.length;i+=2){
     const dry=stage.calls[i],wet=stage.calls[i+1];
     assert.ok(dry.name.startsWith('footstep-stone')&&wet.name.startsWith('footstep-wet'));
     assert.equal(dry.name.replace('footstep-stone',''),wet.name.replace('footstep-wet',''),'paired materials share contact');
     assert.ok(dry.gain+wet.gain<=.0136,'transition never doubles the gain');
    }
   }
  }
  await writeFile(`artifacts/footsteps/${engine.name()}-report.json`,JSON.stringify(report,null,2));
  console.log(`${engine.name()}: all 24 WAVs decode; wet/dry transitions and rewind pass; ${report.local.length} local footsteps, ${report.positional.length} HRTF remote footsteps; airborne/idle silent.`);
 }finally{await browser.close();}
}
