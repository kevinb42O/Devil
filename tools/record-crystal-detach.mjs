// Synchronized game footage: previous fracture, then the three new detach takes.
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/crystal-detach-preview',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#000"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/crystal-detach-preview');
 const baseline=(await readFile('artifacts/crystal-detach/previous.wav')).toString('base64');
 const result=await page.evaluate(async baseline=>{
  const [{GameRenderer},{World,idleInput,STEP,v},{Sound}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/audio.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:85,screenShake:0,movementMotion:0,mist:false}),sound=new Sound();await game.prepare();await sound.start();
  const old=await sound.context.decodeAudioData(Uint8Array.from(atob(baseline),c=>c.charCodeAt(0)).buffer);
  const names=['crystalbreak1','crystalbreak2','crystalbreak3'];for(const name of names)await sound.load(name);const takes=names.map(name=>sound.buffers.get(name));
  const destination=sound.context.createMediaStreamDestination();sound.master.connect(destination);
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const paint=canvas.getContext('2d');
  const stream=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...destination.stream.getAudioTracks()]);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:2500000,audioBitsPerSecond:192000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
  let phase=-1,world,tower,broken=false,last=performance.now(),start=last,accumulator=0;const events=[];
  await new Promise((resolve,reject)=>{
   window.addEventListener('error',e=>reject(new Error(e.message)),{once:true});
   const timeout=setTimeout(()=>reject(new Error('Crystal comparison rendering timed out')),30000);
   function frame(now){
    const elapsed=Math.max(0,(now-start)/1000),dt=Math.min(.05,(now-last)/1000);last=now;const next=Math.min(3,Math.floor(elapsed/3.3));
    if(next!==phase){
     phase=next;sound.clear();names.forEach(name=>sound.buffers.set(name,phase===0?old:takes[phase-1]));
     world=new World(71,{schedule:false,invulnerable:true});world.startAt(0);world.player.pos.z=7;
     tower=world.spawn('squid2',v(0,0,-4));tower.age=10;tower.nextSpawn=Infinity;world.effects=[];broken=false;accumulator=0;
    }
    if(elapsed-phase*3.3>.65&&!broken){broken=true;world.damageEnemy(tower,10000,world.weakPoint(tower),0,true);}
    accumulator+=dt;while(accumulator>=STEP){world.lastShotTick=world.tick+1;world.step(idleInput());accumulator-=STEP;}
    for(const e of world.effects){game.effect(e,world,0,.35);if(e.crystalBreak){sound.play(e,world);events.push({phase,at:elapsed,kind:'detach'});}}
    world.effects=[];sound.listener(world.player.pos,0,.35);game.render(world,0,.35,dt,false,1,null,false,false,idleInput());
    paint.drawImage(game.renderer.domElement,0,0,960,540);paint.fillStyle='rgba(8,10,18,.86)';paint.fillRect(18,18,650,70);paint.fillStyle=phase?'#b5f5ff':'#eee';paint.font='bold 22px system-ui';paint.fillText(phase?'NEW · CRYSTAL FRACTURE · TAKE '+phase:'BEFORE · ICE CRACK',34,47);paint.fillStyle='#ccc';paint.font='15px system-ui';paint.fillText('Actual tower socket detachment · game mixer + positional arena reverb',34,73);
    if(elapsed<13.2)requestAnimationFrame(frame);else{clearTimeout(timeout);resolve();}
   }requestAnimationFrame(frame);
  });
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});sound.clear();stream.getTracks().forEach(t=>t.stop());await sound.context.close();
  const bytes=new Uint8Array(await new Blob(chunks,{type:recorder.mimeType}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),events,failed:sound.diagnostics.failed};
 },baseline);
 assert.deepEqual(errors,[]);assert.deepEqual(result.failed,[]);assert.equal(result.events.length,4,'one socket detach per comparison');
 await mkdir('artifacts/crystal-detach',{recursive:true});await writeFile('artifacts/crystal-detach/comparison.webm',Buffer.from(result.base64,'base64'));delete result.base64;await writeFile('artifacts/crystal-detach/preview.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close();}
