import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const previewFov=Number(process.env.EMOTE_FOV)||145;
const previewPitch=process.env.EMOTE_PITCH?Number(process.env.EMOTE_PITCH):null;
const frames='/tmp/devildaggers-prelobby-emotes';
await mkdir(frames,{recursive:true});await mkdir('artifacts/prelobby-emotes',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:864,height:576},deviceScaleFactor:1});page.on('pageerror',e=>{throw e;});
 await page.route('**/prelobby-emote-capture',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;overflow:hidden;background:#000}#label{position:fixed;left:16px;top:16px;padding:10px 14px;background:#111c;color:#fff;font:16px sans-serif;border-radius:6px;z-index:2;white-space:pre-line}</style><canvas></canvas><div id="label"></div>'}));
 await page.goto(base+'/prelobby-emote-capture');
 await page.evaluate(async()=>{
  const {GameRenderer}=await import('/src/renderer.ts'),{World,idleInput}=await import('/src/simulation.ts'),T=await import('/node_modules/.vite/deps/three.js');
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90});await Promise.all([renderer.crewAvatarReady,renderer.entrance.ready]);
  renderer.configure({quality:'low',fov:90,screenShake:0,movementMotion:0,skyMotion:'reduced',mist:false});
  const world=new World(1,{schedule:false});world.addCrew('host');world.addCrew('friend');world.selectCrew('host');world.player.pos={x:0,y:1.7,z:0};world.crew[1].player.pos={x:0,y:1.7,z:-2.5};
  renderer.setCrewNames([{id:'host',name:'You'},{id:'friend',name:'Friend'}]);
  window.capture={renderer,world,idleInput,T};
 });
 const stills=process.argv.includes('--stills');
 for(const view of ['first-person','friend']){
  const count=stills?1:84;
  for(let i=0;i<count;i++){
   const diagnostics=await page.evaluate(({view,i,stills,previewFov,previewPitch})=>{
    const {renderer:r,world:w,idleInput,T}=window.capture,phase=stills?1:i/12;
    const fov=view==='first-person'&&(stills||phase>=3.5)?previewFov:90;
    r.baseFov=fov;r.camera.fov=fov;r.camera.updateProjectionMatrix();
    const cycle=phase%3.5,left=stills||cycle>.35&&cycle<2.7,right=stills||cycle>1.15&&cycle<2.7;
    const input={...idleInput(),leftArm:left,rightArm:right},friend=w.crew[1];friend.input={...idleInput(),yaw:Math.PI,...(view==='friend'?{leftArm:left,rightArm:right}:{})};
    const pitch=view==='first-person'?(stills?(previewPitch??(previewFov===145?-.55:.25)):phase>=3.5?-.45+Math.sin((phase-3.5)*1.8)*.35:.25):0;
    const steps=stills?60:1;
    for(let j=0;j<steps;j++){w.tick+=10;r.render(w,0,pitch,1/12,false,1,null,false,true,view==='first-person'?input:null);}
    document.querySelector('#label').textContent=view==='first-person'?`FIRST PERSON · FOV ${fov}\nLeft arm → both → release${fov===145?' · looking down at shoulders':''}`:'FRIEND FACING YOU · FOV 90\nLeft arm → both → release';
    const body=r.emoteHands;body?.updateMatrixWorld(true);
    return {fov,body:body?.position.toArray(),eye:r.camera.position.toArray(),localGeometry:body?.children[0]?.children.length};
   },{view,i,stills,previewFov,previewPitch});
   if(stills){console.log(view,diagnostics);await page.screenshot({path:`artifacts/prelobby-emotes/${view}.png`});}
   else await page.screenshot({path:`${frames}/${view}-${String(i).padStart(3,'0')}.png`});
  }
  console.log('Captured',view,count,'frames');
 }
}finally{await browser.close();}
