import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOUND_NAMES,entranceSounds,handUpgradeSound} from '../src/audio.ts';
import {REMAKE_AUDIO,remakeAudioUrl} from '../src/remake-audio';
import {World,STEP,idleInput,v} from '../src/simulation.ts';
const ROOT=new URL('../public/assets/audio/remake/',import.meta.url);
test('every replacement cue has an intact licensed file and every runtime cue is covered',()=>{
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',ROOT),'utf8'));
 const available=new Set<string>();
 for(const [name,entry] of Object.entries(manifest) as [string,any][]){
  const data=readFileSync(new URL(entry.file,ROOT));available.add(name);
  assert.equal(data.length,entry.bytes,name);assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256,name);
  assert.deepEqual(REMAKE_AUDIO[name],Object.fromEntries(['file','gain','loop','duration','role'].map(k=>[k,entry[k]])));
  assert.equal(remakeAudioUrl(name),'/assets/audio/remake/'+entry.file);
  assert.ok(['CC0-1.0','CC-BY-4.0','Sonniss-GDC-2026-08-27'].includes(entry.license));assert.ok(entry.gain>0&&entry.gain<=1);assert.ok(entry.duration>0);
  if(!entry.file.endsWith('.wav')){assert.equal(data.toString('ascii',4,8),'ftyp');continue;}
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');
  let format=false,samples=false;
  for(let offset=12;offset+8<=data.length;){const name=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4);assert.ok(offset+8+size<=data.length,name+' truncated chunk');
   if(name==='fmt '){assert.equal(data.readUInt16LE(offset+8),1,name+' PCM');format=true;}
   if(name==='data'){assert.ok(size>0,name+' empty');samples=true;}
   offset+=8+size+(size%2);
  }
  assert.ok(format&&samples,name);
 }
 for(const name of SOUND_NAMES)assert.ok(available.has(name),'missing runtime recording '+name);
 for(const name of ['crew-countdown','crew-release-laugh','football-goal','uihover','uiclick','uislider','highscore1','menutheme','menuatmos'])assert.ok(available.has(name));
 assert.ok(Object.keys(manifest).length>=SOUND_NAMES.length);
 const sources=JSON.parse(readFileSync(new URL('../assets/provenance/remake/audio/sources.json',import.meta.url),'utf8'));
 const recipes=JSON.parse(readFileSync(new URL('../assets/provenance/remake/audio/recipes.json',import.meta.url),'utf8'));
 const files=new Set(sources.map((source:any)=>source.file));
 for(const name of Object.keys(manifest)){assert.ok(recipes[name]?.sources.length>0,name+' has source attribution');for(const file of recipes[name].sources)assert.ok(files.has(file));}
 for(const source of sources){assert.ok(['CC0-1.0','CC-BY-4.0','Sonniss-GDC-2026-08-27'].includes(source.license));const data=readFileSync(new URL('../'+source.file,import.meta.url));assert.equal(createHash('sha256').update(data).digest('hex'),source.sha256);}
});
test('audio stream state follows release, primary/homing priority and death at every hand',()=>{
 for(let level=1;level<=4;level++){
  const w=new World(7,{schedule:false});w.level=level;w.reserve=100;
  for(let i=0;i<30;i++)w.step({...idleInput(),fire:true});assert.equal(w.weaponAudio.primary,true);
  w.step(idleInput());assert.equal(w.weaponAudio.primary,false);
  if(level>=2){for(let i=0;i<30;i++)w.step({...idleInput(),fire:true});w.step({...idleInput(),fire:true,homing:true});assert.equal(w.weaponAudio.primary,false);assert.equal(w.weaponAudio.homing,true);}
  w.die('skull');assert.deepEqual(w.weaponAudio,{primary:false,homing:false});
 }
});
test('sound events preserve hand and jump kind at emission and include landing',()=>{
 const w=new World(3,{schedule:false});w.shoot(idleInput(),true,false);w.level=4;assert.equal(w.effects[0].level,1);
 w.effects=[];w.step({...idleInput(),jump:true});assert.equal(w.effects.find(e=>e.kind==='jump')?.amount,1);
 for(let i=0;i<150;i++)w.step(idleInput());assert.ok(w.effects.some(e=>e.kind==='land'));
});
test('walking over uneven arena tiles does not emit landing thuds',()=>{
 for(const yaw of [0,.4,.8,1.6]){
  const w=new World(1,{schedule:false,invulnerable:true});
  for(let i=0;i<300;i++){
   w.effects=[];w.step({...idleInput(),forward:1,yaw});
   assert.ok(!w.effects.some(e=>e.kind==='land'),`walking landing at yaw ${yaw}, tick ${i}`);
  }
 }
});
test('real falls retain soft and heavy landing cues',()=>{
 for(const [height,amount] of [[.5,1],[3,2]]){
  const w=new World(1,{schedule:false});w.startAt(0);w.player.pos.y+=height;w.player.grounded=false;
  for(let i=0;i<120;i++)w.step(idleInput());
  assert.deepEqual(w.effects.filter(e=>e.kind==='land').map(e=>e.amount),[amount]);
 }
});
test('buffered bunnyhops emit a distinct jump cue on every successful takeoff',()=>{
 const w=new World(1,{schedule:false});w.startAt(0);const floor=w.player.pos.y;
 w.step({...idleInput(),jump:true});w.effects=[];
 let hops=0,landings=0;
 for(let i=0;i<300&&hops<3;i++){
  // Tap just before contact, so the jump buffer carries the tap to takeoff.
  const jump=w.player.vel.y<-5&&w.player.pos.y<floor+.25;
  w.step({...idleInput(),jump});
  for(const e of w.effects){if(e.kind==='land')landings++;if(e.kind==='jump'){assert.equal(e.amount,3);hops++;}}
  w.effects=[];
 }
 assert.equal(hops,3);assert.equal(landings,3);
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',ROOT),'utf8'));
 assert.notEqual(manifest.jump3.sha256,manifest.jump1.sha256);
 assert.ok(manifest.jump3.gain>manifest.jump1.gain);
 for(const name of ['land','land2']){
  assert.ok(manifest[name].duration<.25);
  assert.ok(manifest[name].rms*manifest[name].gain<manifest.jump3.rms*manifest.jump3.gain*.6);
 }
});
test('egg hatch and projectile ricochet emit positional sound events',()=>{
 const w=new World(4,{schedule:false}),egg=w.spawn('egg2',v(10,2,0));egg.age=10-STEP;w.step(idleInput());assert.ok(w.effects.some(e=>e.kind==='hatch'&&e.enemy==='egg2'));
 w.projectiles.push({id:999,pos:v(0,.2,0),vel:v(0,-50,0),age:0,homing:false});w.step(idleInput());assert.ok(w.effects.some(e=>e.kind==='ricochet'));
});
test('crystal destruction signals detachment once per socket and on spider death',()=>{
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(2,{schedule:false}),e=w.spawn(kind,v(5,4,0));w.effects=[];
  w.damageEnemy(e,1,w.weakPoint(e),0,true);
  assert.ok(!w.effects.some(e=>e.crystalBreak),'nonlethal hit is not a detach');w.effects=[];
  w.damageEnemy(e,1000,w.weakPoint(e),0,true);
  const breaks=w.effects.filter(e=>e.crystalBreak);
  assert.equal(breaks.length,1);assert.equal(breaks[0].kind,'hit');assert.equal(breaks[0].enemyId,e.id);assert.equal(w.gems.length,1);
  w.damageEnemy(e,1000,e.pos,0,true);assert.equal(w.effects.filter(e=>e.crystalBreak).length,1);
  if(kind!=='squid')assert.ok(e.hp>0,'individual socket breaks before the whole tower dies');
 }
 for(const kind of ['spider','spider2','skull'] as const){
  const w=new World(2,{schedule:false}),e=w.spawn(kind,v(5,4,0));w.effects=[];w.damageEnemy(e,10000);
  assert.equal(w.effects.filter(e=>e.crystalBreak).length,kind==='skull'?0:1);
 }
});
test('damage and death effects identify the enemy that made the sound',()=>{
 const w=new World(4,{schedule:false}),a=w.spawn('skull2',v(10,3,0)),b=w.spawn('skull2',v(15,3,0));w.effects=[];
 w.damageEnemy(a,1);w.damageEnemy(b,1);w.damageEnemy(a,100);
 assert.deepEqual(w.effects.filter(e=>e.kind==='hit').map(e=>e.enemyId),[a.id,b.id,a.id]);
 assert.equal(w.effects.find(e=>e.kind==='kill')?.enemyId,a.id);
});
test('centipede emergence cues occur at the ground crossing on each cycle',()=>{
 const w=new World(4,{schedule:false,invulnerable:true}),e=w.spawn('centipede',v(20,3,0));
 const cues=[];let dives=0;
 for(let i=0;i<120*70;i++){
  w.effects=[];w.step(idleInput());
  for(const effect of w.effects){if(effect.kind==='emerge')cues.push(effect);if(effect.kind==='burrow')dives++;}
 }
 assert.ok(cues.length>=2);assert.ok(dives>=2);
 assert.ok(cues.every(c=>c.pos.y>=0&&c.pos.y<.3));assert.notDeepEqual(cues[0].pos,cues[1].pos);
});

