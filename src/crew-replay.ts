import {isPlayerSkin,isPodiumRank,type PlayerSkin,type PodiumRank} from './player-skins';
import {isPlayerColor,type PlayerColor} from './player-colors';
import {MAX_CREW_PLAYERS} from './crew-config';
import {ENEMY_KINDS} from './enemy-kinds';
import {World,STEP,idleInput,type Input,type CrewCheckpoint,type Effect,type DeathSource,type Enemy,type Vec} from './simulation';
import {randomId} from './id';
import {readBounded} from './replay-file';
import {validContact,encodeContacts,decodeContacts,type ProjectileContact} from './network-contacts';

export const CREW_REPLAY_VERSION=1,CREW_GAMEPLAY_REVISION=21;
export const MAX_CREW_REPLAY_TICKS=30*60*120,MAX_CREW_DECODED_BYTES=64*1024*1024,MAX_CREW_REPLAY_BYTES=32*1024*1024;
export type CrewReplayMember={id:string;name:string;host:boolean;color?:PlayerColor;skin?:PlayerSkin;skinRank?:PodiumRank};
export type CrewReplayFrame={ticks:number;inputs:Input[];waiting:number;disconnected:number};
/** Float64 inputs stay exact, but do not retain one JS object per player per changing-input tick. */
export class CrewReplayFrames{
 private chunks:Uint8Array[]=[];private count=0;readonly stride:number;private capacity=1024;
 constructor(readonly players:number){this.stride=6+players*33;}
 get length(){return this.count;}
 get byteLength(){return this.chunks.length*this.capacity*this.stride;}
 private location(index:number){const chunk=this.chunks[Math.floor(index/this.capacity)],at=(index%this.capacity)*this.stride;return {chunk,at,view:new DataView(chunk.buffer,chunk.byteOffset,chunk.byteLength)};}
 append(f:CrewReplayFrame){if(this.count%this.capacity===0)this.chunks.push(new Uint8Array(this.capacity*this.stride));let {chunk,at,view}=this.location(this.count);view.setUint32(at,f.ticks,true);at+=4;chunk[at++]=f.waiting;chunk[at++]=f.disconnected;for(const input of f.inputs){for(const k of ['forward','strafe','yaw','pitch'] as const){view.setFloat64(at,input[k],true);at+=8;}chunk[at++]=(input.jump?1:0)|(input.fire?2:0)|(input.homing?4:0)|(input.leftArm?8:0)|(input.rightArm?16:0);}this.count++;}
 extendLast(){const {at,view}=this.location(this.count-1);view.setUint32(at,view.getUint32(at,true)+1,true);}
 at(index:number):CrewReplayFrame|undefined{if(index<0)index+=this.count;if(index<0||index>=this.count)return;let {chunk,at,view}=this.location(index);const ticks=view.getUint32(at,true);at+=4;const waiting=chunk[at++],disconnected=chunk[at++],inputs:Input[]=[];for(let n=0;n<this.players;n++){const input=idleInput();for(const k of ['forward','strafe','yaw','pitch'] as const){input[k]=view.getFloat64(at,true);at+=8;}const flags=chunk[at++];input.jump=!!(flags&1);input.fire=!!(flags&2);input.homing=!!(flags&4);if(flags&8)Object.assign(input,{leftArm:true});if(flags&16)Object.assign(input,{rightArm:true});inputs.push(input);}return {ticks,waiting,disconnected,inputs};}
 *[Symbol.iterator](){for(let i=0;i<this.count;i++)yield this.at(i)!;}
 map<T>(fn:(frame:CrewReplayFrame,index:number)=>T){const out:T[]=[];for(let i=0;i<this.count;i++)out.push(fn(this.at(i)!,i));return out;}
}
export type CrewReplayEvent={tick:number;time:number;kind:'death'|'respawn'|'disconnect'|'upgrade'|'wipe';sharedWave?:boolean;playerId?:string;life?:number;cause?:string;source?:DeathSource;level?:number;position?:Vec};
export type CrewReplayCheckpoint={tick:number;state:CrewCheckpoint;digest:string};
export type RecordedCrewRun={format:'abyss-crew-replay';version:1;towerArchitecture?:boolean;combatRevision:18|19|20|21;contacts?:{tick:number;packets:{owner:string;packed:string}[]}[];id:string;created:number;sessionId:string;epoch:number;seed:number;roster:CrewReplayMember[];ticks:number;time:number;cause:string;stats:World['stats'];frames:CrewReplayFrames|CrewReplayFrame[];checkpoints:CrewReplayCheckpoint[];events:CrewReplayEvent[];blood:{tick:number;effect:Effect}[];towerDeaths?:{tick:number;enemy:Enemy}[]};
const numeric=['forward','strafe','yaw','pitch'] as const;
const inputEqual=(a:Input,b:Input)=>numeric.every(k=>a[k]===b[k])&&a.jump===b.jump&&a.fire===b.fire&&a.homing===b.homing&&!!a.leftArm===!!b.leftArm&&!!a.rightArm===!!b.rightArm;
// JSON has no representation for the simulation's infinite timers.
const stringify=(v:unknown)=>JSON.stringify(v,(_k,v)=>v===Infinity?'@crew:infinity':v===-Infinity?'@crew:-infinity':v);
const parse=(s:string)=>JSON.parse(s,(_k,v)=>v==='@crew:infinity'?Infinity:v==='@crew:-infinity'?-Infinity:v);
function digestText(text:string){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0');}
export function crewCheckpointDigest(s:CrewCheckpoint){return digestText(stringify(s));}

/** One recorder per host arena epoch, fed AFTER input pacing and BEFORE rendering. */
export class CrewRunRecorder{
 private contacts:NonNullable<RecordedCrewRun['contacts']>=[];
 readonly id=randomId();readonly created=Date.now();readonly roster:CrewReplayMember[];
 private frames:CrewReplayFrames;private lastFrame:CrewReplayFrame|undefined;private checkpoints:CrewReplayCheckpoint[]=[];private events:CrewReplayEvent[]=[];private blood:RecordedCrewRun['blood']=[];private towerDeaths:{tick:number;enemy:Enemy}[]=[];
 private previous=new Map<string,{alive:boolean;life:number;cause:string}>();private count=0;private bytes=0;private checkpointBytes=0;private lastCheckpoint=0;private interval=600;private minimumInterval=30;private finished:RecordedCrewRun|null=null;
 error='';
 constructor(readonly seed:number,world:World,roster:CrewReplayMember[],readonly sessionId:string,readonly epoch:number,private budget=64*1024*1024){
  this.frames=new CrewReplayFrames(world.crew.length);this.roster=world.crew.map(p=>{const member=roster.find(m=>m.id===p.id);return {id:p.id,name:member?.name??'Wanderer',host:member?.host??p.id==='host',...(isPlayerColor(member?.color)?{color:member.color}:{}),...(isPlayerSkin(member?.skin)&&isPodiumRank(member?.skinRank)?{skin:member.skin,skinRank:member.skinRank}:{})};});
  this.remember(world);this.checkpoint(world);
 }
 private remember(w:World){for(const p of w.crew)this.previous.set(p.id,{alive:p.alive,life:p.life,cause:p.cause});}
 private fail(){this.error='Full team replay unavailable: recording exceeded this device’s memory or duration limit.';this.frames=new CrewReplayFrames(this.roster.length);this.lastFrame=undefined;this.checkpoints=[];this.events=[];this.blood=[];this.towerDeaths=[];this.contacts=[];}
 private checkpoint(w:World){
  const state=w.captureCrewCheckpoint(),serialized=stringify(state),cost=serialized.length*2;
  if(this.checkpointBytes+cost>this.budget/2&&this.checkpoints.length>2){this.minimumInterval=Math.max(this.minimumInterval,this.interval*2);this.interval=this.minimumInterval;this.checkpoints=this.checkpoints.filter((_,i)=>i===0||i%2===0);this.checkpointBytes=this.checkpoints.reduce((n,c)=>n+stringify(c.state).length*2,0);}
  this.checkpoints.push({tick:this.count,state,digest:digestText(serialized)});this.checkpointBytes+=cost;this.lastCheckpoint=this.count;
 }
 record(w:World,inputs:Map<string,Input>,waiting:Set<string>,before:{id:string;alive:boolean;life:number;cause:string}[],effectsStart=0,tickCostMs=0,towerCandidates:Enemy[]=[]){
  if(this.error||this.finished)return;
  const disconnected=this.roster.reduce((mask,p,i)=>before.find(x=>x.id===p.id)?.cause==='DISCONNECTED'&&this.previous.get(p.id)?.cause!=='DISCONNECTED'?mask|(1<<i):mask,0);
  const row:CrewReplayFrame={ticks:1,inputs:this.roster.map(p=>({...inputs.get(p.id)??idleInput()})),waiting:this.roster.reduce((n,p,i)=>waiting.has(p.id)?n|(1<<i):n,0),disconnected};
  const last=this.lastFrame;
  if(last&&!disconnected&&!last.disconnected&&last.waiting===row.waiting&&last.inputs.every((v,i)=>inputEqual(v,row.inputs[i]))){last.ticks++;this.frames.extendLast();}
  else{this.frames.append(row);this.lastFrame=row;}
  this.count++;
  if(w.lastContactInputs.length){
   const groups:{owner:string;contacts:ProjectileContact[]}[]=[];
   for(const c of w.lastContactInputs){const owner=c.shotKey.split(':')[0],last=groups.at(-1);if(last&&last.owner===owner&&last.contacts.length<24)last.contacts.push(c);else groups.push({owner,contacts:[c]});}
   const packets=groups.map(g=>({owner:g.owner,packed:JSON.parse(encodeContacts(0,g.contacts)).packed as string}));
   this.contacts.push({tick:this.count,packets});this.bytes+=stringify(packets).length*2;
  }
  for(const p of w.crew){const old=this.previous.get(p.id);if(p.cause==='DISCONNECTED'&&old?.cause!=='DISCONNECTED')this.events.push({kind:'disconnect',playerId:p.id,life:p.life,tick:this.count,time:w.time,cause:p.cause});else if(old?.alive&&!p.alive)this.events.push({kind:'death',playerId:p.id,life:p.life,tick:this.count,time:w.time,cause:p.cause,source:p.deathSource?structuredClone(p.deathSource):undefined});if(old&&p.life>old.life)this.events.push({kind:'respawn',playerId:p.id,life:p.life,tick:this.count,time:w.time});}
  for(const effect of w.effects.slice(effectsStart)){if(effect.kind==='upgrade')this.events.push({kind:'upgrade',...(effect.sharedWave?{sharedWave:true}:{}),playerId:effect.shooterId,tick:this.count,time:w.time,level:effect.level??effect.amount,position:{...effect.pos}});if(!effect.bloodless&&(effect.kind==='kill'||effect.kind==='hit')){const copy=structuredClone(effect);this.blood.push({tick:this.count,effect:copy});this.bytes+=stringify(copy).length*2+48;}}
  for(const e of towerCandidates)if(e.hp<=0){const enemy=structuredClone(e);this.towerDeaths.push({tick:this.count,enemy});this.bytes+=stringify(enemy).length*2+48;}
  this.remember(w);
  this.interval=Math.max(this.minimumInterval,tickCostMs>0?Math.max(30,Math.min(600,Math.floor(120/tickCostMs))):w.enemies.length>=100?Math.max(30,Math.floor(12000/w.enemies.length)):600);
  if(this.count-this.lastCheckpoint>=this.interval)this.checkpoint(w);
  if(w.state==='dead'){this.events.push({kind:'wipe',tick:this.count,time:w.time,cause:w.cause});if(this.lastCheckpoint!==this.count)this.checkpoint(w);}
  if(this.bytes+this.frames.byteLength+this.checkpointBytes>this.budget||this.count>MAX_CREW_REPLAY_TICKS)this.fail();
 }
 finish(w:World):RecordedCrewRun|null{
  if(this.finished)return this.finished;if(this.error||!this.count||w.state!=='dead')return null;
  this.finished={format:'abyss-crew-replay',version:CREW_REPLAY_VERSION,combatRevision:CREW_GAMEPLAY_REVISION,towerArchitecture:w.towerArchitectureEnabled,id:this.id,created:this.created,seed:this.seed,sessionId:this.sessionId,epoch:this.epoch,roster:structuredClone(this.roster),ticks:this.count,time:w.time,cause:w.cause,stats:structuredClone(w.stats),frames:this.frames,checkpoints:this.checkpoints,events:this.events,blood:this.blood,towerDeaths:this.towerDeaths,...(this.contacts.length?{contacts:this.contacts}:{})};return this.finished;
 }
 get diagnostics(){return {ticks:this.count,frames:this.frames.length,checkpoints:this.checkpoints.length,estimatedBytes:this.bytes+this.frames.byteLength+this.checkpointBytes,error:this.error};}
}

const crewFrameStarts=new WeakMap<RecordedCrewRun,Float64Array>();
export class CrewReplayPlayer{
 private contacts:Map<number,NonNullable<RecordedCrewRun['contacts']>[number]['packets']>;
 world:World;tick=0;private frame=0;private remaining=0;private checkpointIndex=1;private request=0;private starts:Float64Array;private currentFrame?:CrewReplayFrame;private currentIndex=-1;
 constructor(readonly run:RecordedCrewRun){this.contacts=new Map((run.contacts??[]).map(c=>[c.tick,c.packets]));if(run.version!==1||![18,19,20,21].includes(run.combatRevision))throw Error('Replay uses a different game build.');this.world=World.restoreCrewCheckpoint(run.checkpoints[0].state,run.combatRevision<19,run.combatRevision<20,run.towerArchitecture!==true);let starts=crewFrameStarts.get(run);if(!starts){starts=new Float64Array(run.frames.length);let n=0;for(let i=0;i<run.frames.length;i++){starts[i]=n;n+=run.frames.at(i)!.ticks;}crewFrameStarts.set(run,starts);}this.starts=starts;}
 get done(){return this.tick>=this.run.ticks;}
 cancelSeek(){this.request++;}
 private restore(c:CrewReplayCheckpoint){this.world=World.restoreCrewCheckpoint(c.state,this.run.combatRevision<19,this.run.combatRevision<20,this.run.towerArchitecture!==true);this.currentFrame=undefined;this.currentIndex=-1;this.tick=c.tick;let low=0,high=this.starts.length;while(low<high){const mid=(low+high)>>>1;if(this.starts[mid]<=this.tick)low=mid+1;else high=mid;}this.frame=Math.max(0,low-1);this.remaining=(this.run.frames.at(this.frame)?.ticks??0)-(this.tick-this.starts[this.frame]);if(this.remaining===0){this.frame++;this.remaining=0;}else if(this.starts[this.frame]===this.tick)this.remaining=0;this.checkpointIndex=this.run.checkpoints.findIndex(x=>x.tick>this.tick);if(this.checkpointIndex<0)this.checkpointIndex=this.run.checkpoints.length;}
 step(){
  if(this.done)return;const f=this.currentIndex===this.frame?this.currentFrame:this.run.frames.at(this.frame);this.currentIndex=this.frame;this.currentFrame=f;if(!f)throw Error('Team replay ended before its final tick.');
  if(!this.remaining){this.remaining=f.ticks;for(let i=0;i<this.run.roster.length;i++)if(f.disconnected&(1<<i)){const p=this.world.crew.find(p=>p.id===this.run.roster[i].id);if(p){p.alive=false;p.cause='DISCONNECTED';p.respawnAt=null;}}}
  const inputs=new Map(this.run.roster.map((p,i)=>[p.id,f.inputs[i]])),waiting=new Set(this.run.roster.filter((_,i)=>f.waiting&(1<<i)).map(p=>p.id));
  this.world.effects=[];this.world.queueContacts((this.contacts.get(this.tick+1)??[]).flatMap(p=>decodeContacts(p,p.owner)));this.world.stepCrew(inputs,STEP,waiting);this.tick++;if(!--this.remaining)this.frame++;
  const checkpoint=this.run.checkpoints[this.checkpointIndex];if(checkpoint?.tick===this.tick){if(crewCheckpointDigest(this.world.captureCrewCheckpoint())!==checkpoint.digest)throw Error('Team replay validation failed. Playback stopped to avoid showing an inaccurate match.');this.checkpointIndex++;}
 }
 /** Immediate bounded reconstruction for tests and isolated tasks; UI uses seekAsync. */
 seek(tick:number,onStep?:(w:World)=>void){const target=Math.max(0,Math.min(this.run.ticks,Math.round(tick))),checkpoint=[...this.run.checkpoints].reverse().find(c=>c.tick<=target)!;this.restore(checkpoint);while(this.tick<target){this.step();onStep?.(this.world);this.world.effects=[];}return this.world;}
 async seekAsync(tick:number,onReady?:(w:World)=>void):Promise<boolean>{
  const request=++this.request,target=Math.max(0,Math.min(this.run.ticks,Math.round(tick))),scratch=new CrewReplayPlayer(this.run),checkpoint=[...this.run.checkpoints].reverse().find(c=>c.tick<=target)!;scratch.restore(checkpoint);
  while(scratch.tick<target){const end=performance.now()+5;do{scratch.step();scratch.world.effects=[];}while(scratch.tick<target&&performance.now()<end);await new Promise<void>(r=>setTimeout(r,0));if(request!==this.request)return false;}
  if(request!==this.request)return false;this.world=scratch.world;this.tick=scratch.tick;this.frame=scratch.frame;this.remaining=scratch.remaining;this.checkpointIndex=scratch.checkpointIndex;this.currentFrame=undefined;this.currentIndex=-1;onReady?.(this.world);return true;
 }
}

function invalid():never{throw Error('Invalid or unsupported team replay.');}
const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,a:number,b:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=a&&v<=b;
const finite=(v:unknown,a=-1e15,b=1e15)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const vector=(v:unknown)=>obj(v)&&['x','y','z'].every(k=>finite(v[k]));
/** Strict outer bounds plus full recursive shape checks before allocating a simulation. */
export function validateCrewReplay(value:unknown):RecordedCrewRun{
 if(!obj(value))invalid();const r=value;
 if(r.towerArchitecture!==undefined&&typeof r.towerArchitecture!=='boolean')invalid();
 if(r.format!=='abyss-crew-replay'||r.version!==1||![18,19,20,21].includes(r.combatRevision)||typeof r.id!=='string'||!/^[\w-]{1,80}$/.test(r.id)||typeof r.sessionId!=='string'||r.sessionId.length>80||!integer(r.epoch,0,1e9)||!integer(r.seed,0,0xffffffff)||!finite(r.created,0,1e15)||!integer(r.ticks,1,MAX_CREW_REPLAY_TICKS)||!finite(r.time,0,1801)||typeof r.cause!=='string'||r.cause.length>80)invalid();
 if(!Array.isArray(r.roster)||!integer(r.roster.length,1,MAX_CREW_PLAYERS))invalid();const ids=new Set<string>();for(const p of r.roster){if(!obj(p)||typeof p.id!=='string'||!/^[\w-]{1,64}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||p.name.length>24||typeof p.host!=='boolean'||p.color!==undefined&&!isPlayerColor(p.color)||p.skin!==undefined&&(!isPlayerSkin(p.skin)||!isPodiumRank(p.skinRank))||p.skin===undefined&&p.skinRank!==undefined)invalid();ids.add(p.id);}
 if(!(r.frames instanceof CrewReplayFrames)&&!Array.isArray(r.frames)||r.frames.length>r.ticks)invalid();let ticks=0;for(const f of r.frames){if(!obj(f)||!integer(f.ticks,1,r.ticks)||!integer(f.waiting,0,(1<<ids.size)-1)||!integer(f.disconnected,0,(1<<ids.size)-1)||f.disconnected&&f.ticks!==1||!Array.isArray(f.inputs)||f.inputs.length!==ids.size)invalid();for(const i of f.inputs)if(!obj(i)||!finite(i.forward,-1,1)||!finite(i.strafe,-1,1)||!finite(i.yaw,-1e6,1e6)||!finite(i.pitch,-Math.PI,Math.PI)||['jump','fire','homing'].some(k=>typeof i[k]!=='boolean')||['leftArm','rightArm'].some(k=>i[k]!==undefined&&typeof i[k]!=='boolean'))invalid();ticks+=f.ticks;if(ticks>r.ticks)invalid();}if(ticks!==r.ticks)invalid();
 if(!Array.isArray(r.checkpoints)||r.checkpoints.length<2||r.checkpoints.length>1000||r.checkpoints[0]?.tick!==0||r.checkpoints.at(-1)?.tick!==r.ticks)invalid();let previous=-1;
 for(const c of r.checkpoints){if(!obj(c)||!integer(c.tick,0,r.ticks)||c.tick<=previous||typeof c.digest!=='string'||!/^[a-f0-9]{8}$/.test(c.digest))invalid();previous=c.tick;validateCheckpoint(c.state,ids,r.combatRevision);if(c.state.tick!==c.tick||Math.abs(c.state.time-c.tick*STEP)>.0001||crewCheckpointDigest(c.state)!==c.digest)invalid();}
 const final=r.checkpoints.at(-1).state;if(final.state!=='dead'||Math.abs(r.time-final.time)>.0001||stringify(r.stats)!==stringify(final.stats)||final.cause!==r.cause)invalid();
 if(r.contacts!==undefined){
  if(r.combatRevision<21||!Array.isArray(r.contacts)||r.contacts.length>r.ticks)invalid();let last=0;
  for(const batch of r.contacts){if(!obj(batch)||!integer(batch.tick,last+1,r.ticks)||!Array.isArray(batch.packets)||batch.packets.length>8192)invalid();let count=0;for(const p of batch.packets){if(!obj(p)||!ids.has(p.owner))invalid();try{count+=decodeContacts(p,p.owner).length;}catch{invalid();}}if(count>8192)invalid();last=batch.tick;}
 }
 if(!Array.isArray(r.events)||r.events.length>r.ticks*(MAX_CREW_PLAYERS*2+1)||!Array.isArray(r.blood)||r.blood.length>1000000)invalid();
 let eventTick=0;for(const e of r.events){if(e.tick<eventTick)invalid();eventTick=e.tick;if(!obj(e)||!integer(e.tick,1,r.ticks)||!finite(e.time,0,r.time+.001)||!['death','respawn','disconnect','upgrade','wipe'].includes(e.kind)||(e.playerId!==undefined&&!ids.has(e.playerId)))invalid();}

 let bloodTick=0;for(const b of r.blood){if(b.tick<bloodTick)invalid();bloodTick=b.tick;if(!obj(b)||!integer(b.tick,1,r.ticks)||!obj(b.effect)||!['hit','kill'].includes(b.effect.kind)||!vector(b.effect.pos))invalid();}
 if(r.towerDeaths!==undefined){if(!Array.isArray(r.towerDeaths)||r.towerDeaths.length>10000)invalid();for(const d of r.towerDeaths)if(!obj(d)||!integer(d.tick,1,r.ticks)||!obj(d.enemy)||!['squid','squid2','squid3'].includes(d.enemy.kind)||!integer(d.enemy.id,1,1e9)||!vector(d.enemy.pos)||!Array.isArray(d.enemy.weakpoints)||!finite(d.enemy.phase)||!finite(d.enemy.age))invalid();}
 let nodes=0;const visit=(v:any,depth=0)=>{if(++nodes>4000000||depth>40)invalid();if(typeof v==='number'&&(Number.isNaN(v)||Math.abs(v)>1e15&&Number.isFinite(v)))invalid();if(typeof v==='string'&&v.length>10000)invalid();if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))invalid();visit(x,depth+1);}};visit({...r,frames:undefined});
 return r as RecordedCrewRun;
}
function validateCheckpoint(s:unknown,ids:Set<string>,revision:number){
 if(obj(s)&&s.contacts!==undefined){const c=s.contacts;
  if(revision<21||!obj(c)||!Array.isArray(c.owners)||c.owners.length>MAX_CREW_PLAYERS||!c.owners.every((id:unknown)=>typeof id==='string'&&ids.has(id))||!Array.isArray(c.pending)||c.pending.length>8192||!Array.isArray(c.incoming)||c.incoming.length>8192||!c.incoming.every(validContact)||!c.pending.every((p:any)=>obj(p)&&validContact(p.contact)&&integer(p.expires,0,MAX_CREW_REPLAY_TICKS+600)))invalid();
  if(c.sources!==undefined&&(!Array.isArray(c.sources)||c.sources.length>20000||!c.sources.every((p:any)=>Array.isArray(p)&&p.length===2&&typeof p[0]==='string'&&obj(p[1])&&integer(p[1].level,1,7)&&finite(p[1].energy,0,100)&&typeof p[1].homing==='boolean'&&integer(p[1].expires,0,MAX_CREW_REPLAY_TICKS+600)&&(p[1].kind===undefined||p[1].kind==='shotgun'))))invalid();
  if(c.receipts!==undefined&&(!Array.isArray(c.receipts)||c.receipts.length>MAX_CREW_PLAYERS||!c.receipts.every((p:any)=>Array.isArray(p)&&p.length===3&&ids.has(p[0])&&integer(p[1],0,1e9)&&Array.isArray(p[2])&&p[2].length<=8192&&p[2].every((n:unknown)=>integer(n,p[1]+1,1e9)))))invalid();
 }
 if(!obj(s)||s.version!==1||!obj(s.options)||Object.values(s.options).some(v=>typeof v!=='boolean')||!integer(s.scheduleCursor,0,100000)||!integer(s.tick,0,MAX_CREW_REPLAY_TICKS)||!finite(s.time,0,1801)||!['playing','dead'].includes(s.state)||!Array.isArray(s.crew)||s.crew.length!==ids.size||!Array.isArray(s.playerStarts)||s.playerStarts.length!==ids.size||!s.playerStarts.every(vector))invalid();
 for(const k of ['rng','shotRngSeed','spawnRng','nextId','bloodSequence','level','reserve','wave','lastShotTick'])if(!finite(s[k]))invalid();if(!finite(s.spawnAngle)||!finite(s.radius,0,200)||typeof s.wasJump!=='boolean'||!ids.has(s.selectedId)||!obj(s.stats)||!Array.isArray(s.stats.upgradeTimes)||s.stats.upgradeTimes.length!==(revision>=20?7:4)||!obj(s.stats.killed))invalid();
 for(const v of Object.values(s.stats))if(typeof v==='number'&&!finite(v,0,1e9))invalid();
 for(const k of ['enemies','projectiles','gems','rings','delayed','detonations','upgradePulses'])if(!Array.isArray(s[k])||s[k].length>20000)invalid();
 const seen=new Set<string>();for(const p of s.crew){if(!obj(p)||!ids.has(p.id)||seen.has(p.id)||!obj(p.player)||!vector(p.player.pos)||!vector(p.player.vel)||!obj(p.input)||!obj(p.primary)||!obj(p.secondary)||typeof p.alive!=='boolean'||!integer(p.life,0,1000)||!(p.respawnAt===null||finite(p.respawnAt))||!finite(p.protectedUntil)||!integer(p.level,1,revision>=20?7:4)||!finite(p.reserve,0,1e9))invalid();seen.add(p.id);for(const ch of [p.primary,p.secondary])if(!['held','nextShot','recoverUntil','lastBurst'].every(k=>finite(ch[k]))||typeof ch.wasHeld!=='boolean'||typeof ch.streaming!=='boolean')invalid();}
 for(const e of s.enemies){if(!obj(e)||!integer(e.id,1,1e9)||!ENEMY_KINDS.includes(e.kind)||!vector(e.pos)||!vector(e.vel)||!vector(e.target)||!Array.isArray(e.segments)||e.segments.length>1000||!Array.isArray(e.weakpoints)||e.weakpoints.length>1000)invalid();for(const k of ['hp','age','phase','nextSpawn','radius','gems','eaten','headExposure','lastHit','duckUntil','nextMove','orbitSpeed','radialOffset','facingYaw','eggCooldown','statusUntil','activeAt','size'])if(!finite(e[k]))invalid();if(!(finite(e.nextBeckon)||e.nextBeckon===Infinity)||typeof e.pendingDuck!=='boolean'||!['emerging','idle','hunting','burrowing'].includes(e.status))invalid();for(const p of e.segments)if(!obj(p)||!vector(p.pos)||!finite(p.hp))invalid();for(const p of e.weakpoints)if(!obj(p)||!vector(p.local)||!finite(p.hp))invalid();}
 for(const key of ['projectiles','gems','rings','delayed','detonations','upgradePulses'])for(const p of s[key])if(!obj(p)||!vector(p.pos))invalid();for(const p of s.projectiles)if(!vector(p.vel)||!integer(p.id,1,1e9)||!finite(p.age)||typeof p.homing!=='boolean'||p.kind!==undefined&&p.kind!=='shotgun'||p.previous!==undefined&&!vector(p.previous)||p.path!==undefined&&(!Array.isArray(p.path)||p.path.length>20000||!p.path.every((x:any)=>obj(x)&&vector(x.pos)&&finite(x.t))))invalid();for(const p of s.gems)if(!vector(p.vel)||!integer(p.id,1,1e9)||!finite(p.age))invalid();for(const p of s.upgradePulses)if(!Array.isArray(p.hit)||!p.hit.every((v:unknown)=>integer(v,0,1e9)))invalid();
}

