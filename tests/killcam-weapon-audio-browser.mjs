import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();
 const base=process.env.GAME_URL||'http://127.0.0.1:5173';
 await page.route('**/killcam-weapon-test',r=>r.fulfill({contentType:'text/html',body:'<button>Start</button>'}));
 await page.goto(base+'/killcam-weapon-test');
 await page.evaluate(()=>{document.querySelector('button').onclick=async()=>{try{
  const [{Sound},{World,idleInput,v}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts')]);
  const sound=new Sound();await sound.start();
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const weapons=name=>/^(?:seekrapid|rapid|weapon|shot|daggerdrone|magentadrone)/.test(name);
  for(let level=1;level<=7;level++){
   await Promise.all([`rapid${level}`,`seekrapid${level}`,`weapon${level}-start`,`weapon${level}-stop`,'daggerdrone','magentadrone'].map(name=>sound.load(name)));
   for(const homing of level>=2?[false,true]:[false]){
    sound.clear();const w=new World(7,{schedule:false,invulnerable:true});w.level=level;w.reserve=1000;
    for(let i=0;i<35;i++)w.step({...idleInput(),fire:!homing,homing});
    sound.listener(w.player.pos,0,0);sound.update(w);
    const source=sound.loops.get(homing?-11:-10)?.source;check(source,'stream exists at hand '+level);
    const ended=new Promise(resolve=>source.addEventListener('ended',resolve,{once:true}));
    w.projectiles.push({id:10000,pos:{...w.player.pos},vel:v(),age:0,homing:true,level});
    const recent=sound.diagnostics.recent.length;
    // The snapshot still says firing. The killcam mix must explicitly ignore it.
    sound.update(w,{weapons:false});
    check(!sound.diagnostics.loops.some(weapons),'killcam removes weapon and projectile loops');
    check(!sound.diagnostics.recent.slice(recent).some(weapons),'no release tail when entering killcam');
    await Promise.race([ended,new Promise((_,reject)=>setTimeout(()=>reject(Error('source still running')),1000))]);
    check(!sound.loops.has(homing?-11:-10),'stopped source removed');
    for(let i=0;i<10;i++)sound.update(w,{weapons:false});
    check(!sound.diagnostics.loops.some(weapons),'frozen firing cannot restart a stream');
    sound.clear();
    // Live gameplay still follows trigger release normally.
    sound.update(w);check(sound.diagnostics.loops.some(n=>n===(homing?'seekrapid':'rapid')+level),'live stream still works');
    w.step(idleInput());sound.update(w);
    check(!sound.loops.has(-10)&&!sound.loops.has(-11),'live release stops both stream channels');
   }
  }
  sound.clear();window.done=true;
 }catch(error){window.failure=String(error.stack||error);}};});
 await page.click('button');await page.waitForFunction(()=>window.done||window.failure,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>window.failure),undefined);
 console.log('All seven hands: primary/homing release, actual source termination, frozen firing suppression and projectile drone suppression passed.');
}finally{await browser.close();}
