import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const sustained=process.argv.includes('--sustained'),mix=process.argv.includes('--mix');
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
await mkdir('artifacts/weapon-audio',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],oldRequests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/original/devil-daggers/audio/'))oldRequests.push(r.url());});
 await page.route('**/weapon-audio-gameplay',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas><div id="label" style="position:fixed;top:20px;left:25px;color:#eee;font:18px system-ui;text-shadow:0 2px 4px black">Studio sound pass · live game simulation and mixer</div></body>'}));
 await page.goto(base+'/weapon-audio-gameplay');
 const result=await page.evaluate(async({sustained,mix})=>{
  const [{GameRenderer},{World,idleInput,STEP},{Sound},{REMAKE_AUDIO}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/audio.ts'),import('/src/remake-audio.ts')]);
  const game=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,screenShake:0,movementMotion:0,mist:false}),sound=new Sound();await game.prepare();await sound.start();
  for(const [name,asset] of Object.entries(REMAKE_AUDIO))if(!asset.role.endsWith('music'))await sound.load(name);
  const world=new World(71,{schedule:false,invulnerable:true});world.player.pos={x:0,y:1.7,z:mix?0:18};world.level=1;world.reserve=10000;
  for(const [kind,x,z]of (mix?[['squid',-10,-8],['spider',9,-3],['skull',-6,-4],['skull2',6,-5],['skull3',-8,-6]]:[['squid',-10,-9],['squid2',9,-16],['squid3',-24,-25],['orb',16,-4],['skull2',0,7],['skull2',-4,6],['skull3',7,5]])){const e=world.spawn(kind,{x,y:kind.startsWith('squid')?0:3,z});e.age=12;}
  const destination=sound.context.createMediaStreamDestination();sound.master.connect(destination);
  const preview=document.createElement('canvas');preview.width=1280;preview.height=720;const paint=preview.getContext('2d');const stream=preview.captureStream(30),tracks=[...stream.getVideoTracks(),...destination.stream.getAudioTracks()],output=new MediaStream(tracks);
  const recorder=new MediaRecorder(output,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:3500000,audioBitsPerSecond:192000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();
  let last=performance.now(),accumulator=0,elapsed=0,nextSpawn=5,frames=0;const start=last;
  await new Promise(resolve=>{
   function frame(now){
    const dt=Math.min(.05,(now-last)/1000);last=now;elapsed=(now-start)/1000;accumulator+=dt;
    const level=sustained||mix?3:Math.min(7,1+Math.floor(elapsed/5)),phase=elapsed%5;world.level=level;world.reserve=10000;
    const input={...idleInput(),yaw:Math.sin(elapsed*.3)*.18,pitch:.11,fire:mix?elapsed>4&&elapsed<31:sustained?elapsed>.25&&elapsed<34:phase>.25&&phase<2.4||phase>2.85&&phase<2.94||phase>3.55&&phase<3.64,homing:!sustained&&!mix&&level>=2&&phase>4.15&&phase<4.85};
    while(accumulator>=STEP){world.step(input);accumulator-=STEP;}
    if(elapsed>nextSpawn&&elapsed<(mix?30:17)){nextSpawn+=4;for(let i=0;i<3;i++){const e=world.spawn(i===0?'skull3':'skull2',{x:mix?(i===1?-7:7):(i-1)*5,y:2.5,z:mix?-6:5});e.age=3;}}
    for(const effect of world.effects)sound.play(effect,world);world.effects=[];
    sound.listener(world.player.pos,input.yaw,input.pitch);sound.update(world);game.render(world,input.yaw,input.pitch,dt,false,1,null,false,false,input);paint.drawImage(game.renderer.domElement,0,0,1280,720);paint.fillStyle='rgba(5,5,8,.8)';paint.fillRect(20,18,590,76);paint.fillStyle='#ffba80';paint.font='bold 22px sans-serif';paint.fillText('HAND '+level+' · '+['CINDER · LION','FERAL · BEAR','HEX · SCREAM','ABYSS · ROAR','RIFT · TWIN PREDATORS','TYRANT · BEAST','ECLIPSE · CHORUS'][level-1],36,49);paint.fillStyle='#eee';paint.font='16px sans-serif';paint.fillText(mix?(elapsed<4?'ARENA · NO FIRING':elapsed<31?'FIRING · ARENA REMAINS AUDIBLE':'RELEASE · ARENA'):sustained?'UNINTERRUPTED STREAM · '+elapsed.toFixed(1)+'s':phase<2.5?'PRIMARY STREAM':phase<4?'SHOTGUN':'HOMING',36,77);frames++;
    if(elapsed<35)requestAnimationFrame(frame);else resolve();
   }requestAnimationFrame(frame);
  });
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop()});sound.clear();tracks.forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:recorder.mimeType}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(binary),frames,duration:elapsed,bytes:bytes.length,decoded:sound.diagnostics.loaded,failed:sound.diagnostics.failed};
 },{sustained,mix});
 await writeFile(mix?'artifacts/weapon-audio/balanced-arena.webm':sustained?'artifacts/weapon-audio/balanced-flow.webm':'artifacts/weapon-audio/balanced-seven-hands.webm',Buffer.from(result.base64,'base64'));delete result.base64;
 assert.deepEqual(result.failed,[]);assert.deepEqual(errors,[]);assert.deepEqual(oldRequests,[]);assert.ok(result.frames>100);
 await writeFile(mix?'artifacts/weapon-audio/balanced-arena-report.json':sustained?'artifacts/weapon-audio/balanced-sustained-report.json':'artifacts/weapon-audio/balanced-gameplay-report.json',JSON.stringify({...result,errors,oldRequests},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