test('entrance replacement cues follow the existing best-time tiers',()=>{
 const thresholds=[0,60,120,250,500,1000];const suffixes=['','1bronze','2silver','3gold','4devil','5'];
 thresholds.forEach((time,i)=>{assert.deepEqual(entranceSounds(time),{call:'daggercall'+suffixes[i],collect:'daggercollect'+suffixes[i]});if(i)assert.equal(entranceSounds(time-.01).collect,'daggercollect'+suffixes[i-1]);});
});
test('every hand upgrade has its own long animal/creature performance',()=>{
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',ROOT),'utf8'));
 const recipes=JSON.parse(readFileSync(new URL('../assets/provenance/remake/audio/recipes.json',import.meta.url),'utf8'));
 const primaries=new Set(),recordings=new Set();assert.equal(handUpgradeSound(1),'leveldown');
 for(let hand=2;hand<=7;hand++){
  const name=handUpgradeSound(hand),asset=manifest[name],recipe=recipes[name];
  assert.equal(name,`levelup${hand}`);assert.ok(SOUND_NAMES.includes(name));assert.equal(asset.role,'upgrade');
  assert.ok(asset.duration>=2.7&&asset.duration<=5.2,`${name} full transformation gesture`);
  assert.ok(recipe.sources.includes(recipe.primarySource));primaries.add(recipe.primarySource);recordings.add(asset.sha256);
 }
 assert.equal(primaries.size,6,'each hand has a different lead vocal recording');assert.equal(recordings.size,6);
 assert.ok(manifest.levelup7.duration>=5,'final hand has the longest transformation');
});
test('pickup recordings use the new absorption source at restrained gain',()=>{
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',ROOT),'utf8'));
 const recipes=JSON.parse(readFileSync(new URL('../assets/provenance/remake/audio/recipes.json',import.meta.url),'utf8'));
 const sources=JSON.parse(readFileSync(new URL('../assets/provenance/remake/audio/pro/selected-sources.json',import.meta.url),'utf8'));
 const absorption=sources.find((s:any)=>s.name==='MAGElem_Water Spell Splash Attack Medium 2_RogueWaves_DruidMagic.wav').file;
 const retired=sources.filter((s:any)=>s.name==='Harp_Glissando_10b.wav').map((s:any)=>s.file);
 const bell=sources.find((s:any)=>s.name==='Enchanting_Bells_4.wav').file;
 for(const name of ['gibcollect','gibcollect2','gibcollect3','gibcollectmagic','gibcollectmagic2','gibcollectmagic3']){
  assert.ok(recipes[name].sources.includes(absorption));assert.ok(recipes[name].sources.includes(bell));assert.ok(recipes[name].sources.every((file:string)=>!retired.includes(file)));
  assert.ok(manifest[name].gain<=.125);assert.ok(manifest[name].rms*manifest[name].gain*.55<.0085);
 }
});

