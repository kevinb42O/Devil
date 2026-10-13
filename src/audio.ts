import {distance,type Effect,type Vec,type World} from './simulation';
import {type EnemyKind} from './enemy-kinds';
const ROOT='/assets/original/devil-daggers/audio/';
const variants=(name:string,count:number)=>Array.from({length:count},(_,i)=>`${name}${i+1}`);
export function entranceSounds(best:number){const suffix=best>=1000?'5':best>=500?'4devil':best>=250?'3gold':best>=120?'2silver':best>=60?'1bronze':'';return {call:'daggercall'+suffix,collect:'daggercollect'+suffix};}
const ENTRANCE_SOUNDS=[0,60,120,250,500,1000].flatMap(best=>Object.values(entranceSounds(best)));
const CHATTER:Partial<Record<EnemyKind,string>>={skull:'chatterskull',skull2:'chatterskull2',skull3:'chatterskull3',skull4:'chatterskull4',transmuted1:'chatterskullblack',transmuted2:'chatterskull2black',transmuted3:'chatterskull3black',transmuted4:'chatterskull4black',squid:'chatterminisquid',squid2:'chattersquid',squid3:'chattersquidultra',spider:'chatterspider',spider2:'chattergigaspider',spiderling:'chatterspiderling',centipede:'chattercentipede',gigapede:'chattercentipede2',ghostpede:'chatterultrapede',leviathan:'chatterleviathan',orb:'eyearousedrone',thorn:'chatterthorn',egg:'eggdrone',egg2:'eggdrone2'};
const SPAWN:Partial<Record<EnemyKind,string>>={squid:'spawnminisquid',squid2:'spawnsquid',squid3:'spawnultrasquid',spider:'spawnspider',spider2:'spawngigaspider',centipede:'spawncentipede',gigapede:'spawncentipede2',ghostpede:'spawnultrapede',leviathan:'spawnleviathan',orb:'eyearouse',thorn:'thornemerge',egg:'spawnegg',egg2:'spawnegg'};
const KILL:Partial<Record<EnemyKind,string|string[]>>={skull:variants('killskull',5),skull2:'killsuperskull',skull3:'killsuperskull2',skull4:'killsuperskull3',transmuted1:variants('killskullblack',4),transmuted2:'killsuperskullblack',transmuted3:'killsuperskull2black',transmuted4:'killsuperskull3',squid:'killminisquid',squid2:'killsquid',squid3:'killultrasquid',spider:'killspider',spider2:'killgigaspider',centipede:'killcentipede',gigapede:'killcentipede2',ghostpede:'ultrapedecrash',leviathan:'killleviathan',orb:'killeye',thorn:'killthorn',egg:'eggburst',egg2:'eggburst2',spiderling:variants('killspiderling',5)};
const HIT:Partial<Record<EnemyKind,string>>={squid:'damagesquid',squid2:'damagesquid2',squid3:'damagesquid3',spider:'damagespider',spider2:'damagegigaspider',centipede:'damagecentipede',gigapede:'damagecentipede2',ghostpede:'damageultrapede',leviathan:'damageleviathan',orb:'eyehit',thorn:'damagethorn'};
const CORE=['rapid1','rapid2','rapid3','rapid4','shot1','shot2',...variants('shot3alt',4),...variants('shot4alt',5),'gibcollect','gibcollectmagic','jump1','jump2','jump3','land','land2','death','fall','leveldown','levelup2','levelup3','levelup4','daggerdrone','daggerseek','magentadrone','magentashot','daggerhit1'];
export const SOUND_NAMES=[...new Set([...CORE,...ENTRANCE_SOUNDS,...Object.values(CHATTER),...Object.values(SPAWN),...Object.values(KILL).flat(),...Object.values(HIT),'polarity1e','polarity2w','polarity3n','polarity4s','leviathanbeckon','leviathanbeckon2','leviathantransmute',...variants('magentadetonate',5),...variants('ricochet',5),...variants('ricochetmagic',4),...variants('ricochetmagenta',5),...variants('magicpierce',5),...variants('spidereat',6),'eggbounce','ultrapedeeat','burrowcentipede','subchattercentipede','unburrowcentipede','eyepacifydrone'])] as string[];
type Voice={source:AudioBufferSourceNode;panner?:PannerNode;gain:GainNode;name:string;priority:number;ended:boolean};
/** Original WAVs. Browser bus gains/attenuation remain port tuning, not native mixer measurements. */
export class Sound{
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private buffers=new Map<string,AudioBuffer>();
 private pending=new Map<string,Promise<AudioBuffer|undefined>>();
 private loops=new Map<number,Voice>();
 private shots=new Set<Voice>();
 private volume=.55;
 private loudness=new Map<string,number>();
 private loading:Promise<void>|null=null;
 private cooldowns=new Map<string,number>();
 private choices=new Map<string,number>();
 private failures=new Set<string>();
 private generation=0;
 get diagnostics(){return {loaded:this.buffers.size,failed:[...this.failures],oneShots:this.shots.size,oneShotNames:[...this.shots].map(v=>v.name),loops:[...this.loops.values()].map(v=>v.name)};}
 async start(){
  if(this.context){await this.context.resume();return this.loading;}
  this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.volume;
  const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-4;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.15;
  this.master.connect(limiter);limiter.connect(this.context.destination);await this.context.resume();
  this.loading=(async()=>{
   try{const response=await fetch(ROOT+'loudness.ini');if(response.ok)for(const match of (await response.text()).matchAll(/([\w]+)\s*=\s*([\d.]+)/g)){const value=parseFloat(match[2]);if(Number.isFinite(value))this.loudness.set(match[1],value);}}catch{/* Recordings still work with the fallback mix. */}
   // Warm only the opening weapon/movement cues. Enemy and later-hand sounds
   // load on demand; decoding the entire library on Start competes with gameplay.
   const opening=['rapid1','shot1','gibcollect','jump1','jump2','jump3','land','land2','death','fall','spawnminisquid'];
   let index=0;await Promise.all(Array.from({length:2},async()=>{while(index<opening.length)await this.load(opening[index++]);}));
  })();return this.loading;
 }
 private load(name:string):Promise<AudioBuffer|undefined>{
  if(this.buffers.has(name))return Promise.resolve(this.buffers.get(name));
  if(this.pending.has(name))return this.pending.get(name)!;
  const promise=(async()=>{try{const response=await fetch(ROOT+name+'.wav');if(!response.ok)throw Error(String(response.status));const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());this.buffers.set(name,buffer);return buffer;}catch{this.failures.add(name);return undefined;}finally{this.pending.delete(name);}})();
  this.pending.set(name,promise);return promise;
 }
 setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));if(this.master&&this.context)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.03);}
 listener(pos:Vec,yaw:number,pitch:number){
  const c=this.context;if(!c)return;const l=c.listener,t=c.currentTime;
  l.positionX.setValueAtTime(pos.x,t);l.positionY.setValueAtTime(pos.y,t);l.positionZ.setValueAtTime(pos.z,t);
  l.forwardX.setValueAtTime(-Math.sin(yaw)*Math.cos(pitch),t);l.forwardY.setValueAtTime(Math.sin(pitch),t);l.forwardZ.setValueAtTime(-Math.cos(yaw)*Math.cos(pitch),t);
  l.upX.setValueAtTime(Math.sin(yaw)*Math.sin(pitch),t);l.upY.setValueAtTime(Math.cos(pitch),t);l.upZ.setValueAtTime(Math.cos(yaw)*Math.sin(pitch),t);
 }
 private panner(pos:Vec){const p=this.context!.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=4;p.maxDistance=80;p.rolloffFactor=1.2;p.positionX.value=pos.x;p.positionY.value=pos.y;p.positionZ.value=pos.z;return p;}
 async prepareEntrance(best:number){
  const generation=this.generation;await this.start();if(generation!==this.generation)return;
  const names=entranceSounds(best);await Promise.all([this.load(names.call),this.load(names.collect)]);
 }
 entrance(best:number,pos:Vec){this.loop(-2000,entranceSounds(best).call,pos,1,false);}
 async collectDagger(best:number){
  const generation=this.generation;await this.start();const name=entranceSounds(best).collect;await this.load(name);
  if(generation===this.generation)this.oneShot(name,undefined,1,4);
 }
 private volumeFor(name:string){
  if(name.startsWith('daggercall'))return .2;
  if(name.startsWith('daggercollect'))return .5;
  // Rapid files are continuous beds, not individual dagger transients. Their tiny
  // loudness.ini numbers cannot be divided by 50 like enemy cue weights.
  // Measured recording RMS differs substantially between hands (especially II).
  // Keep a modest progression without the stream masking positional feedback.
  if(name.startsWith('rapid'))return [.07,.0375,.07,.0525][Number(name.at(-1))-1];
  // First-half-second RMS: ~.20/.23/.25/.20. Preserve the attack at a
  // comparable level across hands; leave room for damage and collection cues.
  if(name.startsWith('shot'))return [.16,.15,.14,.17][Number(name[4])-1];
  if(name==='gibcollect')return .11;
  if(name==='gibcollectmagic')return .16;
  if(name==='jump1')return .55;
  if(name.startsWith('jump')||name.startsWith('land'))return .22;
  const gain=Math.min(.9,.16*Math.sqrt((this.loudness.get(name)??10)/10));
  // Homing launch cues and projectile drones share the quieter weapon mix.
  return ['daggerseek','magentashot','daggerdrone','magentadrone'].includes(name)?gain*.5:gain;
 }
 private choose(names:string|string[]){if(typeof names==='string')return names;const previous=this.choices.get(names[0])??-1;let index=Math.floor(Math.random()*names.length);if(index===previous)index=(index+1)%names.length;this.choices.set(names[0],index);return names[index];}
 private disconnect(voice:Voice){if(voice.ended)return;voice.ended=true;voice.source.disconnect();voice.gain.disconnect();voice.panner?.disconnect();this.shots.delete(voice);}
 private oneShot(name:string,pos?:Vec,scale=1,priority=1,throttle=0,throttleKey=name.replace(/\d+$/,'')){
  const c=this.context;if(!c||!this.master||c.state!=='running')return;
  const buffer=this.buffers.get(name);if(!buffer){
   const generation=this.generation,expiresAt=performance.now()+100,position=pos?{...pos}:undefined;
   void this.load(name).then(loaded=>{if(loaded&&generation===this.generation&&performance.now()<expiresAt)this.oneShot(name,position,scale,priority,throttle,throttleKey);});
   return; // Only a fresh cue may survive loading; never carry it into a new run.
  }
  if(throttle&&c.currentTime<(this.cooldowns.get(throttleKey)??-1))return;
  if(this.shots.size>=48){const candidate=[...this.shots].find(v=>v.priority<priority);if(!candidate)return;candidate.source.stop();this.disconnect(candidate);}
  if(throttle)this.cooldowns.set(throttleKey,c.currentTime+throttle);
  const source=c.createBufferSource();source.buffer=buffer;const gain=c.createGain();gain.gain.value=this.volumeFor(name)*scale;source.connect(gain);
  const panner=pos?this.panner(pos):undefined;if(panner){gain.connect(panner);panner.connect(this.master);}else gain.connect(this.master);
  const voice:Voice={source,gain,panner,name,priority,ended:false};this.shots.add(voice);source.onended=()=>this.disconnect(voice);source.start();
 }
 play(e:Effect,world:World){
  const level=e.level??world.level;
  if(e.kind==='shot'||e.kind==='burst'){
   if(e.amount===1){if(e.kind==='burst')this.oneShot(level===4?'magentashot':'daggerseek',undefined,.8,3);return;}
   if(e.kind==='burst')this.oneShot(level<=2?`shot${level}`:this.choose(variants(`shot${level}alt`,level===3?4:5)),undefined,1,3);
   return; // Primary stream is a single loop owned by the weapon state.
  }
  if(e.kind==='spawn'){if(e.amount===-1)return;if(e.enemy&&SPAWN[e.enemy])this.oneShot(SPAWN[e.enemy]!,e.pos,1,2);return;}
  if(e.kind==='kill'){if(e.enemyId!==undefined){this.stop(e.enemyId);this.cooldowns.delete(`hit:${e.enemyId}`);}this.oneShot(this.choose(e.enemy?KILL[e.enemy]??'killskull1':'killskull1'),e.pos,1,2);return;}
  // Armor contacts do not damage the enemy. Keep their impact cue separate
  // from actual damage, and rate-limit damage per enemy rather than per tier.
  if(e.kind==='impact'){this.oneShot('daggerhit1',e.pos,.65,0,.08);return;}
  if(e.kind==='hit'){this.oneShot(e.enemy?HIT[e.enemy]??'daggerhit1':'daggerhit1',e.pos,.9,1,.08,`hit:${e.enemyId??e.enemy??'generic'}`);return;}
  if(e.kind==='ricochet'){this.oneShot(this.choose(variants(e.amount===4?'ricochetmagenta':e.amount===3?'ricochetmagic':'ricochet',e.amount===3?4:5)),e.pos,.65,0,.04);return;}
  if(e.kind==='pierce'){this.oneShot(this.choose(variants('magicpierce',5)),e.pos,.7,1,.05);return;}
  if(e.kind==='eat'){this.oneShot(e.enemy==='ghostpede'?'ultrapedeeat':this.choose(variants('spidereat',6)),e.pos,.8,1,.12);return;}
  if(e.kind==='death'){
   const victim=world.crew.find(p=>p.id===e.shooterId),local=!world.crew.length||victim?.player===world.player;
   if(local||world.state==='dead'||(world.crew.length&&!world.crew.some(p=>p.alive)))this.clear();
   this.oneShot((e.deathCause??victim?.cause??world.cause)==='FALLEN'?'fall':'death',local?undefined:e.pos,1,4);return;
  }
  const name=e.kind==='pickup'?level>=3?'gibcollectmagic':'gibcollect':e.kind==='upgrade'?e.amount===1?'leveldown':`levelup${e.amount}`:e.kind==='jump'?e.amount===3?'jump3':e.amount===2?'jump2':'jump1':e.kind==='land'?e.amount===2?'land2':'land':e.kind==='beckon'?e.enemy==='orb'?'leviathanbeckon2':'leviathanbeckon':e.kind==='transmute'?'leviathantransmute':e.kind==='explosion'?this.choose(variants('magentadetonate',5)):e.kind==='bounce'?'eggbounce':e.kind==='hatch'?e.enemy==='egg2'?'eggburst2':'eggburst':e.kind==='burrow'?'burrowcentipede':e.kind==='emerge'?'unburrowcentipede':undefined;
  if(name)this.oneShot(name,['beckon','transmute','explosion','bounce','hatch','burrow','emerge'].includes(e.kind)?e.pos:undefined,1,e.kind==='upgrade'?4:1,e.kind==='pickup'?.025:e.kind==='explosion'?.035:0);
 }
 private loop(id:number,name:string,pos?:Vec,scale=1,randomPhase=true){
  const c=this.context;if(!c||!this.master||c.state!=='running')return;let voice=this.loops.get(id);
  if(voice&&voice.name!==name){this.stop(id);voice=undefined;}
  if(!voice){const buffer=this.buffers.get(name);if(!buffer){void this.load(name);return;}const source=c.createBufferSource();source.buffer=buffer;source.loop=true;const gain=c.createGain(),panner=pos?this.panner(pos):undefined;
   const target=this.volumeFor(name)*scale;gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(target,c.currentTime+.012);source.connect(gain);if(panner){gain.connect(panner);panner.connect(this.master);}else gain.connect(this.master);
   voice={source,gain,panner,name,priority:0,ended:false};const current=voice;source.onended=()=>this.disconnect(current);this.loops.set(id,voice);source.start(0,randomPhase?Math.random()*buffer.duration:0);
  }
  if(pos&&voice.panner){voice.panner.positionX.value=pos.x;voice.panner.positionY.value=pos.y;voice.panner.positionZ.value=pos.z;}
 }
 update(world:World){
  if(world.state!=='playing'){for(const id of this.loops.keys())this.stop(id);return;}
  const ids=new Set<number>();
  if(world.weaponAudio.primary){ids.add(-10);this.loop(-10,`rapid${world.level}`,undefined,1,false);}
  // Homing drone follows surviving projectiles, instead of stacking an eight-second drone per launch.
  const homing:World['projectiles']=[],ranges:number[]=[];
  for(const p of world.projectiles){if(!p.homing)continue;const range=(p.pos.x-world.player.pos.x)**2+(p.pos.y-world.player.pos.y)**2+(p.pos.z-world.player.pos.z)**2;let slot=0;while(slot<ranges.length&&ranges[slot]<=range)slot++;if(slot>=8)continue;homing.splice(slot,0,p);ranges.splice(slot,0,range);if(homing.length>8){homing.pop();ranges.pop();}}

  for(const p of homing){const id=-100-p.id;ids.add(id);this.loop(id,p.level===4?'magentadrone':'daggerdrone',p.pos,.3);}
  const selected=world.enemies.filter(e=>e.hp>0&&(world.active(e)||e.kind==='centipede')&&CHATTER[e.kind]).sort((a,b)=>{
   const priority=(e:typeof a)=>distance(e.pos,world.player.pos)/((e.kind==='skull2'||e.kind==='skull3')?2:1);return priority(a)-priority(b);
  }).slice(0,28);
  for(const e of selected){ids.add(e.id);const name=e.kind==='centipede'&&!world.active(e)?'subchattercentipede':e.kind==='orb'&&world.time-e.lastHit<=.2?'eyepacifydrone':CHATTER[e.kind]!;this.loop(e.id,name,e.pos,1.2);}
  for(const [id,name,pos] of [[-1,'polarity1e',{x:32,y:0,z:0}],[-2,'polarity2w',{x:-32,y:0,z:0}],[-3,'polarity3n',{x:0,y:0,z:-32}],[-4,'polarity4s',{x:0,y:0,z:32}]] as const){ids.add(id);this.loop(id,name,pos,.35);}
  for(const id of this.loops.keys())if(!ids.has(id))this.stop(id);
 }
 private stop(id:number){const voice=this.loops.get(id),c=this.context;if(!voice||!c)return;this.loops.delete(id);voice.gain.gain.cancelScheduledValues(c.currentTime);voice.gain.gain.setTargetAtTime(0,c.currentTime,.005);voice.source.stop(c.currentTime+.025);}
 stopLoops(){for(const id of this.loops.keys())this.stop(id);}
 clear(){this.generation++;this.stopLoops();for(const voice of [...this.shots]){voice.source.stop();this.disconnect(voice);}this.cooldowns.clear();}
 pause(){void this.context?.suspend();}
}
