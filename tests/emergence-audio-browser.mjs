import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();await page.route('**/emergence-audit',r=>r.fulfill({contentType:'text/html',body:'<title>Emergence audio regression</title>'}));await page.goto('http://127.0.0.1:5173/emergence-audit');
 const result=await page.evaluate(async()=>{
  const [{Sound},{ENEMY_SPAWN,ENEMY_EMERGE},{World,v}]=await Promise.all([import('/src/audio.ts'),import('/src/enemy-audio.ts'),import('/src/simulation.ts')]);
  const sound=new Sound();await sound.start();await sound.warmEmergences();
  const check=(value,message)=>{if(!value)throw Error(message);};let checks=0;
  const world=new World(1,{schedule:false});sound.listener(v(),0,0);
  for(const [event,bank] of [['spawn',ENEMY_SPAWN],['emerge',ENEMY_EMERGE]]){
   for(const [kind,name] of Object.entries(bank)){
    sound.clear();sound.play({kind:event,enemy:kind,pos:v(5,0,-5)},world);
    const voices=[...sound.shots];check(voices.length===1&&voices[0].name===name,kind+' '+event+' own cue');
    check(voices[0].panner?.panningModel==='HRTF'&&!!voices[0].spatialGain,kind+' spatial graph');
    sound.clear();sound.play({kind:event,enemy:kind,pos:v(200,0,0)},world);check(sound.shots.size===0,kind+' distant emergence silent');checks+=3;
   }
  }
  sound.clear();sound.play({kind:'spawn',enemy:'squid',amount:-1,pos:v(5,0,0)},world);check(sound.shots.size===0,'dust particles never replay emergence');
  // A first encounter on a slow connection must survive decoding latency.
  const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/spawnminisquid.wav'))await new Promise(r=>setTimeout(r,250));return original(...args);};
  try{
   sound.buffers.delete('spawnminisquid');sound.play({kind:'spawn',enemy:'squid',pos:v(5,0,0)},world);await sound.pending.get('spawnminisquid');
   check([...sound.shots].some(v=>v.name==='spawnminisquid'),'cold emergence survives slow fetch');sound.clear();
   sound.buffers.delete('spawnminisquid');sound.play({kind:'spawn',enemy:'squid',pos:v(5,0,0)},world);const pending=sound.pending.get('spawnminisquid');sound.clear();await pending;
   check(sound.shots.size===0,'restart cancels loading emergence');
  }finally{window.fetch=original;}
  check(sound.diagnostics.failed.length===0,'no failed downloads');await sound.context.close();return {checks:checks+4,cues:Object.keys(ENEMY_SPAWN).length+Object.keys(ENEMY_EMERGE).length};
 });
 assert.equal(result.cues,16);console.log('Emergence routing, spatial cutoff, dust exclusion and cold-load lifecycle passed:',result);
}finally{await browser.close();}