test('hand weapon recipes exclude firearm sources and preserve separate authored tiers',async()=>{
 const {WEAPON_SOUNDS,weaponBank}=await import('../src/weapon-audio.ts');
 const recipes=JSON.parse(readFileSync(new URL('../assets/provenance/remake/audio/recipes.json',import.meta.url),'utf8'));
 const sources=JSON.parse(readFileSync(new URL('../assets/provenance/remake/audio/sources.json',import.meta.url),'utf8'));
 const byFile=new Map(sources.map((s:any)=>[s.file,s.name]));
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',ROOT),'utf8'));
 const hashes=new Set<string>();
 for(const name of WEAPON_SOUNDS){
  assert.ok(recipes[name].sources.length>0,name+' retains organic source attribution');
  for(const path of recipes[name].sources)assert.doesNotMatch(String(byFile.get(path)),/GUN|Heavyweapon|SCIWeap|EXPLDsgn|LASRMisc/i,name+' must not use firearm or predesigned weapon samples');
  assert.ok(!hashes.has(manifest[name].sha256),name+' must have its own authored waveform');hashes.add(manifest[name].sha256);
 }
 for(let level=1;level<=7;level++){
  for(const name of weaponBank(level))assert.ok(manifest[name],name);
  const vocals=recipes['rapid'+level].sources.filter((p:string)=>/lion|bear_pain|Banshee|MonsterPack|Monster Within|Gibbons/.test(String(byFile.get(p))));
  assert.ok(vocals.length>=3,'hand '+level+' has foreground roar, chest and scream sources');
  assert.ok(manifest['rapid'+level].duration>=24,'continuous stream has a long evolving field');
  assert.ok(manifest['shot'+level].duration>=1,'pressure and air decay survive the attack');
 }
});
