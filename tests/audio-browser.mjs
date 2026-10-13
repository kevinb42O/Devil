import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 // Import the audio system into an isolated page so game startup and hot
 // reloads cannot interrupt decoding or change the voices under test.
 await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Audio regression tests</title>'}));
 await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const {Sound,SOUND_NAMES}=await import('/src/audio.ts'),{World,idleInput,v}=await import('/src/simulation.ts'),{ENEMY_KINDS}=await import('/src/enemy-kinds.ts');
  const sound=new Sound();await sound.start();const check=(value,message)=>{if(!value)throw Error(message);};
  check(sound.diagnostics.failed.length===0,JSON.stringify(sound.diagnostics.failed));check(sound.diagnostics.loaded===11,'startup decodes only opening cues');
  // Exhaustive audio fixture explicitly warms later cues; normal gameplay loads them on demand.
  for(const name of SOUND_NAMES)await sound.load(name);
  check(sound.diagnostics.loaded===SOUND_NAMES.length,'all used recordings decoded');
  const unusedDecoded=[];
  const manifest=await (await fetch('/assets/original/devil-daggers/audio/manifest.json')).json();
  for(const entry of manifest.files){if(SOUND_NAMES.includes(entry.name))continue;const buffer=await sound.context.decodeAudioData(await (await fetch('/assets/original/devil-daggers/audio/'+entry.name+'.wav')).arrayBuffer());check(buffer.duration>0&&buffer.numberOfChannels>0,'decode '+entry.name);unusedDecoded.push(entry.name);}
  const summary=[];
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
  sound.clear();w.shoot(idleInput(),true,true);sound.play(w.effects.at(-1),w);check([...sound.shots].some(v=>v.name==='magentashot'),'homing burst launch cue');
  await sound.start();sound.pause();sound.clear();await sound.start();sound.update(w);
  w.die('skull');sound.play(w.effects.at(-1),w);sound.update(w);check(sound.diagnostics.loops.length===0,'death silences loops');check(sound.diagnostics.oneShots===1,'death cue survives clear');sound.clear();check(sound.diagnostics.oneShots===0,'restart clears tails');
  // Low-priority saturation cannot swallow the weapon or upgrade/death cues.
  for(let i=0;i<60;i++)sound.play({kind:'kill',pos:v(),enemy:'skull'},w);
  check(sound.diagnostics.oneShots===48,'bounded transient pool');sound.play({kind:'burst',pos:v(),amount:0,level:4},w);check(sound.diagnostics.oneShots===48,'weapon takes lower priority slot');sound.play({kind:'upgrade',pos:v(),amount:4},w);check(sound.diagnostics.oneShots===48,'upgrade takes lower priority slot');sound.clear();
  const enemies=[];
  for(const kind of ENEMY_KINDS){sound.clear();const fixture=new World(5,{schedule:false}),enemy=fixture.spawn(kind,v(4,3,0));enemy.age=20;enemy.status='idle';for(const event of fixture.effects)sound.play(event,fixture);sound.update(fixture);check(sound.diagnostics.loops.length===5,kind+' chatter and four ambient loops');sound.play({kind:'hit',enemy:kind,pos:enemy.pos},fixture);sound.play({kind:'kill',enemy:kind,pos:enemy.pos},fixture);enemies.push({kind,loops:sound.diagnostics.loops,cues:[...sound.shots].map(v=>v.name)});}
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
  b.status='burrowing';sound.update(combat);check(!sound.loops.has(b.id),'burrowing stops surface chatter');
  b.status='idle';sound.update(combat);check(sound.loops.has(b.id),'emergence restores chatter');
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
  const gemVoice=[...sound.shots].find(v=>v.name==='damagesquid2');
  check(!!gemVoice&&!!gemVoice.panner,'gem hit uses positional squid damage recording');
  check(Math.abs(gemVoice.panner.positionX.value-gemHit.pos.x)<1e-5&&Math.abs(gemVoice.panner.positionZ.value-gemHit.pos.z)<1e-5,'gem impact audio comes from the hit position');
  check(Math.abs(gemVoice.gain.gain.value-sound.volumeFor('damagesquid2')*.9)<1e-6,'damage feedback uses the balanced gain');
  sound.clear();sound.listener(v(),.8,.6);const listener=sound.context.listener;const dot=listener.forwardX.value*listener.upX.value+listener.forwardY.value*listener.upY.value+listener.forwardZ.value*listener.upZ.value;check(Math.abs(dot)<1e-6,'orthogonal pitched listener');
  // Verify fresh weapon sounds cannot be queued into a later run while loading.
  const cached=sound.buffers.get('shot1');sound.buffers.delete('shot1');const pending=sound.load('shot1');sound.play({kind:'burst',level:1,pos:v()},w);sound.clear();await pending;check(sound.diagnostics.oneShots===0,'no stale cue after load/restart');sound.buffers.set('shot1',cached);
  // Real audio output: render each original weapon through the same mixer gain.
  const rendered=[];
  for(const name of ['rapid1','rapid2','rapid3','rapid4','shot1','shot2','shot3alt1','shot4alt1']){
   const offline=new OfflineAudioContext(2,44100,44100),source=offline.createBufferSource(),gain=offline.createGain();source.buffer=sound.buffers.get(name);gain.gain.value=sound.volumeFor(name)*.55;source.connect(gain);gain.connect(offline.destination);source.start();if(name.startsWith('rapid'))source.stop(.7);
   const output=await offline.startRendering(),samples=output.getChannelData(0),rms=Math.sqrt(samples.slice(0,22050).reduce((s,x)=>s+x*x,0)/22050),tail=Math.max(...samples.slice(33075).map(Math.abs));
   check(rms>.01,name+' must be audible');if(name.startsWith('rapid'))check(tail===0,name+' stops after release');rendered.push({name,rms,tail});
  }
  const streamRms=rendered.filter(r=>r.name.startsWith('rapid')).map(r=>r.rms),burstRms=rendered.filter(r=>r.name.startsWith('shot')).map(r=>r.rms);
  check(Math.max(...streamRms)<.025,'stream leaves room for enemy chatter and impacts');
  check(Math.max(...burstRms)/Math.min(...burstRms)<1.2,'shotgun hands have consistent perceived attack levels');
  check(Math.max(...burstRms)<.045,'shotgun attack stays below the former overpowering mix');
  return {totalDecoded:SOUND_NAMES.length+unusedDecoded.length,used:SOUND_NAMES.length,enemies,enemyRegressions:{damageCues,armorImpact:true,perEnemyCooldown:true,killStopsChatter:true,burrowAndTransmute:true},levels:summary,rendered,final:sound.diagnostics};
 });
 assert.deepEqual(errors,[]);mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/audio-audit.json',JSON.stringify(result,null,2)+'\n');console.log('Audio browser passed: all 275 WAVs decoded, every hand stream/burst, release/upgrade/homing, pause/restart/death, saturated voice priority and rendered audibility.',result.used);
}finally{await browser.close();}
