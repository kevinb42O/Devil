import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/audio-routing-check',r=>r.fulfill({contentType:'text/html',body:'Audio event audit'}));await page.goto(base+'/audio-routing-check');
 const result=await page.evaluate(async()=>{
  const [{Sound,SOUND_NAMES},{World,idleInput,v,STEP},{ENEMY_KINDS},{weaponShots},{remakeAudioUrl},{ORIGINAL_EFFECTS_HEADROOM}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts'),import('/src/enemy-kinds.ts'),import('/src/weapon-audio.ts'),import('/src/remake-audio.ts'),import('/src/audio-mix.ts')]);
  const check=(value,label)=>{if(!value)throw Error(label);};
  const sound=new Sound();await sound.start();for(const name of SOUND_NAMES)await sound.load(name);
  check(!sound.diagnostics.failed.length,'all runtime cues load');
  for(const name of SOUND_NAMES.filter(n=>!n.startsWith('footstep-')))check(sound.volumeFor(name)===1,'no hidden gain on '+name);
  check(sound.originalBus.gain.value===ORIGINAL_EFFECTS_HEADROOM,'one explicit shared headroom stage');
  const w=new World(3,{schedule:false,invulnerable:true});w.startAt(0);
  const play=event=>{sound.clear();sound.play(event,w);return [...sound.shots];};
  const first=event=>{const voices=play(event);check(voices.length>0,'missing voice '+JSON.stringify(event));return voices[0];};
  const at=(kind,extra={})=>({kind,pos:{...w.player.pos},...extra});
  const render=async voice=>{
   const offline=new OfflineAudioContext(2,22050,44100),source=offline.createBufferSource(),gain=offline.createGain();source.buffer=voice.source.buffer;source.playbackRate.value=voice.rate;gain.gain.value=voice.gain.gain.value*.55*ORIGINAL_EFFECTS_HEADROOM;source.connect(gain);gain.connect(offline.destination);source.start();
   const samples=(await offline.startRendering()).getChannelData(0);
   return {rms:Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length),peak:samples.reduce((peak,x)=>Math.max(peak,Math.abs(x)),0)};
  };
  const movement=[];
  const stream=await render({source:{buffer:sound.buffers.get('rapid1')},gain:{gain:{value:sound.volumeFor('rapid1')}},rate:1});
  for(const [delay,name] of [[0,'jump3'],[3,'jump2'],[9,'jump1']]){
   const jumpWorld=new World(1,{schedule:false});jumpWorld.startAt(0);jumpWorld.player.landedAt=jumpWorld.tick;
   for(let i=0;i<delay;i++)jumpWorld.step(idleInput());jumpWorld.step({...idleInput(),jump:true});
   const event=jumpWorld.effects.find(e=>e.kind==='jump');
   sound.clear();for(let i=0;i<48;i++)sound.play(at('kill',{enemy:'skull'}),w);
   sound.play(event,jumpWorld);const voice=[...sound.shots].find(v=>v.name===name);
   check(voice&&!voice.panner&&voice.rate===1,'protected native local '+name);
   check(voice.gain.gain.value===1&&!voice.reverbSends,'native jump bypasses boosts and added reverb');
   const output=await render(voice);check(output.rms>.008&&output.rms>stream.rms*.5,name+' audible against weapon body');movement.push({name,...output});
  }
  for(const amount of [1,2]){const voice=first(at('land',{amount}));const output=await render(voice);check(output.rms>.004,'audible landing '+amount);movement.push({name:voice.name,...output});}
  const lift=new World(3,{schedule:false});lift.startAt(0,4);lift.shoot({...idleInput(),pitch:-1.5},true,false);sound.clear();for(const event of lift.effects)sound.play(event,lift);
  check([...sound.shots].filter(v=>v.name.startsWith('shot4alt')).length===1,'shotgun lift retains one native burst');check(![...sound.shots].some(v=>v.name.startsWith('jump')),'no false bunnyhop on shotgun lift');
  sound.clear();
  for(let i=0;i<12;i++)sound.play(at('kill',{enemy:'skull',enemyId:i}),w);
  check([...sound.shots].every(v=>v.gain.gain.value===1&&!v.reverbSends),'overlapping originals retain recorded levels without synthetic room sends');
  const native=[];
  for(let tier=1;tier<=7;tier++){
   for(let i=0;i<12;i++){const voice=first(at('burst',{level:tier,amount:0}));check(weaponShots(tier).includes(voice.name),'correct shotgun bank '+tier);check(voice.rate===1,'native shotgun pitch');}
   w.level=tier;w.reserve=100;w.weaponAudioFor=()=>({primary:true,homing:false});sound.clear();sound.update(w);
   const streamVoice=sound.loops.get(-10);check(streamVoice?.name==='rapid'+tier,'primary stream '+tier);check(streamVoice.targetGain===1&&!streamVoice.reverbSends,'native stream bypasses role/crowd trims');
   w.weaponAudioFor=()=>({primary:false,homing:true});sound.update(w);const homing=sound.loops.get(-11);
   check(homing?.name==='seekrapid'+tier&&!sound.loops.has(-10),'homing switches stream '+tier);
   if(tier<=4)check(remakeAudioUrl(homing.name).endsWith('/daggerseek.wav'),'homing must not reuse normal fire '+tier);
   w.weaponAudioFor=()=>({primary:false,homing:false});sound.update(w);check(!sound.loops.has(-11),'release stops stream '+tier);
   native.push({tier,shotguns:weaponShots(tier),homing:remakeAudioUrl('seekrapid'+tier)});
  }
  w.level=1;w.weaponAudioFor=()=>({primary:false,homing:false});
  for(const [level,expected] of [[1,'gibcollect'],[2,'gibcollect'],[3,'gibcollectmagic'],[4,'gibcollect']])check(first(at('pickup',{level})).name===expected,'pickup level '+level);
  for(const [level,amount,stem] of [[1,1,'ricochet'],[2,1,'ricochetmed'],[3,1,'gigaricochet'],[4,1,'gigaricochet'],[3,3,'ricochetmagic'],[4,4,'ricochetmagenta']])check(first(at('ricochet',{level,amount})).name.startsWith(stem),'ricochet '+stem);
  const enemies=[];
  for(const kind of ENEMY_KINDS){
   const fixture=new World(7,{schedule:false,invulnerable:true}),enemy=fixture.spawn(kind,v(8,4,-4));enemy.pos=v(8,4,-4);enemy.age=20;enemy.status='idle';
   sound.clear();for(const event of fixture.effects)sound.play(event,fixture);sound.update(fixture);
   check(sound.loops.has(enemy.id),'chatter '+kind);
   const death=first(at('kill',{enemy:kind,enemyId:enemy.id}));check(death.source.buffer.duration>0&&death.rate===1,'native death '+kind);enemies.push({kind,death:death.name});
  }
  check(first(at('kill',{enemy:'ghostpede'})).name==='ultrapedefall','ghostpede death is not floor crash');
  for(const [kind,hit,detach] of [['squid2','damagesquid','damagesquid2'],['squid3','damagesquid','damagesquid3'],['leviathan','damagesquid','damageleviathan']]){
   const fixture=new World(7,{schedule:false}),enemy=fixture.spawn(kind,v(8,5,0));const index=enemy.weakpoints.findIndex(p=>p.hp>1);fixture.effects=[];
   fixture.damageEnemy(enemy,1,fixture.weakPoint(enemy),index,true);check(first(fixture.effects.find(e=>e.kind==='hit')).name===hit,'actual crystal hit '+kind);
   fixture.effects=[];fixture.damageEnemy(enemy,999,fixture.weakPoint(enemy),index,true);check(first(fixture.effects.find(e=>e.kind==='hit')).name===detach,'actual detachment '+kind);
  }
  for(const [level,stem] of [[3,'magicpierce'],[4,'magentastuckenemy']]){
   const fixture=new World(7,{schedule:false}),enemy=fixture.spawn('squid2',v(0,5.2,-20));enemy.age=2;fixture.step(idleInput());fixture.effects=[];
   const crystal=fixture.weakPoint(enemy);fixture.projectiles.push({id:9999,pos:{...crystal},vel:v(),age:0,energy:1,homing:true,level});fixture.step(idleInput());
   const impact=fixture.effects.find(e=>e.kind==='hit'&&e.enemyId===enemy.id);check(impact?.homing&&impact.level===level,'actual homing metadata '+level);
   check(play(impact).some(v=>v.name.startsWith(stem)),'actual homing contact '+level);
  }
  for(const [kind,gush] of [['squid','spawnskulls2'],['squid2','spawnskulls'],['squid3','spawnskulls3']])check(first(at('gush',{enemy:kind})).name===gush,'tower gush '+kind);
  check(first(at('egg',{enemy:'spider'})).name==='spawnegg','egg shot');check(play(at('spawn',{enemy:'egg'})).length===0,'egg spawn does not duplicate shot');
  check(first(at('hatch',{enemy:'egg2'})).name==='eggburst','both eggs use native hatch');
  check(first(at('beckon',{enemy:'orb'})).name==='leviathanbeckon','orb ring uses beckon, not ring-contact cue');
  const transmute=play(at('transmute',{enemy:'orb'})).map(v=>v.name);check(transmute.includes('leviathanbeckon2')&&transmute.includes('leviathantransmute'),'ring contact and transformation');
  for(const level of [2,3,4,5,6,7])check(first(at('upgrade',{amount:level})).name==='levelup'+level,'upgrade '+level);
  const gemWorld=new World(8,{schedule:false,invulnerable:true});gemWorld.dropGems(v(2,1,0),3);
  sound.clear();sound.update(gemWorld);check([1,2,3].every(i=>[...sound.loops.values()].some(v=>v.name==='gibdrone'+i)),'all three idle gem recordings are routed');
  const spider=gemWorld.spawn('spider',v(10,3,0));spider.pos=v(10,3,0);spider.age=20;spider.headExposure=1;sound.update(gemWorld);
  check([...sound.loops.values()].some(v=>v.name==='stealgib'),'spider pulls use the native attraction sound');
  spider.kind='spider2';sound.update(gemWorld);check([...sound.loops.values()].some(v=>v.name==='stealgib2'),'Spider II has its own attraction sound');
  spider.headExposure=0;sound.update(gemWorld);check(![...sound.loops.values()].some(v=>v.name.startsWith('stealgib')),'hidden spider mouths stop attraction audio');
  check(first(at('emerge',{enemy:'centipede'})).name==='unburrowcentipede','centipede emergence');
  for(const kind of ['gigapede','ghostpede'])check(play(at('emerge',{enemy:kind})).length===0,'no invented centipede cue for '+kind);
  check(first(at('burrow',{enemy:'centipede'})).name==='burrowcentipede','burrow cue');
  check(first(at('bounce',{enemy:'egg'})).name==='eggbounce','egg floor bounce');
  check(first(at('eat',{enemy:'spider'})).name.startsWith('spidereat'),'spider feeding');check(first(at('eat',{enemy:'ghostpede'})).name==='ultrapedeeat','ghostpede absorbs homing');
  check(first(at('explosion')).name.startsWith('magentadetonate'),'magenta detonation');
  const contacts=[];
  for(const [kind,name] of [['squid2','splashgiga'],['squid3','splashgiga4'],['spider','splashgiga3'],['spider2','splashgiga5'],['centipede','splashgiga2'],['gigapede','splashgiga2'],['ghostpede','splashgiga6']]){
   sound.clear();sound.deathContact(kind,v());check([...sound.shots][0]?.name===name,'death floor contact '+kind);contacts.push({kind,name});
  }
  const pb=new World(3,{schedule:false});pb.time=10.1;sound.clear();sound.update(pb,{personalBest:10});sound.update(pb,{personalBest:10});check([...sound.shots].filter(v=>v.name==='highscore1').length===1,'personal best once per live run');
  const reward=new World(3,{schedule:false});reward.time=60.01;sound.clear();sound.update(reward,{personalBest:50});sound.update(reward,{personalBest:50});
  check([...sound.shots].filter(v=>v.name==='daggercollect1bronze').length===1,'new dagger reward is routed once');
  sound.clear();sound.update(reward,{personalBest:60});check(!sound.diagnostics.oneShots,'earned reward does not repeat');
  sound.clear();sound.update(pb);check(!sound.diagnostics.oneShots,'replay update does not replay highscore');
  const crew=new World(3,{schedule:false});crew.addCrew('host');crew.addCrew('guest');crew.selectCrew('host');
  sound.clear();sound.play({kind:'jump',pos:v(8,1.7,0),shooterId:'guest',jumpAudio:2},crew);check([...sound.shots][0].panner,'remote hop positional');
  sound.clear();sound.play(at('death'),w);check(sound.diagnostics.oneShots===1&&sound.diagnostics.oneShotNames[0]==='death','death survives cleanup');sound.clear();check(!sound.diagnostics.oneShots&&!sound.diagnostics.loops.length,'clear silences voices');
  const retryName='polarity1e',retryUrl=remakeAudioUrl(retryName),savedFetch=window.fetch;
  sound.buffers.delete(retryName);sound.recordings.delete(retryUrl);let attempts=0,fail=true;
  window.fetch=async(...args)=>{if(String(args[0])===retryUrl){attempts++;if(fail)return new Response('',{status:503});}return savedFetch(...args);};
  try{
   await sound.load(retryName);await sound.load(retryName);check(attempts===1,'failed cues back off');
   sound.retries.get(retryName).nextAt=0;fail=false;await sound.load(retryName);check(attempts===2&&!sound.diagnostics.failed.includes(retryName),'failed cues recover');
  }finally{window.fetch=savedFetch;}
  sound.buffers.delete('jump1');sound.recordings.delete(remakeAudioUrl('jump1'));
  const pending=sound.load('jump1');sound.play(at('jump',{amount:1}),w);sound.clear();await pending;await Promise.resolve();check(!sound.diagnostics.oneShots,'clear invalidates pending cues');
  sound.pause();await sound.start();check(sound.context.state==='running','pause resumes');sound.clear();
  // Exercise the actual Sound graph and final compressor under dense native
  // playback; isolated asset-gain checks cannot establish output headroom.
  await sound.prepareCrewArrival();sound.clear();
  const savedLoading=sound.loading;sound.loading=new Promise(resolve=>setTimeout(resolve,750));
  sound.crewArrival(3,3000);await new Promise(resolve=>setTimeout(resolve,80));
  check(sound.diagnostics.recent.includes('crew-countdown'),'countdown is not blocked behind unrelated warming');
  sound.loading=savedLoading;sound.clear();
  const AudioContextBefore=window.AudioContext;let renderedMix;
  try{
   window.AudioContext=class extends OfflineAudioContext{
    constructor(){super(2,44100,44100);}
    get state(){return 'running';}
    async resume(){}
   };
   const dense=new Sound();dense.setVolume(1);dense.choose=names=>typeof names==='string'?names:names[0];dense.buffers=sound.buffers;await dense.start();
   const denseWorld=new World(7,{schedule:false,invulnerable:true});denseWorld.startAt(0);
   denseWorld.weaponAudioFor=()=>({primary:true,homing:false});dense.update(denseWorld);
   for(let i=0;i<48;i++)dense.play({kind:'kill',enemy:'skull',pos:v(),enemyId:i},denseWorld);
   dense.play({kind:'jump',pos:v(),jumpAudio:1},denseWorld);
   const renderedVoices=dense.shots.size;const output=await dense.context.startRendering();let peak=0,power=0;
   for(let channel=0;channel<output.numberOfChannels;channel++)for(const value of output.getChannelData(channel)){peak=Math.max(peak,Math.abs(value));power+=value*value;}
   check(peak<=1,'dense final output must not clip: '+peak);check(power>0,'dense mix is audible');
   renderedMix={peak,rms:Math.sqrt(power/output.length/output.numberOfChannels),oneShots:renderedVoices,volume:1};dense.clear();
  }finally{window.AudioContext=AudioContextBefore;}
  return {renderedMix,movement,weaponReference:stream,native,enemies,contacts,homingContacts:true,crystalDamage:true,eggShotAndHatch:true,towerGush:true,personalBest:true,remoteMovement:true,failed:sound.diagnostics.failed};
 });
 assert.deepEqual(errors,[]);mkdirSync('artifacts/original-audio',{recursive:true});writeFileSync('artifacts/original-audio/routing-audit.json',JSON.stringify(result,null,2)+'\n');
 console.log('Audio routing audit passed: actual jump variants and rendered audibility; all 7 hands, 22 enemy voices, native damage, homing impacts, ricochets, pickups, tower gushing, eggs, highscore and cleanup.');
 console.log(JSON.stringify(result.movement));
}finally{await browser.close();}
