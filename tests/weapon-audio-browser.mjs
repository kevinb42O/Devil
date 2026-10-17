import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
mkdirSync('artifacts/weapon-audio',{recursive:true});
for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true,...(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']}: {})});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/weapon-audit',r=>r.fulfill({contentType:'text/html',body:'<button>Start</button>'}));await page.goto(base+'/weapon-audit');
  await page.evaluate(()=>{document.querySelector('button').onclick=async()=>{
   try{
    const [{Sound},{World,idleInput,v},{WEAPON_SOUNDS,weaponShots}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts'),import('/src/weapon-audio.ts')]);
    const sound=new Sound();await sound.start();await Promise.all(WEAPON_SOUNDS.map(n=>sound.load(n)));
    const check=(v,m)=>{if(!v)throw Error(m);},tiers=[];
    for(let level=1;level<=7;level++){
     sound.clear();const w=new World(24,{schedule:false,invulnerable:true});w.level=level;w.reserve=1000;
     const samples=[];
     for(let i=0;i<12;i++){
      sound.clear();w.effects=[];w.shoot(idleInput(),true,false);sound.play(w.effects.find(e=>e.kind==='burst'),w);
      const voice=[...sound.shots][0];check(weaponShots(level).includes(voice.name),'tier routing '+level);check(voice.rate>.98&&voice.rate<1.02,'no borrowed pitched tier');samples.push(voice.name);
      if(i)check(samples[i]!==samples[i-1],'no repeated shotgun take');
     }
     check(new Set(samples).size>=2,'take variation '+level);sound.clear();
     for(let i=0;i<35;i++)w.step({...idleInput(),fire:true});sound.update(w);
     check(sound.loops.get(-10)?.name==='rapid'+level,'own primary stream '+level);
     const onset=[...sound.shots].filter(v=>v.name===`weapon${level}-start`);check(onset.length===1,'one onset');
     for(let i=0;i<20;i++)sound.update(w);check([...sound.shots].filter(v=>v.name===`weapon${level}-start`).length===1,'no onset every frame');
     w.step(idleInput());sound.update(w);check(!sound.loops.has(-10),'release stops stream');check(sound.diagnostics.oneShotNames.includes(`weapon${level}-stop`),'release tail');
     const b=sound.buffers.get('rapid'+level),l=b.getChannelData(0),r=b.getChannelData(1);let width=0,energy=0,peak=0,seam=0;
     for(let i=0;i<l.length;i++){width+=(l[i]-r[i])**2;energy+=l[i]**2;peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));seam=Math.max(seam,i?Math.abs(l[i]-l[i-1]):0);}
     check(peak<=.912,'headroom');check(Math.sqrt(energy/l.length)>.1,'stream body');check(Math.abs(l[0]-l.at(-1))<=seam*1.2,'boundary no worse than normal sample slope');
     if(level>=5)check(width/l.length>.001,'independent twin hands');
     check(b.duration>=24,'long sustained texture, hand '+level);
     const envelopes=[];
     for(let at=9600;at+2400<l.length-9600;at+=2400){let sum=0;for(let i=at;i<at+2400;i++)sum+=(l[i]*l[i]+r[i]*r[i])*.5;envelopes.push(Math.sqrt(sum/2400));}
     envelopes.sort((a,b)=>a-b);const envelopeRatio=envelopes[Math.floor(envelopes.length*.95)]/envelopes[Math.floor(envelopes.length*.05)];
     check(envelopeRatio<1.32,'continuous flow without repeated vocal swells, hand '+level);

     // Audibility on ordinary speakers: vocal presence must survive above the
     // bass. Render the actual decoded buffer through a 500–5000 Hz band.
     const offline=new OfflineAudioContext(1,b.length,b.sampleRate),voice=offline.createBufferSource(),hp=offline.createBiquadFilter(),lp=offline.createBiquadFilter();
     voice.buffer=b;hp.type='highpass';hp.frequency.value=500;hp.Q.value=.707;lp.type='lowpass';lp.frequency.value=5000;lp.Q.value=.707;
     voice.connect(hp);hp.connect(lp);lp.connect(offline.destination);voice.start();const band=(await offline.startRendering()).getChannelData(0);
     const vocalEnergy=band.reduce((sum,x)=>sum+x*x,0),presence=vocalEnergy/energy;
     check(presence>.08,'audible roar/scream presence above bass at tier '+level);
     sound.clear();w.reserve=1000;for(let i=0;i<35;i++)w.step({...idleInput(),homing:true});sound.update(w);
     if(level>=2){check(sound.loops.get(-11)?.name==='seekrapid'+level,'own homing stream');check(!sound.loops.has(-10),'homing priority');}
     sound.clear();check(sound.shots.size===0&&sound.loops.size===0,'clear cancels all tails');
     tiers.push({level,shotgunTakes:[...new Set(samples)],peak,rms:Math.sqrt(energy/l.length),stereoDifference:width/l.length,presence,envelopeRatio});
    }
    const crew=new World(4,{schedule:false});crew.addCrew('host');crew.addCrew('guest');crew.selectCrew('host');
    crew.crew[1].level=7;for(let i=0;i<35;i++)crew.stepCrew(new Map([['guest',{...idleInput(),fire:true}]]));sound.update(crew);
    check(sound.loops.get('crew:guest')?.name==='rapid7','remote hand VII');check(sound.loops.get('crew:guest').panner,'remote spatial');
    sound.play({kind:'burst',shooterId:'guest',level:7,pos:v(18,2,0)},crew);check([...sound.shots].some(v=>v.name.startsWith('shot7')&&v.panner?.positionX.value===18),'remote shotgun spatial');
    const budget=new World(1,{schedule:false});sound.clear();await Promise.all(Array.from({length:5},(_,i)=>sound.load('killskull'+(i+1))));for(let i=0;i<60;i++)sound.play({kind:'kill',enemy:'skull',pos:v()},budget);sound.play({kind:'burst',level:7,pos:v()},budget);check(sound.shots.size===48&&[...sound.shots].some(v=>v.name.startsWith('shot7')),'weapon survives dense voice budget');
    sound.clear();window.report={tiers,failed:sound.diagnostics.failed,remoteSpatial:true,budget:true};
   }catch(e){window.error=String(e.stack||e);}
  };});
  await page.click('button');await page.waitForFunction(()=>window.report||window.error,null,{timeout:60000});
  const result=await page.evaluate(()=>({report:window.report,error:window.error}));assert.equal(result.error,undefined);assert.deepEqual(errors,[]);assert.deepEqual(result.report.failed,[]);
  writeFileSync(`artifacts/weapon-audio/${engine}-audit.json`,JSON.stringify(result.report,null,2)+'\n');console.log(engine+': all seven primary/homing streams, shotgun variation, envelopes, stereo, headroom, voice budget and remote routing passed.');
 }finally{await browser.close();}
}
