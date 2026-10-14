import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Launch FOV regression</title>'}));await page.goto(url);
 const result=await page.evaluate(async()=>{
  const [T,{World},{OriginalWeapon},{ProjectileLighting},{HAND_MUZZLES,weaponMuzzle}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/original-weapon.ts'),import('/src/projectile-lighting.ts'),import('/src/weapon-origin.ts')]);
  const scene=new T.Scene(),weapon=new OriginalWeapon(scene);await weapon.loaded;if(!weapon.ready)throw Error(weapon.error);
  const lighting=new ProjectileLighting(scene,new T.MeshBasicMaterial()),world=new World(1,{schedule:false});
  world.player.pos={x:3,y:5,z:7};const camera=new T.PerspectiveCamera(90,16/9,.05,100);camera.position.copy(world.player.pos);
  const check=(v,label)=>{if(!v)throw Error(label);};let checks=0,maxError=0;
  for(const aspect of [16/9,4/3,9/16])for(const fov of [75,90,115,145])for(const [yaw,pitch] of [[0,0],[.8,.6],[-1.1,-1.2]])for(let level=1;level<=4;level++){
   camera.aspect=aspect;camera.fov=fov;camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateProjectionMatrix();world.level=level;
   weapon.resize(aspect*360,360);weapon.update(world,0,false,camera);
   for(let i=0;i<HAND_MUZZLES[level-1].length;i++){
    const pos=weaponMuzzle(world.player.pos,yaw,pitch,level,i),p={id:i,shotKey:`local:1:${i}`,pos,vel:{x:0,y:0,z:-70},age:0,level,homing:false};
    const original=JSON.stringify(p),visual=weapon.projectileView(p,new T.Vector3(pos.x,pos.y,pos.z)),screen=visual.project(camera),tip=weapon.socketScreen(level,i);
    const error=Math.hypot(screen.x-tip.x,screen.y-tip.y);maxError=Math.max(maxError,error);check(error<1e-10,'launch aligns with fingertip');
    check(JSON.stringify(p)===original,'projection never mutates physics');
    p.age=.1;const far=weapon.projectileView(p,new T.Vector3(pos.x,pos.y,pos.z));check(far.distanceTo(new T.Vector3(pos.x,pos.y,pos.z))===0,'flight joins authoritative path');checks++;
   }
  }
  camera.fov=145;camera.aspect=16/9;camera.rotation.set(0,0,0);camera.updateProjectionMatrix();world.level=1;
  const pos=weaponMuzzle(world.player.pos,0,0,1);pos.z-=2;
  world.projectiles=[{id:100,shotKey:'local:2:0',pos,vel:{x:0,y:0,z:-70},age:.03,level:1,homing:false}];
  weapon.update(world,0,false,camera);lighting.update(world,false,1,360,weapon.projectileView);
  const mesh=weapon.daggers[0].instanceMatrix.array,glow=lighting.glow.geometry.getAttribute('shotCenter');
  check(Math.hypot(mesh[12]-glow.getX(0),mesh[13]-glow.getY(0),mesh[14]-glow.getZ(0))<1e-6,'dagger and glow share visual path');
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(960,540);renderer.setClearColor(0);
  renderer.render(scene,camera);weapon.render(renderer,false);const screenshot=renderer.domElement.toDataURL();renderer.dispose();
  const field=lighting.pixels.slice();lighting.update(world,false,1,360);check(field.every((v,i)=>v===lighting.pixels[i]),'floor spill follows physical path');
  const localPlayer=world.player;world.crew=[{id:'local',player:localPlayer}];weapon.update(world,0,false,camera);
  const remote={...world.projectiles[0],shotKey:'remote:2:0'},remotePos={...remote.pos};weapon.projectileView(remote,remotePos);check(JSON.stringify(remotePos)===JSON.stringify(remote.pos),'remote shots retain world projection');
  world.crew=[];world.projectiles[0].floorBounces=1;const bounced={...world.projectiles[0].pos};weapon.projectileView(world.projectiles[0],bounced);check(JSON.stringify(bounced)===JSON.stringify(world.projectiles[0].pos),'ricochets retain world projection');
  weapon.update(world,0,false);const spectator={...pos};weapon.projectileView({...world.projectiles[0],floorBounces:0},spectator);check(JSON.stringify(spectator)===JSON.stringify(pos),'spectator view has no local projection');
  return {socketChecks:checks,maxError,meshGlowMatch:true,physicsUnchanged:true,remoteAndSpectatorUnchanged:true,screenshot};
 });
 assert.deepEqual(errors,[]);await mkdir('test-results/weapon-fov',{recursive:true});await writeFile('test-results/weapon-fov/launch-145.png',Buffer.from(result.screenshot.split(',')[1],'base64'));delete result.screenshot;console.log('Launch FOV checks passed:',result);
}finally{await browser.close();}
