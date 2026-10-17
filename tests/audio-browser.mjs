import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[],oldRequests=[];page.on('request',r=>{if(r.url().includes('/assets/original/devil-daggers/audio/'))oldRequests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 // Import the audio system into an isolated page so game startup and hot
 // reloads cannot interrupt decoding or change the voices under test.
 await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Audio regression tests</title>'}));
 await page.goto(url);
 const result=await page.evaluate(async()=>{
  const {Sound,SOUND_NAMES}=await import('/src/audio.ts'),{World,idleInput,v}=await import('/src/simulation.ts'),{ENEMY_KINDS}=await import('/src/enemy-kinds.ts');
  const sound=new Sound();await sound.start();const check=(value,message)=>{if(!value)throw Error(message);};
  check(sound.diagnostics.failed.length===0,JSON.stringify(sound.diagnostics.failed));check(['rapid1','shot1','weapon1-start','weapon1-stop','gibcollect','gibcollectmagic','crystalhit1','crystalbreak1','gemchatter','jump1','land','death','spawnminisquid'].every(name=>sound.buffers.has(name)),'startup prepares opening combat and gem feedback');check(sound.diagnostics.loaded<SOUND_NAMES.length/2,'startup leaves later cues on demand');
  // Exhaustive audio fixture explicitly warms later cues; normal gameplay loads them on demand.
  for(const name of SOUND_NAMES)await sound.load(name);
  check(sound.diagnostics.loaded===SOUND_NAMES.length,'all used recordings decoded');
  const unusedDecoded=[];
  const manifest=await (await fetch('/assets/audio/remake/manifest.json')).json();
  for(const [name,entry] of Object.entries(manifest)){if(SOUND_NAMES.includes(name))continue;const buffer=await sound.context.decodeAudioData(await (await fetch('/assets/audio/remake/'+entry.file)).arrayBuffer());check(buffer.duration>0&&buffer.numberOfChannels>0,'decode '+name);unusedDecoded.push(name);}
  const summary=[];
  // A shotgun trigger emits one launch voice, including the two-hand tiers.
  // Each authored expulsion includes its continuous pressure / breath tail.
  for(let level=1;level<=7;level++){
   sound.clear();const shotgun=new World(17,{schedule:false,invulnerable:true});shotgun.level=level;shotgun.reserve=100;
   shotgun.shoot({...idleInput(),pitch:0},true,false);
   const bursts=shotgun.effects.filter(e=>e.kind==='burst');check(bursts.length===1,'one shotgun event at tier '+level);
   sound.play(bursts[0],shotgun);
   const voices=[...sound.shots];check(voices.length===1&&voices[0].name.startsWith('shot'),'one shotgun voice at tier '+level);
   check(voices[0].source.buffer.duration>1&&voices[0].source.buffer.duration<1.4,'full supernatural pressure tail at tier '+level);
  }
  for(const name of SOUND_NAMES.filter(name=>name.startsWith('shot'))){
   const buffer=sound.buffers.get(name);check(buffer.duration>1&&buffer.duration<1.4,name+' has a single designed expulsion with a full decay');
  }
  sound.clear();
  // Cold upgrades survive a slow decode, play once, and cancel across restart.
  const upgradeFetch=window.fetch;
  window.fetch=async(...args)=>{if(/\/levelup[2-7]\.wav$/.test(String(args[0])))await new Promise(resolve=>setTimeout(resolve,250));return upgradeFetch(...args);};
  try{
   const upgradeWorld=new World(12,{schedule:false});
   for(let level=2;level<=7;level++){
    sound.clear();const name='levelup'+level;sound.buffers.delete(name);
    sound.play({kind:'upgrade',level,amount:level,pos:upgradeWorld.player.pos},upgradeWorld);
    await sound.pending.get(name);
    check(sound.diagnostics.oneShots===1&&sound.diagnostics.oneShotNames[0]===name,'cold upgrade plays once at tier '+level);
    check([...sound.shots][0].rate===1,'each upgrade plays its own recording at native pitch '+level);
   }
   sound.clear();sound.buffers.delete('levelup2');sound.play({kind:'upgrade',level:2,amount:2,pos:upgradeWorld.player.pos},upgradeWorld);
   const pendingUpgrade=sound.pending.get('levelup2');sound.clear();await pendingUpgrade;
   check(sound.diagnostics.oneShots===0,'restart cancels cold upgrade');
  }finally{window.fetch=upgradeFetch;sound.clear();}
  // Walking over the original uneven tiles must not sound like repeated landings.
  sound.clear();const walking=new World(1,{schedule:false});
  for(let i=0;i<300;i++){walking.step({...idleInput(),forward:1,yaw:.8});for(const event of walking.effects)sound.play(event,walking);walking.effects=[];}
  check(sound.diagnostics.oneShots===0,'uneven-floor walking produces no false landing voices');
  const jumping=new World(1,{schedule:false});jumping.step({...idleInput(),jump:true});
  for(let i=0;i<120;i++)jumping.step(idleInput());
  for(const event of jumping.effects)sound.play(event,jumping);
  check(sound.diagnostics.oneShotNames.includes('jump1')&&sound.diagnostics.oneShotNames.includes('land'),'jump and genuine landing retain movement audio');sound.clear();
  const hopping=new World(1,{schedule:false});hopping.startAt(0);const hopFloor=hopping.player.pos.y;
  hopping.step({...idleInput(),jump:true});hopping.effects=[];let heardHops=0;
  for(let i=0;i<300&&heardHops<3;i++){
   const jump=hopping.player.vel.y<-5&&hopping.player.pos.y<hopFloor+.25;
   hopping.step({...idleInput(),jump});
   for(const event of hopping.effects){
    if(event.kind!=='jump')continue;
    sound.clear();
    for(let j=0;j<48;j++)sound.play({kind:'kill',pos:hopping.player.pos,enemy:'skull'},hopping);
    sound.play(event,hopping);
    check(event.amount===3&&sound.diagnostics.oneShotNames.includes('jump3'),'buffered bunnyhop remains audible during combat');
    check([...sound.shots].find(v=>v.name==='jump3').panner===undefined,'local hop plays directly');heardHops++;
   }
   hopping.effects=[];
  }
  check(heardHops===3,'every chained bunnyhop has its own feedback');sound.clear();
  const normalJump=sound.buffers.get('jump1').getChannelData(0),hopJump=sound.buffers.get('jump3').getChannelData(0);
  check(normalJump.length!==hopJump.length||normalJump.some((sample,i)=>sample!==hopJump[i]),'bunnyhop recording differs from normal takeoff');
  for(let level=1;level<=4;level++){
   sound.clear();const w=new World(1,{schedule:false});w.level=level;w.reserve=100;
   for(let i=0;i<360;i++){w.step({...idleInput(),fire:true});for(const e of w.effects)sound.play(e,w);w.effects=[];sound.update(w);}
   check(sound.diagnostics.loops.filter(n=>n.startsWith('rapid')).length===1,'one stream voice at level '+level);
   check(sound.diagnostics.loops.includes('rapid'+level),'correct hand recording');check(![...sound.shots].some(v=>v.name.startsWith('rapid')),'no rapid one-shots');
   w.step(idleInput());sound.update(w);check(!sound.diagnostics.loops.some(n=>n.startsWith('rapid')),'release stops stream');
   sound.clear();w.shoot(idleInput(),true,false);sound.play(w.effects.at(-1),w);check(sound.diagnostics.oneShots===1,'burst plays immediately');summary.push({level,...sound.diagnostics});
  }
  // Level changes replace the stream; homing has priority and bounded drone voices.
  sound.clear();const w=new World(2,{schedule:false});w.level=3;w.reserve=100;
  for(let i=0;i<30;i++)w.step({...idleInput(),fire:true});sound.update(w);w.level=4;sound.update(w);check(!sound.diagnostics.loops.includes('rapid3')&&sound.diagnostics.loops.includes('rapid4'),'upgrade swaps stream');
  w.step({...idleInput(),fire:true,homing:true});sound.update(w);check(!sound.diagnostics.loops.some(n=>n.startsWith('rapid')),'homing interrupts primary');check(sound.diagnostics.loops.includes('magentadrone'),'magenta drone');
  w.reserve=1000;sound.clear();
  for(let i=0;i<360;i++){w.step({...idleInput(),fire:true,homing:true});for(const event of w.effects)sound.play(event,w);w.effects=[];sound.update(w);}
  check(![...sound.shots].some(v=>v.name==='daggerseek'||v.name==='magentashot'),'sustained homing never stacks launch tails');check(sound.diagnostics.loops.filter(n=>n==='magentadrone').length<=8,'bounded homing drones');check(!sound.diagnostics.loops.some(n=>n.startsWith('rapid')),'sustained homing retains priority');
  for(let i=0;i<1200;i++){w.step(idleInput());w.effects=[];}sound.update(w);check(!sound.diagnostics.loops.includes('magentadrone'),'expired projectiles stop drones');
  sound.clear();w.shoot(idleInput(),true,true);sound.play(w.effects.at(-1),w);check([...sound.shots].some(v=>v.name==='weapon4-homing'),'homing burst launch cue');
  await sound.start();sound.pause();sound.clear();await sound.start();sound.update(w);
  w.die('skull');sound.play(w.effects.at(-1),w);sound.update(w);check(sound.diagnostics.loops.length===0,'death silences loops');check(sound.diagnostics.oneShots===1,'death cue survives clear');sound.clear();check(sound.diagnostics.oneShots===0,'restart clears tails');
  // Low-priority saturation cannot swallow the weapon or upgrade/death cues.
  for(let i=0;i<60;i++)sound.play({kind:'kill',pos:v(),enemy:'skull'},w);
  check(sound.diagnostics.oneShots===48,'bounded transient pool');sound.play({kind:'burst',pos:v(),amount:0,level:4},w);check(sound.diagnostics.oneShots===48,'weapon takes lower priority slot');sound.play({kind:'upgrade',pos:v(),amount:4},w);check(sound.diagnostics.oneShots===48,'upgrade takes lower priority slot');sound.clear();
  // Remote deaths must not cut surviving players' weapon or one-shot voices.
  sound.clear();const crew=new World(4,{schedule:false});crew.addCrew('host');crew.addCrew('guest');crew.selectCrew('host');
  for(let i=0;i<30;i++)crew.stepCrew(new Map([['host',{...idleInput(),fire:true}]]));sound.update(crew);
  sound.play({kind:'jump',shooterId:'host',pos:crew.player.pos,amount:1},crew);
  const stream=sound.loops.get(-10),jump=[...sound.shots].find(v=>v.name==='jump1');
  check(!!stream&&!!jump,'crew fixture has local stream and jump audio');
  crew.crew[1].alive=false;crew.crew[1].cause='FALLEN';
  sound.play({kind:'death',shooterId:'guest',deathCause:'FALLEN',pos:v(20,1.7,0)},crew);
  check(sound.loops.get(-10)===stream&&!stream.ended,'remote death preserves local weapon loop');
  check(sound.shots.has(jump)&&!jump.ended,'remote death preserves local one-shot');
  const remote=[...sound.shots].find(v=>v.name==='fall');check(!!remote?.panner&&remote.panner.positionX.value===20,'remote fall cue is positional');sound.clear();
  // Teammates' bursts and continuous fire stay attached to their own positions.
  const weapons=new World(4,{schedule:false,invulnerable:true});weapons.addCrew('host');weapons.addCrew('guest');weapons.selectCrew('host');
  for(const [amount,level,name] of [[0,1,'shot1'],[1,3,'weapon3-homing'],[1,4,'weapon4-homing']]){
   sound.clear();sound.play({kind:'burst',shooterId:'guest',pos:v(20,2,-12),amount,level},weapons);
   const remoteShot=[...sound.shots].find(v=>(name==='shot1'?v.name.startsWith('shot1'):v.name===name));
   check(remoteShot?.panner?.positionX.value===20&&remoteShot.panner.positionZ.value===-12,'remote '+name+' has positional attenuation');
   sound.clear();sound.play({kind:'burst',shooterId:'host',pos:v(20,2,-12),amount,level},weapons);
   check([...sound.shots].some(v=>(name==='shot1'?v.name.startsWith('shot1'):v.name===name)&&!v.panner),'local '+name+' retains direct weapon mix');
  }
  sound.clear();
  for(let i=0;i<30;i++)weapons.stepCrew(new Map([['guest',{...idleInput(),fire:true}]]));
  sound.update(weapons);const guest=weapons.crew[1],remoteStream=sound.loops.get('crew:guest');
  check(remoteStream?.name==='rapid1'&&!!remoteStream.panner&&!sound.loops.has(-10),'remote stream plays while local player is idle');
  guest.player.pos.x=17;sound.update(weapons);
  check(sound.loops.get('crew:guest')===remoteStream&&remoteStream.panner.positionX.value===17,'remote stream follows movement without stacking');
  guest.level=3;guest.reserve=100;sound.update(weapons);
  check(sound.loops.get('crew:guest')?.name==='rapid3','remote upgrade replaces stream');
  weapons.stepCrew(new Map([['guest',{...idleInput(),fire:true,homing:true}]]));sound.update(weapons);
  check(sound.loops.get('crew:guest')?.name==='seekrapid3','remote homing replaces primary stream with its own cue');
  for(let i=0;i<30;i++)weapons.stepCrew(new Map([['host',{...idleInput(),fire:true}],['guest',{...idleInput(),fire:true}]]));
  sound.update(weapons);check(sound.loops.has(-10)&&sound.loops.has('crew:guest'),'local and remote streams coexist');
  weapons.stepCrew(new Map([['host',{...idleInput(),fire:true}]]));sound.update(weapons);
  check(sound.loops.has(-10)&&!sound.loops.has('crew:guest'),'remote release preserves local stream');
  for(let i=0;i<30;i++)weapons.stepCrew(new Map([['guest',{...idleInput(),fire:true}]]));sound.update(weapons);
  guest.alive=false;sound.update(weapons);check(!sound.loops.has('crew:guest'),'remote death stops its stream');
  guest.alive=true;sound.update(weapons);check(sound.loops.has('crew:guest'),'remote stream fixture restored');
  weapons.crew.pop();sound.update(weapons);check(!sound.loops.has('crew:guest'),'departed player stops its stream');sound.clear();
  const enemies=[];
  for(const kind of ENEMY_KINDS){sound.clear();const fixture=new World(5,{schedule:false}),enemy=fixture.spawn(kind,v(4,3,0));enemy.pos=v(4,3,0);enemy.age=20;enemy.status='idle';for(const event of fixture.effects)sound.play(event,fixture);sound.update(fixture);check(sound.diagnostics.loops.length===5,kind+' chatter and four ambient loops');sound.play({kind:'hit',enemy:kind,pos:enemy.pos},fixture);sound.play({kind:'kill',enemy:kind,pos:enemy.pos},fixture);enemies.push({kind,loops:sound.diagnostics.loops,cues:[...sound.shots].map(v=>v.name)});}
  // Enemy damage must not be synthesized by armor contacts or suppressed by
  // another enemy's cooldown, even when the recordings share a numbered stem.
  sound.clear();const combat=new World(6,{schedule:false}),a=combat.spawn('squid2',v(8,5,0)),b=combat.spawn('squid2',v(12,5,0)),c=combat.spawn('squid3',v(16,7,0));
  combat.effects=[];for(const enemy of [a,b,c]){enemy.age=20;enemy.status='idle';}
  sound.update(combat);
  sound.play({kind:'impact',enemy:a.kind,pos:a.pos},combat);
  check([...sound.shots].map(v=>v.name).join(',')==='daggerhit1','armor contact only plays dagger impact');
  combat.damageEnemy(a,1);combat.damageEnemy(a,1);combat.damageEnemy(b,1);combat.damageEnemy(c,1);
  for(const event of combat.effects)sound.play(event,combat);
  const damageCues=[...sound.shots].map(v=>v.name);
  check(damageCues.filter(n=>n==='damagesquid2').length===2,'two enemies each get damage audio; repeated same-enemy hits throttle');
  check(damageCues.filter(n=>n==='damagesquid3').length===1,'other squid tier keeps its damage cue');
  combat.effects=[];combat.damageEnemy(a,100);for(const event of combat.effects)sound.play(event,combat);
  check(!sound.loops.has(a.id)&&sound.loops.has(b.id),'kill immediately stops only its enemy chatter');
  sound.update(combat);check(!sound.loops.has(a.id),'dead enemy cannot restart chatter before removal');
  b.status='burrowing';b.pos.y=-100;sound.update(combat);check(!sound.loops.has(b.id),'burrowing stops surface chatter');
  b.status='idle';b.pos.y=5;sound.update(combat);check(sound.loops.has(b.id),'emergence restores chatter');
  c.kind='transmuted3';sound.update(combat);check(sound.loops.get(c.id)?.name==='chatterskull3black','transmutation replaces chatter');
  sound.clear();
  for(const kind of ['squid','squid2','squid3'])sound.play({kind:'hit',enemy:kind,pos:v()},combat);
  check(sound.diagnostics.oneShots===3,'legacy events without IDs retain separate tier cooldowns');
  // Exercise a real projectile hitting an attached gem, through event playback.
  sound.clear();const crystals=new World(8,{schedule:false}),tower=crystals.spawn('squid2',v(0,5.2,-20));tower.age=2;crystals.step(idleInput());crystals.effects=[];
  const crystal=crystals.weakPoint(tower);crystals.projectiles.push({id:9999,pos:{...crystal},vel:v(),age:0,homing:false});crystals.step(idleInput());
  const gemHit=crystals.effects.find(e=>e.kind==='hit'&&e.enemyId===tower.id);
  check(!!gemHit,'projectile on attached gem emits damage audio');
  for(const event of crystals.effects)sound.play(event,crystals);
  const gemVoice=[...sound.shots].find(v=>v.name.startsWith('crystalhit'));
  check(!!gemVoice&&!!gemVoice.panner,'gem hit uses positional crystal recording');
  check(Math.abs(gemVoice.panner.positionX.value-gemHit.pos.x)<1e-5&&Math.abs(gemVoice.panner.positionZ.value-gemHit.pos.z)<1e-5,'gem impact audio comes from the hit position');
  check(Math.abs(gemVoice.gain.gain.value-sound.volumeFor(gemVoice.name))<1e-6,'damage feedback uses the balanced gain');
  sound.clear();sound.listener(v(),.8,.6);const listener=sound.context.listener;const dot=listener.forwardX.value*listener.upX.value+listener.forwardY.value*listener.upY.value+listener.forwardZ.value*listener.upZ.value;check(Math.abs(dot)<1e-6,'orthogonal pitched listener');
  // Verify fresh weapon sounds cannot be queued into a later run while loading.
  const cached=sound.buffers.get('shot1');sound.buffers.delete('shot1');const pending=sound.load('shot1');sound.play({kind:'burst',level:1,pos:v()},w);sound.clear();await pending;check(sound.diagnostics.oneShots===0,'no stale cue after load/restart');sound.buffers.set('shot1',cached);
  // Failed loop downloads back off, then recover when the recording is available.
  const ambient=sound.buffers.get('polarity1e'),fetchOriginal=window.fetch;let attempts=0,unavailable=true;
  sound.buffers.delete('polarity1e');
  window.fetch=async(...args)=>{if(String(args[0]).endsWith('/polarity1e.wav')){attempts++;if(unavailable)return new Response('',{status:503});}return fetchOriginal(...args);};
  try{
   const retryWorld=new World(1,{schedule:false});
   for(let i=0;i<12;i++){sound.update(retryWorld);await Promise.resolve();}
   check(attempts===1&&sound.diagnostics.failed.includes('polarity1e'),'failed ambient recording does not retry every update');
   sound.clear();sound.update(retryWorld);await Promise.resolve();check(attempts===1,'restart preserves download backoff');
   await new Promise(r=>setTimeout(r,1100));sound.update(retryWorld);await Promise.resolve();
   check(attempts===2,'failed recording retries after initial backoff');
   unavailable=false;await new Promise(r=>setTimeout(r,1100));sound.update(retryWorld);await Promise.resolve();
   check(attempts===2,'repeated failure increases backoff');
   await new Promise(r=>setTimeout(r,1100));sound.update(retryWorld);await sound.pending.get('polarity1e');sound.update(retryWorld);
   check(attempts===3&&sound.loops.get(-1)?.name==='polarity1e','ambient loop recovers automatically');
   check(!sound.diagnostics.failed.includes('polarity1e'),'successful retry clears failure diagnostics');
  }finally{window.fetch=fetchOriginal;sound.buffers.set('polarity1e',ambient);sound.clear();}
  // Real audio output: render each replacement weapon through the same mixer gain.
  const rendered=[];
  for(const name of Array.from({length:7},(_,i)=>[`rapid${i+1}`,`seekrapid${i+1}`,`shot${i+1}`]).flat()){
   const offline=new OfflineAudioContext(2,44100,44100),source=offline.createBufferSource(),gain=offline.createGain();source.buffer=sound.buffers.get(name);gain.gain.value=sound.volumeFor(name)*.55;source.connect(gain);gain.connect(offline.destination);source.start();if(name.includes('rapid'))source.stop(.7);
   const output=await offline.startRendering(),samples=output.getChannelData(0),rms=Math.sqrt(samples.slice(0,22050).reduce((s,x)=>s+x*x,0)/22050),tail=Math.max(...samples.slice(33075).map(Math.abs));
   check(rms>.005,name+' must retain audible body');if(name.includes('rapid'))check(tail===0,name+' stops after release');rendered.push({name,rms,tail,peak:Math.max(...samples.map(Math.abs))});
  }
  const streamRms=rendered.filter(r=>r.name.startsWith('rapid')).map(r=>r.rms),burstRms=rendered.filter(r=>r.name.startsWith('shot')).map(r=>r.rms);
  check(Math.max(...streamRms)<.055,'sustained stream output retains 25 dB RMS headroom');
  check(Math.max(...burstRms)/Math.min(...burstRms)<1.6,'shotgun hands have consistent perceived attack levels');
  check(Math.max(...rendered.filter(r=>r.name.startsWith('shot')).map(r=>r.peak))<.36,'shotgun attack retains at least 8 dB of peak headroom');
  return {totalDecoded:SOUND_NAMES.length+unusedDecoded.length,used:SOUND_NAMES.length,enemies,enemyRegressions:{damageCues,armorImpact:true,perEnemyCooldown:true,killStopsChatter:true,burrowAndTransmute:true},levels:summary,rendered,final:sound.diagnostics};
 });
 assert.deepEqual(oldRequests,[],'no extracted audio requests');assert.deepEqual(errors,[]);mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/audio-audit.json',JSON.stringify(result,null,2)+'\n');console.log('Audio browser passed: all replacement effects and music decoded, every hand stream/burst, release/upgrade/homing, pause/restart/death, saturated voice priority and rendered audibility.',result.used);
}finally{await browser.close();}
