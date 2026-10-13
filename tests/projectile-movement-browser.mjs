import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:640,height:480}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [T,{World,v,idleInput,STEP},{GameRenderer},{weaponMuzzle},{sampleProjectile}]=await Promise.all([
   import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/renderer.ts'),import('/src/weapon-origin.ts'),import('/src/projectile-presentation.ts'),
  ]);
  const renderer=new GameRenderer(document.createElement('canvas'),{quality:'low',fov:90});
  await renderer.originalWeapon.loaded;if(!renderer.originalWeapon.ready)throw Error(renderer.originalWeapon.error);
  const check=(yes,label)=>{if(!yes)throw Error(label);};
  let frames=0,launchChecks=0,maxCameraError=0,maxDaggerError=0,maxLaunchError=0;
  for(const fps of [30,60,144,240])for(const strafe of [-1,1]){
   const w=new World(71,{schedule:false,invulnerable:true});w.level=4;w.player.pos=v(0,8,0);w.player.vel=v(strafe*18,7,0);
   const input={...idleInput(),strafe,yaw:.3,pitch:.2,fire:true};let accumulator=0;
   for(let frame=0;frame<Math.ceil(fps*.25);frame++){
    accumulator+=1/fps;
    while(accumulator+1e-10>=STEP){
     w.step(input);accumulator=Math.max(0,accumulator-STEP);
     for(const effect of w.effects.filter(e=>e.kind==='shot'))for(let i=0;i<effect.muzzles.length;i++){
      const expected=weaponMuzzle(w.player.pos,input.yaw,input.pitch,w.level,i),actual=effect.muzzles[i];
      maxLaunchError=Math.max(maxLaunchError,Math.hypot(expected.x-actual.x,expected.y-actual.y,expected.z-actual.z));launchChecks++;
     }
     w.effects=[];
    }
    const alpha=accumulator/STEP,before=w.previousPlayerPosition;
    renderer.render(w,input.yaw,input.pitch,1/fps,false,alpha);
    const expected=new T.Vector3(before.x,before.y,before.z).lerp(new T.Vector3(w.player.pos.x,w.player.pos.y,w.player.pos.z),alpha);
    maxCameraError=Math.max(maxCameraError,renderer.camera.position.distanceTo(expected));
    const cursors=Array(6).fill(0);
    for(const p of w.projectiles){
     const index=renderer.originalWeapon.daggerIndex(p.level,p.homing),matrix=new T.Matrix4();
     renderer.originalWeapon.daggers[index].getMatrixAt(cursors[index]++,matrix);
     const actual=new T.Vector3().setFromMatrixPosition(matrix),expected=sampleProjectile(p,alpha,v());
     maxDaggerError=Math.max(maxDaggerError,actual.distanceTo(new T.Vector3(expected.x,expected.y,expected.z)));
     const blade=new T.Vector3(0,0,1).transformDirection(matrix),flight=new T.Vector3(p.vel.x,p.vel.y,p.vel.z).normalize();
     check(blade.dot(flight)>.999999,'moving primary dagger points along its fixed flight direction');
    }
    w.effects=[];frames++;
   }
   renderer.render(w,input.yaw,input.pitch,0,false,1);
   check(renderer.camera.position.distanceTo(new T.Vector3(w.player.pos.x,w.player.pos.y,w.player.pos.z))<1e-9,'frozen frame shows latest completed tick');
   const spectator=v(3,20,4);renderer.render(w,0,0,0,false,.2,spectator);
   check(renderer.camera.position.distanceTo(new T.Vector3(3,20,4))<1e-9,'spectator position remains immediate');
   renderer.clear();
  }
  check(maxCameraError<1e-9,'camera samples the same tick fraction as projectiles');
  check(maxDaggerError<1e-5,'actual instance transforms match interpolated projectile positions');
  check(launchChecks>0,'exercise moving fingertip launches');
  check(maxLaunchError<1e-9,'physical launch stays on its fingertip');
  return {frames,launchChecks,frameRates:[30,60,144,240],maxCameraError,maxDaggerError,maxLaunchError};
 });
 assert.deepEqual(errors,[]);console.log('Moving projectile render checks passed:',result);
}finally{await browser.close();}
