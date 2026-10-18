import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const out='artifacts/teaser';await mkdir(out+'/shots',{recursive:true});
const proof=process.argv.includes('--proof');
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
const captureWidth=Number(process.argv.find(a=>a.startsWith('--width='))?.slice(8)||1920),captureHeight=captureWidth*9/16;
const shots=[
 {id:'01-threshold',duration:3,start:0,type:'gate'},
 {id:'02-cosmic',duration:4,start:8,type:'cosmic'},
 {id:'03-first-blood',duration:5,start:12,type:'combat',level:2},
 {id:'04-cosmic-scale',duration:4,start:15,type:'scale'},
 {id:'05-rain-stone',duration:3,start:94,type:'surface'},
 {id:'06-storm-fight',duration:5,start:96,type:'combat',level:3},
 {id:'07-storm-orbit',duration:2,start:100,type:'orbit'},
 {id:'08-veil',duration:3,start:175,type:'glide'},
 {id:'09-veil-fight',duration:4,start:180,type:'combat',level:4},
 {id:'10-furnace',duration:3,start:300,type:'orbit'},
 {id:'11-fire-fight',duration:5,start:305,type:'combat',level:5},
 {id:'12-serpent',duration:3,start:310,type:'creature'},
 {id:'13-fire-release',duration:3,start:315,type:'combat',level:6},
 {id:'14-cathedral',duration:5,start:410,type:'cathedral'},
 {id:'15-limestone',duration:3,start:415,type:'surface'},
 {id:'16-monument',duration:3,start:425,type:'scale'},
 {id:'17-cathedral-fight',duration:4,start:420,type:'combat',level:5},
 {id:'18-storm-hit',duration:2,start:110,type:'combat',level:4},
 {id:'19-furnace-hit',duration:2,start:320,type:'combat',level:7},
 {id:'20-last-stand',duration:3,start:430,type:'combat',level:7},
 {id:'21-depth',duration:1,start:487,type:'depth'},
 {id:'22-title',duration:5,start:490,type:'title'},
];
await writeFile(out+'/shot-manifest.json',JSON.stringify({title:'ABYSS / DAGGERS — DESCEND',width:1920,height:1080,fps:30,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source:'Current working tree; cinematic cameras and scripted unranked invulnerable combat; normal weapons, enemy AI, collision and effects.',shots},null,2));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 const page=await browser.newPage({viewport:{width:captureWidth,height:captureHeight},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
 page.on('console',m=>{if(m.type()==='error')console.error(m.text().slice(0,200));});
 await page.route('**/teaser-capture',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black;overflow:hidden"><canvas id="game"></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/teaser-capture');
 await page.evaluate(async({width,height})=>{
  const [{GameRenderer},{World,v,idleInput,STEP},{Sound,SOUND_NAMES},{floorHeight},{RunRecorder}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/audio.ts'),import('/src/arena.ts'),import('/src/replay.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:82,mist:true,screenShake:.25,movementMotion:.45});await renderer.prepare();
  // A recording-only native 1080p target; normal game resolution policy is untouched.
  renderer.renderer.setPixelRatio(1);renderer.renderer.setSize(width,height);
  renderer.composer.setPixelRatio(1);renderer.composer.setSize(width,height);renderer.bloom.setSize(width/2,height/2);
  renderer.originalWeapon.resize(width,height);
  const sound=new Sound();sound.setVolume(.78);await sound.start();
  let loadIndex=0;await Promise.all(Array.from({length:4},async()=>{while(loadIndex<SOUND_NAMES.length)await sound.load(SOUND_NAMES[loadIndex++]);}));
  await sound.prepareEntrance(0);
  const c=sound.context,destination=c.createMediaStreamDestination(),mix=c.createGain(),limiter=c.createDynamicsCompressor(),meter=c.createAnalyser();
  mix.gain.value=1.35;limiter.threshold.value=-3;limiter.knee.value=3;limiter.ratio.value=12;limiter.attack.value=.002;limiter.release.value=.12;
  sound.master.connect(mix);mix.connect(limiter);limiter.connect(destination);limiter.connect(meter);meter.fftSize=2048;
  const output=document.createElement('canvas');output.width=1920;output.height=1080;const paint=output.getContext('2d',{alpha:false});
  await Promise.all([
   new FontFace('TeaserTitle','url(/node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2)',{weight:'700'}).load().then(f=>document.fonts.add(f)),
   new FontFace('TeaserBody','url(/node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2)').load().then(f=>document.fonts.add(f)),
  ]);
  const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
  window.captureShot=async shot=>{
   renderer.clear();renderer.resetFeedback();sound.clear();
   const seed=731+Number(shot.id.slice(0,2));
   const world=new World(seed,{schedule:false,invulnerable:true});
   const level=shot.level??3;world.startAt(shot.start,level,350);world.player.pos=v(0,floorHeight(0,12,shot.start)+1.7,12);
   const recorder=new RunRecorder(seed,{time:shot.start,level,reserve:350});
   const tower=world.spawn('squid2',v(-14,4.6,-17));tower.age=14;tower.nextSpawn=Infinity;tower.towerEmission=undefined;
   let creature=null;
   if(shot.type==='creature'){
    creature=world.spawn('gigapede',v(15,3,-15));
    for(let i=0;i<480;i++)world.step(idleInput());
   }
   if(shot.type==='scale'&&shot.start<30){const orb=world.spawn('orb',v(14,6,-19));orb.age=9;orb.nextBeckon=Infinity;}
   const combat=shot.type==='combat';
   let spawnIndex=0;
   const spawnWave=()=>{
    const p=world.player.pos,a=aimYaw;
    for(let i=0;i<5;i++){
     const bearing=a+(i-2)*.24,dist=11+(i%3)*4;
     const e=world.spawn(i===4?'skull3':i%2?'skull2':'skull',v(p.x-Math.sin(bearing)*dist,2.2+i*.33,p.z-Math.cos(bearing)*dist));
     e.age=2;e.activeAt=.1;
    }spawnIndex++;
   };
   let aimYaw=0,aimPitch=.03;if(combat)spawnWave();world.effects=[];
   const pose=(t)=>{
    let x=0,y=2.1,z=12,yaw=0,pitch=.12;
    if(shot.type==='gate'){x=-.65+.65*ease(t/shot.duration);z=2-t*1.9;y=1.7;pitch=.015;yaw=-x*.10;}
    if(shot.type==='cosmic'){x=-5+t*1.1;z=15-t*.9;y=2.2+t*.45;pitch=.12+.21*ease(t/shot.duration);yaw=-.10+t*.025;}
    if(shot.type==='surface'){x=-7+t*2.1;z=7-t*.6;y=.65;pitch=-.30+.15*ease(t/shot.duration);yaw=-.10+t*.04;}
    if(shot.type==='orbit'){const a=.10+t*.12;x=Math.sin(a)*30;z=Math.cos(a)*30;y=7-t*.7;yaw=a;pitch=-.12;}
    if(shot.type==='glide'){x=-9+t*3;z=12-t*1.7;y=2.1;pitch=.16+t*.035;yaw=-.12+t*.07;}
    if(shot.type==='cathedral'){x=-6+t*1.4;z=15-t*.7;y=1.9+t*.3;pitch=.07+.27*ease(t/shot.duration);yaw=-.22+t*.055;}
    if(shot.type==='scale'){const a=-.25+t*.065;x=Math.sin(a)*38;z=Math.cos(a)*38;y=17+t*.7;yaw=a;pitch=-.32+t*.015;}
    if(shot.type==='creature'){x=-12+t*2;z=17-t;y=7;const target=creature.pos;yaw=Math.atan2(x-target.x,z-target.z);pitch=Math.atan2(target.y-y,Math.hypot(target.x-x,target.z-z));}
    if(shot.type==='depth'||shot.type==='title'){x=0;z=8-t*.2;y=2;pitch=.35;yaw=t*.01;}
    return {position:v(x,Math.max(y,floorHeight(x,z,world.time,0)+.3),z),yaw,pitch};
   };
   const camera=pose(0);renderer.baseFov=combat?92:shot.type==='scale'?75:78;
   if(shot.type==='gate'){world.player.pos={...camera.position};sound.listener(camera.position,camera.yaw,camera.pitch);sound.entrance(0,v(0,1.7,-7));}
   else sound.updateEnvironment(shot.start,1/30);
   for(let i=0;i<12;i++){renderer.render(world,camera.yaw,camera.pitch,1/60,false,1,combat?null:camera.position,false,shot.type==='gate',combat?idleInput():null);await new Promise(r=>requestAnimationFrame(r));}
   await new Promise(r=>setTimeout(r,700));
   const mime='video/mp4;codecs=avc1.640028,mp4a.40.2';if(!MediaRecorder.isTypeSupported(mime))throw Error('H.264/AAC capture unavailable');
   paint.drawImage(renderer.renderer.domElement,0,0,1920,1080);
   const stream=new MediaStream([...output.captureStream(0).getVideoTracks(),...destination.stream.getAudioTracks()]);
   const videoTrack=stream.getVideoTracks()[0];
   const media=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:24000000,audioBitsPerSecond:320000}),chunks=[];
   media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   let frames=0,start=performance.now(),last=start,elapsed=0,accumulator=0,nextWave=1.8;
   const rms=[],frameTimes=[],screens=[],samples=new Float32Array(2048);let nextSample=.5;
   media.start(1000);
   await new Promise((resolve,reject)=>{
    const frame=now=>{try{
     if(now-last<31){requestAnimationFrame(frame);return;}
     elapsed=(now-start)/1000;const realDt=(now-last)/1000;last=now;const dt=Math.min(.1,realDt);frameTimes.push(realDt);accumulator+=dt;
     let input=idleInput(),cam=pose(elapsed);
     if(combat){
      const p=world.player.pos;
      const target=world.enemies.filter(e=>e.hp>0&&e.kind.startsWith('skull')).sort((a,b)=>Math.hypot(a.pos.x-p.x,a.pos.z-p.z)-Math.hypot(b.pos.x-p.x,b.pos.z-p.z))[0];
      if(target){const dx=target.pos.x-p.x,dy=target.pos.y-p.y,dz=target.pos.z-p.z;
       const desired=Math.atan2(-dx,-dz);aimYaw+=angle(desired-aimYaw)*Math.min(1,dt*5);aimPitch+=(Math.atan2(dy,Math.hypot(dx,dz))-aimPitch)*Math.min(1,dt*6);
      }
      // Orbit around real targets; steer inward before approaching an arena edge.
      const r=Math.hypot(p.x,p.z),inward=angle(Math.atan2(p.x,p.z)-aimYaw);
      input={...idleInput(),yaw:aimYaw,pitch:aimPitch,forward:r>22?Math.cos(inward)*.8:Math.sin(elapsed*1.3)*.25,strafe:r>22?Math.sin(inward)*.8:.6,jump:elapsed%2.2<.08,fire:elapsed%.95<.69,homing:level>=5&&elapsed%2.7>2.2};
      cam={position:p,yaw:aimYaw,pitch:aimPitch};
      if(elapsed>nextWave){spawnWave();nextWave+=1.8;}
     }
     if(shot.type==='gate'){world.player.pos={...cam.position};world.time=shot.start+elapsed;}
     else if(combat||shot.type==='creature'){
      while(accumulator>=STEP){recorder.record(input);world.step(input);accumulator-=STEP;}
     }else{world.time=shot.start+elapsed;world.tick=Math.round(world.time/STEP);}
     for(const effect of world.effects)sound.play(effect,world);
     sound.listener(cam.position,cam.yaw,cam.pitch);
     if(shot.type==='gate')sound.entrance(0,v(0,1.7,-7));
     else{sound.updateEnvironment(world.time,dt);if(combat||shot.type==='creature')sound.update(world);}
     renderer.render(world,cam.yaw,cam.pitch,dt,false,1,combat?null:cam.position,false,shot.type==='gate',combat?input:null);
     world.effects=[];
     paint.globalAlpha=1;paint.drawImage(renderer.renderer.domElement,0,0,1920,1080);
     if(shot.type==='title'){
      paint.fillStyle='rgba(2,4,9,.80)';paint.fillRect(0,0,1920,1080);
      paint.globalAlpha=ease(elapsed/.5);paint.textAlign='center';
      paint.fillStyle='#cba88a';paint.font='20px TeaserBody';paint.letterSpacing='12px';paint.fillText('D E S C E N D',960,382);
      paint.fillStyle='#f3ece1';paint.font='700 142px TeaserTitle';paint.letterSpacing='7px';paint.fillText('ABYSS / DAGGERS',960,552);
      paint.fillStyle='#ae9881';paint.fillRect(860,601,200,1);paint.font='19px TeaserBody';paint.letterSpacing='7px';paint.fillText('ENTER THE ABYSS',960,667);
      paint.globalAlpha=1;paint.textAlign='left';paint.letterSpacing='0px';
     }
     videoTrack.requestFrame();frames++;
     if(elapsed>=nextSample){meter.getFloatTimeDomainData(samples);rms.push(Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length));nextSample+=.5;}
     if(screens.length<3&&elapsed>(screens.length+1)*shot.duration/4){const small=document.createElement('canvas');small.width=960;small.height=540;small.getContext('2d').drawImage(output,0,0,960,540);screens.push({time:elapsed,data:small.toDataURL('image/jpeg',.86).split(',')[1]});}
     if(elapsed<shot.duration)requestAnimationFrame(frame);else resolve();
    }catch(e){reject(e);}};requestAnimationFrame(frame);
   });
   await new Promise(resolve=>{media.onstop=resolve;media.stop();});stream.getVideoTracks().forEach(t=>t.stop());sound.clear();
   const blob=new Blob(chunks,{type:mime}),review=document.createElement('video'),url=URL.createObjectURL(blob);review.src=url;
   await new Promise((resolve,reject)=>{review.onloadedmetadata=resolve;review.onerror=()=>reject(Error('Capture did not decode'));});
   if(review.videoWidth!==1920||review.videoHeight!==1080)throw Error('Capture has no valid 1080p video track: '+shot.id);
   URL.revokeObjectURL(url);
   const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   const sorted=frameTimes.slice(1).sort((a,b)=>a-b);
   return {base64:btoa(binary),screens,report:{id:shot.id,frames,duration:elapsed,renderFps:frames/elapsed,frameP95:sorted[Math.floor(sorted.length*.95)],buffer:[renderer.renderer.domElement.width,renderer.renderer.domElement.height],rms,kills:world.stats.kills,hits:world.stats.hits,shots:world.stats.shots,collected:world.stats.collected,audio:sound.diagnostics},inputs:combat?recorder.finish(world):null};
  };
 },{width:captureWidth,height:captureHeight});
 const selected=only?shots.filter(s=>only.includes(s.id.slice(0,2))):proof?[shots[5],shots[13]]:shots;
 const reports=[];
 for(const shot of selected){
  console.log('CAPTURE',shot.id,shot.duration+'s');
  const result=await page.evaluate(shot=>window.captureShot(shot),shot);
  await writeFile(out+'/shots/'+shot.id+'.mp4',Buffer.from(result.base64,'base64'));
  for(let i=0;i<result.screens.length;i++)await writeFile(out+'/shots/'+shot.id+'-'+i+'.jpg',Buffer.from(result.screens[i].data,'base64'));
   if(result.inputs)await writeFile(out+'/shots/'+shot.id+'-inputs.json',JSON.stringify({fixture:'tools/record-teaser.mjs',note:'Scripted capture input log. Requires the shot fixture and timed spawn waves; not a standalone Survival replay.',shot,run:result.inputs}));
  reports.push(result.report);console.log(JSON.stringify(result.report));
  await writeFile(out+'/'+(only?'retake-report-'+selected.map(s=>s.id.slice(0,2)).join('-')+'.json':proof?'proof-report.json':'capture-report.json'),JSON.stringify({reports,errors},null,2));
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
