import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const [T,{World,v,idleInput},{OriginalWeapon},{sampleProjectile,projectileRoll}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/simulation.ts'),import('/src/original-weapon.ts'),import('/src/projectile-presentation.ts')]);
  const weapon=new OriginalWeapon(new T.Scene());await weapon.loaded;if(!weapon.ready)throw Error(weapon.error);
  // Measure the blade's actual point and rear pommel from loaded OBJ vertices,
  // rather than assuming that a matrix axis represents the blade.
  const vertices=weapon.daggers[0].geometry.attributes.position;
  let minZ=Infinity,maxZ=-Infinity;for(let i=0;i<vertices.count;i++){minZ=Math.min(minZ,vertices.getZ(i));maxZ=Math.max(maxZ,vertices.getZ(i));}
  const end=z=>{const sum=new T.Vector3();let count=0;for(let i=0;i<vertices.count;i++)if(Math.abs(vertices.getZ(i)-z)<1e-6){sum.add(new T.Vector3().fromBufferAttribute(vertices,i));count++;}return sum.divideScalar(count);};
  const tip=end(maxZ),tail=end(minZ),localBlade=tip.clone().sub(tail).normalize();
  const world=new World(71,{schedule:false}),camera=new T.PerspectiveCamera();world.player.pos=v(0,5,0);
  let checked=0,maxFlightErrorDegrees=0,maxCameraErrorDegrees=0,maxRollErrorDegrees=0,minForwardDot=1;
  const angle=(a,b)=>Math.atan2(new T.Vector3().crossVectors(a,b).length(),a.dot(b))*180/Math.PI;
  const measure=(alpha,cameraForward)=>{
   weapon.update(world,0,false,camera,alpha);const cursors=Array(6).fill(0);
   for(const p of world.projectiles){
    const index=p.level===1?0:p.level===2?1:p.level===3?(p.homing?3:2):(p.homing?5:4),matrix=new T.Matrix4();weapon.daggers[index].getMatrixAt(cursors[index]++,matrix);
    const actual=tip.clone().applyMatrix4(matrix).sub(tail.clone().applyMatrix4(matrix)).normalize(),velocity=v();sampleProjectile(p,alpha,v(),velocity);
    const flight=new T.Vector3(velocity.x,velocity.y,velocity.z).normalize();if(!flight.lengthSq())continue;
    const expectedRotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),flight).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),projectileRoll(p)));
    const expectedRight=new T.Vector3(1,0,0).applyQuaternion(expectedRotation),actualRight=new T.Vector3(1,0,0).transformDirection(matrix);
    maxRollErrorDegrees=Math.max(maxRollErrorDegrees,angle(expectedRight,actualRight));
    maxFlightErrorDegrees=Math.max(maxFlightErrorDegrees,angle(actual,flight));minForwardDot=Math.min(minForwardDot,actual.dot(flight));
    if(cameraForward)maxCameraErrorDegrees=Math.max(maxCameraErrorDegrees,angle(actual,cameraForward));checked++;
   }
  };
  for(let level=1;level<=4;level++)for(const burst of [false,true])for(const homing of [false,true]){
   if(homing&&level<3)continue;
   for(const yaw of [-Math.PI,-2,-1,-.001,0,.001,1,2,Math.PI])for(const pitch of [-1.5,-.8,-.001,0,.001,.8,1.5]){
    camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld(true);
    world.level=level;world.reserve=1000;world.projectiles=[];world.shoot({...idleInput(),yaw,pitch},burst,homing);
    measure(1,camera.getWorldDirection(new T.Vector3()));
   }
  }
  // A known straight camera shot must put the measured physical tip forward.
  let straightCameraErrorDegrees=0;
  for(const yaw of [-3,-1,0,1,3])for(const pitch of [-1.5,-.5,0,.5,1.5]){
   camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld(true);const forward=camera.getWorldDirection(new T.Vector3());
   world.projectiles=[{id:1,pos:v(0,5,-3),vel:v(forward.x*70,forward.y*70,forward.z*70),age:.1,homing:false,level:1}];weapon.update(world,0,false,camera);
   const matrix=new T.Matrix4();weapon.daggers[0].getMatrixAt(0,matrix);straightCameraErrorDegrees=Math.max(straightCameraErrorDegrees,angle(localBlade.clone().transformDirection(matrix),forward));
  }
  // Bounced paths must face the segment being displayed, before/after contact.
  world.projectiles=[{id:1,pos:v(1,5,-1),previous:v(0,5,0),path:[{t:.5,pos:v(0,5,-1)}],vel:v(120,0,0),age:.1,homing:false,level:1}];measure(.25);measure(.75);
  if(maxFlightErrorDegrees>.001||maxRollErrorDegrees>.001||straightCameraErrorDegrees>.001||minForwardDot<.999999)throw Error('Physical blade flight direction or launch roll is incorrect');
  return {checked,tip:tip.toArray(),tail:tail.toArray(),localBladeAxis:localBlade.toArray(),maxFlightErrorDegrees,maxRollErrorDegrees,straightCameraErrorDegrees,minForwardDot,maxCameraErrorDegrees};
 });
 assert.ok(result.checked>10000);await mkdir('artifacts',{recursive:true});await writeFile('artifacts/projectile-orientation-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
