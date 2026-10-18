import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';

const directory='artifacts/teaser-environments';await mkdir(directory+'/shots',{recursive:true});
const python='/Users/kevin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const ffmpeg=execFileSync(python,['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
const shots=[
 {id:'01-cosmic-sweep',duration:9,start:5,bed:'space',fov:60,path:[[-31,8,25],[-22,14,33],[0,19,36],[28,12,27]],look:[[0,5,-2],[0,7,-3],[2,6,-5]]},
 {id:'02-orbital-stone',duration:7,start:12,bed:'space',fov:59,path:[[-35,5,12],[-34,9,-4],[-26,14,-23],[-6,16,-35]],look:[[-12,7,-10],[-12,8,-10],[-8,8,-10]]},
 {id:'03-storm-voyage',duration:9,start:92,bed:'storm',fov:63,path:[[30,6,25],[21,4,24],[0,3.1,23],[-25,10,20]],look:[[3,4,-4],[-3,5,-5],[-7,7,-8]]},
 {id:'04-waterline',duration:6,start:105,bed:'storm',fov:58,path:[[-17,1.05,15],[-6,.8,11],[8,1.5,9],[18,5,9]],look:[[-2,1.3,-8],[0,2,-10],[2,5,-12]]},
 {id:'05-violet-passage',duration:8,start:175,bed:'veil',fov:59,path:[[-30,5,18],[-20,6,12],[0,8,15],[24,13,20]],look:[[-8,6,-8],[1,7,-11],[8,9,-16]]},
 {id:'06-furnace-crane',duration:9,start:295,bed:'furnace',fov:62,path:[[28,19,26],[24,12,27],[15,6,28],[-4,3.8,25]],look:[[0,2,-1],[-3,3,-6],[-8,5,-10]]},
 {id:'07-serpent-drift',duration:7,start:310,bed:'furnace',fov:58,follow:true,path:[],look:[]},
 {id:'08-cathedral-ascent',duration:10,start:400,bed:'cathedral',fov:61,path:[[-22,2.5,22],[-12,5,27],[5,12,31],[25,23,26]],look:[[-3,5,-13],[0,15,-20],[1,27,-25]]},
 {id:'09-light-and-limestone',duration:7,start:415,bed:'cathedral',fov:57,path:[[-18,1.05,13],[-6,1.5,12],[6,3.5,14],[19,8,18]],look:[[0,2,-6],[-2,5,-10],[-4,13,-18]]},
 {id:'10-cathedral-recession',duration:9,start:430,bed:'cathedral',fov:61,path:[[4,7,17],[13,14,25],[25,24,34],[34,32,43]],look:[[-1,8,-10],[0,12,-12],[1,14,-15]]},
 {id:'11-beneath-the-world',duration:6,start:487,bed:'depth',fov:65,path:[[-18,4,23],[-10,6,27],[4,10,28],[20,15,24]],look:[[0,8,-10],[0,14,-17],[0,20,-23]]},
 {id:'12-title',duration:5,start:493,bed:'depth',fov:65,title:true,path:[[-7,6,28],[0,8,29],[7,10,28]],look:[[0,13,-13],[0,15,-16]]},
];
let cursor=0;for(const shot of shots){shot.filmIn=cursor;shot.filmOut=cursor+shot.duration;cursor+=shot.duration-1;}
await writeFile(directory+'/shot-manifest.json',JSON.stringify({title:'DESCEND — Environment Film',duration:cursor+1,width:1920,height:1080,fps:30,dissolve:1,source:'Fixed-step native 1080p game rendering. Cinematic spectator cameras, staged drifting creatures and the game Gigapede movement. No player firing, kills or first-person views.',shots},null,2));

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
let encoder=null,encoderError='',frameCount=0;
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.exposeFunction('encodeEnvironmentFrame',async data=>{
  if(!encoder||encoder.exitCode!==null)throw Error('Encoder unavailable');
  if(!encoder.stdin.write(Buffer.from(data,'base64')))await once(encoder.stdin,'drain');
  frameCount++;
 });
 await page.route('**/environment-film-capture',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/environment-film-capture');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,idleInput,STEP},{floorHeight},{updateGigapede},THREE]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/arena.ts'),import('/src/gigapede-motion.ts'),import('/node_modules/three/build/three.module.js')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:60,mist:true,screenShake:0,movementMotion:0});await renderer.prepare();
  renderer.renderer.setPixelRatio(1);renderer.renderer.setSize(1920,1080);renderer.composer.setPixelRatio(1);renderer.composer.setSize(1920,1080);renderer.bloom.setSize(960,540);renderer.originalWeapon.resize(1920,1080);
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const paint=canvas.getContext('2d',{alpha:false});
  await Promise.all([
   new FontFace('EnvironmentTitle','url(/node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2)',{weight:'700'}).load().then(f=>document.fonts.add(f)),
   new FontFace('EnvironmentBody','url(/node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2)').load().then(f=>document.fonts.add(f)),
  ]);
  const curve=points=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  window.renderEnvironmentShot=async shot=>{
   renderer.clear();renderer.resetFeedback();renderer.baseFov=shot.fov;
   const world=new World(933+Number(shot.id.slice(0,2)),{schedule:false,invulnerable:true});world.startAt(shot.start,1,0);
   const towers=[world.spawn('squid2',v(-12,4.6,-10)),world.spawn('squid',v(15,3.3,-21)),world.spawn('squid',v(-25,3.3,-26))];
   for(const e of towers){e.age=20;e.status='idle';e.nextSpawn=Infinity;e.towerEmission=undefined;e.nextBeckon=Infinity;}
   const drifters=[];
   for(let i=0;i<7;i++){const e=world.spawn(i===0?'skull3':i%3===0?'skull2':'skull',v((i-3)*3,2.5+i*.4,-2-(i%3)*5));e.age=8;e.activeAt=0;drifters.push(e);}
   const swimmer=world.spawn('gigapede',v(9,0,-12));
   if(!['01','03','05','07','08','10'].includes(shot.id.slice(0,2)))world.enemies=world.enemies.filter(e=>e!==swimmer);
   const advance=(delta,t)=>{
    const goal=v(Math.sin(t*.18)*11,1.7,Math.cos(t*.18)*11);
    for(let j=0;j<Math.round(delta/STEP);j++){swimmer.age+=STEP;updateGigapede(swimmer,STEP,goal,0,()=>{});}
    for(let i=0;i<drifters.length;i++){
     const e=drifters[i],a=i*.89+t*.15;
     e.pos=v(Math.sin(a)*(9+i*.7),2.8+Math.sin(t*.45+i)*.65+(i%3)*.8,-4+Math.cos(a)*(7+i*.45));e.age+=delta;e.facingYaw=-a;
    }
    for(let i=0;i<towers.length;i++){const e=towers[i];e.age+=delta;e.phase+=delta*.025;}
    world.effects=[];world.projectiles=[];world.rings=[];
   };
   // A fully emerged, naturally moving creature. No attacks are simulated.
   for(let i=0;i<180;i++)advance(1/30,i/30);
   const path=shot.follow?null:curve(shot.path),look=shot.follow?null:curve(shot.look);
   const cameraAt=t=>{
    const p=Math.max(0,Math.min(1,t/shot.duration)),u=.2*p+.8*smooth(p);
    let position,target;
    if(shot.follow){
     const a=-1.1+u*.45,center=swimmer.pos;
     position=new THREE.Vector3(center.x+Math.sin(a)*42,center.y+16-u*4,center.z+Math.cos(a)*42);
     const tail=swimmer.segments[Math.min(5,swimmer.segments.length-1)].pos;target=new THREE.Vector3(center.x*.65+tail.x*.35,center.y*.65+tail.y*.35,center.z*.65+tail.z*.35);
    }else{position=path.getPointAt(u);target=look.getPointAt(u);}
    position.y=Math.max(position.y,floorHeight(position.x,position.z,world.time,0)+.65);
    const dx=target.x-position.x,dy=target.y-position.y,dz=target.z-position.z;
    return {position:v(position.x,position.y,position.z),yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),target:v(target.x,target.y,target.z)};
   };
   const initial=cameraAt(0);for(let i=0;i<4;i++)renderer.render(world,initial.yaw,initial.pitch,1/30,false,1,initial.position,false,false,null);
   const screenshots=[],motion=[],audio=[];let last=null,distance=0,maxStep=0;
   const n=Math.round(shot.duration*30);
   for(let f=0;f<n;f++){
    const t=f/30;world.time=shot.start+t;world.tick=Math.round(world.time/STEP);advance(1/30,t+6);
    // Keeping the player's invisible origin near the creatures supplies stable
    // model-facing coordinates; the spectator camera is entirely independent.
    world.player.pos=v(Math.sin((t+6)*.18)*11,1.7,Math.cos((t+6)*.18)*11);
    const cam=cameraAt(t);
    renderer.render(world,cam.yaw,cam.pitch,1/30,false,1,cam.position,false,false,null);
    paint.globalAlpha=1;paint.drawImage(renderer.renderer.domElement,0,0);
    if(shot.title){
     paint.fillStyle='rgba(3,5,10,.77)';paint.fillRect(0,0,1920,1080);paint.textAlign='center';paint.globalAlpha=smooth(t/1.2);
     paint.fillStyle='#bfa48b';paint.font='19px EnvironmentBody';paint.letterSpacing='9px';paint.fillText('D E S C E N D',960,384);
     paint.fillStyle='#ece7de';paint.font='700 130px EnvironmentTitle';paint.letterSpacing='7px';paint.fillText('ABYSS / DAGGERS',960,550);
     paint.fillStyle='#b2a08c';paint.fillRect(875,599,170,1);paint.font='16px EnvironmentBody';paint.letterSpacing='6px';paint.fillText('ENTER THE ABYSS',960,659);paint.globalAlpha=1;paint.textAlign='left';paint.letterSpacing='0px';
    }
    if(last){const d=Math.hypot(cam.position.x-last.x,cam.position.y-last.y,cam.position.z-last.z);distance+=d;maxStep=Math.max(maxStep,d);}last={...cam.position};
    const hero=shot.follow?swimmer:towers[0],dx=hero.pos.x-cam.position.x,dz=hero.pos.z-cam.position.z,dist=Math.hypot(dx,hero.pos.y-cam.position.y,dz);
    audio.push({t,kind:hero.kind,distance:dist,pan:Math.max(-1,Math.min(1,(dx*Math.cos(cam.yaw)-dz*Math.sin(cam.yaw))/Math.max(1,Math.hypot(dx,dz))))});
    if(f%30===0)motion.push({t,position:cam.position,target:cam.target,enemies:world.enemies.length});
    if([Math.round(n*.18),Math.round(n*.5),Math.round(n*.82)].includes(f)){
     const preview=document.createElement('canvas');preview.width=960;preview.height=540;preview.getContext('2d').drawImage(canvas,0,0,960,540);screenshots.push(preview.toDataURL('image/jpeg',.9).split(',')[1]);
    }
    await window.encodeEnvironmentFrame(canvas.toDataURL('image/jpeg',.96).split(',')[1]);
   }
   return {id:shot.id,frames:n,duration:shot.duration,buffer:[renderer.renderer.domElement.width,renderer.renderer.domElement.height],cameraDistance:distance,maxCameraStep:maxStep,firstPerson:false,shots:world.stats.shots,kills:world.stats.kills,motion,audio,screenshots};
  };
 });
 const reports=[];
 for(const shot of shots.filter(s=>!only||only.includes(s.id.slice(0,2)))){
  const began=Date.now();encoderError='';frameCount=0;
  encoder=spawn(ffmpeg,['-hide_banner','-y','-f','image2pipe','-vcodec','mjpeg','-framerate','30','-i','pipe:0','-an','-c:v','h264_videotoolbox','-b:v','24M','-profile:v','high','-pix_fmt','yuv420p','-r','30','-fps_mode','cfr','-video_track_timescale','15360','-movflags','+faststart',directory+'/shots/'+shot.id+'.mp4'],{stdio:['pipe','ignore','pipe']});
  encoder.stderr.on('data',d=>encoderError+=d);const closed=once(encoder,'close');
  console.log('RENDER',shot.id,shot.duration*30,'frames');
  const result=await page.evaluate(shot=>window.renderEnvironmentShot(shot),shot);encoder.stdin.end();const [code]=await closed;
  await writeFile(directory+'/shots/'+shot.id+'-encode.log',encoderError);
  if(code!==0||frameCount!==shot.duration*30)throw Error('Incomplete shot '+shot.id+': '+encoderError.slice(-500));
  for(let i=0;i<result.screenshots.length;i++)await writeFile(directory+'/shots/'+shot.id+'-'+i+'.jpg',Buffer.from(result.screenshots[i],'base64'));
  delete result.screenshots;result.renderSeconds=(Date.now()-began)/1000;
  await writeFile(directory+'/shots/'+shot.id+'-metadata.json',JSON.stringify(result,null,2));
  reports.push({id:result.id,frames:result.frames,renderSeconds:result.renderSeconds,cameraDistance:result.cameraDistance,maxCameraStep:result.maxCameraStep,shots:result.shots,kills:result.kills,buffer:result.buffer});
  console.log(JSON.stringify(reports.at(-1)));
  await writeFile(directory+'/capture-report'+(only?'-'+only.join('-'):'')+'.json',JSON.stringify({reports,errors},null,2));
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{if(encoder&&encoder.exitCode===null)encoder.kill();await browser.close();}
