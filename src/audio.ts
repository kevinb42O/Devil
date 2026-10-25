import {EnvironmentAudio} from './environment-audio';
import {roleMixGain,environmentMixGain,ORIGINAL_EFFECTS_HEADROOM} from './audio-mix';
import {ArenaReverb} from './arena-reverb';
import {FOOTSTEP_SOUNDS,WET_FOOTSTEP_SOUNDS,ALL_FOOTSTEP_SOUNDS,footstepSurface,bloodFootWetness,FootstepGait} from './footstep-audio';
import {distanceEnvelope,hearingProfile} from './spatial-audio';
import {WEAPON_SOUNDS,weaponBank,weaponShots,weaponTier} from './weapon-audio';
import {ENEMY_CHATTER,ENEMY_SPAWN,ENEMY_EMERGE,selectEnemyAudio} from './enemy-audio';
import {remakeAudioAsset,remakeAudioUrl} from './remake-audio';
import {ENEMY_KILL,ENEMY_HIT,jumpCue,pickupCue,ricochetCues,enemyDamageCue,towerGushCue,pierceCues,deathSplashCue,DAGGER_REWARDS} from './original-audio-cues';
import {TUNING,type Effect,type Vec,type World} from './simulation';
import {isSquid,isSpider,type EnemyKind} from './enemy-kinds';
const variants=(name:string,count:number)=>Array.from({length:count},(_,i)=>`${name}${i+1}`);
const GEM_SOUNDS=['gibcollect','gibcollectmagic','gibdrone1','gibdrone2','gibdrone3'];
export const handUpgradeSound=(level:number)=>level<=1?'leveldown':`levelup${Math.min(7,level)}`;
export function entranceSounds(best:number){const suffix=best>=1000?'5':best>=500?'4devil':best>=250?'3gold':best>=120?'2silver':best>=60?'1bronze':'';return {call:'daggercall'+suffix,collect:'daggercollect'};}
const ENTRANCE_SOUNDS=[0,60,120,250,500,1000].flatMap(best=>Object.values(entranceSounds(best)));
const CHATTER=ENEMY_CHATTER;
const SPAWN=ENEMY_SPAWN;
const KILL=ENEMY_KILL;
const HIT=ENEMY_HIT;
const CORE=['stealgib','stealgib2','highscore1','skullclop1','spawnplayer','rapid1','rapid2','rapid3','rapid4','shot1','shot2',...variants('shot3alt',4),...variants('shot4alt',5),'gibcollect','gibcollectmagic','jump1','jump2','jump3','land','land2','death','fall',...Array.from({length:7},(_,i)=>handUpgradeSound(i+1)),'daggerdrone','daggerseek','magentadrone','magentashot','daggerhit1'];
export const SOUND_NAMES=[...new Set([...CORE,...ALL_FOOTSTEP_SOUNDS,...WEAPON_SOUNDS,...GEM_SOUNDS,...ENTRANCE_SOUNDS,...DAGGER_REWARDS.map(reward=>reward.name),...Object.values(CHATTER),...Object.values(SPAWN),...Object.values(ENEMY_EMERGE),...Object.values(KILL).flat(),...Object.values(HIT),'polarity1e','polarity2w','polarity3n','polarity4s','leviathanbeckon','leviathanbeckon2','leviathantransmute',...variants('magentadetonate',5),...variants('ricochet',5),...variants('ricochetmagic',4),...variants('ricochetmagenta',5),...variants('magicpierce',5),...variants('magentastuckenemy',5),...variants('gigaricochet',5),...variants('ricochetmed',5),...variants('skullclop',6),'damagesquid2','damagesquid3','damageleviathan','splashgiga',...variants('splashgiga',6).slice(1),'spawnskulls','spawnskulls2','spawnskulls3',...variants('spidereat',6),'spawnegg','eggbounce','ultrapedeeat','burrowcentipede','subchattercentipede','unburrowcentipede'])] as string[];
type Voice={reverbSends?:GainNode[];upgradeOwner?:string;targetGain?:number;rate:number;source:AudioBufferSourceNode;panner?:PannerNode;spatialGain?:GainNode;position?:Vec;gain:GainNode;name:string;priority:number;ended:boolean};
/** Original game recordings and preserved footsteps, with bounded positional voices. */
export class Sound{
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private originalBus:GainNode|null=null;
 private reverb:ArenaReverb|null=null;
 private environmentAudio:EnvironmentAudio|null=null;
 private environmentGain:GainNode|null=null;
 updateEnvironment(time:number|null,dt:number){this.environmentAudio?.update(this.volume>0?time:null,dt);}
 private buffers=new Map<string,AudioBuffer>();
 private pending=new Map<string,Promise<AudioBuffer|undefined>>();
 private recordings=new Map<string,AudioBuffer>();
 private recordingPending=new Map<string,Promise<AudioBuffer>>();
 private recording(url:string):Promise<AudioBuffer>{
  const cached=this.recordings.get(url);if(cached)return Promise.resolve(cached);
  const pending=this.recordingPending.get(url);if(pending)return pending;
  const request=(async()=>{try{
   const response=await fetch(url);if(!response.ok)throw Error(String(response.status));
   const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());this.recordings.set(url,buffer);return buffer;
  }finally{this.recordingPending.delete(url);}})();
  this.recordingPending.set(url,request);return request;
 }
 private loops=new Map<number|string,Voice>();
 private shots=new Set<Voice>();
 private listenerPosition:Vec={x:0,y:0,z:0};
 private volume=.55;private playbackRate=1;
 setPlaybackRate(rate:number){const next=Math.max(.25,Math.min(2,rate));if(next===this.playbackRate)return;this.playbackRate=next;for(const v of [...this.loops.values(),...this.shots])v.source.playbackRate.value=this.playbackRate*v.rate;}
 private loading:Promise<void>|null=null;
 private choices=new Map<string,number>();
 private pickupBags=new Map<string,{bag:number[];previous:number}>();
 private recent:string[]=[];
 private failures=new Set<string>();
 private retries=new Map<string,{attempts:number;nextAt:number}>();
 private generation=0;
 private upgradeRevisions=new Map<string,number>();
 private countdownBeat=0;
 private countdownRevision=0;
 private preparedHands=new Set<number>();
 private personalBestWorlds=new WeakSet<World>();
 private rewardWorlds=new WeakMap<World,Set<number>>();
 private footstepGait=new FootstepGait();
 private footstepWorld:World|null=null;
 get diagnostics(){return {source:'devil-daggers-original',mixPolicy:'recorded-level',originalHeadroom:ORIGINAL_EFFECTS_HEADROOM,environment:this.environmentAudio?.diagnostics??null,recent:[...this.recent],loaded:this.buffers.size,failed:[...this.failures],oneShots:this.shots.size,oneShotNames:[...this.shots].map(v=>v.name),loops:[...this.loops.values()].map(v=>v.name)};}
 async start(){
  if(this.context){await this.context.resume();return this.loading;}
  this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.volume;
  const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=0;limiter.release.value=.15;
  this.originalBus=this.context.createGain();this.originalBus.gain.value=ORIGINAL_EFFECTS_HEADROOM;this.originalBus.connect(this.master);
  this.reverb=new ArenaReverb(this.context,this.master);
  this.environmentGain=this.context.createGain();this.environmentGain.gain.value=environmentMixGain(false);this.environmentGain.connect(this.master);
  this.environmentAudio=new EnvironmentAudio(this.context,this.environmentGain);
  this.master.connect(limiter);limiter.connect(this.context.destination);await this.context.resume();
  this.loading=(async()=>{
   // Warm only the opening weapon/movement cues. Enemy and later-hand sounds
   // load on demand; decoding the entire library on Start competes with gameplay.
   const opening=['jump1','jump2','jump3','land','land2',...FOOTSTEP_SOUNDS,'rapid1',...weaponShots(1),...GEM_SOUNDS,'jump1','jump2','jump3','land','land2','death','fall','spawnminisquid','highscore1'];
   let index=0;await Promise.all(Array.from({length:2},async()=>{while(index<opening.length)await this.load(opening[index++]);}));
  })();void this.loading.then(()=>this.warmEmergences());return this.loading;
 }
 private async warmEmergences(){
  const names=[...WET_FOOTSTEP_SOUNDS,'killminisquid','killsquid','killultrasquid',...Object.values(SPAWN),...Object.values(ENEMY_EMERGE)] as string[];let index=0;
  await Promise.all(Array.from({length:2},async()=>{while(index<names.length)await this.load(names[index++]);}));
 }
 private load(name:string):Promise<AudioBuffer|undefined>{
  if(this.buffers.has(name))return Promise.resolve(this.buffers.get(name));
  if(this.pending.has(name))return this.pending.get(name)!;
  const retry=this.retries.get(name);
  if(retry&&performance.now()<retry.nextAt)return Promise.resolve(undefined);
  const promise=(async()=>{try{const buffer=await this.recording(remakeAudioUrl(name));this.buffers.set(name,buffer);this.failures.delete(name);this.retries.delete(name);return buffer;}catch{
   this.failures.add(name);const attempts=(retry?.attempts??0)+1;
   this.retries.set(name,{attempts,nextAt:performance.now()+Math.min(30000,1000*2**Math.min(attempts-1,5))});return undefined;
  }finally{this.pending.delete(name);}})();
  this.pending.set(name,promise);return promise;
 }
 setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));if(this.master&&this.context)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.03);}
 listener(pos:Vec,yaw:number,pitch:number){
  this.listenerPosition={...pos};
  const c=this.context;if(!c)return;const l=c.listener,t=c.currentTime;
  for(const voice of [...this.loops.values(),...this.shots])this.updateSpatial(voice);
  l.positionX.setValueAtTime(pos.x,t);l.positionY.setValueAtTime(pos.y,t);l.positionZ.setValueAtTime(pos.z,t);
  l.forwardX.setValueAtTime(-Math.sin(yaw)*Math.cos(pitch),t);l.forwardY.setValueAtTime(Math.sin(pitch),t);l.forwardZ.setValueAtTime(-Math.cos(yaw)*Math.cos(pitch),t);
  l.upX.setValueAtTime(Math.sin(yaw)*Math.sin(pitch),t);l.upY.setValueAtTime(Math.cos(pitch),t);l.upZ.setValueAtTime(Math.cos(yaw)*Math.sin(pitch),t);
 }
 private panner(pos:Vec,name=''){const profile=hearingProfile(name,name?remakeAudioAsset(name).role:undefined),p=this.context!.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=profile.refDistance;p.maxDistance=profile.maxDistance;p.rolloffFactor=name&&remakeAudioAsset(name).role==='footstep'?1.2:1;p.positionX.value=pos.x;p.positionY.value=pos.y;p.positionZ.value=pos.z;return p;}
 private distance(pos:Vec){return Math.hypot(pos.x-this.listenerPosition.x,pos.y-this.listenerPosition.y,pos.z-this.listenerPosition.z);}
 private audible(name:string,pos?:Vec){return !pos||(remakeAudioAsset(name).role==='footstep'?distanceEnvelope(this.distance(pos),20)>0:this.distance(pos)<10000);}
 private updateSpatial(voice:Voice){
  if(!voice.position||!voice.spatialGain||!this.context)return;
  const value=remakeAudioAsset(voice.name).role==='footstep'?distanceEnvelope(this.distance(voice.position),20):1;
  // Exact zero outside the range, including already-playing one-shots when
  // the listener flies away. The smooth spatial envelope prevents edge pops.
  voice.spatialGain.gain.setValueAtTime(value,this.context.currentTime);
 }
 deathContact(kind:EnemyKind,pos:Vec){const name=deathSplashCue(kind);if(name)this.oneShot(name,pos,{priority:2});}
 private async unlock(){void this.start().catch(()=>{});await this.context!.resume();}
 async prepareCourtyard(){const generation=this.generation;await this.unlock();if(generation===this.generation)await this.load('football-goal');}
 courtyard(kind:string,pos:Vec){if(kind==='goal'){this.oneShot('football-goal',pos,{priority:4});return;}const name=kind==='kick'||kind==='bounce'?'skullclop1':kind==='highfive'?'land':kind==='open'?'spawnplayer':kind==='arrival'?'spawnplayer':kind==='cancel'?'land2':'';if(name)this.oneShot(name,pos,{priority:1});}
 async prepareEntrance(best:number){
  const generation=this.generation;await this.unlock();if(generation!==this.generation)return;
  const names=entranceSounds(best);await Promise.all([this.load(names.call),this.load(names.collect)]);
 }
 entrance(best:number,pos:Vec){this.loop(-2000,entranceSounds(best).call,pos);}
 async collectDagger(best:number){
  const generation=this.generation;await this.unlock();const name=entranceSounds(best).collect;await this.load(name);
  if(generation===this.generation)this.oneShot(name,undefined,{priority:4});
 }
 async prepareCrewArrival(){
  const generation=this.generation;await this.unlock();if(generation!==this.generation)return;
  await Promise.all(['spawnplayer','crew-countdown'].map(name=>this.load(name)));
 }
 crewArrival(beat:number,remainingMs=beat*1000){
  if(beat>0){if(this.countdownBeat!==beat){this.countdownBeat=beat;void this.playCrewCountdown(remainingMs);}return;}
  this.countdownBeat=0;this.countdownRevision++;this.stopCrewCountdown();
  this.oneShot('spawnplayer',undefined,{priority:4});
 }
 private async playCrewCountdown(remainingMs:number){
  // The original has no spoken countdown. Give each authoritative beat a UI tick.
  const generation=this.generation,revision=this.countdownRevision,requestedAt=performance.now();
  await this.unlock();await this.load('crew-countdown');
  if(generation===this.generation&&revision===this.countdownRevision&&!document.hidden&&performance.now()-requestedAt<Math.min(remainingMs,500))this.oneShot('crew-countdown',undefined,{priority:4});
 }
 private stopCrewCountdown(){
  for(const voice of [...this.shots])if(voice.name==='crew-countdown'){voice.source.stop();this.disconnect(voice);}
 }
 private volumeFor(name:string){const asset=remakeAudioAsset(name);return asset.role==='footstep'?asset.gain*roleMixGain('footstep'):asset.gain;}
 private output(name:string){return remakeAudioAsset(name).role==='footstep'?this.master!:this.originalBus!;}
 private remember(name:string){this.recent.push(name);if(this.recent.length>32)this.recent.shift();}
 private choose(names:string|string[]){if(typeof names==='string')return names;const previous=this.choices.get(names[0])??-1;let index=Math.floor(Math.random()*names.length);if(index===previous)index=(index+1)%names.length;this.choices.set(names[0],index);return names[index];}
 private pickupChoice(key:string,count:number){
  let state=this.pickupBags.get(key);if(!state){state={bag:[],previous:-1};this.pickupBags.set(key,state);}
  if(!state.bag.length){
   state.bag=Array.from({length:count},(_,i)=>i);
   for(let i=count-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[state.bag[i],state.bag[j]]=[state.bag[j],state.bag[i]];}
   if(state.bag[count-1]===state.previous)[state.bag[0],state.bag[count-1]]=[state.bag[count-1],state.bag[0]];
  }
  return state.previous=state.bag.pop()!;
 }
 private disconnect(voice:Voice){if(voice.ended)return;voice.ended=true;voice.source.disconnect();voice.gain.disconnect();voice.panner?.disconnect();voice.spatialGain?.disconnect();for(const send of voice.reverbSends??[])send.disconnect();this.shots.delete(voice);}
 private upgrade(level:number,pos?:Vec,owner='local'){
  const c=this.context;if(!c||c.state!=='running')return;
  const name=handUpgradeSound(level),revision=(this.upgradeRevisions.get(owner)??0)+1,generation=this.generation,expiresAt=performance.now()+2000;
  this.upgradeRevisions.set(owner,revision);
  const play=()=>{
   if(revision!==this.upgradeRevisions.get(owner)||generation!==this.generation||performance.now()>expiresAt)return;
   // A newer transformation takes over with a brief fade rather than stacking roars.
   for(const v of this.shots)if(v.upgradeOwner===owner){
    v.gain.gain.cancelScheduledValues(c.currentTime);v.gain.gain.setValueAtTime(v.gain.gain.value,c.currentTime);v.gain.gain.linearRampToValueAtTime(0,c.currentTime+.045);v.source.stop(c.currentTime+.05);
   }
   const voice=this.oneShot(name,pos,{priority:4});if(voice)voice.upgradeOwner=owner;
  };
  if(this.buffers.has(name))play();else void this.load(name).then(buffer=>{if(buffer)play();});
 }
 private oneShot(name:string,pos?:Vec,options:{priority?:number;rate?:number;footstepScale?:number}={}):Voice|undefined{
  const {priority=1,rate=1,footstepScale=1}=options;
  const c=this.context;if(!c||!this.master||c.state!=='running'||!this.audible(name,pos))return;
  const buffer=this.buffers.get(name);if(!buffer){
   const generation=this.generation,expiresAt=performance.now()+(priority>=4?2000:remakeAudioAsset(name).role==='enemy-spawn'?1000:100),position=pos?{...pos}:undefined;
   void this.load(name).then(loaded=>{if(loaded&&generation===this.generation&&performance.now()<expiresAt)this.oneShot(name,position,options);});
   return; // Only a fresh cue may survive loading; never carry it into a new run.
  }
  if(this.shots.size>=48){const candidate=[...this.shots].find(v=>v.priority<priority);if(!candidate)return;candidate.source.stop();this.disconnect(candidate);}
  const role=remakeAudioAsset(name).role;
  const source=c.createBufferSource();source.buffer=buffer;const gain=c.createGain();gain.gain.value=this.volumeFor(name)*(role==='footstep'?footstepScale:1);source.connect(gain);
  const panner=pos?this.panner(pos,name):undefined,spatialGain=panner?c.createGain():undefined;if(panner&&spatialGain){gain.connect(panner);panner.connect(spatialGain);spatialGain.connect(this.output(name));}else gain.connect(this.output(name));
  const voice:Voice={source,gain,panner,spatialGain,position:pos?{...pos}:undefined,name,priority,rate,ended:false};voice.reverbSends=remakeAudioAsset(name).role==='footstep'?this.reverb?.connect(spatialGain??gain,'footstep'):undefined;this.updateSpatial(voice);this.shots.add(voice);source.onended=()=>this.disconnect(voice);source.playbackRate.value=this.playbackRate*rate;source.start();this.remember(name);
  return voice;
 }
 play(e:Effect,world:World){
  const weaponLevel=weaponTier(e.level??world.level);
  const remotePlayer=!!e.shooterId&&!world.crew.some(p=>p.id===e.shooterId&&p.player===world.player);
  if(e.kind==='shot'||e.kind==='burst'){
   const pos=remotePlayer?e.pos:undefined;
   if(e.amount===1){if(e.kind==='burst')this.oneShot(`weapon${weaponLevel}-homing`,pos,{priority:3});return;}
   if(e.kind==='burst')this.oneShot(this.choose(weaponShots(weaponLevel)),pos,{priority:3});
   return; // Primary streams are loops owned by each player's weapon state.
  }
  if(e.kind==='spawn'){if(e.enemy){if(isSpider(e.enemy))void this.load(e.enemy==='spider2'?'stealgib2':'stealgib');const splash=deathSplashCue(e.enemy);if(splash)void this.load(splash);void this.load(CHATTER[e.enemy]);if(isSquid(e.enemy))void this.load(KILL[e.enemy] as string);}if(e.amount===-1)return;if(e.enemy&&SPAWN[e.enemy])this.oneShot(SPAWN[e.enemy]!,e.pos,{priority:2});return;}
  // Original death recordings keep their native pitch and priority over swarm kills.
  if(e.kind==='kill'){
   if(e.enemyId!==undefined){this.stop(e.enemyId);}
   const tower=!!e.enemy&&isSquid(e.enemy),name=this.choose(e.enemy?KILL[e.enemy]??'killskull1':'killskull1');
   this.oneShot(name,e.pos,{priority:tower?3:2,rate:1});return;
  }
  // Armor contacts do not damage the enemy. Keep their impact cue separate
  // from actual damage, and rate-limit damage per enemy rather than per tier.
  if(e.kind==='impact'||e.kind==='hit'){
   // Homing contact and creature damage are separate physical cues. Each
   // projectile carries its own firing level, including remote confirmations.
   if(e.homing)this.oneShot(this.choose(pierceCues(e.level??world.level)),e.pos,{priority:2});
   if(e.kind==='impact'){if(!e.homing)this.oneShot('daggerhit1',e.pos,{priority:0});return;}
   this.oneShot(enemyDamageCue(e),e.pos,{priority:e.crystalBreak?4:2});return;
  }
  if(e.kind==='ricochet'){this.oneShot(this.choose(ricochetCues(e)),e.pos,{priority:0});return;}
  if(e.kind==='pierce'){this.oneShot(this.choose(pierceCues(e.level??world.level)),e.pos,{priority:2});return;}
  if(e.kind==='gush'){if(e.enemy)this.oneShot(towerGushCue(e.enemy),e.pos,{priority:2});return;}
  if(e.kind==='clop'){this.oneShot(this.choose(variants('skullclop',6)),e.pos,{priority:0});return;}
  if(e.kind==='eat'){this.oneShot(e.enemy==='ghostpede'?'ultrapedeeat':this.choose(variants('spidereat',6)),e.pos,{priority:1});return;}
  if(e.kind==='death'){
   const victim=world.crew.find(p=>p.id===e.shooterId),local=!world.crew.length||victim?.player===world.player;
   if(local||world.state==='dead'||(world.crew.length&&!world.crew.some(p=>p.alive)))this.clear();
   this.oneShot((e.deathCause??victim?.cause??world.cause)==='FALLEN'?'fall':'death',local?undefined:e.pos,{priority:4});return;
  }
  if(e.kind==='jump'||e.kind==='land'){
   const name=e.kind==='jump'?jumpCue(e):e.amount===2?'land2':'land';
   if(!name)return;
   // Local takeoff is timing feedback: it must survive a pool full of kills.
   this.oneShot(name,remotePlayer?e.pos:undefined,{priority:remotePlayer?1:e.kind==='jump'?3:2});return;
  }
  if(e.kind==='pickup'){
   const name=pickupCue(weaponLevel);
   this.oneShot(name,e.pos,{priority:remotePlayer?1:3,rate:1});return;
  }
  if(e.kind==='upgrade'){this.upgrade(e.amount??weaponLevel,remotePlayer?{...e.pos}:undefined,remotePlayer?e.shooterId!:'local');return;}
  if(e.kind==='transmute')this.oneShot('leviathanbeckon2',e.pos,{priority:2});
  const name=e.kind==='egg'?'spawnegg':e.kind==='beckon'?'leviathanbeckon':e.kind==='transmute'?'leviathantransmute':e.kind==='explosion'?this.choose(variants('magentadetonate',5)):e.kind==='bounce'?'eggbounce':e.kind==='hatch'?'eggburst':e.kind==='burrow'?(!e.enemy||e.enemy==='centipede'?'burrowcentipede':undefined):e.kind==='emerge'?(e.enemy?ENEMY_EMERGE[e.enemy]:'unburrowcentipede'):undefined;
  if(name)this.oneShot(name,remotePlayer||['egg','beckon','transmute','explosion','bounce','hatch','burrow','emerge'].includes(e.kind)?e.pos:undefined,{priority:1});
 }
 private loop(id:number|string,name:string,pos?:Vec,rate=1){
  const c=this.context;if(!c||!this.master||c.state!=='running')return;if(!this.audible(name,pos)){this.stop(id);return;}let voice=this.loops.get(id);
  if(voice&&voice.name!==name){this.stop(id);voice=undefined;}
  if(!voice){const buffer=this.buffers.get(name);if(!buffer){void this.load(name);return;}const source=c.createBufferSource();source.buffer=buffer;source.loop=true;const gain=c.createGain(),panner=pos?this.panner(pos,name):undefined,spatialGain=panner?c.createGain():undefined;
   const target=this.volumeFor(name);gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(target,c.currentTime+.012);source.connect(gain);if(panner&&spatialGain){gain.connect(panner);panner.connect(spatialGain);spatialGain.connect(this.output(name));}else gain.connect(this.output(name));
   voice={source,gain,panner,spatialGain,position:pos?{...pos}:undefined,name,priority:0,rate,ended:false,targetGain:target};voice.reverbSends=remakeAudioAsset(name).role==='footstep'?this.reverb?.connect(spatialGain??gain,'footstep'):undefined;this.updateSpatial(voice);const current=voice;source.onended=()=>this.disconnect(current);this.loops.set(id,voice);source.playbackRate.value=this.playbackRate;source.start(0,0);
  }
  const target=this.volumeFor(name);
  if(voice.targetGain===undefined||Math.abs(voice.targetGain-target)>.001){voice.gain.gain.setTargetAtTime(target,c.currentTime,.06);voice.targetGain=target;}
  voice.rate=rate;voice.source.playbackRate.value=this.playbackRate*rate;
  if(pos&&voice.panner){voice.position={...pos};this.updateSpatial(voice);voice.panner.positionX.value=pos.x;voice.panner.positionY.value=pos.y;voice.panner.positionZ.value=pos.z;}
 }
 /** Also called on the quiet entrance/courtyard, which bypasses combat loops. */
 updateFootsteps(world:World){
  const now=performance.now()/1000;
  // Crew replay creates a fresh presentation wrapper each frame but retains
  // the underlying roster. Preserve the odometer across those wrappers.
  if(this.footstepWorld!==world&&(!world.crew.length||this.footstepWorld?.crew!==world.crew))this.footstepGait.clear();
  this.footstepWorld=world;
  if(world.state!=='playing'||!this.context||this.context.state!=='running'||document.hidden){this.footstepGait.clear();return;}
  // Warm the small wet bank before rain arrives or when feet pick up blood. Failed requests retain the normal retry/backoff policy.
  if(!world.courtyard&&((world.time>=43&&world.time<229)||bloodFootWetness(world.player)>0||world.crew.some(p=>bloodFootWetness(p.player,p.id)>0))){
   for(const name of WET_FOOTSTEP_SOUNDS)if(!this.buffers.has(name))void this.load(name);
  }
  const actors=world.crew.length?world.crew.filter(p=>p.alive).map(p=>({id:p.id,player:p.player})): [{id:'local',player:world.player}];
  this.footstepGait.retain(new Set(actors.map(p=>p.id)));
  for(const {id,player} of actors){
   const step=this.footstepGait.update(id,player,now,this.playbackRate);if(!step)continue;
   // The camera is the authority for first-person vs spectated positioning.
   // A dead player's body may still be world.player while the camera flies.
   const local=player===world.player&&this.distance(player.pos)<.5;
   const pos=local?undefined:{x:player.pos.x,y:player.pos.y-TUNING.eyeHeight+.08,z:player.pos.z};
   const index=this.pickupChoice('footstep:'+id,FOOTSTEP_SOUNDS.length);
   const dry=FOOTSTEP_SOUNDS[index],wet=WET_FOOTSTEP_SOUNDS[index];
   const weight=.48+Math.min(1,step.speed/11)*.42;
   // The recorded variations supply texture without pitch warble or an
   // alternating loud/soft accent. Footsteps stay beneath combat information.
   const scale=weight*(local?1:.8/Math.sqrt(Math.max(1,actors.length-1)));
   // Choose the material only at contact. Never replay a late-loaded wet
   // voice after its dry fallback, or change gait phase at a weather boundary.
   const surface=footstepSurface(world.time,!!world.courtyard,bloodFootWetness(player,id));
   const wetMix=this.buffers.has(wet)?surface.wet:0;
   if(wetMix<1)this.oneShot(dry,pos,{priority:local?1:0,rate:1,footstepScale:scale*(1-wetMix)});
   if(wetMix>0)this.oneShot(wet,pos,{priority:local?1:0,rate:1,footstepScale:scale*wetMix});
  }
 }
 update(world:World,{weapons=true,personalBest}:{weapons?:boolean;personalBest?:number}={}){
  const weaponAudio=weapons?world.weaponAudio:{primary:false,homing:false};
  this.updateFootsteps(world);
  if(world.state!=='playing'){this.setEnvironmentCombat(false);for(const id of this.loops.keys())this.stop(id);return;}
  if(personalBest!==undefined&&personalBest>0&&world.time>personalBest&&!this.personalBestWorlds.has(world)){this.personalBestWorlds.add(world);this.oneShot('highscore1',undefined,{priority:4});}
  if(personalBest!==undefined){
   let earned=this.rewardWorlds.get(world);if(!earned){earned=new Set();this.rewardWorlds.set(world,earned);}
   for(const reward of DAGGER_REWARDS){
    if(personalBest>=reward.time||earned.has(reward.time))continue;
    if(world.time>=reward.time){earned.add(reward.time);this.oneShot(reward.name,undefined,{priority:4});}
    else if(reward.time-world.time<8&&!this.buffers.has(reward.name))void this.load(reward.name);
   }
  }
  // Decode the next hand before its gem threshold, so its first attack and
  // upgrade cue are ready without loading the entire sound library at startup.
  for(const hand of new Set([weaponTier(world.level),weaponTier(world.level+1),...world.crew.map(p=>weaponTier(p.level))])){
   const level=Math.min(4,hand);
   if(this.preparedHands.has(hand)||!this.context)continue;this.preparedHands.add(hand);
   const names=[...weaponBank(hand),handUpgradeSound(hand),...(level>=2?['gibcollectmagic',level===4?'magentashot':'daggerseek',level===4?'magentadrone':'daggerdrone']:[])].flat();
   void Promise.all(names.map(name=>this.load(name)));
  }
  const ids=new Set<number|string>();
  // Bound concurrent crystal voices by proximity; selected recordings keep their level.
  const nearbyGems:{gem:World['gems'][number];distance:number;score:number}[]=[];
  for(const gem of world.gems){
   if(gem.age>=TUNING.gemLifetime)continue;
   const distance=Math.hypot(gem.pos.x-this.listenerPosition.x,gem.pos.y-this.listenerPosition.y,gem.pos.z-this.listenerPosition.z);
   if(distance>=18)continue;
   const score=distance*(this.loops.has(`gem:${gem.id}`)?.85:1);
   let slot=0;while(slot<nearbyGems.length&&nearbyGems[slot].score<=score)slot++;
   if(slot<6){nearbyGems.splice(slot,0,{gem,distance,score});if(nearbyGems.length>6)nearbyGems.pop();}
  }
  const pullingSpiders=world.enemies.filter(e=>isSpider(e.kind)&&e.hp>0&&world.active(e)&&e.age>=(e.kind==='spider2'?9:3)&&e.headExposure>.5);
  for(const {gem,distance} of nearbyGems){
   const id=`gem:${gem.id}`;ids.add(id);
   this.loop(id,`gibdrone${gem.id%3+1}`,gem.pos);
   // These are the same exposed, mature spiders whose mouths apply gem pull
   // in the simulation. One nearest pull voice per crystal avoids multiplying
   // the sound when several spiders compete for the same gem.
   let pulling:typeof pullingSpiders[number]|undefined,nearest=Infinity;
   for(const spider of pullingSpiders){const range=(spider.pos.x-gem.pos.x)**2+(spider.pos.z-gem.pos.z)**2;if(range<nearest){pulling=spider;nearest=range;}}
   if(pulling){const pullId=`gem-pull:${gem.id}`;ids.add(pullId);this.loop(pullId,pulling.kind==='spider2'?'stealgib2':'stealgib',gem.pos);}
  }
  const retained=new Set([...this.loops.keys()].filter((id):id is number=>typeof id==='number'&&id>0));
  const selected=selectEnemyAudio(world.enemies,this.listenerPosition,e=>world.active(e),retained);
  this.setEnvironmentCombat(weaponAudio.primary||weaponAudio.homing||selected.some(c=>c.distance<12));
  if(weaponAudio.primary){ids.add(-10);this.weaponStream(-10,world.level,undefined,false);}
  if(weaponAudio.homing){ids.add(-11);this.weaponStream(-11,world.level,undefined,true);}
  for(const crew of world.crew){
   if(!weapons||crew.player===world.player)continue;
   const state=world.weaponAudioFor(crew);if(!state.primary&&!state.homing)continue;
   const id=`crew:${crew.id}`;ids.add(id);this.weaponStream(id,crew.level,crew.player.pos,state.homing);
  }
  // Homing drone follows surviving projectiles, instead of stacking an eight-second drone per launch.
  const homing:World['projectiles']=[],ranges:number[]=[];
  for(const p of world.projectiles){if(!weapons||!p.homing||!this.audible((p.level??1)>=4?'magentadrone':'daggerdrone',p.pos))continue;const range=(p.pos.x-this.listenerPosition.x)**2+(p.pos.y-this.listenerPosition.y)**2+(p.pos.z-this.listenerPosition.z)**2;let slot=0;while(slot<ranges.length&&ranges[slot]<=range)slot++;if(slot>=8)continue;homing.splice(slot,0,p);ranges.splice(slot,0,range);if(homing.length>8){homing.pop();ranges.pop();}}

  for(const p of homing){const id=-100-p.id;ids.add(id);this.loop(id,(p.level??1)>=4?'magentadrone':'daggerdrone',p.pos);}

  for(const {enemy:e,pos} of selected){ids.add(e.id);if(e.kind==='orb'&&world.time-e.lastHit<=.2){ids.delete(e.id);continue;}const name=['centipede','gigapede','ghostpede'].includes(e.kind)&&!world.active(e)?'subchattercentipede':CHATTER[e.kind];this.loop(e.id,name,pos,1);}
  for(const [id,name,pos] of [[-1,'polarity1e',{x:32,y:0,z:0}],[-2,'polarity2w',{x:-32,y:0,z:0}],[-3,'polarity3n',{x:0,y:0,z:-32}],[-4,'polarity4s',{x:0,y:0,z:32}]] as const){ids.add(id);this.loop(id,name,pos);}
  for(const id of this.loops.keys())if(!ids.has(id)){
   this.stop(id);
  }
 }
 private setEnvironmentCombat(combat:boolean){if(this.environmentGain&&this.context)this.environmentGain.gain.setTargetAtTime(environmentMixGain(combat),this.context.currentTime,combat?.08:.4);}
 private weaponStream(id:number|string,level:number,pos?:Vec,homing=false){
  const tier=weaponTier(level),name=`${homing?'seekrapid':'rapid'}${tier}`;
  if(!this.audible(name,pos)){this.stop(id);return;}
  this.loop(id,name,pos);
 }
 private stop(id:number|string){const voice=this.loops.get(id),c=this.context;if(!voice||!c)return;this.loops.delete(id);voice.gain.gain.cancelScheduledValues(c.currentTime);voice.gain.gain.setTargetAtTime(0,c.currentTime,.005);voice.source.stop(c.currentTime+.025);}
 stopLoops(){this.footstepGait.clear();for(const id of this.loops.keys())this.stop(id);}
 clear(){this.environmentAudio?.stop();this.footstepGait.clear();this.footstepWorld=null;this.generation++;this.countdownBeat=0;for(const [id,voice] of this.loops){voice.source.stop();this.disconnect(voice);this.loops.delete(id);}this.reverb?.reset();for(const voice of [...this.shots]){voice.source.stop();this.disconnect(voice);}this.pickupBags.clear();this.upgradeRevisions.clear();}
 pause(){this.environmentAudio?.stop();this.footstepGait.clear();void this.context?.suspend();}
}
