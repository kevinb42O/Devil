import {createCourtyard,courtyardEvent,insidePit,pitIsOpen,PIT,SPAWNS,resetSkull,type CourtyardState} from './courtyard-state';
import {createDrawing,pencilAction,stepDrawing,nearDrawingRoom} from './courtyard-drawing';
import {stepSkull,stepHighFives} from './courtyard-physics';
import {ARENA_START_DELAY_MS} from './crew-arrival-timing';
import {verifyPodiumSkin} from './podium-skin-service';
import {type PlayerSkin,type PodiumRank} from './player-skins';
import {DEFAULT_PLAYER_COLOR,isPlayerColor,type PlayerColor} from './player-colors';
import {MAX_CREW_PLAYERS} from './crew-config';
import {CrewRunRecorder,type RecordedCrewRun} from './crew-replay';
import {CrewReplayTransfer} from './crew-replay-transfer';
import {ENTRANCE_SPAWN} from './entrance-layout';
import {LOBBY_TOPIC,DISCOVERY_TOPIC,type PublicLobby} from './lobbies';
import {randomId} from './id';
import {World,STEP,idleInput,v,distance,type Input,type Effect,type Vec} from './simulation';
import {CommandBuffer,InputHistory,MAX_PENDING_INPUTS,inputRuns,InputPacer} from './network-input';
import {encodeState,decodeState,fragmentState,StateAssembler,snapshotBaseline,stateAssemblyTimeout,type StateBaseline} from './network-state';
import {encodePacket,decodePacket,NETWORK_PROTOCOL_VERSION} from './network-codec';
import {SnapshotTimeline} from './network-presentation';
import {MqttWsSignalingClient} from './signaling';
const STATE_BYTES_PER_SECOND=192000,STATE_BURST_BYTES=256*1024;
export type LobbyMember={id:string;name:string;ready:boolean;host:boolean;color?:PlayerColor;skin?:PlayerSkin;skinRank?:PodiumRank;readyRevision?:number;loaded?:number};
export type ArenaSnapshot={members:LobbyMember[];lobbyName:string;serverNow:number;startAt:number;effects:Effect[];epoch:number;running:boolean;prelobby?:boolean;courtyard?:CourtyardState;time:number;tick:number;state:World['state'];cause:string;radius:number;wave:number;level:number;reserve:number;stats:World['stats'];enemies:World['enemies'];projectiles:World['projectiles'];gems:World['gems'];rings:World['rings'];crew:{id:string;player:World['player'];alive:boolean;cause:string;respawnAt:number|null;life:number;protectedUntil:number;yaw:number;pitch?:number;leftArm?:boolean;rightArm?:boolean;level:number;reserve:number;primary:CrewPlayerWireChannel;secondary:CrewPlayerWireChannel;wasJump:boolean;lastShotTick:number;shotSequence:number;shotSeed:number;ack:number;queuedInputs?:number}[]};
type CrewPlayerWireChannel={held:number;wasHeld:boolean;streaming:boolean;nextShot:number;recoverUntil:number;lastBurst:number};
type StateTransfer={frame:number;epoch:number;packets:ArrayBuffer[];next:number;baseline:StateBaseline;at:number;size:number};
type Link={localIce?:RTCIceCandidateInit[];remoteIce?:Map<string,RTCIceCandidateInit|null>;signal?:string;replay?:CrewReplayTransfer;transfer?:StateTransfer;eventEpoch?:number;rttMs?:number;pongAt?:number;pc:RTCPeerConnection;state?:RTCDataChannel;input?:RTCDataChannel;updates?:RTCDataChannel;timer:ReturnType<typeof setTimeout>;assembler:StateAssembler;baselines:Map<number,StateBaseline>;ackFrame:number;sentEpoch:number;tokens:number;tokenAt:number;lastSend:number;sendInterval:number;events:Effect[];disconnectTimer?:ReturnType<typeof setTimeout>};
export function validPeerId(id:unknown):id is string{return typeof id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(id)&&!['host','constructor','prototype','__proto__'].includes(id.toLowerCase());}
type Signal={version:typeof NETWORK_PROTOCOL_VERSION;room:string;id:string;description:RTCSessionDescriptionInit};
export function cleanInput(value:unknown):Input|null{if(!value||typeof value!=='object')return null;const p=value as Input;for(const key of ['forward','strafe','yaw','pitch'] as const)if(!Number.isFinite(p[key]))return null;return {forward:Math.max(-1,Math.min(1,p.forward)),strafe:Math.max(-1,Math.min(1,p.strafe)),yaw:p.yaw%(Math.PI*2),pitch:Math.max(-1.5,Math.min(1.5,p.pitch)),jump:p.jump===true,fire:p.fire===true,homing:p.homing===true,...(p.leftArm===true?{leftArm:true}:{}),...(p.rightArm===true?{rightArm:true}:{})};}
// Movement uses the latest sample; button transitions are consumed one per tick.
// The ordered reliable input channel preserves taps even between network updates.
export class CrewInputBuffer {
 private latest=idleInput();private received=idleInput();private buttons={fire:false,homing:false,jump:false};private edges:{fire:boolean;homing:boolean;jump:boolean}[]=[];
 push(input:Input){this.latest={...input};if(input.fire!==this.received.fire||input.homing!==this.received.homing||input.jump!==this.received.jump){if(this.edges.length>=128)this.edges.shift();this.edges.push({fire:input.fire,homing:input.homing,jump:input.jump});}this.received={...input};}
 next(){const edge=this.edges.shift();if(edge)this.buttons=edge;return {...this.latest,...this.buttons};}
}
export class FriendsSession{
 readonly id=randomId();room='';name='Wanderer';color:PlayerColor=DEFAULT_PLAYER_COLOR;lobbyName='The First Circle';members:LobbyMember[]=[];startAt=0;private heartbeat?:ReturnType<typeof setInterval>;private publicLobby=false;role:'host'|'guest';links=new Map<string,Link>();inputs=new Map<string,Input>();private inputBuffers=new Map<string,CrewInputBuffer>();private commands=new Map<string,CommandBuffer>();private history=new InputHistory();private pacer=new InputPacer();private lastProgress=0;private progressTick=-1;private hostPlaying=false;private timeline=new SnapshotTimeline();private cameraOffset:Vec=v();private predictedShots=new Set<string>();private seenEvents=new Set<number>();private eventSequence=0;private networkTimer:ReturnType<typeof setInterval>;private lastBroadcast=0;private lastPing=0;private lastView=0;private lastState=0;private bytesSent=0;private bytesReceived=0;private rtt=0;private correction=0;private releasedSequence=-1;private localLife=0;private readyRevision=0;private pendingReady?:{revision:number;ready:boolean};private hostStepMs=0;private snapshotInterval=50;private rateAt=0;private rateSent=0;private rateReceived=0;private sendRate=0;private receiveRate=0;inputTimes=new Map<string,number>();world:World|null=null;epoch=0;running=false;prelobby=false;localId='host';closed=false;private sequence=0;private pendingEffects:Effect[]=[];private mqtt=new MqttWsSignalingClient();private joinTimer?:ReturnType<typeof setInterval>;private signalingTopic='';private earlyIce=new Map<string,RTCIceCandidateInit>();
 onCrewControl=(_peerId:string,_message:unknown)=>{};beforeArenaStart=()=>true;
 sendCrewControl(message:unknown,peerId?:string){if(!message||typeof message!=='object'||typeof (message as {type?:unknown}).type!=='string'||!(message as {type:string}).type.startsWith('crew-ranking:'))return false;const payload=JSON.stringify(message);if(payload.length>16000)return false;let sent=false;for(const [id,l]of this.links)if((!peerId||id===peerId)&&l.state?.readyState==='open')try{l.state.send(payload);this.bytesSent+=new TextEncoder().encode(payload).length;sent=true;}catch{}return sent;}
 completedReplay:RecordedCrewRun|null=null;replayError='';private crewRecorder:CrewRunRecorder|null=null;onReplayReady=(_run:RecordedCrewRun)=>{};onReplayProgress=(_progress:number)=>{};
 get replayDiagnostics(){return this.crewRecorder?.diagnostics??null;}
 async requestReplay(){if(this.completedReplay)return this.completedReplay;const transfer=[...this.links.values()].find(l=>l.replay)?.replay;if(!transfer)throw Error(this.replayError||'The host connection is unavailable.');const run=await transfer.request();this.completedReplay=run;this.onReplayReady(run);return run;}
 private resetReplay(){this.completedReplay=null;this.replayError='';this.crewRecorder=null;for(const l of this.links.values())l.replay?.reset();}
 onEffects=(_effects:Effect[])=>{};onChange=()=>{};onSnapshot=(_s:ArenaSnapshot)=>{};onError=(_s:string)=>{};
 constructor(role:'host'|'guest',private iceServers:RTCIceServer[]=[{urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']}],private verifySkin=verifyPodiumSkin){this.role=role;if(role==='host'){this.world=new World(1,{schedule:false});this.addLobbyCrew('host');this.world.selectCrew('host');this.members=[{id:'host',name:this.name,color:this.color,ready:false,host:true}];}this.networkTimer=setInterval(()=>this.pumpNetwork(),25);}
 private addLobbyCrew(id:string){
  if(!this.world||this.world.crew.length>=MAX_CREW_PLAYERS||this.world.crew.some(p=>p.id===id))return;
  const spawn=(this.world.courtyard?SPAWNS:Array.from({length:MAX_CREW_PLAYERS},(_,i)=>({...ENTRANCE_SPAWN,x:i%2?1.05:-1.05,z:Math.floor(i/2)*2}))).find(pos=>!this.world!.crew.some(p=>Math.hypot(p.player.pos.x-pos.x,p.player.pos.z-pos.z)<1));
  this.world.addCrew(id);this.world.crew.at(-1)!.player.pos={...(spawn??ENTRANCE_SPAWN)};
 }
 get connected(){return [...this.links.values()].filter(l=>l.state?.readyState==='open').length;}
 // The host reports the slowest peer so a healthy peer cannot hide a bad link.
 get connection(){
  const links=[...this.links.values()],open=links.filter(l=>l.state?.readyState==='open'),now=performance.now();
  if(!open.length)return {state:this.role==='host'&&!links.length?'hosting':'offline',rttMs:null} as const;
  if(open.some(l=>l.pc.connectionState==='disconnected'||l.pc.connectionState==='failed'||l.pongAt!==undefined&&now-l.pongAt>3000)||this.waitingForHost)return {state:'stalled',rttMs:null} as const;
  if(open.some(l=>l.rttMs===undefined))return {state:'measuring',rttMs:null} as const;
  return {state:'connected',rttMs:Math.round(Math.max(...open.map(l=>l.rttMs!)))} as const;
 }
 private lastCourtyardSummary?:CourtyardState['lastRun'];
 private socialContacts=new Set<string>();
 get gathering(){return !this.running&&(!this.world?.courtyard||this.world.courtyard.phase==='gathering');}
 get courtyard(){return this.world?.courtyard;}
 private pencilActions=new Map<string,number>();
 pencilAction(clear=false){
  if(!this.prelobby||!this.gathering)return false;
  if(this.role==='guest')return !clear&&this.control({type:'drawing-action',generation:this.epoch});
  return this.applyPencilAction('host',clear);
 }
 private applyPencilAction(id:string,clear=false){
  const c=this.courtyard,p=this.world?.crew.find(p=>p.id===id),now=performance.now();
  if(!this.prelobby||!this.gathering||!c||!p||!p.alive||!nearDrawingRoom(p.player.pos)||now-(this.pencilActions.get(id)??-1000)<250)return false;
  this.pencilActions.set(id,now);c.drawing??=createDrawing();
  if(clear){if(id!=='host')return false;c.drawing.ink=[];c.drawing.sequence++;for(const pencil of c.drawing.pencils)pencil.tip=null;}
  else if(!pencilAction(c.drawing,p))return false;
  this.updateLobby();return true;
 }
 markLoaded(generation:number){if(!this.prelobby||generation!==this.epoch)return;if(this.role==='host'){const m=this.members[0];if(m.loaded!==generation){m.loaded=generation;this.updateLobby();}}else this.control({type:'courtyard-loaded',generation});}
 get courtyardPeerUnavailable(){return [...this.links.values()].some(l=>l.pc.connectionState==='disconnected'||l.pc.connectionState==='failed'||l.pc.connectionState==='closed');}
 get pitBlockedReason(){
  if(!this.prelobby||!this.world?.courtyard)return 'Enter the courtyard first';
  if(!this.gathering)return 'The pit is opening';
  if(this.courtyardPeerUnavailable||this.links.size!==this.connected||this.members.length!==1+this.connected)return 'Waiting for a friend to connect';
  if(this.members.some(m=>m.loaded!==this.epoch))return 'Waiting for everyone to load into the courtyard';
  if(!this.allReady)return 'Everyone must mark ready';
  if(this.world.crew.some(p=>insidePit(p.player.pos,.4)))return 'Clear the pit cover';
  return '';
 }
 openPit(){if(this.closed||this.role!=='host'||this.pitBlockedReason)return false;const c=this.world!.courtyard!;c.phase='opening';c.phaseTick=this.world!.tick;c.participants=this.members.map(m=>m.id);c.committed=[];courtyardEvent(c,this.world!.tick,'open',{x:0,y:0,z:PIT.z});this.updateLobby();return true;}
 cancelDescent(){if(this.closed||this.role!=='host'||!this.prelobby||!this.world?.courtyard)return;const c=this.world.courtyard;if(c.phase==='gathering')return;for(const [i,p]of this.world.crew.entries()){if(c.committed.includes(p.id)||insidePit(p.player.pos,.4)||p.player.pos.y<0){p.player.pos={...SPAWNS[i%6]};p.player.vel=v();p.player.grounded=true;p.life++;this.inputs.delete(p.id);this.commands.delete(p.id);this.inputBuffers.delete(p.id);}}c.phase='gathering';c.phaseTick=this.world.tick;c.participants=[];c.committed=[];courtyardEvent(c,this.world.tick,'cancel',{x:0,y:0,z:PIT.z});this.updateLobby();}

 resetToy(){if(this.role==='host'&&this.world?.courtyard){resetSkull(this.world.courtyard,this.world.crew);this.updateLobby();}}
 private skinChecks=new Set<string>();private skinProofs=new Map<string,string>();private skinRevisions=new Map<string,number>();
 get checkingSkin(){return this.skinChecks.has(this.localId);}
 get allReady(){return !this.skinChecks.size&&this.members.length===1+this.connected&&this.members.every(p=>p.ready);}
 setName(name:string){this.name=name.trim().slice(0,24)||'Wanderer';if(this.role==='host')this.members[0].name=this.name;}
 private clearSkin(id:string){this.skinRevisions.set(id,(this.skinRevisions.get(id)??0)+1);this.skinProofs.delete(id);const member=this.members.find(p=>p.id===id);if(member){delete member.skin;delete member.skinRank;}}
 async setSkin(token:unknown){
  if(!this.gathering||this.closed||this.skinChecks.has(this.localId))return false;
  const accepted=await this.applySkin(this.localId,token);
  if(accepted&&this.role==='guest')this.control({type:'skin',token});
  return accepted;
 }
 private async applySkin(id:string,token:unknown){
  if(!this.gathering||this.closed||this.skinChecks.has(id)||typeof token!=='string'||token.length>64)return false;
  const member=this.members.find(p=>p.id===id);if(!member)return false;
  const revision=(this.skinRevisions.get(id)??0)+1;this.skinRevisions.set(id,revision);this.skinChecks.add(id);this.onChange();
  try{
   const rank=await this.verifySkin(token,this.room,id);
   if(this.closed||!this.gathering||this.skinRevisions.get(id)!==revision||!this.members.includes(member))return false;
   if(!rank){this.clearSkin(id);return false;}
   member.ready=false;member.skin='ascendant';member.skinRank=rank;this.skinProofs.set(id,token);return true;
  }catch{if(this.skinRevisions.get(id)===revision)this.clearSkin(id);return false;}
  finally{this.skinChecks.delete(id);if(!this.closed){if(this.role==='host')this.updateLobby();else this.onChange();}}
 }
 async refreshSkins(){if(this.role!=='host'||!this.gathering)return;await Promise.all([...this.skinProofs].map(([id,token])=>this.applySkin(id,token)));}
 setColor(color:unknown){
  if(!isPlayerColor(color)||!this.gathering)return false;
  this.color=color;this.clearSkin(this.localId);
  if(this.role==='host'){this.members[0].color=color;this.members[0].ready=false;this.updateLobby();}
  else{const local=this.members.find(p=>p.id===this.localId);if(local)local.color=color;this.control({type:'color',color});this.onChange();}
  return true;
 }
 setReady(ready:boolean){if(this.running||this.checkingSkin||ready&&this.prelobby&&this.members.find(m=>m.id===this.localId)?.loaded!==this.epoch)return;if(this.role==='host'&&!ready)this.cancelDescent();if(this.role==='host'){this.members[0].ready=ready;this.updateLobby();}else{const revision=++this.readyRevision;this.pendingReady={revision,ready};const local=this.members.find(p=>p.id===this.localId);if(local)local.ready=ready;this.control({type:'ready',ready,revision,name:this.name,generation:this.prelobby?this.epoch:undefined});this.onChange();}}
 private control(message:unknown){let sent=false;const type=(message as {type?:string})?.type;for(const l of this.links.values())if(l.state?.readyState==='open'&&(!(type==='ping'||type==='ack')||l.state.bufferedAmount<32000))try{const payload=JSON.stringify(message);l.state.send(payload);this.bytesSent+=new TextEncoder().encode(payload).length;sent=true;}catch{/* Lifecycle handles closed channels. */}return sent;}
 private announce(closed=false){if(!this.publicLobby)return;const lobby:PublicLobby={id:this.room,name:this.lobbyName,host:this.name,players:1+this.connected,ready:this.members.filter(p=>p.ready).length,state:this.running||!this.gathering?'playing':'waiting',updated:Date.now(),closed};this.mqtt.publish(LOBBY_TOPIC,JSON.stringify(lobby));}
 private updateLobby(){this.broadcast();this.announce();this.onChange();}
 async hostPublic(name:string){if(this.role!=='host')throw Error('Only a host can create a lobby.');this.lobbyName=name.trim().slice(0,40)||`${this.name}'s lobby`;this.publicLobby=true;this.mqtt.subscribe(DISCOVERY_TOPIC,()=>this.announce());await this.auto();this.announce();this.heartbeat=setInterval(()=>{this.announce();if(!this.running)this.broadcast();},2500);}
 async joinPublic(lobby:PublicLobby){if(lobby.state!=='waiting'||lobby.players>=MAX_CREW_PLAYERS)throw Error('This lobby is no longer available.');await this.auto(lobby.id);}
 async auto(room?:string){this.room=room?.trim().toUpperCase()||randomId().replaceAll('-','').slice(0,10).toUpperCase();if(!/^[A-Z0-9]{6,16}$/.test(this.room))throw Error('This lobby is no longer available.');const topic=`abyss-daggers/v1/rooms/${this.room}`;
  this.signalingTopic=topic;this.mqtt.subscribe(topic,raw=>{void this.signalMessage(raw,topic).catch(e=>this.onError(String(e.message||e)));});
  await this.mqtt.connect();const deadline=Date.now()+12000;while(!this.mqtt.isConnected()&&!this.closed&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,250));if(this.closed)throw Error('Lobby closed.');if(!this.mqtt.isConnected())throw Error('Lobby service is reconnecting. Try joining again in a moment.');
  if(this.role==='guest'){const join=()=>{if(!this.connected)this.mqtt.publish(topic,JSON.stringify({type:'join',id:this.id,name:this.name}));};join();this.joinTimer=setInterval(join,3000);setTimeout(()=>{if(!this.closed&&!this.connected)this.onError('Connection timed out. The internet connection to this host could not be established. Try another lobby.');},30000);}
  this.onChange();return this.room;
 }
 private async signalMessage(raw:string,topic:string){if(this.closed||raw.length>100000)return;let m;try{m=JSON.parse(raw);}catch{return;}
  if(!m||typeof m!=='object')return;
  if(m.type==='ice'){
   if(m.room!==this.room||m.version!==NETWORK_PROTOCOL_VERSION||!validPeerId(m.id)||m.to!==(this.role==='host'?'host':this.id))return;
   const candidate=m.candidate as RTCIceCandidateInit;if(!candidate||typeof candidate.candidate!=='string'||candidate.candidate.length>4096||typeof candidate.sdpMid!=='string'&&candidate.sdpMid!==null||candidate.sdpMLineIndex!==null&&(!Number.isInteger(candidate.sdpMLineIndex)||(candidate.sdpMLineIndex as number)<0))return;
   const key=JSON.stringify(candidate),link=this.links.get(m.id);
   if(!link){if(this.role==='guest'&&m.id===this.id&&this.earlyIce.size<128)this.earlyIce.set(key,candidate);return;}
   link.remoteIce??=new Map();if(link.remoteIce.has(key)||link.remoteIce.size>=128)return;link.remoteIce.set(key,candidate);await this.applyIce(link);return;
  }
  if(this.role==='host'&&m.type==='join'&&validPeerId(m.id)){
   const existing=this.links.get(m.id);if(existing){if(existing.signal)this.mqtt.publish(topic,JSON.stringify({type:'offer',to:m.id,signal:existing.signal}));this.sendIce(m.id,existing);return;}
   if(this.links.size>=MAX_CREW_PLAYERS-1||!this.gathering){this.mqtt.publish(topic,JSON.stringify({type:'reject',to:m.id,reason:!this.gathering?'The crew is descending. Join after this run.':'Room is full (6 players).'}));return;}
   this.members.push({id:m.id,name:typeof m.name==='string'?m.name.slice(0,24):'Wanderer',ready:false,host:false});const offer=await this.offer(m.id);const link=this.links.get(m.id);if(link)link.signal=offer;if(!this.closed&&link){this.mqtt.publish(topic,JSON.stringify({type:'offer',to:m.id,signal:offer}));this.sendIce(m.id,link);}
  }else if(this.role==='guest'&&m.to===this.id&&m.type==='offer'){
   const existing=this.links.get(this.id);if(existing){if(existing.signal)this.mqtt.publish(topic,JSON.stringify({type:'answer',signal:existing.signal}));this.sendIce(this.id,existing);return;}
   const answer=await this.answer(m.signal);const link=this.links.get(this.id);if(link&&!this.closed){link.signal=answer;this.mqtt.publish(topic,JSON.stringify({type:'answer',signal:answer}));this.sendIce(this.id,link);}
  }
  else if(this.role==='host'&&m.type==='answer')await this.accept(m.signal);
  else if(this.role==='guest'&&m.to===this.id&&m.type==='reject'){if(this.joinTimer)clearInterval(this.joinTimer);this.onError(m.reason);}
 }
 private makeLink(id:string){if(!validPeerId(id))throw Error('Invalid peer identity.');if(this.links.has(id))throw Error('This invitation is already in use.');const pc=new RTCPeerConnection({iceServers:this.iceServers});const link:Link={pc,assembler:new StateAssembler(),baselines:new Map(),ackFrame:0,sentEpoch:-1,tokens:STATE_BURST_BYTES,tokenAt:performance.now(),lastSend:0,sendInterval:50,events:[],timer:setTimeout(()=>{if(link.state?.readyState!=='open'){this.drop(id);this.onError('Peer connection timed out. A TURN relay may be needed on this network.');}},35000)};this.links.set(id,link);
  pc.onicecandidate=e=>{if(!e.candidate||!this.signalingTopic||this.closed)return;link.localIce??=[];if(link.localIce.length<128)link.localIce.push(e.candidate.toJSON());if(link.signal)this.sendIce(id,link,[e.candidate.toJSON()]);};
  pc.ondatachannel=e=>this.bind(id,link,e.channel);pc.onconnectionstatechange=()=>{if(pc.connectionState==='disconnected'&&!link.disconnectTimer)link.disconnectTimer=setTimeout(()=>{if(pc.connectionState==='disconnected')this.drop(id);},12000);if(pc.connectionState==='connected'&&link.disconnectTimer){clearTimeout(link.disconnectTimer);link.disconnectTimer=undefined;}if(pc.connectionState==='failed'||pc.connectionState==='closed')this.drop(id);this.onChange();};return link;
 }
 private bind(id:string,link:Link,ch:RTCDataChannel){
  if(ch.label==='replay'){link.replay=new CrewReplayTransfer(ch,this.role==='host',()=>this.epoch,()=>this.completedReplay,()=>this.replayError);link.replay.onProgress=p=>this.onReplayProgress(p);ch.onclose=()=>link.replay?.reset();return;}
  if(ch.label==='input')link.input=ch;else if(ch.label==='state')link.state=ch;else if(ch.label==='updates')link.updates=ch;else{ch.close();return;}ch.binaryType='arraybuffer';
  ch.onopen=()=>{if(ch.label==='state'){clearTimeout(link.timer);if(this.role==='host'&&!this.world?.crew.some(p=>p.id===id)&&this.running){this.drop(id);return;}if(this.role==='host'&&!this.running){this.addLobbyCrew(id);if(!this.members.some(p=>p.id===id))this.members.push({id,name:'Wanderer',ready:false,host:false});this.updateLobby();}else if(this.role==='guest'){if(this.joinTimer)clearInterval(this.joinTimer);this.control({type:'hello',name:this.name,color:this.color});}this.onChange();}};
  ch.onclose=()=>{if(!this.closed)this.drop(id);};
  ch.onmessage=e=>{
   if(e.data instanceof ArrayBuffer){this.bytesReceived+=e.data.byteLength;if(this.role==='guest'&&(ch.label==='state'||ch.label==='updates'))this.receiveState(link,e.data);else if(this.role==='host'&&ch.label==='input')this.receiveCommands(id,e.data);return;}
   if(ch.label!=='state'||typeof e.data!=='string'||e.data.length>20000)return;
   this.bytesReceived+=new TextEncoder().encode(e.data).length;try{const m=JSON.parse(e.data);
    if(typeof m.type==='string'&&m.type.startsWith('crew-ranking:')){this.onCrewControl(this.role==='host'?id:'host',m);return;}
    if(m.type==='ping'){const pong=JSON.stringify({type:'pong',at:m.at});ch.send(pong);this.bytesSent+=pong.length;return;}
    if(m.type==='pong'&&Number.isFinite(m.at)){const now=performance.now();link.rttMs=Math.max(0,now-m.at);link.pongAt=now;this.rtt=link.rttMs;return;}
    if(this.role==='host'){
     if(!validPeerId(id))return;
     if(m.type==='ack'&&m.epoch===this.epoch&&Number.isInteger(m.frame)){if(m.frame===0)link.ackFrame=0;else if(link.baselines.has(m.frame)&&m.frame>link.ackFrame)link.ackFrame=m.frame;return;}
     if(m.type==='release'&&m.epoch===this.epoch&&(m.life??0)===this.world?.crew.find(p=>p.id===id)?.life){let commands=this.commands.get(id);if(!commands){commands=new CommandBuffer();this.commands.set(id,commands);}if(!commands.discardThrough(m.seq))return;this.inputs.set(id,this.neutralInput(id));this.inputTimes.set(id,-Infinity);this.inputBuffers.delete(id);return;}
     // Compatibility path for direct transport tests/tools: real gameplay uses
     // fixed-duration binary commands. Legacy samples use reliable controls.
     if(m.type==='sample'&&m.epoch===this.epoch&&this.world?.crew.some(p=>p.id===id&&p.alive&&p.life===(m.life??0))){const input=cleanInput(m.input);if(input){let b=this.inputBuffers.get(id);if(!b){b=new CrewInputBuffer();this.inputBuffers.set(id,b);}b.push(input);this.inputs.set(id,input);this.inputTimes.set(id,performance.now());}return;}
     if(m.type==='courtyard-loaded'&&this.prelobby&&m.generation===this.epoch){const member=this.members.find(p=>p.id===id);if(member&&member.loaded!==this.epoch){member.loaded=this.epoch;courtyardEvent(this.world!.courtyard!,this.world!.tick,'arrival',this.world!.crew.find(p=>p.id===id)!.player.pos,[id]);this.updateLobby();}return;}
     if(m.type==='drawing-action'){if(m.generation===this.epoch)this.applyPencilAction(id);return;}
     if(m.type==='skin'){void this.applySkin(id,m.token).then(ok=>{if(!ok&&ch.readyState==='open')ch.send(JSON.stringify({type:'skin-rejected'}));});return;}const member=this.members.find(p=>p.id===id);if(member&&this.gathering&&m.type==='color'){this.clearSkin(id);if(isPlayerColor(m.color)){member.color=m.color;member.ready=false;this.updateLobby();}return;}if(member&&!this.running&&(m.type==='ready'||m.type==='hello')){if(m.type==='hello'&&this.gathering)member.color=isPlayerColor(m.color)?m.color:DEFAULT_PLAYER_COLOR;if(typeof m.name==='string')member.name=m.name.trim().slice(0,24)||'Wanderer';if(m.type==='ready'){if(this.prelobby&&m.generation!==this.epoch)return;const revision=m.revision??((member.readyRevision??0)+1);if(!Number.isSafeInteger(revision)||revision<1||revision<=(member.readyRevision??0))return;member.readyRevision=revision;member.ready=m.ready===true&&(!this.prelobby||member.loaded===this.epoch);if(!member.ready)this.cancelDescent();}this.updateLobby();}
    }else if(m.type==='skin-rejected'){this.clearSkin(this.localId);this.onChange();this.onError('Ascendant is reserved for the current solo top three. Choose a color or try verifying again.');}else if(m.type==='effects'&&m.epoch===this.epoch&&Array.isArray(m.events)){const effects:Effect[]=[];for(const e of m.events){if(!Number.isInteger(e.networkId)||this.seenEvents.has(e.networkId))continue;this.seenEvents.add(e.networkId);const predicted=e.shotKey&&this.predictedShots.has(e.shotKey);if(predicted)this.predictedShots.delete(e.shotKey);if(!predicted&&!(e.shooterId===this.localId&&(e.kind==='jump'||e.kind==='land')))effects.push(e);}while(this.seenEvents.size>2048)this.seenEvents.delete(this.seenEvents.values().next().value!);this.onEffects(effects);}
   }catch{/* Malformed controls cannot advance simulation. */}
  };
 }
 private receiveCommands(id:string,data:ArrayBuffer){
  if(!validPeerId(id)||(!this.running&&!this.prelobby)||data.byteLength>20000)return;
  try{const packet=decodePacket(new Uint8Array(data)) as {epoch:number;life?:number;runs:unknown[][]};if(packet.epoch!==this.epoch||!this.world?.crew.some(p=>p.id===id&&p.alive&&p.life===(packet.life??0))||!Array.isArray(packet.runs)||packet.runs.length>MAX_PENDING_INPUTS)return;let buffer=this.commands.get(id);if(!buffer){buffer=new CommandBuffer();this.commands.set(id,buffer);}let remaining=MAX_PENDING_INPUTS;
   for(const row of packet.runs){if(!Array.isArray(row)||row.length!==7)return;const [seq,ticks,forward,strafe,yaw,pitch,flags]=row as number[];if(!Number.isSafeInteger(seq)||seq<1||!Number.isInteger(ticks)||ticks<1||ticks>remaining||!Number.isInteger(flags)||flags<0||flags>31)return;remaining-=ticks;const input=cleanInput({forward,strafe,yaw,pitch,jump:!!(flags&1),fire:!!(flags&2),homing:!!(flags&4),leftArm:!!(flags&8),rightArm:!!(flags&16)});if(!input)return;
    for(let tick=0;tick<ticks;tick++)if(buffer.push({seq:seq+tick,input})){this.inputs.set(id,input);this.inputTimes.set(id,performance.now());}
   }
  }catch{/* Ignore malformed packets. */}
 }
 private receiveState(link:Link,data:ArrayBuffer){
  try{const bytes=link.assembler.push(data,performance.now());if(!bytes)return;const decoded=decodeState(bytes,link.baselines);if(!decoded){this.control({type:'ack',epoch:this.epoch,frame:0});return;}const {frame,snapshot}=decoded;if(frame<=link.assembler.last)return;
   if(snapshot.epoch!==this.epoch){this.resetReplay();this.history.reset();this.pacer.reset();this.lastProgress=0;this.progressTick=-1;this.localLife=0;this.releasedSequence=-1;this.pendingReady=undefined;this.timeline.reset();this.predictedShots.clear();this.seenEvents.clear();this.cameraOffset=v();this.lastState=0;this.snapshotInterval=50;link.baselines.clear();}
   link.baselines.set(frame,snapshotBaseline(snapshot));while(link.baselines.size>32)link.baselines.delete(link.baselines.keys().next().value!);link.assembler.accept(frame);
   const local=snapshot.members.find(p=>p.id===this.localId);if(this.pendingReady&&local){if((local.readyRevision??0)>=this.pendingReady.revision)this.pendingReady=undefined;else local.ready=this.pendingReady.ready;}
   const changed=this.running!==snapshot.running||this.prelobby!==!!snapshot.prelobby||JSON.stringify(this.members)!==JSON.stringify(snapshot.members);this.running=snapshot.running;this.world??=new World(1,{schedule:false});this.world.courtyard=snapshot.courtyard;this.world.tick=snapshot.tick;this.prelobby=!!snapshot.prelobby;this.epoch=snapshot.epoch;this.members=snapshot.members??[];this.lobbyName=snapshot.lobbyName;this.startAt=snapshot.time>0||!snapshot.startAt?0:Date.now()+Math.max(0,snapshot.startAt-snapshot.serverNow-this.rtt/2);const receivedAt=performance.now();if(this.lastState)this.snapshotInterval=this.snapshotInterval*.8+(receivedAt-this.lastState)*.2;this.lastState=receivedAt;this.hostPlaying=(snapshot.running||!!snapshot.prelobby)&&snapshot.state==='playing';if(snapshot.tick!==this.progressTick){this.progressTick=snapshot.tick;this.lastProgress=receivedAt;}this.timeline.push(snapshot,this.lastState);this.control({type:'ack',epoch:this.epoch,frame});if(changed)this.onChange();this.onSnapshot(snapshot);
  }catch{/* Corrupt/incomplete updates expire; the next baseline repairs state. */}
 }
 private pumpNetwork(){
  if(this.closed)return;for(const l of this.links.values())l.replay?.pump();const now=performance.now();if(now-this.rateAt>=1000){const elapsed=(now-this.rateAt)/1000;this.sendRate=(this.bytesSent-this.rateSent)/elapsed;this.receiveRate=(this.bytesReceived-this.rateReceived)/elapsed;this.rateSent=this.bytesSent;this.rateReceived=this.bytesReceived;this.rateAt=now;}if(now-this.lastPing>=1000){this.lastPing=now;this.control({type:'ping',at:now});}
  if(!this.running&&!this.prelobby)return;if(this.role==='host'){for(const link of this.links.values())this.drainState(link,now);if(now-this.lastBroadcast>=50){this.lastBroadcast=now-(now-this.lastBroadcast)%50;this.broadcast();}}else this.flushInputs();
 }
 private flushInputs(){
  if(!this.history.commands.length)return;const packet=encodePacket({epoch:this.epoch,life:this.localLife,runs:inputRuns(this.history.commands)});
  for(const link of this.links.values())if(link.input?.readyState==='open'&&link.input.bufferedAmount<8000)try{link.input.send(packet.buffer as ArrayBuffer);this.bytesSent+=packet.byteLength;}catch{/* Retry outstanding commands on the next pump. */}
 }
 predict(w:World,input:Input):boolean{
  if(this.role!=='guest'||(!this.running&&!this.prelobby)||Date.now()<this.startAt||this.waitingForHost)return false;
  const local=w.crew.find(p=>p.id===this.localId);if(!local?.alive||w.state!=='playing'||!this.pacer.next(input))return false;
  const command=this.history.record(input);if(!command)return false;w.predictCrew(this.localId,command.input,STEP,this.prelobby);
  for(const effect of w.effects)if(effect.shotKey)this.predictedShots.add(effect.shotKey);while(this.predictedShots.size>512)this.predictedShots.delete(this.predictedShots.values().next().value!);return true;
 }
 get waitingForHost(){return this.role==='guest'&&(this.running||this.prelobby)&&(performance.now()-this.lastState>1000||this.history.stalled||this.hostStalled);}
 get hostStalled(){return this.role==='guest'&&(this.running||this.prelobby)&&this.hostPlaying&&Date.now()>=this.startAt&&this.lastProgress>0&&performance.now()-this.lastProgress>500;}
 private neutralInput(id:string){const last=this.world?.crew.find(p=>p.id===id)?.input??this.inputs.get(id)??idleInput();return {...idleInput(),yaw:last.yaw,pitch:last.pitch,homing:false};}

 reconcile(w:World,s:ArenaSnapshot){
  const next=s.crew.find(p=>p.id===this.localId),changedLife=!!next&&next.life!==this.localLife;
  if(changedLife){this.localLife=next!.life;this.history.reset();this.pacer.reset();this.releasedSequence=-1;this.predictedShots.clear();this.cameraOffset=v();}
  this.pacer.update(next?.queuedInputs??0);
  const before={x:w.player.pos.x+this.cameraOffset.x,y:w.player.pos.y+this.cameraOffset.y,z:w.player.pos.z+this.cameraOffset.z};this.history.acknowledge(s.crew.find(p=>p.id===this.localId)?.ack??0);applySnapshot(w,s,this.localId);if(!w.crew.find(p=>p.id===this.localId)?.alive||w.state==='dead')this.history.commands=[];
  for(const command of this.history.commands)w.predictCrew(this.localId,command.input,STEP,this.prelobby);w.effects=[];this.correction=distance(before,w.player.pos);this.cameraOffset=!changedLife&&this.correction<2&&w.crew.find(p=>p.id===this.localId)?.alive?v(before.x-w.player.pos.x,before.y-w.player.pos.y,before.z-w.player.pos.z):v();
 }
 presentation(w:World,now:number){if(this.role!=='guest')return w;const dt=this.lastView?Math.min(.1,(now-this.lastView)/1000):0;this.lastView=now;const decay=Math.exp(-20*dt);this.cameraOffset.x*=decay;this.cameraOffset.y*=decay;this.cameraOffset.z*=decay;return this.timeline.view(w,this.localId,now,this.cameraOffset);}
 releaseControls(){if(this.role==='guest'){const seq=this.history.lastSequence;if(seq===this.releasedSequence)return;if(this.control({type:'release',epoch:this.epoch,life:this.localLife,seq}))this.releasedSequence=seq;}}
 get diagnostics(){return {updateHz:Math.round(1000/(this.role==='host'?Math.max(50,...[...this.links.values()].map(l=>l.sendInterval)):this.snapshotInterval)),hostStepMs:Number(this.hostStepMs.toFixed(2)),sendKBps:Number((this.sendRate/1000).toFixed(1)),receiveKBps:Number((this.receiveRate/1000).toFixed(1)),rttMs:Math.round(this.rtt),snapshotAgeMs:this.lastState?Math.round(performance.now()-this.lastState):0,pendingInputs:this.history.commands.length,predictionStalled:this.history.stalled,hostStalled:this.hostStalled,hostQueue:this.pacer.queued,correction:this.correction,interpolationMs:Math.round(this.timeline.delay*1000),bytesSent:this.bytesSent,bytesReceived:this.bytesReceived,queuedBytes:[...this.links.values()].reduce((n,l)=>n+(l.updates?.bufferedAmount??0)+(l.input?.bufferedAmount??0)+(l.state?.bufferedAmount??0),0)};}
 // Forward late ICE candidates and replay them when a lost handshake is retried.
 private sendIce(id:string,link:Link,candidates=link.localIce??[]){if(!this.signalingTopic||this.closed)return;for(const candidate of candidates)this.mqtt.publish(this.signalingTopic,JSON.stringify({type:'ice',version:NETWORK_PROTOCOL_VERSION,room:this.room,id,to:this.role==='host'?id:'host',candidate}));}
 // Brokers can deliver candidates before SDP. Apply each once after remote SDP.
 private async applyIce(link:Link){if(!link.pc.remoteDescription)return;for(const [key,candidate]of link.remoteIce??[]){if(candidate===null)continue;link.remoteIce!.set(key,null);try{await link.pc.addIceCandidate(candidate);}catch{/* Ignore obsolete or invalid candidates; other routes can still connect. */}}}
 private async description(link:Link,type:'offer'|'answer'){await link.pc.setLocalDescription(type==='offer'?await link.pc.createOffer():await link.pc.createAnswer());if(link.pc.iceGatheringState!=='complete')await new Promise<void>(resolve=>{const timer=setTimeout(done,7000);function done(){clearTimeout(timer);link.pc.removeEventListener('icegatheringstatechange',change);resolve();}function change(){if(link.pc.iceGatheringState==='complete')done();}link.pc.addEventListener('icegatheringstatechange',change);});if(this.closed)throw Error('Session closed.');return link.pc.localDescription!.toJSON();}
 async offer(id=randomId()){if(!validPeerId(id))throw Error('Invalid peer identity.');if(this.role!=='host'||this.links.size>=MAX_CREW_PLAYERS-1||!this.gathering)throw Error('Host can invite five friends before starting.');this.room||=randomId().replaceAll('-','').slice(0,10).toUpperCase();const l=this.makeLink(id);this.bind(id,l,l.pc.createDataChannel('replay'));this.bind(id,l,l.pc.createDataChannel('state'));this.bind(id,l,l.pc.createDataChannel('input',{ordered:false,maxRetransmits:0}));this.bind(id,l,l.pc.createDataChannel('updates',{ordered:false,maxRetransmits:0}));return JSON.stringify({version:NETWORK_PROTOCOL_VERSION,room:this.room,id,description:await this.description(l,'offer')} satisfies Signal);}
 private parse(raw:string,type:'offer'|'answer'){if(raw.length>100000)throw Error('Connection code is too large.');let s:Signal;try{s=JSON.parse(raw.trim());}catch{throw Error('Paste the complete connection code.');}if(s.version!==NETWORK_PROTOCOL_VERSION)throw Error('This lobby uses a different game build. Reload every player’s browser.');if(!validPeerId(s.id)||typeof s.room!=='string'||s.description?.type!==type||typeof s.description.sdp!=='string')throw Error('Invalid connection code.');return s;}
 async answer(raw:string){if(this.role!=='guest'||this.links.size)throw Error('Leave the current room before joining another.');const s=this.parse(raw,'offer');this.room=s.room;this.localId=s.id;const l=this.makeLink(s.id);l.remoteIce=new Map(this.earlyIce);this.earlyIce.clear();await l.pc.setRemoteDescription(s.description);await this.applyIce(l);return JSON.stringify({...s,description:await this.description(l,'answer')});}
 async accept(raw:string){const s=this.parse(raw,'answer');if(this.role!=='host'||s.room!==this.room)throw Error('Answer belongs to another room.');const l=this.links.get(s.id);if(!l)throw Error('Invitation expired. Create a new offer.');if(l.pc.signalingState==='have-local-offer'){await l.pc.setRemoteDescription(s.description);await this.applyIce(l);}}
 start(fromEntrance=false){if(this.skinChecks.size)return;if(this.role!=='host'||fromEntrance&&this.running)return;if(this.world?.courtyard){const c=this.world.courtyard;if(c.phase!=='collecting'||!c.participants.length||c.participants.length!==this.members.length||c.committed.length!==c.participants.length||!this.allReady||this.members.some(m=>m.loaded!==this.epoch))return;}if(fromEntrance&&!this.beforeArenaStart())return;if(!fromEntrance&&this.publicLobby&&!this.allReady&&!this.running)throw Error('Every player must be ready before starting.');this.resetReplay();const seed=crypto.getRandomValues(new Uint32Array(1))[0],crewIds=[...new Set([...(this.world?.crew.map(p=>p.id)??[]),...this.links.keys()])].filter(id=>id!=='host'&&this.links.get(id)?.state?.readyState==='open');this.startAt=Date.now()+ARENA_START_DELAY_MS;this.world=new World(seed);this.world.addCrew('host');this.world.selectCrew('host');for(const id of crewIds)this.world.addCrew(id);this.inputs.clear();this.inputBuffers.clear();this.commands.clear();this.inputTimes.clear();this.pendingEffects=[];this.epoch++;this.running=true;this.prelobby=false;this.crewRecorder=new CrewRunRecorder(seed,this.world,this.members,this.id,this.epoch,typeof navigator!=='undefined'&&navigator.maxTouchPoints>0?24*1024*1024:64*1024*1024);this.updateLobby();}
 enterPrelobby(){
  if(this.role!=='host'||this.running||this.prelobby)return;
  this.resetReplay();this.prelobby=true;this.startAt=0;this.epoch++;this.inputs.clear();this.inputBuffers.clear();this.commands.clear();this.inputTimes.clear();this.pendingEffects=[];this.socialContacts.clear();this.pencilActions.clear();
  this.world=new World(1,{schedule:false});this.world.courtyard=createCourtyard(this.epoch);this.addLobbyCrew('host');for(const [id,l]of this.links)if(l.state?.readyState==='open')this.addLobbyCrew(id);this.world.selectCrew('host');for(const m of this.members){m.ready=false;delete m.loaded;}this.updateLobby();
 }
 returnToLobby(){if(this.role!=='host')return;const w=this.world,last=this.courtyard?.lastRun??this.lastCourtyardSummary,crew=this.members.map(m=>m.id).sort().join('|');const summary=w&&this.running?{time:w.time,best:Math.max(w.time,last?.crew===crew?last.best:0),crew}:last;this.running=false;this.prelobby=false;this.enterPrelobby();this.world!.courtyard!.lastRun=summary;this.updateLobby();}
 private stepCourtyard(waiting:Set<string>){
  const w=this.world!;w.stepCrewEntrance(this.inputs,STEP,waiting);const c=w.courtyard;if(!c)return false;
  const invalidCrew=this.courtyardPeerUnavailable||!this.allReady||c.participants.some(id=>!this.members.some(m=>m.id===id&&m.loaded===this.epoch));
  if(c.phase!=='gathering'&&invalidCrew)this.cancelDescent();
  if(c.phase==='opening'&&w.tick-c.phaseTick>=PIT.openingTicks)c.phase='open';
  if(pitIsOpen(c)){
   for(const p of w.crew){
    if(c.committed.includes(p.id)||!insidePit(p.player.pos)||p.player.pos.y>=PIT.depth||p.player.vel.y>=0)continue;
    c.committed.push(p.id);p.player.pos.y=PIT.depth-.2;p.player.vel=v();c.phase='collecting';
   }
   if(c.participants.length&&c.committed.length===c.participants.length){
    this.lastCourtyardSummary=c.lastRun;this.start(true);if(!this.running)this.cancelDescent();return true;
   }
  }
  const active=w.crew.filter(p=>!c.committed.includes(p.id)),artists=active.map(p=>({...p,input:{...p.input,fire:this.inputs.get(p.id)?.fire,homing:this.inputs.get(p.id)?.homing}}));
  c.drawing??=createDrawing();stepDrawing(c.drawing,artists,w.tick,c.phase==='gathering');
  const holding=new Set(c.drawing.pencils.map(p=>p.owner).filter(Boolean));for(const id of holding)delete c.kicks[id!];
  stepSkull(c,artists.filter(p=>!holding.has(p.id)),w.tick,STEP);stepHighFives(c,active,w.tick,this.socialContacts);return false;
 }
 step(input:Input){if(this.role==='host'&&this.world&&(this.running||this.prelobby)&&Date.now()>=this.startAt){
  const started=performance.now();this.inputs.set('host',input);const waiting=new Set<string>();
  for(const id of this.links.keys()){if(!validPeerId(id))continue;const commands=this.commands.get(id),command=commands?.next();if(command)this.inputs.set(id,command.input);else if(commands){if(performance.now()-(this.inputTimes.get(id)??0)<150)waiting.add(id);else this.inputs.set(id,this.neutralInput(id));}else if(performance.now()-(this.inputTimes.get(id)??0)>500){this.inputs.set(id,this.neutralInput(id));this.inputBuffers.delete(id);}else{const buffer=this.inputBuffers.get(id);if(buffer)this.inputs.set(id,buffer.next());}}
  const lives=new Map(this.world.crew.map(p=>[p.id,{life:p.life,alive:p.alive}]));const before=this.world.crew.map(p=>({id:p.id,alive:p.alive,life:p.life,cause:p.cause}));const recording=this.running&&this.world.state==='playing';
  const replayTowers=recording?this.world.enemies.filter(e=>e.kind.startsWith('squid')&&e.hp>0):[];const resolvedInputs=new Map([...this.inputs].map(([id,input])=>[id,{...input}]));const start=this.world.effects.length;if(this.running)this.world.stepCrew(this.inputs,STEP,waiting);else if(this.stepCourtyard(waiting))return;for(const p of this.world.crew){const old=lives.get(p.id);if(old&&(old.life!==p.life||old.alive&&!p.alive)){this.inputs.delete(p.id);this.inputBuffers.delete(p.id);this.commands.delete(p.id);this.inputTimes.delete(p.id);}}if(recording&&this.crewRecorder){try{this.crewRecorder.record(this.world,resolvedInputs,waiting,before,start,performance.now()-started,replayTowers);this.replayError=this.crewRecorder.error;if(this.world.state==='dead'&&!this.completedReplay){this.completedReplay=this.crewRecorder.finish(this.world);if(this.completedReplay)this.onReplayReady(this.completedReplay);}}catch{this.replayError='Team replay recording failed. The run results are still available.';this.crewRecorder=null;}}this.startAt=0;this.pendingEffects.push(...this.world.effects.slice(start).map(e=>({...e,networkId:++this.eventSequence})));if(this.pendingEffects.length>1024)this.pendingEffects.splice(0,this.pendingEffects.length-1024);this.hostStepMs=this.hostStepMs*.9+(performance.now()-started)*.1;
 }}
 sendInput(input:Input){this.control({type:'sample',epoch:this.epoch,life:this.localLife,input});}
 snapshot():ArenaSnapshot|null{const w=this.world;if(!w)return null;return {members:this.members.filter(p=>p.host||this.links.get(p.id)?.state?.readyState==='open'),lobbyName:this.lobbyName,serverNow:Date.now(),startAt:this.startAt,effects:this.pendingEffects,epoch:this.epoch,running:this.running,prelobby:this.prelobby||undefined,courtyard:this.prelobby?w.courtyard:undefined,time:w.time,tick:w.tick,state:w.state,cause:w.cause,radius:w.radius,wave:w.wave,level:w.level,reserve:w.reserve,stats:w.stats,enemies:w.enemies,projectiles:w.projectiles,gems:w.gems,rings:w.rings,crew:w.crew.map(p=>({id:p.id,player:p.player,alive:p.alive,cause:p.cause,respawnAt:p.respawnAt,life:p.life,protectedUntil:p.protectedUntil,yaw:p.input.yaw,pitch:p.input.pitch||undefined,leftArm:this.prelobby&&p.input.leftArm||undefined,rightArm:this.prelobby&&p.input.rightArm||undefined,level:p.level,reserve:p.reserve,primary:p.primary,secondary:p.secondary,wasJump:p.wasJump,lastShotTick:p.lastShotTick,shotSequence:p.shotSequence,shotSeed:p.shotSeed,ack:this.commands.get(p.id)?.acknowledged??0,queuedInputs:this.commands.get(p.id)?.size||undefined}))};}
 private refillStateBudget(link:Link,now:number){link.tokens=Math.min(STATE_BURST_BYTES,link.tokens+(now-link.tokenAt)*STATE_BYTES_PER_SECOND/1000);link.tokenAt=now;}
 private cacheStateBaseline(link:Link,frame:number,baseline:StateBaseline){link.baselines.set(frame,baseline);while(link.baselines.size>32)link.baselines.delete(link.baselines.keys().next().value!);}
 private rememberState(link:Link,frame:number,baseline:StateBaseline,now:number){
  if(link.lastSend)link.sendInterval=link.sendInterval*.8+(now-link.lastSend)*.2;link.lastSend=now;
  this.cacheStateBaseline(link,frame,baseline);
 }
 private drainState(link:Link,now:number){
  const transfer=link.transfer;if(!transfer)return;
  if(transfer.epoch!==this.epoch||!(this.running||this.prelobby)||now-transfer.at>stateAssemblyTimeout(transfer.size)){link.transfer=undefined;return;}
  const channel=link.updates;if(channel?.readyState!=='open')return;this.refillStateBudget(link,now);
  // One frame in flight, bounded work/queue per pump, and per-chunk accounting.
  // A frame can exceed the token bucket without requiring an unbounded burst.
  for(let sent=0;sent<8&&transfer.next<transfer.packets.length;sent++){
   const packet=transfer.packets[transfer.next];if(channel.bufferedAmount>8000||link.tokens<packet.byteLength)break;
   try{channel.send(packet);}catch{return;}transfer.next++;link.tokens-=packet.byteLength;this.bytesSent+=packet.byteLength;
  }
  if(transfer.next===transfer.packets.length){this.rememberState(link,transfer.frame,transfer.baseline,now);link.transfer=undefined;}
 }
 private flushEffects(link:Link){
  if(link.sentEpoch!==this.epoch||link.state?.readyState!=='open')return;
  while(link.events.length&&link.state.bufferedAmount<16000){
   const events=link.events.slice(0,24),message=JSON.stringify({type:'effects',epoch:this.epoch,events});
   try{link.state.send(message);}catch{return;}link.events.splice(0,events.length);this.bytesSent+=new TextEncoder().encode(message).length;
  }
 }
 broadcast(){
  const snapshot=this.snapshot();if(!snapshot)return;const frame=++this.sequence,now=performance.now();
  for(const link of this.links.values())if(link.state?.readyState==='open'){
   if(link.sentEpoch!==this.epoch){
    if(link.eventEpoch!==this.epoch){link.events=[];link.eventEpoch=this.epoch;}link.baselines.clear();link.ackFrame=0;link.transfer=undefined;
   }else link.eventEpoch=this.epoch;
   link.events.push(...this.pendingEffects);if(link.events.length>1024)link.events.splice(0,link.events.length-1024);
   this.flushEffects(link);
   const lifecycle=link.sentEpoch!==this.epoch||!this.running&&!this.prelobby;
   if(lifecycle)link.transfer=undefined;
   else if(link.transfer){this.drainState(link,now);continue;}
   const channel=lifecycle?link.state:link.updates;if(channel?.readyState!=='open')continue;
   this.refillStateBudget(link,now);if(!lifecycle&&channel.bufferedAmount>8000)continue;
   const base=lifecycle?0:link.ackFrame,baseline=base?link.baselines.get(base):undefined;
   let packets:ArrayBuffer[];
   try{packets=fragmentState(encodeState(snapshot,frame,base,baseline),frame);}catch(error){this.onError(`World update could not be encoded: ${error instanceof Error?error.message:String(error)}`);continue;}
   const size=packets.reduce((total,p)=>total+p.byteLength,0);
   // Small unsent updates are replaced by current state on the next broadcast.
   if(!lifecycle&&size<=STATE_BURST_BYTES&&link.tokens<size)continue;
   const nextBaseline=snapshotBaseline(snapshot);
   if(!lifecycle){link.transfer={frame,epoch:this.epoch,packets,next:0,baseline:nextBaseline,at:now,size};
    // The receiver can finish before the trailing XOR repair packet is sent.
    // Cache the immutable candidate now; only its ACK makes it a delta base.
    this.cacheStateBaseline(link,frame,nextBaseline);this.drainState(link,now);continue;}
   try{for(const packet of packets)channel.send(packet);}catch{continue;}
   link.tokens-=size;this.bytesSent+=size;link.sentEpoch=this.epoch;this.rememberState(link,frame,nextBaseline,now);this.flushEffects(link);
  }
  this.pendingEffects=[];
 }
 private drop(id:string){if(this.prelobby)this.cancelDescent();if(this.courtyard){delete this.courtyard.kicks[id];delete this.courtyard.skull.lastContact[id];}const l=this.links.get(id);if(!l)return;this.links.delete(id);this.clearSkin(id);clearTimeout(l.timer);if(l.disconnectTimer)clearTimeout(l.disconnectTimer);l.replay?.reset();l.pc.close();this.inputs.delete(id);this.inputBuffers.delete(id);this.commands.delete(id);this.inputTimes.delete(id);this.members=this.members.filter(p=>p.id!==id);const p=this.world?.crew.find(p=>p.id===id);if(p){if(this.running){p.alive=false;p.cause='DISCONNECTED';p.respawnAt=null;}else if(this.world)this.world.crew=this.world.crew.filter(p=>p.id!==id);}if(!this.closed)this.updateLobby();this.onChange();}
 close(){this.resetReplay();this.announce(true);this.closed=true;clearInterval(this.networkTimer);if(this.heartbeat)clearInterval(this.heartbeat);if(this.joinTimer)clearInterval(this.joinTimer);this.mqtt.close();this.earlyIce.clear();for(const id of [...this.links.keys()])this.drop(id);}
}
export function applySnapshot(w:World,s:ArenaSnapshot,localId:string){s=structuredClone(s);Object.assign(w,{courtyard:s.courtyard,time:s.time,tick:s.tick,state:s.state,cause:s.cause,radius:s.radius,wave:s.wave,level:s.level,reserve:s.reserve,stats:s.stats,enemies:s.enemies,projectiles:s.projectiles,gems:s.gems,rings:s.rings});w.crew=[];for(const p of s.crew){w.addCrew(p.id);Object.assign(w.crew[w.crew.length-1],p,{input:{...idleInput(),yaw:p.yaw,pitch:p.pitch??0,fire:p.primary.wasHeld,homing:p.secondary.wasHeld,...(s.prelobby?{leftArm:p.leftArm===true,rightArm:p.rightArm===true}:{})}});}const local=w.crew.find(p=>p.id===localId);if(local)w.selectCrew(localId);}