const magic=[65,66,89,67,1],rowSize=(n:number)=>6+n*33;
export function packCrewReplay(run:RecordedCrewRun){
 validateCrewReplay(run);const {frames,...metadata}=run,header=new TextEncoder().encode(stringify(metadata)),size=9+header.length+frames.length*rowSize(run.roster.length);if(size>MAX_CREW_DECODED_BYTES)throw Error('Team replay exceeds the decoded size limit.');const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);bytes.set(magic);view.setUint32(5,header.length,true);bytes.set(header,9);let at=9+header.length;
 for(const f of frames){view.setUint32(at,f.ticks,true);at+=4;bytes[at++]=f.waiting;bytes[at++]=f.disconnected;for(const input of f.inputs){for(const k of numeric){view.setFloat64(at,input[k],true);at+=8;}bytes[at++]=(input.jump?1:0)|(input.fire?2:0)|(input.homing?4:0)|(input.leftArm?8:0)|(input.rightArm?16:0);}}return bytes;
}
export function unpackCrewReplay(bytes:Uint8Array):RecordedCrewRun{
 if(bytes.length>MAX_CREW_DECODED_BYTES||bytes.length<9||magic.some((v,i)=>bytes[i]!==v))invalid();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=view.getUint32(5,true);let at=9+length;if(at>bytes.length)invalid();const metadata=parse(new TextDecoder().decode(bytes.subarray(9,at)));if(!obj(metadata)||!Array.isArray(metadata.roster)||!integer(metadata.roster.length,1,MAX_CREW_PLAYERS))invalid();const size=rowSize(metadata.roster.length);if((bytes.length-at)%size||(bytes.length-at)/size>MAX_CREW_REPLAY_TICKS)invalid();const frames=new CrewReplayFrames(metadata.roster.length);
 while(at<bytes.length){const ticks=view.getUint32(at,true);at+=4;const waiting=bytes[at++],disconnected=bytes[at++],inputs:Input[]=[];for(let n=0;n<metadata.roster.length;n++){const input=idleInput();for(const k of numeric){input[k]=view.getFloat64(at,true);at+=8;}const flags=bytes[at++];if(flags>31)invalid();input.jump=!!(flags&1);input.fire=!!(flags&2);input.homing=!!(flags&4);if(flags&8)Object.assign(input,{leftArm:true});if(flags&16)Object.assign(input,{rightArm:true});inputs.push(input);}frames.append({ticks,waiting,disconnected,inputs});}return validateCrewReplay({...metadata,frames});
}
export async function encodeCrewReplay(run:RecordedCrewRun,maxBytes=MAX_CREW_REPLAY_BYTES):Promise<Blob>{const packed=packCrewReplay(run),bytes=await readBounded(new Blob([packed as BlobPart]).stream().pipeThrough(new CompressionStream('gzip')),maxBytes);return new Blob([bytes as BlobPart],{type:'application/gzip'});}
export async function decodeCrewReplay(blob:Blob):Promise<RecordedCrewRun>{if(blob.size>MAX_CREW_REPLAY_BYTES)throw Error('Team replay exceeds the compressed size limit.');return unpackCrewReplay(await readBounded(blob.stream().pipeThrough(new DecompressionStream('gzip')),MAX_CREW_DECODED_BYTES));}
