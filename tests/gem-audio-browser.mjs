import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(base+'/gem-audio-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Gem audio regression</title>'}));
 await page.goto(base+'/gem-audio-test');
 const report=await page.evaluate(async()=>{
  const [{Sound},{World,idleInput,v,TUNING},{crystalToEnemy}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts'),import('/src/enemy-presentation.ts')]);
  const check=(v,m)=>{if(!v)throw Error(m);},sound=new Sound();await sound.start();
  const w=new World(8,{schedule:false});w.startAt(0);sound.listener(w.player.pos,0,0);
  for(let i=0;i<30;i++)w.step({...idleInput(),fire:true});
  check(w.weaponAudio.primary,'crystal feedback is checked during sustained fire');
  await Promise.all(['damagesquid','damagesquid2','damagesquid3','damagespider','damagegigaspider'].map(name=>sound.load(name)));
  for(const kind of ['squid','squid2','squid3','spider','spider2']){
   sound.clear();w.enemies=[];w.gems=[];w.effects=[];const e=w.spawn(kind,v(3,3,0));w.effects=[];
   // Spider spawning relocates outside the arena; keep this cue test nearby.
   e.pos=v(3,3,0);
   const weak=e.weakpoints.length>0,point=weak?crystalToEnemy(e,w.player.pos,e.weakpoints[0].local):w.weakPoint(e);
   {
    w.damageEnemy(e,1,point,weak?0:-1,weak);for(const event of w.effects)sound.play(event,w);w.effects=[];
    const hit=[...sound.shots].find(voice=>voice.name.startsWith('crystalhit'));
    check(!!hit,kind+' nonlethal crystal hit plays during firing');
    check(Math.abs(hit.gain.gain.value-sound.volumeFor(hit.name))<1e-6,kind+' crystal hit uses its restrained feedback gain during firing');
    check(hit.priority===3&&!!hit.panner,kind+' crystal hit has protected spatial feedback');
    check(hit.panner.refDistance===4,kind+' crystal strike carries across normal aiming distances');
   }
   // An ordinary hit cooldown must never suppress the lethal crystal fracture.
   w.damageEnemy(e,10000,point,weak?0:-1,weak);for(const event of w.effects)sound.play(event,w);
   const breaks=[...sound.shots].filter(v=>v.name.startsWith('crystalbreak'));
   check(breaks.length===1,kind+' plays exactly one detach');check(!!breaks[0].panner,kind+' break is spatial');
   check(breaks[0].panner.refDistance===4&&breaks[0].priority===4,kind+' break carries as far as hits and has higher priority');
   check(breaks[0].gain.gain.value>sound.volumeFor('crystalhit1')*1.1,kind+' break leads the quieter hit');
   check(Math.abs(breaks[0].panner.positionX.value-point.x)<1e-5,kind+' break originates at crystal');
  }
  sound.clear();
  for(let i=0;i<48;i++)sound.play({kind:'hit',bloodless:true,enemy:'squid2',enemyId:1000+i,pos:w.player.pos},w);
  check(sound.shots.size===48,'fill the combat voice budget with crystal hits');
  const crowdedHits=[...sound.shots];
  check(crowdedHits.at(-1).gain.gain.value<crowdedHits[0].gain.gain.value*.2,'simultaneous hits across enemies do not stack at full level');
  sound.play({kind:'hit',bloodless:true,crystalBreak:true,enemy:'squid2',pos:w.player.pos},w);
  check([...sound.shots].some(voice=>voice.name.startsWith('crystalbreak')),'break survives a full budget of reverberant hits');
  sound.clear();w.enemies=[];w.gems=[];w.effects=[];
  w.dropGems(v(0,w.player.pos.y,3),1);sound.update(w);
  check(sound.diagnostics.loops.filter(n=>n==='gemchatter').length===1,'nearby loose gem chatters');
  const first=w.gems[0],voice=sound.loops.get(`gem:${first.id}`);
  check(voice.source.buffer.numberOfChannels===2&&voice.source.loop,'gem chatter uses the stereo reverberant loop');
  first.pos.x=2;sound.update(w);check(voice.panner.positionX.value===2,'shimmer follows moving gem');
  first.pos.x=40;sound.update(w);check(!sound.loops.has(`gem:${first.id}`),'distant gem is silent');
  w.gems=[];for(let i=0;i<80;i++)w.dropGems(v((i%5)-2,w.player.pos.y,2+i*.1),1);
  sound.update(w);const chatter=[...sound.loops.values()].filter(v=>v.name==='gemchatter');
  check(chatter.length===6,'gem shower uses at most six voices');
  const combinedGain=Math.sqrt(chatter.reduce((sum,v)=>sum+v.targetGain**2,0));
  check(combinedGain<=sound.volumeFor('gemchatter')*.701,'shower energy stays bounded');
  for(const gem of w.gems)gem.age=TUNING.gemLifetime;sound.update(w);
  check(!sound.diagnostics.loops.includes('gemchatter'),'expired gems stop immediately');
  sound.clear();w.gems=[];w.effects=[];w.level=1;w.dropGems({...w.player.pos},1);w.step(idleInput());
  const pickup=w.effects.find(e=>e.kind==='pickup');check(!!pickup,'actual gem contact emits pickup');
  for(let i=0;i<48;i++)sound.play({kind:'kill',enemy:'skull',pos:w.player.pos},w);
  sound.play(pickup,w);check(sound.diagnostics.oneShotNames.some(n=>/^gibcollect[23]?$/.test(n)),'local collection survives saturated combat');
  const collection=[...sound.shots].find(v=>v.name.startsWith('gibcollect'));
  check(collection.panner?.panningModel==='HRTF','local collection uses 3D audio');
  check(Math.abs(collection.panner.positionX.value-pickup.pos.x)<1e-5&&Math.abs(collection.panner.positionY.value-pickup.pos.y)<1e-5&&Math.abs(collection.panner.positionZ.value-pickup.pos.z)<1e-5,'collection originates at the actual pickup position');
  sound.play({...pickup,pos:v(pickup.pos.x+8,pickup.pos.y,pickup.pos.z)},w);
  check([...sound.shots].filter(v=>v.name.startsWith('gibcollect')).length===1,'moving through pickup positions preserves the collector cooldown');
  sound.clear();const variants=[],pickupVoices=[];
  for(const level of [1,3]){
   let previous='';const takes=[];
   for(let i=0;i<14;i++){
    // Audio time can advance in larger quanta than wall time under GPU load.
    while(sound.context.currentTime<(sound.cooldowns.get('pickup:local')??0))await new Promise(r=>setTimeout(r,10));
    const overlap=[...sound.shots].filter(v=>v.name.startsWith('gibcollect')).length;
    sound.play({...pickup,level},w);const name=sound.diagnostics.recent.at(-1);
    const voice=[...sound.shots].filter(v=>v.name.startsWith('gibcollect')).at(-1);
    check(level===1?/^gibcollect[23]?$/.test(name):/^gibcollectmagic[23]?$/.test(name),'correct pickup family');
    check(name!==previous,'consecutive liquid recordings vary');
    check(voice.rate===1&&voice.source.playbackRate.value===1,'every pickup uses fixed native pitch');
    check(Math.abs(voice.gain.gain.value-sound.volumeFor(name)/Math.sqrt(1+overlap*.2))<1e-6,'gain has no random variation');
    takes.push(name);previous=name;variants.push({name,rate:voice.rate,gain:voice.gain.gain.value});
    pickupVoices.push({name,rate:voice.rate,gain:voice.gain.gain.value});
    await new Promise(r=>setTimeout(r,35));
   }
   for(let i=0;i<12;i+=3)check(new Set(takes.slice(i,i+3)).size===3,'every take plays before a bag repeats');
  }
  const surge=new OfflineAudioContext(2,48000*2.5,48000);
  pickupVoices.forEach((v,i)=>{const source=surge.createBufferSource(),gain=surge.createGain();source.buffer=sound.buffers.get(v.name);source.playbackRate.value=v.rate;gain.gain.value=v.gain*.55;source.connect(gain);gain.connect(surge.destination);source.start(i*.035);});
  const surgeOutput=await surge.startRendering();let surgePeak=0;
  for(let channel=0;channel<2;channel++)for(const sample of surgeOutput.getChannelData(channel))surgePeak=Math.max(surgePeak,Math.abs(sample));
  check(surgePeak<.26,'rapid collection stays restrained in the mix');
  sound.clear();w.dropGems(v(0,w.player.pos.y,3),1);sound.update(w);w.state='dead';sound.update(w);
  check(!sound.diagnostics.loops.includes('gemchatter'),'death stops gem shimmer');
  const rendered=[];
  for(const name of ['gibcollect','gibcollect2','gibcollect3','gibcollectmagic','gibcollectmagic2','gibcollectmagic3','crystalhit1','crystalhit2','crystalhit3','crystalbreak1','crystalbreak2','crystalbreak3','gemchatter']){
   const offline=new OfflineAudioContext(1,Math.ceil((sound.buffers.get(name).duration+.1)*48000),48000),source=offline.createBufferSource(),gain=offline.createGain();
   source.buffer=sound.buffers.get(name);gain.gain.value=sound.volumeFor(name)*.55;source.connect(gain);gain.connect(offline.destination);source.start();
   const output=await offline.startRendering(),data=output.getChannelData(0),length=Math.min(data.length,Math.round(source.buffer.duration*output.sampleRate));
   let square=0,peak=0;for(let i=0;i<length;i++){square+=data[i]**2;peak=Math.max(peak,Math.abs(data[i]));}
   const rms=Math.sqrt(square/length);check(rms>(.001),name+' renders audible output');check(peak<(name.startsWith('crystalbreak')?.4:.3),name+' retains output headroom');
   rendered.push({name,rms,peak,duration:source.buffer.duration});
   if(name.startsWith('crystalbreak')){
    check(peak>.1&&peak<.21,'fracture is audible with bounded attack');
    const buffer=source.buffer;check(buffer.duration>1.3&&buffer.duration<1.7,'detach retains shard and crystal resonance decay');
    check(buffer.numberOfChannels===1,'detach keeps a mono source for socket HRTF placement');
    const samples=buffer.getChannelData(0);let attack=0,tail=0;
    for(let i=0;i<samples.length;i++){if(i<buffer.sampleRate*.15)attack+=samples[i]**2;else if(i>buffer.sampleRate*.4)tail+=samples[i]**2;}
    check(tail>attack*.003&&tail<attack*.5,'crystal decay remains audible and falls beneath the initial fracture');
   }
   if(name.startsWith('crystalhit')){
    check(peak>.07&&peak<.12,'hit transient is readable with bounded attack');
    const buffer=source.buffer;
    check(buffer.numberOfChannels===2&&buffer.duration>.7,'hit includes stereo reverb');
    const left=buffer.getChannelData(0),right=buffer.getChannelData(1);let tail=0,width=0;
    for(let i=Math.round(buffer.sampleRate*.3);i<left.length;i++){tail+=left[i]**2;width+=(left[i]-right[i])**2;}
    check(tail>.0001&&width>.0001,'hit reverb has a real diffuse decay beyond the dry strike');
   }
   if(name.startsWith('gibcollect')){
    check(peak>.045&&peak<.075&&rms>.0035&&rms<.006,'pickup stays audible and restrained at the normal master volume');
    const buffer=sound.buffers.get(name);check(buffer.numberOfChannels===2,'pickup has stereo reflections');
    const left=buffer.getChannelData(0),right=buffer.getChannelData(1);let tail=0,width=0;
    for(let i=0;i<left.length;i++){width+=(left[i]-right[i])**2;if(i>buffer.sampleRate*.35)tail+=left[i]**2;}
    check(width>.01,'reflections add stereo width');check(tail>.0005,'pickup retains a restrained decay after the attack');
    check(buffer.duration>1&&buffer.duration<1.3,'pickup has a longer reverb tail');
    let late=0;for(let i=Math.round(buffer.sampleRate*.6);i<left.length;i++)late+=left[i]**2;
    check(late>.002,'pickup reverb remains present beyond 600 ms');
   }
  }
  // Render every crystal variant through the real spatial playback graph.
  const spatial=[];
  for(const {name} of rendered){
   sound.clear();sound.listener(v(),0,0);sound.oneShot(name,v(2,0,0));
   const voice=[...sound.shots][0];
   check(voice?.panner?.panningModel==='HRTF'&&voice.panner.distanceModel==='inverse',name+' uses directional 3D distance attenuation');
   sound.listener(v(0,100,0),0,0);await new Promise(r=>setTimeout(r,40));
   check(voice.spatialGain.gain.value===0,name+' already-playing voice mutes when listener leaves in 3D');
   sound.listener(v(),0,0);await new Promise(r=>setTimeout(r,40));check(voice.spatialGain.gain.value===1,name+' becomes audible on listener return');
   async function renderAt(x){
    const c=new OfflineAudioContext(2,24000,48000);Object.defineProperty(c,'state',{value:'running'});
    const s=new Sound();s.context=c;s.master=c.createGain();s.master.gain.value=.55;s.master.connect(c.destination);s.buffers=sound.buffers;s.listener(v(),0,0);
    s.oneShot(name,v(x,0,0));const out=await c.startRendering();s.clear();
    const energy=[0,1].map(ch=>out.getChannelData(ch).reduce((sum,sample)=>sum+sample*sample,0));
    return {rms:Math.sqrt((energy[0]+energy[1])/(out.length*2)),left:energy[0],right:energy[1]};
   }
   const near=await renderAt(2),distant=await renderAt(12),outside=await renderAt(100),left=await renderAt(-2);
   check(near.rms>0&&distant.rms<near.rms*.5,name+' rendered loudness falls with distance');
   check(outside.rms===0,name+' is silent outside its hearing range');
   check(near.right>near.left&&left.left>left.right,name+' rendered direction follows source side');
   spatial.push({name,nearRms:near.rms,distantRms:distant.rms,outsideRms:outside.rms});
  }
  check(sound.diagnostics.failed.length===0,'no failed recordings');sound.clear();
  return {crystalKinds:5,gemVoiceLimit:6,combinedGain,variants,surgePeak,rendered,spatial};
 });
 assert.deepEqual(errors,[]);mkdirSync('artifacts/gem-audio',{recursive:true});writeFileSync('artifacts/gem-audio/audit.json',JSON.stringify(report,null,2)+'\n');
 console.log('Gem audio passed: crystal sockets/spiders, immediate fracture after hit, spatial chatter/following/range/expiry, 80-gem voice budget, real pickup under saturation, variants, death cleanup and rendered levels.');
}finally{await browser.close();}
