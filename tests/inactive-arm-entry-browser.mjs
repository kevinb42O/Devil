import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.route('**/inactive-arm-test',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/inactive-arm-test');
 const result=await page.evaluate(async()=>{
  const [A,T,S]=await Promise.all([import('/src/crew-avatar.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts')]);await A.loadCrewAvatar();
  const lobby=A.createCrewAvatar(0,false,true),combat=A.createCrewAvatar(0,false,true);
  const bones=[];lobby.getObjectByName('UpperArmR').traverse(b=>{if(b.isBone)bones.push(b.name);});
  const neutral={hands:[{firePower:0,recoil:0},{firePower:0,recoil:0}],firePower:0,recoil:0,upgradeTime:0,upgradeAge:0,counterSwing:0,motion:{x:0,y:0,z:0},motionRotation:{x:0,y:0,z:0}};
  let checks=0,time=0;
  const match=()=>{lobby.updateWorldMatrix(true,true);combat.updateWorldMatrix(true,true);for(const name of bones){const a=lobby.getObjectByName(name),b=combat.getObjectByName(name);if(a.getWorldPosition(new T.Vector3()).distanceTo(b.getWorldPosition(new T.Vector3()))>1e-7||a.getWorldQuaternion(new T.Quaternion()).normalize().angleTo(b.getWorldQuaternion(new T.Quaternion()).normalize())>1e-6)throw Error('Inactive arm differs from prelobby: '+name);}};
  for(const level of [1,2,3,4,5,6,7])for(const yaw of [0,1.3,-2.5])for(const pitch of [-1.5,-.8,0,1.2])for(const motion of ['idle','run','jump']){
   const input={...S.idleInput(),yaw,pitch},velocity={x:motion==='run'?5:0,y:0,z:0};time+=1/60;lobby.rotation.y=combat.rotation.y=yaw;
   A.updateCrewAvatar(lobby,input,velocity,motion!=='jump',time,false,true,level);
   A.updateCrewAvatar(combat,input,velocity,motion!=='jump',time,false,false,level,undefined,false,undefined,neutral);match();
   A.updateCrewAvatar(combat,{...input,fire:true,fireLeft:true},velocity,motion!=='jump',time,false,false,level,undefined,false,undefined,neutral);match();checks++;
  }
  const input=S.idleInput(),velocity={x:0,y:0,z:0};
  A.updateCrewAvatar(combat,{...input,fire:true,fireRight:true},velocity,true,time+1/60,false,false,5,undefined,false,undefined,neutral);combat.updateWorldMatrix(true,true);
  const raised=combat.getObjectByName('Middle1R').getWorldPosition(new T.Vector3());
  A.updateCrewAvatar(combat,input,velocity,true,time+2,false,false,5,undefined,false,undefined,neutral);combat.updateWorldMatrix(true,true);
  if(raised.distanceTo(combat.getObjectByName('Middle1R').getWorldPosition(new T.Vector3()))<.2)throw Error('Right hand does not activate for firing');
  A.updateCrewAvatar(lobby,input,velocity,true,time+2,false,true,5);match();
  return {matchedPrelobbyPoses:checks,comparedBones:bones.length,rightFireAndRelease:true};
 });console.log(JSON.stringify(result));
}finally{await browser.close();}
