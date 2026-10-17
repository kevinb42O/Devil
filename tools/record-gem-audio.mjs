// Scripted in-game showcase; studio recordings remain synchronized to game visuals.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/gem-audio-preview',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#000"><canvas></canvas></body>'}));
 await page.goto(base+'/gem-audio-preview');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,STEP,v},{Sound}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/audio.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:85,screenShake:0,movementMotion:0,mist:false}),sound=new Sound();
  await game.prepare();await sound.start();
  for(const n of ['damagesquid2','killsquid','chattersquid','polarity1e','polarity2w','polarity3n','polarity4s'])await sound.load(n);
  const w=new World(71,{schedule:false,invulnerable:true});w.startAt(0);w.player.pos.z=9;
  const tower=w.spawn('squid2',v(0,0,-4));tower.age=10;tower.nextSpawn=Infinity;w.effects=[];
  const destination=sound.context.createMediaStreamDestination();sound.master.connect(destination);
  const stream=new MediaStream([...game.renderer.domElement.captureStream(30).getVideoTracks(),...destination.stream.getAudioTracks()]);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:2500000,audioBitsPerSecond:192000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
  let last=performance.now(),start=last,accumulator=0,broken=false,pickups=0,nextGem=5.5,extraGems=0;const heard=[];
  await new Promise(resolve=>{
   function frame(now){
    const dt=Math.min(.05,(now-last)/1000),elapsed=(now-start)/1000;last=now;accumulator+=dt;
    if(elapsed>1&&!broken){broken=true;w.damageEnemy(tower,10000,w.weakPoint(tower),0,true);}
    if(elapsed>nextGem&&extraGems<16){
     const side=extraGems%2?1:-1;w.dropGems(v(w.player.pos.x+side*2,w.player.pos.y+.1,w.player.pos.z-1),1);
     extraGems++;nextGem+=extraGems<5?.35:.11;
    }
    while(accumulator>=STEP){
     // Hold collection for the showcase, then let real attraction/contact collect.
     if(elapsed<4)w.lastShotTick=w.tick+1;
     w.step(idleInput());accumulator-=STEP;
    }
    for(const effect of w.effects){game.effect(effect,w,0,.35);sound.play(effect,w);if(effect.kind==='pickup')pickups++;if(effect.crystalBreak||effect.kind==='pickup')heard.push({at:elapsed,kind:effect.crystalBreak?'crystal-break':'pickup'});}
    w.effects=[];sound.listener(w.player.pos,0,.35);sound.update(w);game.render(w,0,.35,dt,false,1,null,false,false,idleInput());
    if(elapsed<11)requestAnimationFrame(frame);else resolve();
   }requestAnimationFrame(frame);
  });
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});sound.clear();stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:recorder.mimeType}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),pickups,heard,failed:sound.diagnostics.failed};
 });
 assert.deepEqual(errors,[]);assert.deepEqual(result.failed,[]);assert.ok(result.pickups>0,'showcase includes actual collection');
 await mkdir('artifacts/gem-audio',{recursive:true});await writeFile('artifacts/gem-audio/gameplay.webm',Buffer.from(result.base64,'base64'));delete result.base64;
 await writeFile('artifacts/gem-audio/preview.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
