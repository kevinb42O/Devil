import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();await page.route('**/spatial-audit',r=>r.fulfill({contentType:'text/html',body:'<title>Enemy spatial audio verification</title>'}));await page.goto('http://127.0.0.1:5173/spatial-audit');
 const results=await page.evaluate(async()=>{
  const {Sound}=await import('/src/audio.ts'),{ENEMY_CHATTER}=await import('/src/enemy-audio.ts'),sound=new Sound();await sound.start();
  const check=(v,m)=>{if(!v)throw Error(m);};
  async function render(buffer,x,yaw=0){
   const c=new OfflineAudioContext(2,48000,48000);sound.context=c;sound.listener({x:0,y:0,z:0},yaw,0);
   const source=c.createBufferSource();source.buffer=buffer;source.loop=true;const p=sound.panner({x,y:0,z:0});source.connect(p);p.connect(c.destination);source.start(0,0);
   const out=await c.startRendering();return [0,1].map(ch=>Math.sqrt(out.getChannelData(ch).reduce((s,v)=>s+v*v,0)/out.length));
  }
  const output=[];const live=sound.context;
  for(const [kind,name] of Object.entries(ENEMY_CHATTER)){
   sound.context=live;await sound.load(name);const buffer=sound.buffers.get(name);
   const left=await render(buffer,-6),right=await render(buffer,6),turned=await render(buffer,-6,Math.PI),far=await render(buffer,-24);
   check(left[0]>left[1]*1.1,kind+' left bearing');check(right[1]>right[0]*1.1,kind+' right bearing');check(turned[1]>turned[0]*1.1,kind+' head turn');check(far[0]<left[0]*.5,kind+' distance falloff');
   output.push({kind,left,right,turned,far});
  }
  sound.context=live;sound.loop('gain-audit',ENEMY_CHATTER.skull,{x:6,y:0,z:0},1);
  await new Promise(r=>setTimeout(r,50));const voice=sound.loops.get('gain-audit'),before=voice.gain.gain.value;
  sound.loop('gain-audit',ENEMY_CHATTER.skull,{x:-6,y:0,z:0},.25);
  await new Promise(r=>setTimeout(r,250));check(sound.loops.get('gain-audit')===voice,'moving voice is retained');check(voice.panner.positionX.value===-6,'voice follows movement');check(voice.gain.gain.value<before*.4,'existing crowd gain smoothly updates');
  sound.clear();await live.close();return output;
 });
 assert.equal(results.length,22);await writeFile('artifacts/remake-audio/spatial-audit.json',JSON.stringify({enemies:results,checks:88,failures:0},null,2));console.log('22 enemy signatures: 88 HRTF left/right, head-turn and distance checks passed.');
}finally{await browser.close();}
