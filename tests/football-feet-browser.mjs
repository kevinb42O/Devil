import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5194,strictPort:false,watch:{ignored:['**/external-trainer/**']}}});
await server.listen();
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=server.resolvedUrls.local[0];
 await page.route(base,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
 await page.goto(base);
 await page.evaluate(async()=>{
  const {loadCrewAvatar,createCrewAvatar,updateCrewAvatar}=await import('/src/crew-avatar.ts');
  const {createCourtyard,footballKickPose}=await import('/src/courtyard-state.ts');
  const {stepFootballKicks}=await import('/src/courtyard-physics.ts');
  const {controllerState}=await import('/src/controls.ts');
  await loadCrewAvatar();
  for(const controller of [false,true])for(const firstPerson of [false,true])for(const right of [false,true]){
   const avatar=createCrewAvatar(0,false,firstPerson),input={forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:!right,homing:right};
   if(controller){const pad={axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===(right?7:6),value:i===(right?7:6)?1:0}))};const courtyard=controllerState(pad,.15,true),combat=controllerState(pad,.15);input.fire=courtyard.fire;input.homing=courtyard.homing;if(combat.fire!==right||combat.homing===right)throw Error('Combat triggers must retain RT fire / LT homing');}
   const c=createCourtyard(1),player={id:'host',player:{pos:{x:36,y:1.7,z:3.1},vel:{x:0,y:0,z:0}},input};
   const foot=avatar.getObjectByName(right?'FootR':'FootL'),other=avatar.getObjectByName(right?'FootL':'FootR');
   if(!foot||!other)throw Error('Both feet must exist');
   const pos=b=>{avatar.updateMatrixWorld(true);return b.getWorldPosition(b.position.clone());};
   updateCrewAvatar(avatar,input,player.player.vel,true,1,false,true);
   const neutral=pos(foot),otherNeutral=pos(other);
   stepFootballKicks(c,[player],1);input.fire=false;input.homing=false;stepFootballKicks(c,[player],145);
   const pose=footballKickPose(structuredClone(c),'host',145);
   updateCrewAvatar(avatar,input,player.player.vel,true,1,false,true,1,{...pose,age:.13});
   const strike=pos(foot);
   if(strike.z>=neutral.z-.15)throw Error('Selected foot must strike forward: '+JSON.stringify({right,firstPerson,neutral,strike}));
   if(pos(other).distanceTo(otherNeutral)>.005)throw Error('Other foot must stay neutral');
   for(let i=0;i<10;i++)updateCrewAvatar(avatar,input,player.player.vel,true,1,false,true,1,{...pose,age:.13});
   if(pos(foot).distanceTo(strike)>.005)throw Error('Repeated sampling must not accumulate rotation');
   updateCrewAvatar(avatar,input,player.player.vel,true,1,false,false,1,pose);
   if(pos(foot).distanceTo(neutral)>.005)throw Error('Kick pose must clear in combat');
  }
 });
 assert.deepEqual(errors,[]);console.log('Mouse buttons and LT/RT select matching feet in first/third person; combat retains RT fire / LT homing.');
}finally{await browser.close();await server.close();}
