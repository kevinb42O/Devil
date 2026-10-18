import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
await mkdir('artifacts/projectile-polish',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:5173/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:black}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v,idleInput,STEP}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,skyMotion:'reduced',movementMotion:.35,screenShake:0,mist:false});await r.prepare();
  const w=new World(971,{schedule:false,invulnerable:true});w.time=45;w.player.pos=v(0,1.7,0);w.level=3;w.reserve=10000;
  const step=(time,dt)=>{
   const input={...idleInput(),fire:time<8,homing:time>=8,yaw:Math.sin(time*.9)*.12,pitch:-.015,strafe:Math.sin(time*1.6)*.5};
   for(let i=0;i<Math.max(1,Math.round(dt/STEP));i++){w.step(input);for(const e of w.effects)r.effect(e,w,input.yaw,input.pitch);w.effects=[];}
   r.render(w,input.yaw,input.pitch,dt,false,1,null,false,false,input);
  };
  for(let i=0;i<30;i++)step(i/60,1/60);
  window.shardPreview={r,w,step,STEP};
 });
 // An actual firing sequence, with regular and seeking streams while strafing.
 const capture=await page.evaluate(async()=>{
  const {r,w,step}=window.shardPreview,canvas=r.renderer.domElement;
  const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6500000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const finished=new Promise(resolve=>{recorder.onstop=resolve;});recorder.start();
  const {projectileVisualIndex}=await import('/src/projectile-presentation.ts');
  let start,previous,frames=0,maxShots=0,maxColorError=0;const colorSamples=[];
  await new Promise(resolve=>{
   const frame=now=>{if(start===undefined)start=previous=now;const t=(now-start)/1000,dt=Math.min(.04,Math.max(1/120,(now-previous)/1000));previous=now;
    step(t,dt);frames++;maxShots=Math.max(maxShots,w.projectiles.length);
    const latest=w.projectiles.length-1,p=w.projectiles[latest];
    if(p){const index=projectileVisualIndex(p,w.level),batch=r.originalWeapon.daggers[index],slot=batch.count-1,mesh=batch.instanceColor,glow=r.projectileLighting.glow.geometry.getAttribute('shotColor');
     const a=[mesh.getX(slot),mesh.getY(slot),mesh.getZ(slot)],b=[glow.getX(latest),glow.getY(latest),glow.getZ(latest)];
     maxColorError=Math.max(maxColorError,...a.map((c,i)=>Math.abs(c-b[i])));
     if(colorSamples.length<=Math.floor(t))colorSamples.push({time:t,color:a});
    }
    if(t<10)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);
  });
  recorder.stop();await finished;stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());
  let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return {base64:btoa(binary),frames,maxShots,maxColorError,colorSamples,lighting:r.projectileLighting.diagnostics};
 });
 await writeFile('artifacts/projectile-polish/firing.webm',Buffer.from(capture.base64,'base64'));
 await page.screenshot({path:'artifacts/projectile-polish/in-game.png'});
 // Keep the trail bounded by the actual flight direction, and terminate it at
 // the current bounce segment rather than drawing a streak through a surface.
 const checks=await page.evaluate(async()=>{
  const [{projectileVisualIndex,sampleProjectile},T]=await Promise.all([import('/src/projectile-presentation.ts'),import('/node_modules/.vite/deps/three.js')]);
  const {r,w}=window.shardPreview,lighting=r.projectileLighting;
  const p={id:1,level:3,homing:false,age:1,previous:{x:0,y:1,z:-4},path:[{t:.5,pos:{x:0,y:1,z:-5}}],pos:{x:1,y:1,z:-5},vel:{x:120,y:0,z:0}};
  w.projectiles=[p];lighting.update(w,false,.55,720);
  const travel=lighting.trail.geometry.getAttribute('shotTravel');const clipped=Math.hypot(travel.getX(0),travel.getY(0),travel.getZ(0))===0;
  lighting.update(w,false,1,720);const direction=travel.getX(0)>0&&travel.getZ(0)===0,tailBound=travel.getX(0)<=.831;
  const geometry=r.originalWeapon.daggers[0].geometry,position=geometry.getAttribute('position');
  let min=Infinity,max=-Infinity,width=0;for(let i=0;i<position.count;i++){min=Math.min(min,position.getZ(i));max=Math.max(max,position.getZ(i));width=Math.max(width,Math.abs(position.getX(i)));}
  // Measure the actual point and rear section, then compare flight directions
  // for streams, pellets, seeking shots and both sides of a bounced path.
  const endpoint=z=>{const result=new T.Vector3();let count=0;for(let i=0;i<position.count;i++)if(Math.abs(position.getZ(i)-z)<1e-6){result.add(new T.Vector3().fromBufferAttribute(position,i));count++;}return result.divideScalar(count);};
  const tip=endpoint(max),rear=endpoint(min),matrix=new T.Matrix4();let maxAngle=0,orientationChecks=0;
  const measure=(projectile,alpha)=>{
   w.projectiles=[projectile];r.originalWeapon.update(w,0,false,undefined,alpha);
   r.originalWeapon.daggers[projectileVisualIndex(projectile,w.level)].getMatrixAt(0,matrix);
   const actual=tip.clone().applyMatrix4(matrix).sub(rear.clone().applyMatrix4(matrix)).normalize(),velocity={x:0,y:0,z:0};sampleProjectile(projectile,alpha,{x:0,y:0,z:0},velocity);
   const expected=new T.Vector3(velocity.x,velocity.y,velocity.z).normalize();
   maxAngle=Math.max(maxAngle,Math.atan2(actual.clone().cross(expected).length(),actual.dot(expected)));orientationChecks++;
  };
  for(const level of [1,3,4,7])for(const kind of [undefined,'shotgun'])for(const homing of [false,true])for(const vel of [{x:0,y:0,z:-70},{x:0,y:0,z:70},{x:30,y:50,z:-10},{x:-40,y:-20,z:7}])
   measure({id:orientationChecks+1,level,kind,homing,vel,pos:{x:0,y:1,z:-5},age:1},1);
  measure(p,.25);measure(p,.75);
  lighting.clear();return {clipped,direction,tailBound,slenderness:(max-min)/(width*2),orientationChecks,maxAngle,cleared:lighting.trail.geometry.instanceCount===0};
 });
 assert.ok(capture.frames>10);assert.ok(capture.maxShots>20);assert.equal(capture.lighting.drawCalls,2);
 assert.equal(capture.maxColorError,0);assert.ok(capture.colorSamples.some(s=>s.color[2]>.8));assert.ok(capture.colorSamples.some(s=>s.color[0]>.8&&s.color[1]>.5));
 assert.ok(checks.clipped&&checks.direction&&checks.tailBound&&checks.cleared,JSON.stringify(checks));assert.ok(checks.slenderness>7);assert.deepEqual(errors,[]);
 assert.ok(checks.maxAngle<.00001,JSON.stringify(checks));
 const {base64,...report}=capture;await writeFile('artifacts/projectile-polish/motion-report.json',JSON.stringify({...report,checks,errors},null,2)+'\n');
 console.log('Projectile motion passed',JSON.stringify({...report,checks}));
}finally{await browser.close();}
