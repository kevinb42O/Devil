import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5198,strictPort:false,watch:null,hmr:false}});await server.listen();
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});const errors=[];
mkdirSync('artifacts/basketball/polish',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/basketball-polish-audit',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:#090b11}</style><canvas></canvas>'}));await page.goto(server.resolvedUrls.local[0]+'basketball-polish-audit');
 const initial=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),A=await import('/src/crew-avatar.ts'),B=await import('/src/courtyard-basketball.ts'),{CourtyardScene}=await import('/src/courtyard-scene.ts'),{createCourtyard}=await import('/src/courtyard-state.ts'),{World,idleInput}=await import('/src/simulation.ts');
  const court=new CourtyardScene();await Promise.all([court.ready,A.loadCrewAvatar()]);const world=new World(1,{schedule:false});world.courtyard=createCourtyard(1);world.addCrew('host');world.selectCrew('host');const player=world.crew[0];player.player.pos={x:B.BASKETBALL.x+.12,y:1.7,z:B.BASKETBALL.hoopZ-7};player.input={...idleInput(),yaw:Math.PI,pitch:.75};
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
  const camera=new T.PerspectiveCamera(75,innerWidth/innerHeight,.02,180),third=A.createCrewAvatar(0),first=A.createCrewAvatar(0,false,true);court.scene.add(first,third);
  const members=[{id:'host',name:'Ash',ready:false},{id:'guest',name:'Ember',ready:false}];world.courtyard.basketball.scores.host={points:9,made:4,attempts:7};
  window.fixture={T,A,B,court,world,renderer,camera,third,first,members};
  const point=new T.Vector3();A.updateCrewAvatar(third,player.input,player.player.vel,true,0,false,true);third.updateMatrixWorld(true);
  const bones=Object.fromEntries(['UpperArmR','LowerArmR','Middle1R','UpperArmL','LowerArmL','Middle1L'].map(n=>[n,third.getObjectByName(n).getWorldPosition(new T.Vector3()).toArray()]));
  window.drawPose=(phase,age=0)=>{
   const b=world.courtyard.basketball,ball=b.balls[0];world.tick=1000;ball.owner=phase==='follow'?null:'host';ball.shooter=phase==='follow'?'host':null;
   b.hands.host={held:phase==='set',charge:phase==='ready'?-1:phase==='set'?940:-1,armed:true,...(phase==='follow'?{released:1000-age*120,power:60/108}:{})};
   const pose=B.basketballPose(b,'host',world.tick);if(phase==='follow'){const launch=B.basketballLaunch(player,60/108);ball.pos=launch.pos;ball.vel=launch.vel;for(let t=0;t<Math.round(age*120);t++)B.integrateBasketball(ball,1/120);}
   for(const avatar of [third,first]){avatar.position.set(player.player.pos.x,player.player.pos.y,player.player.pos.z);avatar.rotation.y=Math.PI;A.updateCrewAvatar(avatar,player.input,player.player.vel,true,1000/120+age,false,true,1,undefined,false,pose);avatar.updateMatrixWorld(true);}
   court.update(world,members);first.visible=false;third.visible=true;
   camera.position.set(7.15,2.35,16.1);camera.lookAt(player.player.pos.x,1.55,player.player.pos.z+.25);renderer.render(court.scene,camera);
   const out={phase,age,pose,targets:third.userData.basketballPose,palms:Object.fromEntries(['Middle1R','Middle1L'].map(n=>{third.getObjectByName(n).getWorldPosition(point);third.worldToLocal(point);return [n,point.toArray()];})),elbows:Object.fromEntries(['LowerArmR','LowerArmL'].map(n=>{third.getObjectByName(n).getWorldPosition(point);third.worldToLocal(point);return [n,point.toArray()];}))};return out;
  };
  return {bones};
 });
 
 const poses=[];for(const [phase,age]of [['ready',0],['set',0],['follow',.08],['follow',.2],['follow',.5]]){poses.push(await page.evaluate(([phase,age])=>window.drawPose(phase,age),[phase,age]));await page.screenshot({path:`artifacts/basketball/polish/${phase}-${age}.png`});}
 await page.evaluate(()=>{window.drawPose('set');const {world,renderer,camera,court,third,first}=window.fixture;third.visible=false;first.visible=true;const p=world.crew[0];camera.position.set(p.player.pos.x,p.player.pos.y,p.player.pos.z);camera.lookAt(p.player.pos.x,p.player.pos.y+Math.sin(p.input.pitch),p.player.pos.z+Math.cos(p.input.pitch));renderer.render(court.scene,camera);});await page.screenshot({path:'artifacts/basketball/polish/first-person-set.png'});
 const transparency=await page.evaluate(()=>{const {A,first,third,world}=window.fixture,p=world.crew[0],faded=first.userData.avatarMaterials.every(m=>m.transparent&&m.opacity===.28&&!m.depthWrite),remoteOpaque=third.userData.avatarMaterials.every(m=>m.opacity===1);A.updateCrewAvatar(first,p.input,p.player.vel,true,20,false,false);return {faded,remoteOpaque,restored:first.userData.avatarMaterials.every(m=>m.opacity===1&&!m.transparent&&m.depthWrite)};});
 assert.deepEqual(transparency,{faded:true,remoteOpaque:true,restored:true});
 for(const pose of poses.filter(p=>p.phase==='ready'||p.phase==='set'))for(const [bone,target]of [['Middle1R','right'],['Middle1L','left']])assert.ok(Math.hypot(...pose.palms[bone].map((n,i)=>n-pose.targets[target][i]))<.08,'palms should touch the ball');
 assert.ok(poses[3].palms.Middle1R[1]>poses[1].palms.Middle1R[1]);assert.ok(poses[3].palms.Middle1L[1]<poses[1].palms.Middle1L[1]-.3);
 const dunkPoses=[];
 for(const frame of [10,24,36,47,80]){
  const pose=await page.evaluate(frame=>{const {B,A,world,court,camera,renderer,third,first,members}=window.fixture,p=world.crew[0],b=world.courtyard.basketball;world.tick=2000;p.player.pos={x:B.BASKETBALL.x,y:1.7,z:B.BASKETBALL.hoopZ-1.2};p.player.vel={x:0,y:0,z:0};p.player.grounded=true;p.input={...p.input,yaw:Math.PI,pitch:0,fire:false,homing:true};b.balls[0].owner='host';b.balls[0].pos=B.basketballHeldPoint(p,0);b.hands.host={held:false,charge:-1,armed:true,secondary:false};
   for(let t=0;t<=frame;t++){world.stepCrewEntrance(new Map([['host',p.input]]));B.stepBasketball(world.courtyard,[{...p,input:{...p.input,homing:t===0}}],world.tick,1/120);}
   const shot=B.basketballPose(b,p.id,world.tick,p);third.position.set(p.player.pos.x,p.player.pos.y,p.player.pos.z);third.rotation.y=Math.PI;A.updateCrewAvatar(third,p.input,p.player.vel,p.player.grounded,world.tick/120,false,true,1,undefined,false,shot);third.updateMatrixWorld(true);first.visible=false;third.visible=true;court.update(world,members);camera.position.set(7.2,3.3,B.BASKETBALL.hoopZ-2.2);camera.lookAt(B.BASKETBALL.x,2.8,B.BASKETBALL.hoopZ-.2);renderer.render(court.scene,camera);return {shot,position:{...p.player.pos},ball:{...b.balls[0].pos},score:b.scores.host};},frame);
  dunkPoses.push(pose);await page.screenshot({path:`artifacts/basketball/polish/dunk-${frame}.png`});
 }
 await page.evaluate(()=>{const {B,court,camera,renderer,first,third}=window.fixture;first.visible=third.visible=false;court.scene.getObjectByName('basketball-shot-guide').visible=false;camera.position.set(B.BASKETBALL.x-1,3.5,B.BASKETBALL.hoopZ-3);camera.lookAt(B.BASKETBALL.x,2.9,B.BASKETBALL.hoopZ);renderer.render(court.scene,camera);});await page.screenshot({path:'artifacts/basketball/polish/hoop-detail.png'});
 const signage=await page.evaluate(()=>{const {T,court,camera,renderer,third,first}=window.fixture;third.visible=first.visible=false;const names=['basketball-scoreboard','drawing-court-wall-sign'];const result=names.map(name=>{const board=court.scene.getObjectByName(name);const before=board.matrixWorld.toArray();camera.position.set(8,3.35,14.9);camera.lookAt(13.35,3.35,14.9);renderer.render(court.scene,camera);const fixed=before.every((n,i)=>Math.abs(n-board.matrixWorld.elements[i])<1e-9);return {name,type:board.type,position:board.position.toArray(),normal:new T.Vector3(0,0,1).applyQuaternion(board.quaternion).toArray(),fixed};});return result;});
 await page.screenshot({path:'artifacts/basketball/polish/left-wall-scoreboard.png'});
 await page.evaluate(()=>{const {court,camera,renderer}=window.fixture;camera.position.set(79,3,9);camera.lookAt(81,4.3,19.94);renderer.render(court.scene,camera);});await page.screenshot({path:'artifacts/basketball/polish/drawing-wall-sign.png'});
 assert.ok(signage.every(s=>s.type==='Mesh'&&s.fixed));assert.ok(signage[0].position[0]>13&&Math.abs(signage[0].position[2]-14.9)<.01);
 assert.deepEqual(errors,[]);writeFileSync('artifacts/basketball/polish/audit.json',JSON.stringify({signage,poses,dunkPoses,initial,transparency,errors},null,2));console.log('Polish checks passed: mounted signs, separate shooting/guide arms, translucent first-person hands, release and recovery.');
}finally{await browser.close();await server.close();}
