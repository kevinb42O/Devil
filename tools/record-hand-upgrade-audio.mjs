// Recorded studio material is previewed only in synchronization with game visuals.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/hand-upgrade-preview',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#000"><canvas></canvas></body>'}));await page.goto(base+'/hand-upgrade-preview');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput,STEP},{Sound}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/audio.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:85,screenShake:.4,movementMotion:0,mist:false}),sound=new Sound();await game.prepare();await sound.start();
  for(const n of ['levelup2','levelup3','levelup4','levelup5','levelup6','levelup7','polarity1e','polarity2w','polarity3n','polarity4s'])await sound.load(n);
  const w=new World(71,{schedule:false,invulnerable:true});w.startAt(0);
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');
  const destination=sound.context.createMediaStreamDestination();sound.master.connect(destination);
  const stream=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...destination.stream.getAudioTracks()]);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:2500000,audioBitsPerSecond:192000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
  const titles=['II / SERPENT','III / BEAR','IV / MAW','V / HUNTER','VI / FERAL CHORUS','VII / APEX'];
  let last=performance.now(),start=last,accumulator=0,index=-1;const heard=[];
  await new Promise(resolve=>{
   function frame(now){
    const dt=Math.min(.05,(now-last)/1000),elapsed=(now-start)/1000;last=now;accumulator+=dt;
    const next=Math.min(5,Math.floor((elapsed-.65)/6));
    if(next>index){index=next;const hand=index+2;w.level=hand;w.emit('upgrade',w.player.pos,hand);heard.push({at:elapsed,hand});}
    while(accumulator>=STEP){w.step(idleInput());accumulator-=STEP;}
    for(const e of w.effects){game.effect(e,w,0,-.08);sound.play(e,w);}w.effects=[];
    sound.listener(w.player.pos,0,-.08);sound.update(w);game.render(w,0,-.08,dt,false,1,null,false,false,idleInput());
    ctx.drawImage(game.renderer.domElement,0,0,960,540);ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(24,22,365,66);
    ctx.fillStyle='#cbbc9c';ctx.font='11px sans-serif';ctx.fillText('HAND TRANSFORMATIONS / RECORDED CREATURE VOCALS',38,44);
    ctx.fillStyle='#fff0d3';ctx.font='bold 20px sans-serif';ctx.fillText(index<0?'AWAKENING':titles[index],38,72);
    ctx.fillStyle='#bd593b';ctx.fillRect(24,88,365*Math.max(0,Math.min(1,(elapsed-(.65+index*6))/6)),2);
    if(elapsed<36.4)requestAnimationFrame(frame);else resolve();
   }requestAnimationFrame(frame);
  });
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});sound.clear();stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:recorder.mimeType}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),heard,failed:sound.diagnostics.failed};
 });
 assert.deepEqual(errors,[]);assert.deepEqual(result.failed,[]);assert.equal(result.heard.length,6);
 await mkdir('artifacts/hand-upgrade-audio',{recursive:true});await writeFile('artifacts/hand-upgrade-audio/gameplay.webm',Buffer.from(result.base64,'base64'));delete result.base64;
 await writeFile('artifacts/hand-upgrade-audio/preview.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
