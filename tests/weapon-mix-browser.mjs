import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();await page.route('**/weapon-mix-audit',r=>r.fulfill({contentType:'text/html',body:'<title>Weapon / arena mix audit</title>'}));await page.goto(base+'/weapon-mix-audit');
 const report=await page.evaluate(async()=>{
  const [{Sound},{World,idleInput,v},{WEAPON_SOUNDS},{ENEMY_CHATTER}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts'),import('/src/weapon-audio.ts'),import('/src/enemy-audio.ts')]);
  const sound=new Sound();await sound.start();await Promise.all([...WEAPON_SOUNDS,...Object.values(ENEMY_CHATTER),'daggerhit1','damagesquid2'].map(n=>sound.load(n)));
  const check=(v,m)=>{if(!v)throw Error(m);},live=sound.context;
  const snapshot=voice=>({name:voice.name,buffer:voice.source.buffer,gain:voice.targetGain??voice.gain.gain.value,pos:voice.panner?{x:voice.panner.positionX.value,y:voice.panner.positionY.value,z:voice.panner.positionZ.value}:undefined});
  async function render(voices){
   const c=new OfflineAudioContext(4,48000*4,48000);sound.context=c;sound.listener(v(0,1.7,0),0,0);
   const mix=c.createGain();mix.gain.value=.55;
   const all=c.createChannelSplitter(2),band=c.createChannelSplitter(2),merge=c.createChannelMerger(4),hp=c.createBiquadFilter(),lp=c.createBiquadFilter();
   hp.type='highpass';hp.frequency.value=1000;hp.Q.value=-3.0103;lp.type='lowpass';lp.frequency.value=4500;lp.Q.value=-3.0103;
   mix.connect(all);mix.connect(hp);hp.connect(lp);lp.connect(band);all.connect(merge,0,0);all.connect(merge,1,1);band.connect(merge,0,2);band.connect(merge,1,3);merge.connect(c.destination);
   for(const voice of voices){const source=c.createBufferSource(),gain=c.createGain();source.buffer=voice.buffer;source.loop=true;gain.gain.value=voice.gain;source.connect(gain);if(voice.pos){const p=sound.panner(voice.pos);gain.connect(p);p.connect(mix);}else gain.connect(mix);source.start(0,.3);}
   const buffer=await c.startRendering();sound.context=live;
   const rms=(a,b)=>Math.sqrt((a.reduce((s,x)=>s+x*x,0)+b.reduce((s,x)=>s+x*x,0))/(2*a.length));
   return {rms:rms(buffer.getChannelData(0),buffer.getChannelData(1)),presence:rms(buffer.getChannelData(2),buffer.getChannelData(3))};
  }
  const tiers=[];
  for(let level=1;level<=7;level++){
   sound.clear();const w=new World(17,{schedule:false,invulnerable:true});w.player.pos=v(0,1.7,0);w.level=level;
   for(let i=0;i<35;i++)w.step({...idleInput(),fire:true});
   for(const [kind,x,z] of [['skull',-5,-2],['skull2',5,-3],['spider',-3,-6],['squid',0,-8]]){const e=w.spawn(kind,v(x,kind.startsWith('skull')?1.7:0,z));e.age=20;e.status='idle';}
   sound.listener(w.player.pos,0,0);sound.update(w);
   const weapon=snapshot(sound.loops.get(-10)),enemies=[...sound.loops].filter(([id])=>typeof id==='number'&&id>0).map(([,voice])=>snapshot(voice));
   check(enemies.length===4,'four close spatial threats');const gains=enemies.map(e=>e.gain);
   const weaponOutput=await render([weapon]),arenaOutput=await render(enemies);
   check(arenaOutput.presence>weaponOutput.presence*1.3,'spatial threat band must lead sustained weapon at hand '+level);
   check(weaponOutput.rms<.009,'sustained weapon bed leaves mix headroom at hand '+level);
   w.step(idleInput());sound.update(w);
   const idleGains=[...sound.loops].filter(([id])=>typeof id==='number'&&id>0).map(([,voice])=>voice.targetGain);
   check(gains.every((g,i)=>Math.abs(g-idleGains[i])<.0001),'shooting never ducks enemy chatter');
   tiers.push({level,weapon:weaponOutput,arena:arenaOutput,threatBandAdvantageDB:20*Math.log10(arenaOutput.presence/weaponOutput.presence),enemyGainsPreserved:true});
  }
  sound.clear();const contact=new World(9,{schedule:false,invulnerable:true});contact.player.pos=v(0,1.7,0);
  sound.play({kind:'impact',pos:v()},contact);const idleImpact=[...sound.shots][0].gain.gain.value;
  sound.clear();for(let i=0;i<35;i++)contact.step({...idleInput(),fire:true});sound.play({kind:'impact',pos:v()},contact);const firingImpact=[...sound.shots][0].gain.gain.value;
  check(firingImpact<idleImpact*.25,'continuous armor contacts cannot become a second machinegun');
  sound.clear();await live.close();return {tiers,idleImpact,firingImpact};
 });
 mkdirSync('artifacts/weapon-audio',{recursive:true});writeFileSync('artifacts/weapon-audio/mix-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert.equal(report.tiers.length,7);
}finally{await browser.close();}
