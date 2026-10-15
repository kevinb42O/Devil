import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.route(base+'/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}</style>'}));await page.goto(base);
 const result=await page.evaluate(async()=>{
  const {CourtyardScene}=await import('/src/courtyard-scene.ts'),{OriginalEnemies}=await import('/src/original-enemies.ts'),{World}=await import('/src/simulation.ts'),{createCourtyard}=await import('/src/courtyard-state.ts'),{Sound}=await import('/src/audio.ts');
  const THREE=await import(performance.getEntriesByType('resource').find(e=>/\/three\.js(?:\?|$)/.test(e.name)).name);
  const check=(ok,message)=>{if(!ok)throw Error(message);},court=new CourtyardScene(),assets=new OriginalEnemies();await Promise.all([court.ready,assets.loaded]);check(assets.ready,assets.error);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,900);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(65,1280/900,.05,160);camera.position.set(0,0,3);camera.lookAt(0,0,0);
  const combat=new THREE.Scene();combat.background=new THREE.Color(0x111111);combat.add(assets.clone('skull'));
  renderer.render(combat,camera);const before=renderer.domElement.toDataURL();
  const originals=[];assets.templates.get('skull').traverse(o=>{if(o.isMesh)originals.push([o,o.material,o.geometry,o.material.type]);});
  court.setSkull(assets.clone('skull'));
  const world=new World(1,{schedule:false});world.courtyard=createCourtyard(1);court.update(world,[]);
  renderer.render(combat,camera);check(before===renderer.domElement.toDataURL(),'Combat skull pixels must be unchanged');
  check(originals.every(([o,m,g,type])=>o.material===m&&o.geometry===g&&o.material.type===type),'Combat materials and geometry must stay shared and unchanged');
  check(!combat.getObjectByName('football-skull-lighting'),'Football lights cannot enter combat scene');
  const light=court.scene.getObjectByName('football-skull-lighting');check(light.parent===court.scene&&light.children.length===2,'Lighting rig is courtyard-only');
  camera.position.set(36,1.7,5.5);camera.lookAt(36,.6,1);camera.updateMatrixWorld();
  const measure=()=>{renderer.render(court.scene,camera);const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=900;const ctx=canvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0);const center=new THREE.Vector3(36,.36,2).project(camera),x=Math.round((center.x+1)*640),y=Math.round((1-center.y)*450),pixels=ctx.getImageData(x-35,y-35,70,70).data;let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];return sum/(pixels.length/4);};
  const materials=[];court.skull.traverse(o=>{if(o.isMesh)materials.push(o.material);});light.visible=false;for(const m of materials)m.emissiveIntensity=0;const baseline=measure();light.visible=true;for(const m of materials)m.emissiveIntensity=.32;const illuminated=measure();check(illuminated>baseline*1.15,`Skull should brighten clearly: ${baseline} -> ${illuminated}`);
  world.courtyard.skull.pos.x=39;court.update(world,[]);check(light.position.x===39,'Lights follow rolling skull');world.courtyard.skull.resetAt=100;court.update(world,[]);check(!light.visible,'Lights hide while skull resets');world.courtyard.skull.resetAt=0;world.courtyard.skull.pos.x=36;court.update(world,[]);
  check(court.diagnostics.scores.every(s=>s.goals.join(':')==='0:0'),'Both goals begin with zero score');world.courtyard.skull.goals=[2,3];court.update(world,[]);check(court.diagnostics.scores.every(s=>s.goals.join(':')==='2:3'),'Both goal displays update from one shared score');
  check(court.diagnostics.scores[0].position[2]<0&&court.diagnostics.scores[1].position[2]>20,'Scoreboards are mounted above opposite goals');
  const {loadCrewAvatar,createCrewAvatar,updateCrewAvatar}=await import('/src/crew-avatar.ts');await loadCrewAvatar();
  for(const firstPerson of [false,true]){
   const avatar=createCrewAvatar(0,false,firstPerson),neutral={forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false},left=avatar.getObjectByName('FootL'),right=avatar.getObjectByName('FootR');check(!!left&&!!right,'Left leg rig loads');
   const position=bone=>{avatar.updateMatrixWorld(true);return bone.getWorldPosition(new THREE.Vector3());};
   updateCrewAvatar(avatar,neutral,{x:0,y:0,z:0},true,1,false,true);const baseLeft=position(left),baseRight=position(right);
   updateCrewAvatar(avatar,neutral,{x:0,y:0,z:0},true,1,false,true,1,{charge:1,age:100,power:1});const windup=position(left);check(windup.distanceTo(baseLeft)>.2,'Left leg visibly winds up '+JSON.stringify({firstPerson,base:baseLeft.toArray(),windup:windup.toArray(),pose:avatar.userData.footballKick,bones:avatar.children.map(c=>c.name)}));check(position(right).distanceTo(baseRight)<.005,'Right leg keeps its normal pose');
   updateCrewAvatar(avatar,neutral,{x:0,y:0,z:0},true,1,false,true,1,{charge:0,age:.13,power:1});const strike=position(left);check(strike.z<baseLeft.z-.15,'Left foot strikes forward');
   for(let i=0;i<10;i++)updateCrewAvatar(avatar,neutral,{x:0,y:0,z:0},true,1,false,true,1,{charge:0,age:.13,power:1});check(position(left).distanceTo(strike)<.005,'Sampling a paused kick cannot accumulate leg rotations');
   updateCrewAvatar(avatar,neutral,{x:0,y:0,z:0},true,1,false,false,1,{charge:1,age:0,power:1});check(position(left).distanceTo(baseLeft)<.005,'Football leg poses cannot enter combat');
  }
  const sound=new Sound();await sound.prepareCourtyard();const buffer=sound.buffers.get('football-goal');check(buffer?.duration>.3&&buffer.duration<2,'Downloaded whistle decodes as a short goal cue');sound.courtyard('goal',{x:36,y:.36,z:-20});check(sound.diagnostics.oneShotNames.filter(n=>n==='football-goal').length===1,'Goal plays the dedicated recording');sound.courtyard('goal',{x:36,y:.36,z:-20});check(sound.diagnostics.oneShotNames.length===1,'Duplicate goal cue is throttled');check([...sound.shots].every(v=>!v.panner),'Goal is audible across the pitch');
  const offline=new OfflineAudioContext(1,48000,48000),source=offline.createBufferSource(),gain=offline.createGain();source.buffer=buffer;gain.gain.value=sound.volumeFor('football-goal')*.55;source.connect(gain);gain.connect(offline.destination);source.start();const rendered=await offline.startRendering(),samples=rendered.getChannelData(0),rms=Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length);check(rms>.002,'Goal recording produces audible output');sound.clear();check(sound.diagnostics.oneShots===0,'Leaving the prelobby clears goal audio');
  world.courtyard=createCourtyard(2);court.update(world,[]);check(court.diagnostics.scores.every(s=>s.goals.join(':')==='0:0'),'Returning to a fresh courtyard clears both scoreboards');world.courtyard.skull.goals=[2,3];court.update(world,[]);
  window.fixture={court,world,renderer,camera};renderer.render(court.scene,camera);
  return {combatPixelsUnchanged:true,baseline,illuminated,goalDuration:buffer.duration,goalRms:rms,scores:court.diagnostics.scores};
 });
 await page.screenshot({path:'artifacts/football-skull-illuminated.png'});
 await page.evaluate(()=>{const {renderer,camera,court}=window.fixture;camera.position.set(36,1.7,-12);camera.lookAt(36,2,-21);renderer.render(court.scene,camera);});await page.screenshot({path:'artifacts/football-goal-score-north.png'});
 await page.evaluate(()=>{const {renderer,camera,court}=window.fixture;camera.position.set(36,1.7,16);camera.lookAt(36,2,25);renderer.render(court.scene,camera);});await page.screenshot({path:'artifacts/football-goal-score-south.png'});
 assert.deepEqual(errors,[]);console.log('Football feedback passed:',JSON.stringify(result));
}finally{await browser.close();}
