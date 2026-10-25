import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.route('**/locomotion-hands',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/locomotion-hands');
 const result=await page.evaluate(async()=>{
  const [A,T,S]=await Promise.all([import('/src/crew-avatar.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts')]);await A.loadCrewAvatar();
  const lobby=A.createCrewAvatar(0,false,true),combat=A.createCrewAvatar(0,false,true);
  const names={L:[],R:[]};for(const side of ['L','R'])lobby.getObjectByName('UpperArm'+side).traverse(b=>{if(b.isBone)names[side].push(b.name);});
  const neutral={hands:[{firePower:0,recoil:0},{firePower:0,recoil:0}],firePower:0,recoil:0,upgradeTime:0,upgradeAge:0,counterSwing:0,motion:{x:0,y:0,z:0},motionRotation:{x:0,y:0,z:0}};
  const match=side=>{lobby.updateWorldMatrix(true,true);combat.updateWorldMatrix(true,true);for(const name of names[side]){const a=lobby.getObjectByName(name),b=combat.getObjectByName(name);if(a.getWorldPosition(new T.Vector3()).distanceTo(b.getWorldPosition(new T.Vector3()))>1e-7||a.getWorldQuaternion(new T.Quaternion()).normalize().angleTo(b.getWorldQuaternion(new T.Quaternion()).normalize())>1e-6)throw Error('Locomotion differs from prelobby: '+name);}};
  let checks=0,time=0;
  const leftRun=[];
  for(const level of [1,2,3,4,5,6,7])for(const motion of ['idle','run','jump'])for(const phase of [.05,.15,.3,.6]){
   time+=.5+phase;const input={...S.idleInput(),pitch:-1.2},velocity={x:motion==='run'?5:0,y:0,z:0};
   A.updateCrewAvatar(lobby,input,velocity,motion!=='jump',time,false,true,level);
   A.updateCrewAvatar(combat,input,velocity,motion!=='jump',time,false,false,level,undefined,false,undefined,neutral);match('L');match('R');
   if(level===1&&motion==='run')leftRun.push(combat.getObjectByName('LowerArmL').getWorldPosition(new T.Vector3()));
   for(const side of level>=5?['L','R']:['L']){
    A.updateCrewAvatar(combat,{...input,fire:true,[side==='L'?'fireLeft':'fireRight']:true},velocity,motion!=='jump',time,false,false,level,undefined,false,undefined,neutral);combat.updateWorldMatrix(true,true);
    match(side==='L'?'R':'L');
    const active=combat.getObjectByName('Middle1'+side).getWorldPosition(new T.Vector3());
    if(active.distanceTo(lobby.getObjectByName('Middle1'+side).getWorldPosition(new T.Vector3()))<.1)throw Error('Firing arm did not activate: '+side);
    A.updateCrewAvatar(combat,input,velocity,motion!=='jump',time,false,false,level,undefined,false,undefined,neutral);match('L');match('R');
   }checks++;
  }
  if(Math.max(...leftRun.map(p=>p.distanceTo(leftRun[0])))<.03)throw Error('Left running animation does not swing');
  return {locomotionPoses:checks,independentFiring:true,releaseRestoresBoth:true,leftRunSwings:true};
 });console.log(JSON.stringify(result));
}finally{await browser.close();}
