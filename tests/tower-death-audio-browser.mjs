import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();await page.route('**/tower-death-audit',r=>r.fulfill({contentType:'text/html',body:'<title>Tower death audio</title>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/tower-death-audit');
 const report=await page.evaluate(async()=>{
  const [{Sound},{World,v},{TOWER_DEATH_DURATION},{ENEMY_CHATTER}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts'),import('/src/enemy-presentation.ts'),import('/src/enemy-audio.ts')]);
  const check=(v,m)=>{if(!v)throw Error(m);},sound=new Sound();await sound.start();
  const names=['killminisquid','killsquid','killultrasquid'],kinds=['squid','squid2','squid3'];
  await Promise.all([...names,...kinds.map(k=>ENEMY_CHATTER[k]),...Array.from({length:5},(_,i)=>'killskull'+(i+1))].map(n=>sound.load(n)));
  const w=new World(71,{schedule:false});sound.listener(w.player.pos,0,0);
  const enemies=kinds.map((kind,i)=>{const e=w.spawn(kind,v((i-1)*6,0,-8));e.age=20;return e;});sound.update(w);
  for(const e of enemies){check(sound.loops.has(e.id),'live tower chatters');w.effects=[];w.damageEnemy(e,100000,e.pos);const kills=w.effects.filter(e=>e.kind==='kill');check(kills.length===1,'one real tower kill');sound.play(kills[0],w);check(!sound.loops.has(e.id),'death stops tower chatter');}
  const voices=[...sound.shots];check(voices.length===3,'one bellow per dead tower');
  const buffers=[];
  for(const voice of voices){
   const buffer=voice.source.buffer;check(!!voice.panner&&voice.priority===3,'protected positional tower death');
   check(Math.abs(buffer.duration/voice.source.playbackRate.value-TOWER_DEATH_DURATION)<.001,'bellow matches full sinking duration');
   check(voice.reverbSends.length===2,'death uses shared arena body and tail');
   const samples=buffer.getChannelData(0),energy=(start,end)=>{const x=samples.subarray(Math.round(start*buffer.sampleRate),Math.round(end*buffer.sampleRate));return Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);};
   check(energy(.3,1.3)>.025,'vocal has sustained body');check(energy(1.55,1.85)>.012,'vocal continues into final descent');
   let peak=0;for(const s of samples)peak=Math.max(peak,Math.abs(s));check(peak<.9,'source has mastering headroom');
   buffers.push({name:voice.name,duration:buffer.duration,lateRms:energy(1.55,1.85),peak});
  }
  await new Promise(r=>setTimeout(r,(TOWER_DEATH_DURATION-.3)*1000));check(names.every(n=>sound.diagnostics.oneShotNames.includes(n)),'all bellows survive until late descent');
  await new Promise(r=>setTimeout(r,450));check(!sound.diagnostics.oneShotNames.some(n=>names.includes(n)),'bellows finish as towers disappear');
  sound.clear();for(let i=0;i<48;i++)sound.play({kind:'kill',enemy:'skull',pos:v()},w);
  sound.play({kind:'kill',enemy:'squid3',pos:v()},w);check(sound.diagnostics.oneShotNames.includes('killultrasquid')&&sound.shots.size===48,'tower bellow displaces a swarm kill in a full voice pool');
  sound.setPlaybackRate(.5);const voice=[...sound.shots].find(v=>v.name==='killultrasquid');check(Math.abs(voice.source.buffer.duration/voice.source.playbackRate.value-TOWER_DEATH_DURATION/.5)<.001,'slow replay keeps death and sinking in sync');
  sound.clear();check(sound.shots.size===0,'restart clears active bellows');await sound.context.close();return {buffers,failed:sound.diagnostics.failed};
 });
 assert.deepEqual(report.failed,[]);mkdirSync('artifacts/tower-death-audio',{recursive:true});writeFileSync('artifacts/tower-death-audio/audit.json',JSON.stringify(report,null,2)+'\n');console.log('Tower death audio passed:',report);
}finally{await browser.close();}
