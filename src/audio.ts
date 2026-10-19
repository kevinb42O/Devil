import {EnvironmentAudio} from './environment-audio';
import {ArenaReverb} from './arena-reverb';
import {FOOTSTEP_SOUNDS,WET_FOOTSTEP_SOUNDS,ALL_FOOTSTEP_SOUNDS,footstepSurface,bloodFootWetness,FootstepGait} from './footstep-audio';
import {CHATTER_TRIM,distanceEnvelope,hearingProfile} from './spatial-audio';
import {WEAPON_SOUNDS,weaponBank,weaponShots,weaponTier} from './weapon-audio';
import {ENEMY_CHATTER,ENEMY_SPAWN,ENEMY_EMERGE,selectEnemyAudio} from './enemy-audio';
import {remakeAudioAsset,remakeAudioUrl} from './remake-audio';
import {CREW_COUNTDOWN_MS} from './crew-arrival-timing';
import {TUNING,type Effect,type Vec,type World} from './simulation';
import {isSquid,type EnemyKind} from './enemy-kinds';
import {TOWER_DEATH_DURATION} from './enemy-presentation';
const variants=(name:string,count:number)=>Array.from({length:count},(_,i)=>`${name}${i+1}`);
const GEM_PICKUPS=['gibcollect','gibcollect2','gibcollect3'];
const MAGIC_GEM_PICKUPS=['gibcollectmagic','gibcollectmagic2','gibcollectmagic3'];
const GEM_SOUNDS=[...GEM_PICKUPS,...MAGIC_GEM_PICKUPS,...variants('crystalbreak',3),...variants('crystalhit',3),'gemchatter'];
// Mix trims sit after asset mastering and before both the dry and room sends.
// Frequent crystal cues belong beneath weapons and enemy threat information.
const CRYSTAL_MIX:Readonly<Record<string,number>>={'crystal-hit':.32,'crystal-break':.28,'gem-chatter':.35,pickup:.55};
// Jump/touchdown feedback should sit near the quiet footstep bed (-20 dB).
const MOVEMENT_MIX=.1;
export const handUpgradeSound=(level:number)=>level<=1?'leveldown':`levelup${Math.min(7,level)}`;
export function entranceSounds(best:number){const suffix=best>=1000?'5':best>=500?'4devil':best>=250?'3gold':best>=120?'2silver':best>=60?'1bronze':'';return {call:'daggercall'+suffix,collect:'daggercollect'+suffix};}
const ENTRANCE_SOUNDS=[0,60,120,250,500,1000].flatMap(best=>Object.values(entranceSounds(best)));
const CHATTER=ENEMY_CHATTER;
const SPAWN=ENEMY_SPAWN;
const KILL:Partial<Record<EnemyKind,string|string[]>>={skull:variants('killskull',5),skull2:'killsuperskull',skull3:'killsuperskull2',skull4:'killsuperskull3',transmuted1:variants('killskullblack',4),transmuted2:'killsuperskullblack',transmuted3:'killsuperskull2black',transmuted4:'killsuperskull3',squid:'killminisquid',squid2:'killsquid',squid3:'killultrasquid',spider:'killspider',spider2:'killgigaspider',centipede:'killcentipede',gigapede:'killcentipede2',ghostpede:'ultrapedecrash',leviathan:'killleviathan',orb:'killeye',thorn:'killthorn',egg:'eggburst',egg2:'eggburst2',spiderling:variants('killspiderling',5)};
const HIT:Partial<Record<EnemyKind,string>>={squid:'damagesquid',squid2:'damagesquid2',squid3:'damagesquid3',spider:'damagespider',spider2:'damagegigaspider',centipede:'damagecentipede',gigapede:'damagecentipede2',ghostpede:'damageultrapede',leviathan:'damageleviathan',orb:'eyehit',thorn:'damagethorn'};
const CORE=['skullclop1','spawnplayer','rapid1','rapid2','rapid3','rapid4','shot1','shot2',...variants('shot3alt',4),...variants('shot4alt',5),'gibcollect','gibcollectmagic','jump1','jump2','jump3','land','land2','death','fall',...Array.from({length:7},(_,i)=>handUpgradeSound(i+1)),'daggerdrone','daggerseek','magentadrone','magentashot','daggerhit1'];
export const SOUND_NAMES=[...new Set([...CORE,...ALL_FOOTSTEP_SOUNDS,...WEAPON_SOUNDS,...GEM_SOUNDS,...ENTRANCE_SOUNDS,...Object.values(CHATTER),...Object.values(SPAWN),...Object.values(ENEMY_EMERGE),...Object.values(KILL).flat(),...Object.values(HIT),'polarity1e','polarity2w','polarity3n','polarity4s','leviathanbeckon','leviathanbeckon2','leviathantransmute',...variants('magentadetonate',5),...variants('ricochet',5),...variants('ricochetmagic',4),...variants('ricochetmagenta',5),...variants('magicpierce',5),...variants('spidereat',6),'eggbounce','ultrapedeeat','burrowcentipede','subchattercentipede','unburrowcentipede','eyepacifydrone'])] as string[];
type Voice={reverbSends?:GainNode[];upgradeOwner?:string;targetGain?:number;rate:number;source:AudioBufferSourceNode;panner?:PannerNode;spatialGain?:GainNode;position?:Vec;gain:GainNode;name:string;priority:number;ended:boolean};
/** Licensed studio recordings and edited game cues, with bounded positional voices. */
export class Sound{
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private reverb:ArenaReverb|null=null;
 private environmentAudio:EnvironmentAudio|null=null;
 updateEnvironment(time:number|null,dt:number){this.environmentAudio?.update(this.volume>0?time:null,dt);}
 private buffers=new Map<string,AudioBuffer>();
 private pending=new Map<string,Promise<AudioBuffer|undefined>>();
 private loops=new Map<number|string,Voice>();
 private shots=new Set<Voice>();
 private listenerPosition:Vec={x:0,y:0,z:0};
 private volume=.55;private playbackRate=1;
 setPlaybackRate(rate:number){const next=Math.max(.25,Math.min(2,rate));if(next===this.playbackRate)return;this.playbackRate=next;for(const v of [...this.loops.values(),...this.shots])v.source.playbackRate.value=this.playbackRate*v.rate;}
 private loading:Promise<void>|null=null;
 private cooldowns=new Map<string,number>();
 private choices=new Map<string,number>();
 private pickupBags=new Map<string,{bag:number[];previous:number}>();
 private recent:string[]=[];
 private failures=new Set<string>();
 private retries=new Map<string,{attempts:number;nextAt:number}>();
 private generation=0;
 private upgradeRevisions=new Map<string,number>();
 private countdownStarted=false;
 private countdownRevision=0;
 private countdownVoice:Voice|null=null;
 private preparedHands=new Set<number>();
 private footstepGait=new FootstepGait();
 private footstepWorld:World|null=null;
 get diagnostics(){return {source:'studio-horror',environment:this.environmentAudio?.diagnostics??null,recent:[...this.recent],loaded:this.buffers.size,failed:[...this.failures],oneShots:this.shots.size,oneShotNames:[...this.shots].map(v=>v.name),loops:[...this.loops.values()].map(v=>v.name)};}
 async start(){
  if(this.context){await this.context.resume();return this.loading;}
  this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.volume;
  const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-4;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.15;
  this.reverb=new ArenaReverb(this.context,this.master);
  this.environmentAudio=new EnvironmentAudio(this.context,this.master);
  this.master.connect(limiter);limiter.connect(this.context.destination);await this.context.resume();
  this.loading=(async()=>{
   // Warm only the opening weapon/movement cues. Enemy and later-hand sounds
   // load on demand; decoding the entire library on Start competes with gameplay.
   const opening=[...FOOTSTEP_SOUNDS,'rapid1',...weaponShots(1),'weapon1-start','weapon1-stop',...GEM_SOUNDS,'jump1','jump2','jump3','land','land2','death','fall','spawnminisquid'];
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
  const promise=(async()=>{try{const response=await fetch(remakeAudioUrl(name));if(!response.ok)throw Error(String(response.status));const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());this.buffers.set(name,buffer);this.failures.delete(name);this.retries.delete(name);return buffer;}catch{
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
 private panner(pos:Vec,name=''){const profile=hearingProfile(name,name?remakeAudioAsset(name).role:undefined),p=this.context!.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=profile.refDistance;p.maxDistance=profile.maxDistance;p.rolloffFactor=1.2;p.positionX.value=pos.x;p.positionY.value=pos.y;p.positionZ.value=pos.z;return p;}
 private distance(pos:Vec){return Math.hypot(pos.x-this.listenerPosition.x,pos.y-this.listenerPosition.y,pos.z-this.listenerPosition.z);}
 private audible(name:string,pos?:Vec){return !pos||distanceEnvelope(this.distance(pos),hearingProfile(name,remakeAudioAsset(name).role).maxDistance)>0;}
 private updateSpatial(voice:Voice){
  if(!voice.position||!voice.spatialGain||!this.context)return;
  const value=distanceEnvelope(this.distance(voice.position),hearingProfile(voice.name,remakeAudioAsset(voice.name).role).maxDistance);
  // Exact zero outside the range, including already-playing one-shots when
  // the listener flies away. The smooth spatial envelope prevents edge pops.
  voice.spatialGain.gain.setValueAtTime(value,this.context.currentTime);
 }
 async prepareCourtyard(){const generation=this.generation;await this.start();if(generation===this.generation)await this.load('football-goal');}
 courtyard(kind:string,pos:Vec){if(kind==='goal'){this.oneShot('football-goal',pos,1,4,.25);return;}const name=kind==='kick'||kind==='bounce'?'skullclop1':kind==='highfive'?'land':kind==='open'?'spawnplayer':kind==='arrival'?'spawnplayer':kind==='cancel'?'land2':'';if(name)this.oneShot(name,pos,kind==='highfive'?.5:.6,1,.08);}
 async prepareEntrance(best:number){
  const generation=this.generation;await this.start();if(generation!==this.generation)return;
  const names=entranceSounds(best);await Promise.all([this.load(names.call),this.load(names.collect)]);
 }
 entrance(best:number,pos:Vec){this.loop(-2000,entranceSounds(best).call,pos,1,false);}
 async collectDagger(best:number){
  const generation=this.generation;await this.start();const name=entranceSounds(best).collect;await this.load(name);
  if(generation===this.generation)this.oneShot(name,undefined,1,4);
 }
 async prepareCrewArrival(){
  const generation=this.generation;await this.start();if(generation!==this.generation)return;
  await Promise.all(['spawnplayer','crew-countdown','crew-release-laugh'].map(name=>this.load(name)));
 }
 crewArrival(beat:number,remainingMs=beat*1000){
  if(beat>0){void this.playCrewCountdown(remainingMs);return;}
  this.countdownStarted=true;this.countdownRevision++;this.stopCrewCountdown();
  this.oneShot('spawnplayer',undefined,.85,4);
  this.oneShot('crew-release-laugh',undefined,.3,4);
 }
 private async playCrewCountdown(remainingMs:number){
  if(this.countdownStarted)return;
  this.countdownStarted=true;
  const generation=this.generation,revision=this.countdownRevision,requestedAt=performance.now();
  await this.start();
  const buffer=await this.load('crew-countdown');
  const remaining=(remainingMs-(performance.now()-requestedAt))/1000;
  const c=this.context;
  if(!buffer||!c||!this.master||generation!==this.generation||revision!==this.countdownRevision||remaining<=0||c.state!=='running'||document.hidden)return;
  // Three, two, one begin at 0, 1 and 2 seconds. Seek on late guest arrival
  // so the voice stays aligned with the authoritative gate.
  const delay=Math.max(0,remaining-CREW_COUNTDOWN_MS/1000);
  const offset=Math.max(0,CREW_COUNTDOWN_MS/1000-remaining);
  if(offset>=buffer.duration)return;
  const source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;
  const duration=Math.min(remaining-delay,buffer.duration-offset),t=c.currentTime+delay;
  gain.gain.setValueAtTime(.4,t);gain.gain.setValueAtTime(.4,t+Math.max(0,duration-.012));gain.gain.linearRampToValueAtTime(0,t+duration);
  source.connect(gain);gain.connect(this.master);
  const voice:Voice={source,gain,name:'crew-countdown',rate:1,priority:4,ended:false};
  this.countdownVoice=voice;this.shots.add(voice);this.remember('crew-countdown');
  source.onended=()=>{this.disconnect(voice);if(this.countdownVoice===voice)this.countdownVoice=null;};
  source.start(t,offset);source.stop(t+duration);
 }
 private stopCrewCountdown(){
  if(!this.countdownVoice)return;
  this.countdownVoice.source.stop();this.disconnect(this.countdownVoice);this.countdownVoice=null;
 }
 private volumeFor(name:string){const asset=remakeAudioAsset(name);return asset.gain*(CHATTER_TRIM[name]??1)*(CRYSTAL_MIX[asset.role]??1);}
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
   const voice=this.oneShot(name,pos,1,4);if(voice)voice.upgradeOwner=owner;
  };
  if(this.buffers.has(name))play();else void this.load(name).then(buffer=>{if(buffer)play();});
 }
 private oneShot(name:string,pos?:Vec,scale=1,priority=1,throttle=0,throttleKey=name.replace(/\d+$/,''),rate=1):Voice|undefined{
  const c=this.context;if(!c||!this.master||c.state!=='running'||!this.audible(name,pos))return;
  const buffer=this.buffers.get(name);if(!buffer){
   const generation=this.generation,expiresAt=performance.now()+(priority>=4?2000:remakeAudioAsset(name).role==='enemy-spawn'?1000:100),position=pos?{...pos}:undefined;
   void this.load(name).then(loaded=>{if(loaded&&generation===this.generation&&performance.now()<expiresAt)this.oneShot(name,position,scale,priority,throttle,throttleKey,rate);});
   return; // Only a fresh cue may survive loading; never carry it into a new run.
  }
  if(pos&&!throttleKey.startsWith('hit:')&&!throttleKey.startsWith('pickup:'))throttleKey+=`:${Math.floor(pos.x/6)},${Math.floor(pos.y/6)},${Math.floor(pos.z/6)}`;
  if(throttle&&c.currentTime<(this.cooldowns.get(throttleKey)??-1))return;
  if(this.shots.size>=48){const candidate=[...this.shots].find(v=>v.priority<priority);if(!candidate)return;candidate.source.stop();this.disconnect(candidate);}
  if(throttle)this.cooldowns.set(throttleKey,c.currentTime+throttle);
  const role=remakeAudioAsset(name).role;
  // Socket hits and fractures share long decays. Attenuate new overlapping
  // strikes across all enemies, including simultaneous shotgun/crew hits.
  const crystalOverlap=role==='crystal-hit'||role==='crystal-break'
   ?[...this.shots].filter(v=>{const r=remakeAudioAsset(v.name).role;return r==='crystal-hit'||r==='crystal-break';}).length:0;
  const source=c.createBufferSource();source.buffer=buffer;const gain=c.createGain();gain.gain.value=this.volumeFor(name)*scale/Math.sqrt(1+crystalOverlap);source.connect(gain);
  const panner=pos?this.panner(pos,name):undefined,spatialGain=panner?c.createGain():undefined;if(panner&&spatialGain){gain.connect(panner);panner.connect(spatialGain);spatialGain.connect(this.master);}else gain.connect(this.master);
  const voice:Voice={source,gain,panner,spatialGain,position:pos?{...pos}:undefined,name,priority,rate,ended:false};voice.reverbSends=this.reverb?.connect(spatialGain??gain,remakeAudioAsset(name).role);this.updateSpatial(voice);this.shots.add(voice);source.onended=()=>this.disconnect(voice);source.playbackRate.value=this.playbackRate*rate;source.start();this.remember(name);
  return voice;
 }
 play(e:Effect,world:World){
  const weaponLevel=weaponTier(e.level??world.level);
  const level=Math.min(4,weaponLevel);
  const remotePlayer=!!e.shooterId&&!world.crew.some(p=>p.id===e.shooterId&&p.player===world.player);
  if(e.kind==='shot'||e.kind==='burst'){
   const pos=remotePlayer?e.pos:undefined;
   if(e.amount===1){if(e.kind==='burst')this.oneShot(`weapon${weaponLevel}-homing`,pos,.8,3);return;}
   if(e.kind==='burst')this.oneShot(this.choose(weaponShots(weaponLevel)),pos,1,3,0,undefined,1+(Math.random()-.5)*.018);
   return; // Primary streams are loops owned by each player's weapon state.
  }
  if(e.kind==='spawn'){if(e.enemy){void this.load(CHATTER[e.enemy]);if(isSquid(e.enemy))void this.load(KILL[e.enemy] as string);}if(e.amount===-1)return;if(e.enemy&&SPAWN[e.enemy])this.oneShot(SPAWN[e.enemy]!,e.pos,1,2,.075);return;}
  // A tower's final bellow lasts its entire descent and can displace swarm kills.
  if(e.kind==='kill'){
   if(e.enemyId!==undefined){this.stop(e.enemyId);this.cooldowns.delete(`hit:${e.enemyId}`);}
   const tower=!!e.enemy&&isSquid(e.enemy),name=this.choose(e.enemy?KILL[e.enemy]??'killskull1':'killskull1');
   this.oneShot(name,e.pos,tower?.55:.25,tower?3:2,0,undefined,tower?remakeAudioAsset(name).duration/TOWER_DEATH_DURATION:1);return;
  }
  // Armor contacts do not damage the enemy. Keep their impact cue separate
  // from actual damage, and rate-limit damage per enemy rather than per tier.
  if(e.kind==='impact'){this.oneShot('daggerhit1',e.pos,this.sustainedFire(world)?.12:.65,0,.08);return;}
  if(e.kind==='hit'){
   if(e.crystalBreak){this.oneShot(this.choose(variants('crystalbreak',3)),e.pos,1,4);return;}
   // Quiet aiming feedback still gets a protected voice during dense combat.
   if(e.bloodless){this.oneShot(this.choose(variants('crystalhit',3)),e.pos,1,3,.08,`hit:${e.enemyId??e.enemy??'generic'}`);return;}
   this.oneShot(e.enemy?HIT[e.enemy]??'daggerhit1':'daggerhit1',e.pos,this.sustainedFire(world)?.15:.9,1,.08,`hit:${e.enemyId??e.enemy??'generic'}`);return;
  }
  if(e.kind==='ricochet'){this.oneShot(this.choose(variants(e.amount===4?'ricochetmagenta':e.amount===3?'ricochetmagic':'ricochet',e.amount===3?4:5)),e.pos,this.sustainedFire(world)?.25:.65,0,.04);return;}
  if(e.kind==='pierce'){this.oneShot(this.choose(variants('magicpierce',5)),e.pos,this.sustainedFire(world)?.32:.7,1,.05);return;}
  if(e.kind==='eat'){this.oneShot(e.enemy==='ghostpede'?'ultrapedeeat':this.choose(variants('spidereat',6)),e.pos,.8,1,.12);return;}
  if(e.kind==='death'){
   const victim=world.crew.find(p=>p.id===e.shooterId),local=!world.crew.length||victim?.player===world.player;
   if(local||world.state==='dead'||(world.crew.length&&!world.crew.some(p=>p.alive)))this.clear();
   this.oneShot((e.deathCause??victim?.cause??world.cause)==='FALLEN'?'fall':'death',local?undefined:e.pos,1,4);return;
  }
  if(e.kind==='jump'||e.kind==='land'){
   const name=e.kind==='jump'?e.amount===3?'jump3':e.amount===2?'jump2':'jump1':e.amount===2?'land2':'land';
   // Local takeoff is timing feedback: it must survive a pool full of kills.
   this.oneShot(name,remotePlayer?e.pos:undefined,MOVEMENT_MIX,remotePlayer?1:e.kind==='jump'?3:2);return;
  }
  if(e.kind==='pickup'){
   const key=`pickup:${e.shooterId??'local'}`,c=this.context;
   if(!c||c.state!=='running'||c.currentTime<(this.cooldowns.get(key)??-1))return;
   const names=level>=3?MAGIC_GEM_PICKUPS:GEM_PICKUPS;
   // Vary only the non-tonal liquid articulation. The bell and playback pitch
   // stay fixed so collections have one recognizable, stable identity.
   const name=names[this.pickupChoice(`${key}:${names[0]}`,names.length)];
   const overlap=[...this.shots].filter(v=>v.name.startsWith('gibcollect')).length;
   const scale=1/Math.sqrt(1+overlap*.2);
   this.oneShot(name,e.pos,scale,remotePlayer?1:3,.025,key,1);return;
  }
  if(e.kind==='upgrade'){this.upgrade(e.amount??weaponLevel,remotePlayer?{...e.pos}:undefined,remotePlayer?e.shooterId!:'local');return;}
  const name=e.kind==='beckon'?e.enemy==='orb'?'leviathanbeckon2':'leviathanbeckon':e.kind==='transmute'?'leviathantransmute':e.kind==='explosion'?this.choose(variants('magentadetonate',5)):e.kind==='bounce'?'eggbounce':e.kind==='hatch'?e.enemy==='egg2'?'eggburst2':'eggburst':e.kind==='burrow'?'burrowcentipede':e.kind==='emerge'?(e.enemy?ENEMY_EMERGE[e.enemy]:undefined)??'unburrowcentipede':undefined;
  if(name)this.oneShot(name,remotePlayer||['beckon','transmute','explosion','bounce','hatch','burrow','emerge'].includes(e.kind)?e.pos:undefined,1,1,e.kind==='explosion'?.035:0);
 }
 private loop(id:number|string,name:string,pos?:Vec,scale=1,randomPhase=true,rate=1){
  const c=this.context;if(!c||!this.master||c.state!=='running')return;if(!this.audible(name,pos)){this.stop(id);return;}let voice=this.loops.get(id);
  if(voice&&voice.name!==name){this.stop(id);voice=undefined;}
  if(!voice){const buffer=this.buffers.get(name);if(!buffer){void this.load(name);return;}const source=c.createBufferSource();source.buffer=buffer;source.loop=true;const gain=c.createGain(),panner=pos?this.panner(pos,name):undefined,spatialGain=panner?c.createGain():undefined;
   const target=this.volumeFor(name)*scale;gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(target,c.currentTime+.012);source.connect(gain);if(panner&&spatialGain){gain.connect(panner);panner.connect(spatialGain);spatialGain.connect(this.master);}else gain.connect(this.master);
   voice={source,gain,panner,spatialGain,position:pos?{...pos}:undefined,name,priority:0,rate,ended:false,targetGain:target};voice.reverbSends=this.reverb?.connect(spatialGain??gain,remakeAudioAsset(name).role);this.updateSpatial(voice);const current=voice;source.onended=()=>this.disconnect(current);this.loops.set(id,voice);source.playbackRate.value=this.playbackRate;source.start(0,randomPhase?Math.random()*buffer.duration:0);
  }
  const target=this.volumeFor(name)*scale;
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
   if(wetMix<1)this.oneShot(dry,pos,scale*(1-wetMix),local?1:0,0,undefined,1);
   if(wetMix>0)this.oneShot(wet,pos,scale*wetMix,local?1:0,0,undefined,1);
  }
 }
 update(world:World,{weapons=true}:{weapons?:boolean}={}){
  const weaponAudio=weapons?world.weaponAudio:{primary:false,homing:false};
  this.updateFootsteps(world);
  if(world.state!=='playing'){for(const id of this.loops.keys())this.stop(id);return;}
  // Decode the next hand before its gem threshold, so its first attack and
  // upgrade cue are ready without loading the entire sound library at startup.
  for(const hand of new Set([weaponTier(world.level),weaponTier(world.level+1),...world.crew.map(p=>weaponTier(p.level))])){
   const level=Math.min(4,hand);
   if(this.preparedHands.has(hand)||!this.context)continue;this.preparedHands.add(hand);
   const names=[...weaponBank(hand),handUpgradeSound(hand),...(level>=2?['gibcollectmagic',level===4?'magentashot':'daggerseek',level===4?'magentadrone':'daggerdrone']:[])].flat();
   void Promise.all(names.map(name=>this.load(name)));
  }
  for(const [key,expires] of this.cooldowns)if(this.context&&expires<=this.context.currentTime)this.cooldowns.delete(key);
  const ids=new Set<number|string>();
  // Loose crystals advertise their position. Bound both voice count and total
  // energy, so a shower of gems stays a shimmer instead of becoming a wall.
  const nearbyGems:{gem:World['gems'][number];distance:number;score:number}[]=[];
  for(const gem of world.gems){
   if(gem.age>=TUNING.gemLifetime)continue;
   const distance=Math.hypot(gem.pos.x-this.listenerPosition.x,gem.pos.y-this.listenerPosition.y,gem.pos.z-this.listenerPosition.z);
   if(distance>=18)continue;
   const score=distance*(this.loops.has(`gem:${gem.id}`)?.85:1);
   let slot=0;while(slot<nearbyGems.length&&nearbyGems[slot].score<=score)slot++;
   if(slot<6){nearbyGems.splice(slot,0,{gem,distance,score});if(nearbyGems.length>6)nearbyGems.pop();}
  }
  for(const {gem,distance} of nearbyGems){
   const id=`gem:${gem.id}`;ids.add(id);
   this.loop(id,'gemchatter',gem.pos,.7/Math.sqrt(nearbyGems.length)*Math.min(1,(18-distance)/6));
  }
  const retained=new Set([...this.loops.keys()].filter((id):id is number=>typeof id==='number'&&id>0));
  const selected=selectEnemyAudio(world.enemies,this.listenerPosition,e=>world.active(e),retained);
  const threatEnergy=selected.reduce((sum,c)=>sum+c.scale*Math.max(0,1-c.distance/20),0);
  const streamMix=1/(1+Math.min(.55,threatEnergy*.09));
  const remoteStreams=world.crew.filter(p=>p.player!==world.player&&this.audible('rapid'+weaponTier(p.level),p.player.pos)&&(world.weaponAudioFor(p).primary||world.weaponAudioFor(p).homing)).length;
  if(weaponAudio.primary){ids.add(-10);this.weaponStream(-10,world.level,undefined,false,streamMix);}
  if(weaponAudio.homing){ids.add(-11);this.weaponStream(-11,world.level,undefined,true,streamMix);}
  for(const crew of world.crew){
   if(!weapons||crew.player===world.player)continue;
   const state=world.weaponAudioFor(crew);if(!state.primary&&!state.homing)continue;
   const id=`crew:${crew.id}`;ids.add(id);this.weaponStream(id,crew.level,crew.player.pos,state.homing,.6*streamMix/Math.sqrt(Math.max(1,remoteStreams)));
  }
  // Homing drone follows surviving projectiles, instead of stacking an eight-second drone per launch.
  const homing:World['projectiles']=[],ranges:number[]=[];
  for(const p of world.projectiles){if(!weapons||!p.homing||!this.audible((p.level??1)>=4?'magentadrone':'daggerdrone',p.pos))continue;const range=(p.pos.x-this.listenerPosition.x)**2+(p.pos.y-this.listenerPosition.y)**2+(p.pos.z-this.listenerPosition.z)**2;let slot=0;while(slot<ranges.length&&ranges[slot]<=range)slot++;if(slot>=8)continue;homing.splice(slot,0,p);ranges.splice(slot,0,range);if(homing.length>8){homing.pop();ranges.pop();}}

  for(const p of homing){const id=-100-p.id;ids.add(id);this.loop(id,(p.level??1)>=4?'magentadrone':'daggerdrone',p.pos,.3);}

  for(const {enemy:e,pos,scale} of selected){ids.add(e.id);const name=e.kind==='centipede'&&!world.active(e)?'subchattercentipede':e.kind==='orb'&&world.time-e.lastHit<=.2?'eyepacifydrone':CHATTER[e.kind];this.loop(e.id,name,pos,scale,false,.975+((Math.imul(e.id,2654435761)>>>0)%1000)/1000*.05);}
  for(const [id,name,pos] of [[-1,'polarity1e',{x:32,y:0,z:0}],[-2,'polarity2w',{x:-32,y:0,z:0}],[-3,'polarity3n',{x:0,y:0,z:-32}],[-4,'polarity4s',{x:0,y:0,z:32}]] as const){ids.add(id);this.loop(id,name,pos,selected.some(c=>c.distance<12)?.1:.35);}
  for(const id of this.loops.keys())if(!ids.has(id)){
   const voice=this.loops.get(id)!;
   // Only a live trigger release gets a tail. Pause/death/clear remain silent.
   if(weapons&&/^(seek)?rapid[1-7]$/.test(voice.name)){
    const pos=voice.panner?{x:voice.panner.positionX.value,y:voice.panner.positionY.value,z:voice.panner.positionZ.value}:undefined;
    this.oneShot(`weapon${voice.name.slice(-1)}-stop`,pos,1,2);
   }
   this.stop(id);
  }
 }
 private sustainedFire(world:World){if(world.weaponAudio.primary||world.weaponAudio.homing)return true;return world.crew.some(p=>p.player!==world.player&&this.audible('rapid'+weaponTier(p.level),p.player.pos)&&(world.weaponAudioFor(p).primary||world.weaponAudioFor(p).homing));}
 private weaponStream(id:number|string,level:number,pos?:Vec,homing=false,scale=1){
  const tier=weaponTier(level),name=`${homing?'seekrapid':'rapid'}${tier}`;
  if(!this.audible(name,pos)){this.stop(id);return;}
  if(this.loops.get(id)?.name!==name&&this.buffers.has(name))this.oneShot(`weapon${tier}-start`,pos,scale,3);
  this.loop(id,name,pos,scale,true);
 }
 private stop(id:number|string){const voice=this.loops.get(id),c=this.context;if(!voice||!c)return;this.loops.delete(id);voice.gain.gain.cancelScheduledValues(c.currentTime);voice.gain.gain.setTargetAtTime(0,c.currentTime,.005);voice.source.stop(c.currentTime+.025);}
 stopLoops(){this.footstepGait.clear();for(const id of this.loops.keys())this.stop(id);}
 clear(){this.environmentAudio?.stop();this.footstepGait.clear();this.footstepWorld=null;this.generation++;this.countdownStarted=false;this.countdownVoice=null;for(const [id,voice] of this.loops){voice.source.stop();this.disconnect(voice);this.loops.delete(id);}this.reverb?.reset();for(const voice of [...this.shots]){voice.source.stop();this.disconnect(voice);}this.cooldowns.clear();this.pickupBags.clear();this.upgradeRevisions.clear();}
 pause(){this.environmentAudio?.stop();this.footstepGait.clear();void this.context?.suspend();}
}
