import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/combat-emitter-test',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas></body>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/combat-emitter-test');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},{World,idleInput},T,{weaponMuzzle,HAND_MUZZLES}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/weapon-origin.ts')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'low',mist:false,movementMotion:0,screenShake:0});await r.prepare();
  const w=new World(971,{schedule:false});w.player.pos={x:4,y:5,z:-3};
  let checks=0,maxError=0;
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  for(const aspect of [16/9,9/16])for(const level of [1,2,3,4,5,6,7])for(const fov of [75,120,145])for(const pitch of [-1.3,0,1.3])for(const burst of [false,true]){
   r.configure({quality:'low',fov,screenShake:0,movementMotion:0,mist:false});
   r.camera.aspect=aspect;r.camera.updateProjectionMatrix();
   w.level=level;w.projectiles=[];w.effects=[];r.originalWeapon.clear();
   const yaw=.7,input={...idleInput(),yaw,pitch,leftArm:burst,rightArm:burst};
   w.shoot(input,burst,false);const physical=w.projectiles.map(p=>({...p.pos}));
   for(const e of w.effects)r.effect(e,w,yaw,pitch);
   for(const dt of [0,.016,.025]){
    w.time+=dt;r.render(w,yaw,pitch,dt,false,1,null,false,false,input);
    const hands=r.emoteHands;hands.updateWorldMatrix(true,true);
    for(let socket=0;socket<HAND_MUZZLES[level-1].length;socket++){
     const finger=level>=5?Math.floor(socket/2):socket,side=level>=5&&socket%2?'L':'R';
     const name=['Middle','Index','Ring','Pinky','Thumb'][finger];
     const bone=hands.getObjectByName((name==='Ring'?'Middle':name)+(name==='Thumb'?'2':'3')+side+'_end');
     if(!bone)throw Error('Missing tip '+name+side+'; bones: '+(()=>{const names=[];hands.traverse(o=>{if(o.isBone)names.push(o.name)});return names.join(',')})());
     const tip=bone.getWorldPosition(new T.Vector3());
     if(name==='Ring')tip.lerp(hands.getObjectByName('Pinky3'+side+'_end').getWorldPosition(new T.Vector3()),.5);
     const origin=weaponMuzzle(w.player.pos,yaw,pitch,level,socket);
     const viewed=r.originalWeapon.projectileView({id:-1,level,socket,age:0,pos:origin,vel:{x:0,y:0,z:-70},homing:false},{...origin});
     const error=tip.distanceTo(new T.Vector3(viewed.x,viewed.y,viewed.z));maxError=Math.max(maxError,error);
     check(error<1e-7,'Emitter missed animated fingertip '+JSON.stringify({level,socket,fov,pitch,aspect,burst,error}));
     if(dt===0){
      for(const spark of r.originalWeapon.fragments.filter(f=>f.handSocket===socket)){
       const batch=r.originalWeapon.batches.get(spark.family).mesh;
       // Each spark has a distinct ember family for the early sockets. Its
       // rendered matrix must use the same rig offset as the dagger and glow.
       const sample=r.originalWeapon.fragments.filter(f=>f.family===spark.family).indexOf(spark),matrix=new T.Matrix4();batch.getMatrixAt(sample,matrix);
       const expected=tip.clone().add(spark.pos).sub(new T.Vector3(origin.x,origin.y,origin.z));
       check(new T.Vector3().setFromMatrixPosition(matrix).distanceTo(expected)<1e-5,'Spark detached from animated tip');
      }
     }
     const settled=r.originalWeapon.projectileView({id:-1,level,socket,age:.1,pos:origin,vel:{x:0,y:0,z:-70},homing:false},{...origin});
     check(new T.Vector3(settled.x,settled.y,settled.z).distanceTo(new T.Vector3(origin.x,origin.y,origin.z))<1e-10,'Flight did not rejoin physics');checks++;
    }
   }
   check(w.projectiles.every((p,i)=>p.pos.x===physical[i].x&&p.pos.y===physical[i].y&&p.pos.z===physical[i].z),'Presentation moved physics');
  }
  w.addCrew('host');w.addCrew('remote');w.selectCrew('host');
  r.render(w,0,0,0,false,1,null,false,false,idleInput());
  const original=r.originalWeapon.effect;let received,remoteChecks=0;
  r.originalWeapon.effect=(effect)=>{received=effect;};
  for(const level of [1,2,3,4,5,6,7])for(const shotgun of [false,true]){
   w.crew.find(p=>p.id==='remote').level=level;
   const source={kind:shotgun?'burst':'shot',shooterId:'remote',level,pos:{x:20,y:20,z:20},muzzles:[{x:20,y:20,z:20}],...(shotgun?{projectileKind:'shotgun'}:{})};
   r.effect(source,w,0,0);
   const count=shotgun?(level>=5?2:1):HAND_MUZZLES[level-1].length;
   check(received.muzzles.length===count,'Remote emission lost firing lanes');
   const model=r.crewModels.get('remote');
   for(let i=0;i<count;i++){
    const finger=level>=5?Math.floor(i/2):i,side=level>=5&&i%2?'L':'R',name=['Middle3','Index3','Middle3','Pinky3','Thumb2'][finger];
    const expected=model.getObjectByName(name+side+'_end').getWorldPosition(new T.Vector3());
    if(finger===2)expected.lerp(model.getObjectByName('Pinky3'+side+'_end').getWorldPosition(new T.Vector3()),.5);
    const actual=received.muzzles[i];check(expected.distanceTo(new T.Vector3(actual.x,actual.y,actual.z))<1e-7,'Remote emitter detached');remoteChecks++;
   }
   check(source.muzzles[0].x===20,'Remote presentation mutated network event');
  }
  r.originalWeapon.effect=original;
  r.dispose?.();return {checks,remoteChecks,maxError};
 });
 assert.deepEqual(errors,[]);console.log('Animated combat emitters passed:',result);
}finally{await browser.close();}
