import {CrewLeaderboardUI} from './crew-leaderboard-ui';
import {LEVIATHAN_HOVER_HEIGHT} from './enemy-presentation';
import {towerGameplayEntrancePose} from './tower-spawn';
import {downloadCrewReplay} from './crew-replay-sharing';
import {CrewReplayViewer} from './crew-replay-viewer';
import {ReplayControlsVisibility} from './replay-controls-visibility';
import {validateCrewReplay,type RecordedCrewRun} from './crew-replay';
import {setupPwa} from './pwa';
import {version as gameVersion} from '../package.json';
import {ENTRANCE_SPAWN,ENTRANCE_SEAL,touchesEntranceSeal} from './entrance-layout';
import {MobileControls} from './mobile-controls';
import {fullscreenElement,fullscreenAvailable,enterFullscreen,exitFullscreen,fullscreenEvents,setupFullscreenMenu} from './fullscreen';
import {gameViewport,gamePoint} from './game-viewport';
import {nearbyThreats} from './threat-cues';
import { keyboardMovement, controllerState, type ControlScheme } from './controls';
import '@fontsource/pirata-one/latin-400.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './style.css';
import './iron-ui.css';
import './mobile.css';
import './hud.css';
import './death-analysis.css';
import './champion.css';
import './menu-polish.css';
import {setupWindowCloseButtons} from './window-close';
import {CrownOfTheAbyss, crownBadge} from './champion';
import {encodeReplay,decodeReplay,MAX_DECODED_BYTES} from './replay-file';
import {shareReplay,ownReplays,removeSharedReplay,replayLink,linkedReplay,downloadReplay,retainPendingReplay,pendingReplay,clearPendingReplay} from './replay-sharing';
import {DeathHistory,type DeathAnalysis,killerName} from './death-analysis';
import {leaderboardConfigured,loadLeaderboard,loadOwnScore,publishCandidate,scoreCandidate,eligibleForLeaderboard} from './leaderboard';
import {ScoreQueue,cleanNickname,type PendingScore,type OwnScore} from './score-queue';
import { LobbyBrowser, type PublicLobby } from './lobbies';
import { FriendsSession, type ArenaSnapshot } from './multiplayer';
import {CrewClock} from './crew-clock';
import { GameRenderer } from './renderer';
import {SpectatorCamera} from './spectator';
const spectator=new SpectatorCamera();
import { Sound } from './audio';
import { Music } from './music';
import {MenuAudio,setupMenuAudio} from './menu-audio';
import {RunRecorder,ReplayPlayer,createRun,listRuns,saveRun,DEFAULT_SETUP,type RunSetup,type RecordedRun} from './replay';
import {ENEMY_KINDS,isPede,isSpider} from './enemy-kinds';
import { World, STEP, idleInput, TIMELINE, type Input } from './simulation';
const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
$('game-version').textContent=`v${gameVersion}`;
type Settings={sensitivity:number;mobileSensitivity:number;fov:number;volume:number;musicVolume:number;quality:string;skyMotion:'full'|'reduced';mist:boolean;threatCues:boolean;controlScheme:ControlScheme;controllerSensitivity:number;controllerDeadzone:number};
const touchDevice=navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches;
const mobileControls=new MobileControls();let mobileFullscreen=false,mobileOrientationLocked=false;
const defaults:Settings={sensitivity:1,mobileSensitivity:1,fov:90,volume:55,musicVolume:55,quality:touchDevice?'low':'high',skyMotion:matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced':'full',mist:true,threatCues:false,controlScheme:touchDevice?'mobile':'qwerty',controllerSensitivity:1,controllerDeadzone:.15};
function readStore<T>(key:string,fallback:T):T {try {const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function saveStore(key:string,value:unknown) {try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Play remains available with storage disabled. */}}
let settings={...defaults,...readStore<Partial<Settings>>('abyss-settings',{})};
settings.sensitivity=Math.max(.3,Math.min(3,Number(settings.sensitivity)||1));settings.fov=Math.max(75,Math.min(145,Number(settings.fov)||95));settings.volume=Math.max(0,Math.min(100,Number(settings.volume)||0));settings.quality=settings.quality==='low'?'low':'high';
settings.mobileSensitivity=Math.max(.3,Math.min(3,Number(settings.mobileSensitivity)||1));
settings.skyMotion=settings.skyMotion==='reduced'?'reduced':'full';
settings.mist=settings.mist!==false;
settings.musicVolume=Math.max(0,Math.min(100,Number(settings.musicVolume)||0));
settings.controlScheme=['qwerty','azerty','controller','mobile'].includes(settings.controlScheme)?settings.controlScheme:'qwerty';
settings.controllerSensitivity=Math.max(.3,Math.min(3,Number(settings.controllerSensitivity)||1));settings.controllerDeadzone=Math.max(.05,Math.min(.4,Number(settings.controllerDeadzone)||.15));
document.body.dataset.controls=settings.controlScheme;document.body.dataset.skyMotion=settings.skyMotion;
let best=Math.max(0,Number(readStore('abyss-survival-v3-best',0))||0);
let renderer:GameRenderer;const sound=new Sound();sound.setVolume(settings.volume/100);const music=new Music();music.setVolume(settings.musicVolume/100);const menuAudio=new MenuAudio();menuAudio.setVolume(settings.volume/100);
let entrance=false;let entranceRun:{seed:number;setup:RunSetup}|null=null;
const deathHistory=new DeathHistory();let deathAnalysis:DeathAnalysis|null=null;let analysisActive=false;let analysisSuspended=false;
let crewViewer:CrewReplayViewer;let crewReplayRequest=0;let crewReplayDownloading=false;
let mode:'menu'|'playing'|'paused'|'dead'|'replay'|'crew-replay'='menu';let world:World|null=null;let yaw=0,pitch=0;let input:Input=idleInput();let accumulator=0,last=performance.now(),hudTime=0;let settingsOpen=false;let noticeUntil=0,noticeText='';const keys=new Set<string>();const pressedKeys=new Map<string,string>();
type PlayerProfile={name:string;automatic:boolean;configured:boolean};
const savedProfile=readStore<Partial<PlayerProfile>|null>('abyss-player-profile',{})??{};
const savedName=typeof savedProfile.name==='string'?savedProfile.name:readStore<unknown>('abyss-player-name','');
let profile:PlayerProfile={name:typeof savedName==='string'?savedName:'',automatic:savedProfile.automatic===true,configured:savedProfile.configured===true||(typeof savedName==='string'&&savedName.trim().length>0)};
let runNickname='',runAutomatic=false,profileOpen=false,profileAction:'start'|'edit'|'publish'='edit';
let crewBoard:CrewLeaderboardUI;
let leaderboardOpen=false,leaderboardScores:Awaited<ReturnType<typeof loadLeaderboard>>=[],ownScore:OwnScore|null=null;
const crown=new CrownOfTheAbyss();
let rankingRequest:Promise<void>|null=null;
const scoreQueue=new ScoreQueue(pending=>saveStore('abyss-pending-score',pending),publishCandidate,readStore<PendingScore|null>('abyss-pending-score',null));
let recorder:RunRecorder|null=null,replay:ReplayPlayer|null=null,lastRun:RecordedRun|null=null;let practice=false,historyOpen=false,replayPaused=false;
let friends:FriendsSession|null=null;let friendsOpen=false;const lobbyBrowser=new LobbyBrowser();let lobbyStarted=false;let lobbyCrewCount=1;let receivedEpoch=-1;
const hostClock=new CrewClock();let hostClockWorker:Worker|null=null;
const buttonEdges:{button:'fire'|'homing'|'jump';held:boolean}[]=[];let sampledFire=false,sampledHoming=false,sampledJump=false;let capturingMouse=false,captureTicket=0;
let previousPad:ReturnType<typeof controllerState>|null=null;let activePadIndex:number|null=null;let padFire=false,padHoming=false,padJump=false;
let waitingForController=false;
let movement={forward:0,strafe:0,jump:false},controllerDown=false,controllerFast=false;
let blockedPadJump=true,blockedPadFire=true,blockedPadHoming=true;
const format=(time:number)=>time.toFixed(3);
const replayControlsVisibility=new ReplayControlsVisibility(()=>mode,()=>settings.controlScheme==='mobile');
function updateBest() {$('best-menu').innerHTML=best?`${format(best)} <span>SECONDS</span>`:'— <span>SECONDS</span>';$('best-hud').textContent=format(best);}
function showPanels() {document.body.dataset.crewCourtyard=String(!!friends?.prelobby);const previousMode=document.body.dataset.gameMode;document.body.dataset.gameMode=mode;if(previousMode==='menu'&&mode==='playing'&&entrance){const threshold=$('menu-threshold');threshold.classList.remove('is-crossing');void threshold.offsetWidth;threshold.classList.add('is-crossing');}updateConnectionMeter();if(!friends||mode!=='playing')$('respawn-status').hidden=true;music.setScene(analysisActive?'silent':entrance?'entrance':mode==='menu'||mode==='paused'||mode==='dead'?'menu':'silent');$<HTMLButtonElement>('timer').disabled=!!friends||settings.controlScheme!=='mobile'||mode!=='playing';$('player-profile').hidden=!profileOpen;$('leaderboard').hidden=!leaderboardOpen;$('friends').hidden=!friendsOpen;$('crew-hud').hidden=!friends||mode==='menu';$('crew-lobby-controls').hidden=!friends||friends.running||mode==='menu';$('menu').hidden=mode!=='menu';crown.showCoronation(mode==='menu'&&!profileOpen&&!leaderboardOpen&&!friendsOpen&&!settingsOpen&&!historyOpen);$('hud').hidden=mode==='menu'||(entrance&&settings.controlScheme!=='mobile');$('replay-controls').hidden=mode!=='replay';$('history').hidden=!historyOpen;$('pause').hidden=mode!=='paused'||settingsOpen||friendsOpen;$('death').hidden=mode!=='dead'||settingsOpen||analysisActive;$('death-analysis').hidden=!analysisActive;$('hud').hidden=analysisActive||$('hud').hidden;$('settings').hidden=!settingsOpen;if(mode==='crew-replay'){$('hud').hidden=true;$('crew-hud').hidden=true;$('connection-meter').hidden=true;}replayControlsVisibility.sync();updateCrewReplayActions();document.querySelectorAll('.controller-focus').forEach(el=>{if(!(el as HTMLElement).getClientRects().length)el.classList.remove('controller-focus');});}
function crewRespawnStatus(player:World['crew'][number],time:number){
  if(player.respawnAt===null)return player.cause||'DEAD';
  const remaining=player.respawnAt-time;
  return remaining>1e-7?`RESPAWNING IN ${Math.max(1,Math.ceil(remaining-1e-7))}s`:'Waiting for safe respawn…';
}
let spectatorLifeKey='';
function syncSpectator(){
  const local=friends&&world?.crew.find(p=>p.id===friends!.localId);
  // A crew wipe freezes the free camera at its last position. Keep using it
  // behind the results panel so the view cannot snap to a corpse or show a hand.
  const respawnStatus=$('respawn-status');
  const protectedRemaining=local?.alive&&world?Math.max(0,local.protectedUntil-world.time):0;
  respawnStatus.hidden=!local||world?.state!=='playing'||(local.alive?protectedRemaining<=0:local.respawnAt===null);
  respawnStatus.classList.toggle('is-invincible',protectedRemaining>0);
  respawnStatus.textContent=respawnStatus.hidden?'':protectedRemaining>0?`INVINCIBLE · ${protectedRemaining.toFixed(1)}s`:crewRespawnStatus(local!,world!.time);
  const lifeKey=local&&friends?`${friends.id}:${friends.epoch}:${local.life}`:'';
  if(local?.alive&&lifeKey!==spectatorLifeKey&&local.life>0){yaw=local.input.yaw;pitch=local.input.pitch;clearInput();notice('RESPAWNED · 3s INVINCIBILITY',3);}
  spectatorLifeKey=lifeKey;
  if(local&&!local.alive){if(!spectator.position){spectator.start(local.player.pos);clearInput();}}else spectator.reset();
}
function clearInput() {mobileControls.reset();buttonEdges.length=0;sampledFire=false;sampledHoming=false;sampledJump=false;padFire=false;padHoming=false;padJump=false;blockedPadJump=true;blockedPadFire=true;blockedPadHoming=true;movement={forward:0,strafe:0,jump:false};controllerDown=false;controllerFast=false;keys.clear();pressedKeys.clear();input=idleInput();input.yaw=yaw;input.pitch=pitch;}
function notice(text:string,seconds=2.5) {noticeText=text;noticeUntil=performance.now()+seconds*1000;}
async function captureMouse() {
  if(settings.controlScheme==='mobile'){void enterMobileFullscreen();return;}
  if(settings.controlScheme==='controller')return;
  const ticket=++captureTicket;capturingMouse=true;
  try {await $('game').requestPointerLock();}
  catch {if(ticket===captureTicket&&mode==='playing'){paused();notice(friends?'CLICK THE ARENA TO CAPTURE THE MOUSE':'CLICK RETURN TO CAPTURE THE MOUSE');}}
  finally {if(ticket===captureTicket)capturingMouse=false;}
}
function startRun(setup:RunSetup=DEFAULT_SETUP) {music.unlock();
 watchRequest++;
  if(!renderer.originalEnemies.ready||!renderer.originalWeapon.ready)return;
  const previewParams=new URLSearchParams(location.search),previewHand=Number(previewParams.get('hand-preview'));const devPreview=import.meta.env.DEV&&((previewHand>=1&&previewHand<=4)||ENEMY_KINDS.includes(previewParams.get('enemy-preview') as typeof ENEMY_KINDS[number]));
  if(!devPreview&&setup.time===0&&setup.level===1&&setup.reserve===0&&!profile.configured){openProfile('start');return;}
  waitingForController=false;runNickname=profile.name;runAutomatic=profile.automatic;lastRun=null;resetDeathAnalysis();
  renderer.clear();sound.clear();renderer.topDown=false;replay=null;const seed=crypto.getRandomValues(new Uint32Array(1))[0];world=createRun(seed,setup);recorder=new RunRecorder(seed,setup);practice=setup.time!==0||setup.level!==1||setup.reserve!==0;historyOpen=false;leaderboardOpen=false;
  if(import.meta.env.DEV){const preview=Number(new URLSearchParams(location.search).get('hand-preview'));if(preview>=1&&preview<=4){practice=true;world.level=preview;world.stats.collected=preview===1?0:preview===2?10:preview===3?70:200;world.reserve=preview===4?190:preview>=2?50:0;}}
  if(import.meta.env.DEV){const preview=new URLSearchParams(location.search).get('enemy-preview');const kinds=ENEMY_KINDS;if(kinds.includes(preview as typeof kinds[number])){practice=true;const kind=preview as typeof kinds[number];const y=kind==='leviathan'?LEVIATHAN_HOVER_HEIGHT:kind==='orb'?5:kind==='squid'?3.3:kind==='squid2'?5.2:kind==='squid3'?towerGameplayEntrancePose(kind,0).height:kind==='spider'?1.65:kind==='centipede'?3:1;world.player.pos.z=-14;const e=world.spawn(kind,{x:0,y,z:-26});e.age=kind==='spider2'?9.5:kind==='leviathan'?9:kind==='orb'?7:isSpider(kind)||isPede(kind)||kind==='thorn'?3.5:1.2;if(isSpider(kind))e.headExposure=1;if(kind.startsWith('squid')){e.phase=Math.PI;}}}
  entrance=!devPreview;entranceRun=entrance?{seed,setup:{...setup}}:null;
  if(entrance){world=new World(seed,{schedule:false});world.player.pos={...ENTRANCE_SPAWN};recorder=null;void sound.prepareEntrance(best);}
  yaw=0;pitch=import.meta.env.DEV&&new URLSearchParams(location.search).get('enemy-preview')==='leviathan'?.6:0;clearInput();(document.activeElement as HTMLElement|null)?.blur();mode='playing';accumulator=0;last=performance.now();settingsOpen=false;showPanels();if(!entrance)void sound.start();void captureMouse();if(!entrance){deathHistory.capture(world,yaw,pitch,true,input.fire||input.homing);notice('KEEP MOVING. RELEASE FIRE TO COLLECT.',4);}
}
function enterArena(){
  if(!entranceRun)return;const {seed,setup}=entranceRun;
  entrance=false;entranceRun=null;world=createRun(seed,setup);recorder=new RunRecorder(seed,setup);
  yaw=0;pitch=0;clearInput();deathHistory.reset();deathHistory.capture(world,yaw,pitch,true,input.fire||input.homing);renderer.clear();sound.clear();showPanels();void sound.collectDagger(best);notice('KEEP MOVING. RELEASE FIRE TO COLLECT.',4);
}
function resume() {music.unlock();if(!world||profileOpen||leaderboardOpen||historyOpen||friendsOpen)return;
  if(settings.controlScheme==='controller'&&!readControllers().pad){waitingForController=true;clearInput();return;}
  waitingForController=false;clearInput();(document.activeElement as HTMLElement|null)?.blur();mode='playing';settingsOpen=false;accumulator=0;last=performance.now();showPanels();if(entrance)void sound.prepareEntrance(best);else void sound.start();void captureMouse();}
function home() {crewReplayRequest++;crewReplayDownloading=false;crewViewer?.dispose();watchRequest++;stopHostClock();waitingForController=false;resetDeathAnalysis(true);entrance=false;entranceRun=null;leaveMobileFullscreen();spectator.reset();leaderboardOpen=false;friends?.close();friends=null;friendsOpen=false;replay=null;recorder=null;renderer.topDown=false;historyOpen=false;mode='menu';world=null;settingsOpen=false;clearInput();document.exitPointerLock?.();renderer.clear();sound.clear();sound.pause();updateBest();showPanels();}
function paused() {
  if(mode!=='playing')return;
  // Browser interruptions release held controls, but multiplayer never pauses.
  if(friends){friends.releaseControls();clearInput();if(friends.running)return;}
  waitingForController=false;mode='paused';accumulator=0;clearInput();document.exitPointerLock?.();sound.pause();showPanels();
}
function death() {
  if(!world)return;mode='dead';clearInput();document.exitPointerLock?.();
  const record=!friends&&!practice&&world.time>best;if(record){best=world.time;saveStore('abyss-survival-v3-best',best);}
  $('death-time').textContent=format(world.time);$('retry').hidden=!!friends&&friends.role==='guest';$('retry').innerHTML=friends?'RETURN TO LOBBY <span>↗</span>':'DEFY IT AGAIN <span>↗</span>';$('death-cause').textContent=friends?'The crew fell. '+(friends.role==='host'?'Return to the courtyard to start again.':'Waiting for the host to restart.'):world.deathSource?`Killed by ${killerName(world.deathSource.kind)}.`:world.cause==='FALLEN'?'Fell into the abyss.':`Taken by ${world.cause.toLowerCase()}.`;$('death-title').textContent=world.cause==='FALLEN'?'LOST BELOW.':'CONSUMED.';
  $('new-best').hidden=!record;$('stat-kills').textContent=String(world.stats.kills);$('stat-gems').textContent=String(world.stats.collected);$('stat-accuracy').textContent=`${Math.round(world.stats.hits/Math.max(1,world.stats.shots)*100)}%`;
  saveStore('abyss-last-run',{time:world.time,cause:world.cause,...world.stats});lastRun=friends?null:recorder?.finish(world)??null;$('watch-last').hidden=!lastRun;$('retry').hidden=!!friends&&friends.role==='guest';if(lastRun)void saveRun(lastRun).catch(()=>notice('REPLAY STORAGE UNAVAILABLE'));recorder=null;updateBest();showPanels();handleRunScore();
  if(!friends&&!entrance){deathHistory.capture(world,yaw,pitch,true,input.fire||input.homing);deathAnalysis=deathHistory.clip(world.deathSource);$('watch-death').hidden=!deathAnalysis;if(deathAnalysis)startDeathAnalysis();}else $('watch-death').hidden=true;
}
function resetDeathAnalysis(release=false){
 analysisActive=false;analysisSuspended=false;deathAnalysis=null;if(release)deathHistory.release();else deathHistory.reset();if(renderer)renderer.setDeathGhost(null);
}
function startDeathAnalysis(){
 if(!deathAnalysis||friends||mode!=='dead')return;
 deathAnalysis=deathHistory.clip(world?.deathSource??null);if(!deathAnalysis)return;
 analysisActive=true;analysisSuspended=false;accumulator=0;noticeUntil=0;renderer.topDown=false;renderer.clear();sound.stopLoops();
 $('analysis-killer').textContent=deathAnalysis.source?killerName(deathAnalysis.source.kind):'THE ABYSS';
 $('analysis-subtitle').textContent=deathAnalysis.source?'THE HUNT THAT ENDED YOUR RUN':'YOUR FINAL DESCENT';
 $('analysis-length').textContent=`LAST ${deathAnalysis.duration.toFixed(1)} SECONDS`;
 document.exitPointerLock?.();showPanels();updateDeathAnalysis();
}
function endDeathAnalysis(){if(!analysisActive)return;analysisActive=false;analysisSuspended=false;renderer.setDeathGhost(null);renderer.clear();showPanels();}
function updateDeathAnalysis(){
 const a=deathAnalysis;if(!a)return;
 $('analysis-countdown').textContent=a.impact?'IMPACT':`${a.remaining.toFixed(1)}s`;
 $('analysis-countdown-label').textContent=a.impact?(a.source?'LETHAL CONTACT':'LOST BELOW'):'UNTIL IMPACT';
 $('analysis-progress').style.transform=`scaleX(${a.duration>0?Math.min(1,a.elapsed/a.duration):1})`;
 $('death-analysis').classList.toggle('at-impact',a.impact);
 $('analysis-pause').textContent=analysisSuspended?'RESUME':'PAUSE';
 $('analysis-state').textContent=analysisSuspended?'PAUSED':a.impact?'FINAL MOMENT':'DEATH REPLAY';
}
let fpsStarted:number|null=null,fpsFrames=0,displayedFps:number|null=null;
function sampleFrameRate(now:number){
  if(document.hidden||mode!=='playing'){
    fpsStarted=null;fpsFrames=0;
    if(displayedFps!==null){displayedFps=null;$('fps-value').textContent='—';}
    return;
  }
  if(fpsStarted===null){fpsStarted=now;return;}
  fpsFrames++;
  const elapsed=now-fpsStarted;
  if(elapsed<500)return;
  const fps=Math.round(fpsFrames*10000/elapsed)/10;
  if(fps!==displayedFps){displayedFps=fps;$('fps-value').textContent=fps.toFixed(1);}
  fpsStarted=now;fpsFrames=0;
}
let meterSession:FriendsSession|null=null;
let meterQuality:'good'|'fair'|'poor'|null=null;
function updateConnectionMeter(){
  const meter=$('connection-meter');meter.hidden=mode==='menu'||mode==='replay';
  meter.dataset.multiplayer=String(!!friends);
  if(meterSession!==friends){meterSession=friends;meterQuality=null;}
  if(meter.hidden)return;
  if(!friends){
    delete meter.dataset.quality;
    const label=displayedFps!==null?`Rendering: ${displayedFps} frames per second.`:'Measuring frame rate.';
    meter.setAttribute('aria-label',label);meter.title=label;return;
  }
  const {state,rttMs}=friends.connection;
  // Keep the measured number live; hysteresis only steadies the colour near a boundary.
  if(state==='connected'&&rttMs!==null){
    meterQuality=meterQuality==='good'&&rttMs<=88?'good':meterQuality==='poor'&&rttMs>152?'poor':meterQuality==='fair'&&rttMs>72&&rttMs<=168?'fair':rttMs<=80?'good':rttMs<=160?'fair':'poor';
  }else{meterQuality=null;}
  const quality=meterQuality??state;
  meter.dataset.quality=quality;
  $('connection-context').textContent=friends.role==='host'?'CREW':'PING';
  $('connection-value').textContent=rttMs!==null?(rttMs>999?'999+':String(rttMs)):state==='hosting'?'HOST':state==='stalled'?'WAIT':state==='offline'?'LOST':'…';
  $('connection-unit').hidden=rttMs===null;
  const label=rttMs!==null?`${friends.role==='host'?'Slowest player':'Host'} round-trip latency: ${rttMs} milliseconds. ${quality==='good'?'Good':quality==='fair'?'Fair':'High latency'} connection.`:state==='hosting'?'Hosting. No other players connected.':state==='stalled'?'Connection stalled. Waiting for replies.':state==='offline'?'Connection lost.':'Measuring connection latency.';
  const description=label+(displayedFps!==null?` Rendering: ${displayedFps} frames per second.`:'');
  meter.setAttribute('aria-label',description);meter.title=description;
}
const threatMarkers:HTMLElement[]=[];
function updateHud() {
  updateConnectionMeter();
  if(!world)return;const w=world;
  $('timer').textContent=format(w.time);$('gems').textContent=String(w.stats.collected);$('kills').textContent=String(w.stats.kills);
  $('level').textContent=['I','II','III','IV'][w.level-1];$('power-name').textContent=['AWAKENED','KINDLED','ASCENDANT','UNBOUND'][w.level-1];
  const progress=w.level===1?w.stats.collected/10:w.level===2?(w.stats.collected-10)/60:w.level===3?w.finalHandProgress:1;
  $('progress').style.width=`${Math.min(100,progress*100)}%`;
  $('homing').textContent=String(w.reserve);$('homing-ammo').setAttribute('aria-label',w.homingUnlocked?`${w.reserve} homing daggers remaining`:`Homing unlocks at ${w.homingUnlockGems} collected gems`);
  $('collection').textContent=spectator.position?'SPECTATING · FREE FLIGHT':input.fire||input.homing?'FIRING · GEMS DRIFT AWAY':w.gems.length?'CALLING GEMS':'RELEASE FIRE TO CALL GEMS';
  $('collection').style.color=input.fire||input.homing?'var(--muted)':'var(--bone)';
  $('phase').textContent=spectator.position?'SPECTATING':friends?'FRIENDS':mode==='replay'?'REPLAY':practice?'PRACTICE':w.wave>=0?`WAVE ${w.wave+1}`:'SURVIVAL';
  $('notice').textContent=noticeText;$('notice').style.opacity=performance.now()<noticeUntil?'1':'0';
  const ring=$('threat-ring');
  if(settings.threatCues&&!spectator.position) {
    const threats=nearbyThreats(w,yaw),viewport=gameViewport(),radius=Math.min(viewport.width,viewport.height)*.32;
    for(let i=0;i<threats.length;i++) {
      const {angle,distance:dist,family}=threats[i];
      let element=threatMarkers[i];
      if(!element){element=document.createElement('i');element.className='threat';threatMarkers.push(element);}
      if(element.dataset.family!==family)element.dataset.family=family;
      element.style.transform=`translate(${Math.sin(angle)*radius}px,${-Math.cos(angle)*radius}px) rotate(${angle}rad)`;element.style.opacity=String(Math.max(.2,1-dist/10));
      if(element.parentElement!==ring)ring.append(element);
    }
    for(let i=threats.length;i<threatMarkers.length;i++)if(threatMarkers[i].parentElement===ring)threatMarkers[i].remove();
  }else if(ring.childElementCount)ring.replaceChildren();
  const next=settings.threatCues&&!spectator.position?TIMELINE.find(e=>e.time>w.time&&e.time-w.time<1.5):undefined;
  if(next&&performance.now()>noticeUntil)notice(next.kind==='spider'?'A REAPER STIRS':isPede(next.kind)?'SOMETHING MOVES BELOW':'A SUMMONER APPROACHES',1);
}
function stopHostClock(){hostClockWorker?.terminate();hostClockWorker=null;hostClock.reset();}
function advanceHost(now:number){
 if(friends?.role!=='host'||!world||world.state!=='playing')return;
 hostClock.advance(now,()=>{
  const active=!document.hidden&&mode==='playing'&&!controlMenuRoot()&&!spectator.position;
  const move=settings.controlScheme==='qwerty'||settings.controlScheme==='azerty'?keyboardMovement(keys,settings.controlScheme):movement;
  if(active&&Date.now()>=friends!.startAt){const edge=buttonEdges.shift();if(edge){if(edge.button==='fire')sampledFire=edge.held;else if(edge.button==='homing')sampledHoming=edge.held;else sampledJump=edge.held;}}
  input={forward:active?move.forward:0,strafe:active?move.strafe:0,yaw,pitch,jump:active&&sampledJump,fire:active&&sampledFire,homing:active&&sampledHoming};
  friends!.step({...input});syncSpectator();
 });
 // Network effects have already been captured by FriendsSession.step. Avoid
 // retaining a particle/audio backlog while the host has no rendered frames.
 if(document.hidden)world.effects=[];
}
function startHostClock(){
 stopHostClock();hostClock.advance(performance.now(),()=>{});
 const worker=new Worker(new URL('./crew-clock-worker.ts',import.meta.url),{type:'module'});hostClockWorker=worker;
 worker.onmessage=()=>{if(hostClockWorker!==worker)return;advanceHost(performance.now());worker.postMessage(null);};
}
function frame(now:number) {
  sampleFrameRate(now);
  const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(.05,elapsed);last=now;
  music.update(dt);
  pollController(dt);
  if(mode==='crew-replay'){crewViewer.frame(elapsed);requestAnimationFrame(frame);return;}
  if(settings.controlScheme==='mobile')sampleMobileInput();
  else if(settings.controlScheme!=='controller')movement=keyboardMovement(keys,settings.controlScheme);
  if(mode==='playing'&&!settingsOpen)renderer.trackFrame(elapsed);
  if(!friends&&mode==='playing'&&world&&!controlMenuRoot()) {
    input.forward=movement.forward;input.strafe=movement.strafe;input.jump=movement.jump;input.yaw=yaw;input.pitch=pitch;
    accumulator+=Math.min(.1,elapsed);let steps=0;
    while(accumulator>=STEP&&world.state==='playing'&&steps++<12) {const edge=buttonEdges.shift();if(edge){if(edge.button==='fire')sampledFire=edge.held;else if(edge.button==='homing')sampledHoming=edge.held;else sampledJump=edge.held;}input.fire=sampledFire;input.homing=sampledHoming;input.jump=sampledJump;if(entrance){world.stepEntrance(input);if(touchesEntranceSeal(world.player.pos,world.previousPlayerPosition))enterArena();}else{recorder?.record(input);world.step(input);deathHistory.capture(world,yaw,pitch,false,input.fire||input.homing);}accumulator-=STEP;}
    sound.listener(world.player.pos,yaw,pitch);
    for(const effect of world.effects) {renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);if(effect.kind==='upgrade')notice(`ATTUNEMENT ${['','I','II','III','IV'][effect.amount||1]} · ${effect.amount===(world.homingUnlockGems===10?2:3)?'HOMING UNLOCKED':'POWER RISES'}`,3);if(effect.kind==='death'){$('flash').style.opacity='1';setTimeout(()=>$('flash').style.opacity='0',170);}}
    world.effects=[];
    if(entrance)sound.entrance(best,ENTRANCE_SEAL);else sound.update(world);
    if(world.state==='dead')death();
  }
  if(friends&&world){
    syncSpectator();
    const cameraActive=mode==='playing'&&!controlMenuRoot();
    if(cameraActive&&spectator.position)spectator.move(dt,yaw,pitch,movement.forward,movement.strafe,(movement.jump||keys.has('e')?1:0)-(controllerDown||keys.has('ControlLeft')||keys.has('ControlRight')||(settings.controlScheme==='qwerty'&&keys.has('q'))?1:0),controllerFast||keys.has('ShiftLeft')||keys.has('ShiftRight'));
    const active=cameraActive&&!spectator.position;input.forward=active?movement.forward:0;input.strafe=active?movement.strafe:0;input.jump=active&&movement.jump;input.yaw=yaw;input.pitch=pitch;
    input.fire=active&&sampledFire;input.homing=active&&sampledHoming;
    if(friends.role==='host')advanceHost(now);
    else {
     accumulator+=Math.min(.1,elapsed);let crewSteps=0;
     while(accumulator>=STEP&&world.state==='playing'&&crewSteps++<12){
      const edge=active&&Date.now()>=friends.startAt?buttonEdges[0]:undefined;
      const fire=edge?.button==='fire'?edge.held:sampledFire,homing=edge?.button==='homing'?edge.held:sampledHoming,jump=edge?.button==='jump'?edge.held:sampledJump;
      input.fire=active&&fire;input.homing=active&&homing;input.jump=active&&jump;
      if(active&&friends.predict(world,{...input})&&edge){buttonEdges.shift();sampledFire=fire;sampledHoming=homing;sampledJump=jump;}
      syncSpectator();accumulator-=STEP;
     }
    }
    if(friends.role==='host')world.selectCrew('host');
    for(const effect of world.effects){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}world.effects=[];
    syncSpectator();
    sound.listener(spectator.position??world.player.pos,yaw,pitch);if(cameraActive){if(entrance)sound.entrance(best,ENTRANCE_SEAL);else sound.update(world);}
    if(Date.now()<friends.startAt)notice(`CREW READY · STARTING IN ${Math.max(1,Math.ceil((friends.startAt-Date.now())/1000))}`,1);
    $('crew-hud').textContent=(entrance?`CREW COURTYARD · ${world.crew.length} PLAYERS\nENTER THE SEAL TO START EVERYONE\n`:`FRIENDS · ${world.crew.length}/4 · ${friends.role==='host'?'HOST':'GUEST'}\n`)+world.crew.map((p,i)=>`${i+1}. ${p.id===friends!.localId?'YOU':friends!.members.find(m=>m.id===p.id)?.name??'FRIEND '+(i+1)} · ${p.alive?(entrance?'IN COURTYARD':'ALIVE'):p.cause==='DISCONNECTED'?'DISCONNECTED':world!.state==='playing'&&p.respawnAt!==null?crewRespawnStatus(p,world!.time):p.cause||'DEAD'}`).join('\n');
    const local=world.crew.find(p=>p.id===friends!.localId);if(local&&!local.alive&&world.state==='playing'){$('crew-hud').textContent+=settings.controlScheme==='mobile'?'\nSPECTATING':settings.controlScheme==='controller'?'\nSPECTATING · Left stick fly · Right stick look\nA / Cross up · LB / L1 down · L3 faster':`\nSPECTATING · ${settings.controlScheme==='azerty'?'ZQSD':'WASD'} fly · Mouse look\nSpace / E up · Ctrl down · Shift faster`;}
    if(friends.waitingForHost){$('crew-hud').textContent+='\nWaiting for host connection…';friends.releaseControls();clearInput();}
    if(world.state==='dead'&&mode!=='dead')death();
  }
  if(mode==='replay'&&replay){if(!replayPaused){accumulator+=Math.min(.1,elapsed);let steps=0;while(accumulator>=STEP&&!replay.done&&steps++<12){const view=replay.input;if(view){yaw=view.yaw;pitch=view.pitch;input={...view};}replay.step();accumulator-=STEP;}if(replay.done){replayPaused=true;sound.stopLoops();$('replay-pause').textContent='PLAY';}}world=replay.world;yaw=replay.lastInput.yaw;pitch=replay.lastInput.pitch;sound.listener(world.player.pos,yaw,pitch);if(!replayPaused)sound.update(world);for(const effect of world.effects){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}world.effects=[];$<HTMLInputElement>('replay-seek').value=String(replay.tick);$('replay-time').textContent=`${format(world.time)} / ${format(replay.run.time)}`;}
  hudTime+=dt;if(hudTime>.05&&world){updateHud();hudTime=0;}
  // Pointer-lock release can remove document focus while the replay is still
  // visible. Only visibility and explicit pause/menu state stop its clock.
  if(analysisActive&&deathAnalysis){if(!analysisSuspended&&!document.hidden&&!settingsOpen&&!profileOpen&&!leaderboardOpen)deathAnalysis.advance(dt);if(deathAnalysis.done)endDeathAnalysis();else updateDeathAnalysis();}
  renderer.setCrewNames(friends?.members??[]);
  // Frozen views show the completed tick; guests already have a sampled network view.
  const renderAlpha=friends?.role==='guest'||world?.state==='dead'||(!friends&&(mode==='paused'||settingsOpen))||(mode==='replay'&&replayPaused)?1:friends?.role==='host'?hostClock.alpha:Math.min(1,accumulator/STEP);
  const analysis=analysisActive?deathAnalysis:null;
  renderer.setDeathGhost(analysis?.view.player.pos??null,analysis?.victimYaw,analysis?.impact,analysis?Math.max(0,analysis.elapsed-analysis.duration):0,analysis?.end);
  renderer.render(analysis?.view??(world&&friends?friends.presentation(world,now):world),analysis?.camera.yaw??yaw,analysis?.camera.pitch??pitch,analysis?dt:friends?dt:(mode==='paused'||settingsOpen)?0:dt,mode==='menu',analysis?1:renderAlpha,analysis?.camera.position??spectator.position,friends?.role==='guest',entrance,analysis?{...idleInput(),yaw:analysis.victimYaw,pitch:analysis.victimPitch,fire:analysis.victimFiring}:mode==='replay'?replay?.lastInput:null);
  if(analysis){const marker=renderer.projectDeathMarker(analysis.killerPosition,analysis.killerVisible);$('analysis-marker').hidden=!marker.visible;$('analysis-marker').style.left=`${marker.x}%`;$('analysis-marker').style.top=`${marker.y}%`;}
  requestAnimationFrame(frame);
}
function setupCrewReplayActions(){
 const actions=document.createElement('div');actions.id='crew-replay-results';actions.className='death-secondary';actions.hidden=true;
 for(const [id,label,seconds]of [['watch-team-replay','WATCH TEAM REPLAY',0],['watch-team-final','WATCH FINAL MOMENTS · 10s',10]] as const){const button=document.createElement('button');button.id=id;button.className='secondary';button.textContent=label;button.onclick=()=>void watchTeamReplay(seconds);actions.append(button);}
 const status=document.createElement('p');status.id='crew-replay-download-status';status.setAttribute('role','status');actions.append(status);$('death').querySelector('.death-secondary')!.before(actions);
}
function updateCrewReplayActions(){
 const actions=document.getElementById('crew-replay-results');if(!actions)return;actions.hidden=!friends||mode!=='dead';
 if(friends?.role==='guest'&&mode==='dead'){for(const id of ['watch-team-replay','watch-team-final'])$<HTMLButtonElement>(id).disabled=crewReplayDownloading||(!friends.connected&&!friends.completedReplay);}
 if(friends?.role==='host'&&mode==='dead'){const available=!!friends.completedReplay;for(const id of ['watch-team-replay','watch-team-final'])$<HTMLButtonElement>(id).disabled=!available;$('crew-replay-download-status').textContent=available?'Full authoritative crew replay · each player watches independently.':friends.replayError||'Team replay unavailable.';}
}
async function watchTeamReplay(seconds=0){
 const session=friends;if(!session||mode!=='dead')return;const request=++crewReplayRequest;crewReplayDownloading=true;
 for(const id of ['watch-team-replay','watch-team-final'])$<HTMLButtonElement>(id).disabled=true;$('crew-replay-download-status').textContent='Preparing team replay…';
 try{const run=await session.requestReplay();if(request!==crewReplayRequest||friends!==session||mode!=='dead')return;crewReplayDownloading=false;watchCrewRun(run,seconds?Math.max(0,run.ticks-seconds/STEP):0);}catch(error){if(request===crewReplayRequest&&friends===session&&mode==='dead')$('crew-replay-download-status').textContent=error instanceof Error?error.message:'Could not load team replay. Try again.';}finally{if(request===crewReplayRequest&&friends===session){crewReplayDownloading=false;for(const id of ['watch-team-replay','watch-team-final'])$<HTMLButtonElement>(id).disabled=false;}}
}
/** Shared entry point for post-wipe and leaderboard playback. Completion does not publish a score. */
export function watchCrewRun(run:RecordedCrewRun,startTick=0,onExit?:()=>void){
 if(friends&&world?.state==='playing')throw Error('Finish the crew run before watching a replay.');
 validateCrewReplay(run);const previousMode=mode,previousLeaderboard=leaderboardOpen;crewReplayRequest++;stopHostClock();resetDeathAnalysis(true);clearInput();document.exitPointerLock?.();settingsOpen=false;historyOpen=false;leaderboardOpen=false;friendsOpen=false;
 crewViewer.open(run,friends?.localId??'',startTick,()=>{clearInput();renderer.clear();sound.clear();mode=previousMode==='dead'?'dead':'menu';leaderboardOpen=previousLeaderboard;showPanels();if(friends?.role==='guest'&&!friends.connected&&mode==='dead')$('death-cause').textContent='The host left. Your run has ended. Return to the altar to join another crew.';onExit?.();});mode='crew-replay';showPanels();
}
function watchRun(run:RecordedRun){
 if(friends){notice('Leave the crew before watching a replay.');return;}
 watchRequest++;leaderboardOpen=false;friendsOpen=false;clearInput();
 resetDeathAnalysis();
 entrance=false;entranceRun=null;
 try{renderer.clear();replay=new ReplayPlayer(run);world=replay.world;recorder=null;mode='replay';historyOpen=false;settingsOpen=false;replayPaused=false;accumulator=0;renderer.topDown=false;document.exitPointerLock?.();sound.clear();void sound.start();const slider=$<HTMLInputElement>('replay-seek');slider.max=String(run.ticks);slider.value='0';$('replay-pause').textContent='PAUSE';showPanels();}catch(error){notice(error instanceof Error?error.message:'REPLAY UNAVAILABLE');}
}
let watchRequest=0,replayUploadBusy=false,replayUploadError='',replayRetryAt=0;
async function watchShared(id:string,button:HTMLButtonElement){
 if(friends){notice('Leave the crew before watching a replay.');return;}
 const request=++watchRequest;button.disabled=true;const label=button.textContent;button.textContent='LOADING…';
 try{try{const run=await downloadReplay(id);if(request===watchRequest&&!friends)watchRun(run);}catch(soloError){try{const run=await downloadCrewReplay(id);if(request===watchRequest&&!friends){watchCrewRun(run);$('crew-replay-exit').textContent='BACK TO MENU';}}catch{throw soloError;}}}catch(error){notice(error instanceof Error?error.message:'REPLAY UNAVAILABLE',6);}finally{button.disabled=false;button.textContent=label;}
}
function showShareLink(id:string){const link=$<HTMLInputElement>('replay-share-link');link.value=replayLink(id);link.hidden=false;link.focus();link.select();void navigator.clipboard?.writeText(link.value).then(()=>{$('history-status').textContent='Replay link copied. Anyone with the link can watch.';}).catch(()=>{$('history-status').textContent='Copy the replay link below.';});}
async function exportReplay(run:RecordedRun){
 try{const blob=await encodeReplay(run,MAX_DECODED_BYTES),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`abyss-${run.id}.abyss.gz`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){$('history-status').textContent=error instanceof Error?error.message:'Could not export replay.';}
}
function replayStatus(){
 $('replay-publish-status').textContent=replayUploadBusy?'Uploading compressed replay…':replayUploadError||'';
 $<HTMLButtonElement>('replay-upload-retry').hidden=!replayUploadError;$<HTMLButtonElement>('replay-upload-retry').disabled=replayUploadBusy;
}
async function queueScoreRun(run:RecordedRun,name:string){
 try{await retainPendingReplay(run,name);}catch{replayUploadError='Your score can save, but replay storage is unavailable in this browser.';replayStatus();}
 scoreQueue.enqueue(scoreCandidate(run),name);await scoreQueue.flush();void uploadPendingBest(true);
}
async function uploadPendingBest(manual=false){
 if(replayUploadBusy||(!manual&&Date.now()<replayRetryAt))return;replayUploadBusy=true;
 try{const pending=await pendingReplay(),confirmed=scoreQueue.confirmed;if(!pending||!confirmed)return;
  const ms=Math.round(pending.run.time*1000);if(confirmed.survival_ms>ms){await clearPendingReplay(pending.run.id);return;}if(confirmed.survival_ms!==ms)return;
  replayUploadError='';replayStatus();await shareReplay(pending.run,pending.name,true);await clearPendingReplay(pending.run.id);replayUploadError='';
  $('replay-publish-status').textContent='Leaderboard replay saved ✓';if(leaderboardOpen)void openLeaderboard();
 }catch(error){replayUploadError=error instanceof Error?error.message:'Replay upload failed. Your score is saved.';replayRetryAt=Date.now()+60000;
 }finally{replayUploadBusy=false;if(replayUploadError)replayStatus();else $<HTMLButtonElement>('replay-upload-retry').hidden=true;}
}
async function openHistory(){
 historyOpen=true;showPanels();const list=$('history-list');list.replaceChildren();$('history-status').textContent='';
 let shared:Awaited<ReturnType<typeof ownReplays>>=[];try{if(leaderboardConfigured())shared=await ownReplays();}catch(error){$('history-status').textContent=error instanceof Error?error.message:'Shared replays unavailable.';}
 try{const runs=await listRuns();if(!runs.length)list.textContent='Your completed runs will appear here.';
 for(const run of runs){const row=document.createElement('div');row.className='history-row';const title=document.createElement('span');title.textContent=`${format(run.time)} s · ${run.practice?'PRACTICE':run.cause} · ${run.stats.collected} gems`;
 const watch=document.createElement('button');watch.textContent='WATCH';watch.onclick=()=>watchRun(run);const keep=document.createElement('button');keep.textContent=run.saved?'KEPT':'KEEP';keep.onclick=()=>{run.saved=!run.saved;void saveRun(run).then(()=>openHistory());};const download=document.createElement('button');download.textContent='EXPORT';download.onclick=()=>void exportReplay(run);row.append(title,watch,keep,download);
 if(leaderboardConfigured()){const share=document.createElement('button');share.textContent=shared.some(r=>r.run_id===run.id&&r.ready)?'COPY LINK':'SHARE';share.onclick=async()=>{share.disabled=true;$('history-status').textContent='Preparing compressed replay…';try{showShareLink(await shareReplay(run,profile.name));$('history-status').textContent='Replay shared. Copy the link below.';}catch(error){$('history-status').textContent=error instanceof Error?error.message:'Sharing failed.';}finally{share.disabled=false;}};row.append(share);
 if(eligibleForLeaderboard(run,false,false)&&ownScore&&Math.round(run.time*1000)===ownScore.survival_ms&&run.stats.kills===ownScore.kills&&run.stats.collected===ownScore.gems){const attach=document.createElement('button');attach.textContent='ATTACH TO BEST';attach.onclick=async()=>{attach.disabled=true;try{await shareReplay(run,profile.name||ownScore!.player_name,true);$('history-status').textContent='Leaderboard replay saved.';}catch(error){$('history-status').textContent=String(error);}finally{attach.disabled=false;}};row.append(attach);}}
 list.append(row);}
 for(const item of shared){const row=document.createElement('div');row.className='history-row';const title=document.createElement('span');title.textContent=`${item.slot===0?'LEADERBOARD REPLAY':'SHARED REPLAY'} · ${format(item.survival_ms/1000)} s · ${(item.bytes/1024).toFixed(0)} KB${item.ready?'':' · unfinished upload'}`;row.append(title);if(item.ready){const copy=document.createElement('button');copy.textContent='COPY LINK';copy.onclick=()=>showShareLink(item.id);row.append(copy);}const remove=document.createElement('button');remove.textContent='REMOVE LINK';remove.onclick=async()=>{remove.disabled=true;try{await removeSharedReplay(item.id);await openHistory();}catch(error){$('history-status').textContent=error instanceof Error?error.message:'Could not remove link.';remove.disabled=false;}};row.append(remove);list.append(row);}
 }catch{list.textContent='Replay storage is unavailable in this browser.';}
 await crewBoard?.history();
}
function updatePlayerCard(){
 $('player-name').textContent=profile.name||'Unlisted player';$('player-sharing').textContent=scoreQueue.pending?(scoreQueue.busy?'Saving your best…':'Best saved here · waiting to publish'):profile.automatic?'New bests publish automatically':'Scores stay local until you publish';
 $<HTMLInputElement>('friends-name').value=profile.name||'Wanderer';crown.updatePlayer(profile.name,ownScore);
}
function openProfile(action:'start'|'edit'|'publish'){
 profileAction=action;profileOpen=true;$<HTMLInputElement>('profile-name').value=profile.name;$<HTMLInputElement>('profile-auto').checked=profile.configured?profile.automatic:true;$('profile-error').textContent='';
 $('profile-save').innerHTML=action==='start'?'SAVE & PLAY <span>↗</span>':action==='publish'?'SAVE & PUBLISH <span>↗</span>':'SAVE PROFILE <span>✓</span>';
 $('profile-local').hidden=action!=='start';showPanels();$<HTMLInputElement>('profile-name').focus();
}
function saveProfile(name:string,automatic:boolean){profile={name,automatic,configured:true};saveStore('abyss-player-profile',profile);saveStore('abyss-player-name',name);updatePlayerCard();}
function renderRunScore(){
 if(mode!=='dead'||!world)return;
 const title=$('score-result-title'),status=$('publish-status'),button=$<HTMLButtonElement>('publish-run');button.hidden=true;button.disabled=scoreQueue.busy;$('score-profile').hidden=true;
 if(friends){title.textContent='CREW RUN';status.textContent='Co-op runs are separate from the solo Survival leaderboard.';return;}
 if(practice||!lastRun){title.textContent='UNRANKED RUN';status.textContent='Practice starts and weapon testing are not ranked. Start standard Survival and avoid the 1–4 test keys to set a public best.';return;}
 if(!leaderboardConfigured()){title.textContent='SAVED ON THIS DEVICE';status.textContent='The public leaderboard is not connected.';return;}
 const timeMs=Math.round(lastRun.time*1000),confirmed=scoreQueue.confirmed;
 if(scoreQueue.pending){const pending=scoreQueue.pending;
  if(timeMs>pending.score.timeMs&&!runAutomatic&&runNickname){title.textContent='NEW BEST READY TO PUBLISH';status.textContent=`Publish ${format(lastRun.time)} seconds as ${runNickname}. It will replace the lower best waiting to save.`;button.hidden=false;button.disabled=false;button.textContent='PUBLISH NEW BEST';return;}
  title.textContent=scoreQueue.busy?'PUBLISHING YOUR BEST…':scoreQueue.error?'BEST SAVED · CONNECTION PENDING':'BEST READY TO PUBLISH';
  status.textContent=scoreQueue.error||`${pending.name} · ${format(pending.score.timeMs/1000)} seconds. You can retry the arena while it saves.`;
  if(pending.score.timeMs>timeMs)status.textContent+=` Your ${format(lastRun.time)}-second run did not beat that best.`;
  button.hidden=scoreQueue.busy;button.textContent='RETRY SAVE';return;
 }
 if(confirmed&&timeMs<=confirmed.survival_ms){title.textContent=timeMs===confirmed.survival_ms?'PUBLIC BEST SAVED ✓':'PUBLIC BEST UNCHANGED';status.textContent=`${confirmed.player_name} · ${format(confirmed.survival_ms/1000)} seconds · rank #${confirmed.rank}.`;
  if(timeMs<confirmed.survival_ms)status.textContent+=` ${format((confirmed.survival_ms-timeMs)/1000)} seconds behind your public best.`;return;
 }
 title.textContent='PUBLISH YOUR SURVIVAL BEST';status.textContent=runNickname?`Publish ${format(lastRun.time)} seconds as ${runNickname}.`:'Choose your nickname to put this run on the public leaderboard.';
 button.hidden=!runNickname;button.textContent='PUBLISH THIS RUN';$('score-profile').hidden=!!runNickname;
}
function handleRunScore(){
 const run=lastRun;if(eligibleForLeaderboard(run,practice,!!friends)&&run&&runAutomatic&&runNickname&&leaderboardConfigured()){void queueScoreRun(run,runNickname);}
 renderRunScore();
}
function publishCurrentRun(){
 const run=lastRun;if(eligibleForLeaderboard(run,practice,!!friends)&&run){
  if(!runNickname){openProfile('publish');return;}void queueScoreRun(run,runNickname);return;
 }
 if(scoreQueue.pending)void scoreQueue.flush();
}
function renderRankings(){
 if(crewBoard?.active)return;
 const list=$('leaderboard-rows'),search=$<HTMLInputElement>('leaderboard-search').value.trim().toLocaleLowerCase();list.replaceChildren();
 const scores=leaderboardScores.map((score,index)=>({score,rank:index+1})).filter(({score})=>score.player_name.toLocaleLowerCase().includes(search));
 for(const {score,rank} of scores){const row=document.createElement('tr');const isOwn=ownScore?.rank===rank&&ownScore.player_name===score.player_name&&ownScore.survival_ms===score.survival_ms&&ownScore.achieved_at===score.achieved_at;const isChampion=rank===1&&crown.matchesName(score.player_name);if(isChampion){row.classList.add('sovereign-row');row.setAttribute('aria-label','Reigning champion');}if(isOwn){row.classList.add('your-score');row.setAttribute('aria-label','Your public best');}
 for(const value of [rank,score.player_name+(isOwn?' · YOU':''),format(score.survival_ms/1000),score.kills,score.gems]){const cell=document.createElement('td');cell.textContent=String(value);if(isChampion&&row.children.length===1){cell.prepend(crownBadge());const title=document.createElement('small');title.className='sovereign-row-title';title.textContent='REIGNING CHAMPION';cell.append(title);}row.append(cell);}const replayCell=document.createElement('td');if(score.replay_id){const watch=document.createElement('button');watch.className='text-button';watch.textContent='WATCH';watch.setAttribute('aria-label',`Watch ${score.player_name}'s replay`);watch.onclick=()=>void watchShared(score.replay_id!,watch);replayCell.append(watch);}else{replayCell.textContent='—';replayCell.title='No replay attached to this score.';}row.append(replayCell);list.append(row);}
 $('leaderboard-status').textContent=search?`${scores.length} matching ${scores.length===1?'player':'players'} in the top 100`:leaderboardScores.length?`${leaderboardScores.length} ranked ${leaderboardScores.length===1?'player':'players'} · top 100`:'The arena is waiting for its first published score.';
 if(search&&!scores.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=6;cell.textContent='No matching players. Try another nickname.';row.append(cell);list.append(row);}
}
function renderPersonalRanking(){
 if(crewBoard?.active)return;
 const card=$('leaderboard-personal');card.replaceChildren();const name=document.createElement('strong');name.textContent=ownScore?`${ownScore.player_name} · YOUR PUBLIC BEST`:profile.name||'YOUR PLAYER PROFILE';const detail=document.createElement('span');detail.textContent=ownScore?`${format(ownScore.survival_ms/1000)} s · rank #${ownScore.rank}`:scoreQueue.pending?'Your best is saved here and waiting to publish.':'Complete standard Survival to set your first public best.';card.append(name,detail);
 if(scoreQueue.pending){const retry=document.createElement('button');retry.className='lobby-back';retry.textContent=scoreQueue.busy?'SAVING…':'RETRY SAVE';retry.disabled=scoreQueue.busy;retry.onclick=()=>void scoreQueue.flush();card.append(retry);}
}
async function syncPublicBest(){
 try{const score=await loadOwnScore();scoreQueue.remember(score);ownScore=score;renderPersonalRanking();void uploadPendingBest();}catch{/* Reading rankings still works if a player session cannot load. */}
}
async function refreshRankings(){
 if(rankingRequest)return rankingRequest;
 rankingRequest=(async()=>{
  try{
   const [scores]=await Promise.all([loadLeaderboard(),syncPublicBest()]);leaderboardScores=scores;crown.setScores(scores,ownScore,profile.name);renderRankings();renderPersonalRanking();roster();
   $('leaderboard-updated').textContent=`Updated ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;showPanels();
  }catch(error){crown.unavailable();if(crewBoard?.active)return;$('leaderboard-status').textContent=error instanceof Error?error.message:'The leaderboard is unavailable. Your runs still work.';}
 })().finally(()=>{rankingRequest=null;});return rankingRequest;
}
async function openLeaderboard(){
 leaderboardOpen=true;showPanels();if(crewBoard?.active){await crewBoard.refresh();return;}renderPersonalRanking();const button=$<HTMLButtonElement>('leaderboard-refresh');if(button.disabled)return;button.disabled=true;$('leaderboard-status').textContent='Connecting to the public leaderboard…';
 try{await refreshRankings();}finally{button.disabled=false;}
}
function setupLeaderboard(){
 updatePlayerCard();let scoreWasBusy=scoreQueue.busy;
 scoreQueue.onChange=()=>{
  const published=scoreWasBusy&&!scoreQueue.busy&&!scoreQueue.pending&&!scoreQueue.error;scoreWasBusy=scoreQueue.busy;
  ownScore=scoreQueue.confirmed;updatePlayerCard();renderRunScore();renderPersonalRanking();
  if(!scoreQueue.pending&&!scoreQueue.busy)void uploadPendingBest();
  if(published){if(rankingRequest)void rankingRequest.then(()=>refreshRankings());else void refreshRankings();}
 };
 $('profile-edit').onclick=()=>openProfile('edit');$('leaderboard-profile').onclick=()=>openProfile('edit');$('score-profile').onclick=()=>openProfile('publish');
 $('profile-cancel').onclick=()=>{profileOpen=false;showPanels();};$('profile-local').onclick=()=>{try{const typed=$<HTMLInputElement>('profile-name').value.trim();saveProfile(typed?cleanNickname(typed):'',false);profileOpen=false;showPanels();startRun();}catch(error){$('profile-error').textContent=error instanceof Error?error.message:'Choose a nickname.';}};
 $<HTMLInputElement>('friends-name').onchange=()=>{try{saveProfile(cleanNickname($<HTMLInputElement>('friends-name').value),profile.automatic);}catch(error){$('friends-status').textContent=error instanceof Error?error.message:'Choose a nickname.';}};
 $('profile-form').onsubmit=event=>{event.preventDefault();try{const name=cleanNickname($<HTMLInputElement>('profile-name').value);saveProfile(name,$<HTMLInputElement>('profile-auto').checked);profileOpen=false;showPanels();
 if(profileAction==='start')startRun();else if(profileAction==='publish'){runNickname=name;publishCurrentRun();}else if(mode==='dead'){runNickname=name;renderRunScore();}
 if(profile.automatic&&scoreQueue.pending)void scoreQueue.flush();
 }catch(error){$('profile-error').textContent=error instanceof Error?error.message:'Choose a nickname.';}};
 $('publish-run').onclick=publishCurrentRun;
 $('leaderboard-open').onclick=()=>void openLeaderboard();$('death-leaderboard').onclick=()=>void openLeaderboard();$('leaderboard-refresh').onclick=()=>void openLeaderboard();$('leaderboard-search').oninput=()=>crewBoard?.active?crewBoard.search():renderRankings();$('leaderboard-close').onclick=()=>{leaderboardOpen=false;showPanels();};
 const shrine=$('champion-shrine'),stage=$('champion-stage'),compactShrine=matchMedia('(max-width:1100px)');
 stage.append(shrine);
 const placeShrine=()=>{if(compactShrine.matches)document.querySelector('.menu-content')!.insertBefore(stage,document.querySelector('.altar-menu'));else $('menu').append(stage);};placeShrine();compactShrine.addEventListener('change',placeShrine);
 $('champion-shrine').onclick=()=>void openLeaderboard();
 $('coronation-dismiss').onclick=()=>{crown.dismissCoronation();void openLeaderboard();};
 if(leaderboardConfigured()){void refreshRankings();setInterval(()=>{if(!document.hidden&&(mode==='menu'||leaderboardOpen||friendsOpen))void refreshRankings();},60000);}
 const refreshCrown=()=>{if(leaderboardConfigured()&&!document.hidden&&(mode==='menu'||leaderboardOpen||friendsOpen))void refreshRankings();};
 document.addEventListener('visibilitychange',refreshCrown);window.addEventListener('online',refreshCrown);
 const retryPending=()=>{if(profile.automatic&&scoreQueue.pending&&!scoreQueue.busy&&leaderboardConfigured())void scoreQueue.flush();};
 window.addEventListener('online',retryPending);setInterval(()=>{retryPending();if(profile.automatic)void uploadPendingBest();},15000);retryPending();
}
function updateMobileLayout(){
 const {width,height,rotated}=gameViewport();document.body.dataset.mobileRotated=String(rotated);
 document.body.style.setProperty('--game-width',`${width}px`);document.body.style.setProperty('--game-height',`${height}px`);renderer?.resize();
}
async function enterMobileFullscreen(){
 try{
  if(!fullscreenElement()&&fullscreenAvailable()){await enterFullscreen();mobileFullscreen=true;}
  if(settings.controlScheme!=='mobile'||mode!=='playing'){leaveMobileFullscreen();return;}
  const orientation=screen.orientation as ScreenOrientation&{lock?:(orientation:string)=>Promise<void>};if(orientation?.lock){await orientation.lock('landscape');mobileOrientationLocked=true;}
 }catch{/* CSS landscape fallback also works without fullscreen/orientation APIs. */}
 // Orientation locking can finish after quitting or changing controls. Release
 // ownership again after the await, including a lock acquired after cleanup.
 if(settings.controlScheme!=='mobile'||mode!=='playing'){leaveMobileFullscreen();return;}
 updateMobileLayout();
}
function leaveMobileFullscreen(){
 if(mobileOrientationLocked){mobileOrientationLocked=false;try{screen.orientation?.unlock();}catch{/* Unsupported or restricted API. */}}
 if(mobileFullscreen){mobileFullscreen=false;if(fullscreenElement())void exitFullscreen().catch(()=>{});}
}
function sampleMobileInput(){
 if(mode!=='playing'||controlMenuRoot())return;
 const sample=mobileControls.sample(gameViewport().height);movement={forward:sample.forward,strafe:sample.strafe,jump:false};
 // Relative thumb drag aims like a mouse; keeping a thumb still holds that aim.
 yaw-=sample.lookX*.006*settings.mobileSensitivity;const limit=spectator.position?Math.PI/2:1.5;pitch=Math.max(-limit,Math.min(limit,pitch-sample.lookY*.006*settings.mobileSensitivity));
 for(const action of mobileControls.drain()){if(spectator.position){if(action.button==='jump'&&action.held)movement.jump=true;}else buttonEdges.push(action);}
}
function setupMobileControls(){
 const canvas=$('game');
 $('timer').onclick=()=>{if(!friends&&settings.controlScheme==='mobile')paused();};
 const active=()=>settings.controlScheme==='mobile'&&mode==='playing'&&!controlMenuRoot();
 const point=(event:PointerEvent)=>({id:event.pointerId,...gamePoint(event.clientX,event.clientY)});
 const move=(event:PointerEvent)=>{
  // Preserve the full path when the browser combines touch moves. A drag
  // returning to its origin must not become a stationary jump tap.
  for(const sample of event.getCoalescedEvents?.()??[])mobileControls.move(point(sample));
  mobileControls.move(point(event));
 };
 canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch'||!active())return;event.preventDefault();
  if(mobileControls.begin(point(event),gameViewport().width,performance.now())){canvas.setPointerCapture(event.pointerId);if(!entrance)void sound.start();}
 });
 canvas.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'||!active())return;event.preventDefault();move(event);});
 canvas.addEventListener('pointerup',event=>{if(event.pointerType!=='touch'||settings.controlScheme!=='mobile')return;event.preventDefault();move(event);mobileControls.end(event.pointerId,performance.now());});
 const cancelled=(event:PointerEvent)=>{if(settings.controlScheme==='mobile'&&mobileControls.end(event.pointerId,performance.now(),true))paused();};
 canvas.addEventListener('pointercancel',cancelled);canvas.addEventListener('lostpointercapture',cancelled);
 window.addEventListener('resize',()=>{if(settings.controlScheme==='mobile'){if(mobileControls.active)paused();updateMobileLayout();}});
 for(const event of fullscreenEvents)document.addEventListener(event,()=>{if(settings.controlScheme==='mobile'){updateMobileLayout();if(mobileFullscreen&&!fullscreenElement()){mobileFullscreen=false;paused();}}});
}

function updateControlHints(){
 const controller=settings.controlScheme==='controller',mobile=settings.controlScheme==='mobile';
 $<HTMLButtonElement>('timer').disabled=!!friends||!mobile||mode!=='playing';
 if(document.body.dataset.controls==='mobile'&&!mobile)leaveMobileFullscreen();document.body.dataset.controls=settings.controlScheme;updateMobileLayout();
 $('controller-settings').hidden=!controller;$('controller-status').hidden=!controller;$('mouse-sensitivity-setting').hidden=controller||mobile;$('mobile-sensitivity-setting').hidden=!mobile;$('control-bindings').hidden=mobile;
 $('control-hint').textContent=mobile?'MOBILE':controller?'CONTROLLER':settings.controlScheme==='azerty'?'ZQSD + MOUSE':'WASD + MOUSE';
 const rows=controller?[
  ['LEFT STICK','Move'],['RIGHT STICK','Look'],['A / CROSS','Jump · time each hop'],['RT / R2','Tap burst / hold stream'],['LT / L2','Homing · attunement III'],['START / OPTIONS','Pause / resume'],['D-PAD · A / CROSS','Navigate menus · select'],['B / CIRCLE','Back']
 ]:[['1 2 3 4','Test weapons · makes run unranked'],[settings.controlScheme==='azerty'?'Z Q S D':'W A S D','Move'],['MOUSE','Look'],['SPACE','Jump · time each hop'],['LMB','Tap burst / hold stream'],['RMB','Homing · attunement III'],['ESC','Pause'],['R','Retry after death']];
 const list=$('control-bindings');list.replaceChildren();for(const [binding,action] of rows){const row=document.createElement('div'),key=document.createElement('kbd'),text=document.createElement('span');key.textContent=binding;text.textContent=action;row.append(key,text);list.append(row);}
}
function controlMenuRoot():HTMLElement|null {
 if(profileOpen)return $('player-profile');if(settingsOpen)return $('settings');if(leaderboardOpen)return $('leaderboard');if(historyOpen)return $('history');if(friendsOpen)return $('friends');
 if(mode==='crew-replay')return crewViewer.root;
 if(mode==='paused')return $('pause');if(mode==='dead')return analysisActive?$('death-analysis'):$('death');if(mode==='replay')return $('replay-controls');if(mode==='menu')return $('menu');return null;
}
function closeControlMenu(){
 if(mode==='crew-replay'){crewViewer.close();return;}
 if(profileOpen){profileOpen=false;showPanels();}else if(settingsOpen){settingsOpen=false;showPanels();}else if(leaderboardOpen){leaderboardOpen=false;showPanels();}else if(historyOpen){historyOpen=false;showPanels();}else if(friendsOpen){friendsOpen=false;showPanels();}else if(analysisActive)endDeathAnalysis();else if(mode==='replay')home();
}
function focusControl(element:HTMLElement){
 menuAudio.unlock();
 document.querySelectorAll('.controller-focus').forEach(el=>el.classList.remove('controller-focus'));element.classList.add('controller-focus');element.focus();element.scrollIntoView({block:'nearest'});
}
function controllerMenu(state:ReturnType<typeof controllerState>,previous:ReturnType<typeof controllerState>|null){
 const edge=(key:keyof typeof state)=>!!state[key]&&!previous?.[key];
 if(['up','down','left','right','jump','pause'].some(key=>edge(key as keyof typeof state)))replayControlsVisibility.reveal();
 if(edge('back')){menuAudio.unlock();menuAudio.cue('back');closeControlMenu();return;}
 const root=controlMenuRoot();if(!root)return;
 const elements=Array.from(root.querySelectorAll<HTMLElement>('button,input,select,summary')).filter(el=>el.getClientRects().length&&!el.matches(':disabled'));
 if(!elements.length)return;
 const defaultId=mode==='menu'&&root===$('menu')?'start':root===$('pause')?'resume':root===$('death')?'retry':root===$('death-analysis')?'analysis-retry':root===$('settings')?'control-scheme':root===$('replay-controls')?'replay-pause':root===crewViewer.root?'crew-replay-pause':'';
 let index=elements.indexOf(document.activeElement as HTMLElement);
 if(index<0){index=Math.max(0,elements.findIndex(el=>el.id===defaultId));if(edge('up')||edge('down')||edge('left')||edge('right')||edge('jump'))focusControl(elements[index]);}
 else if(edge('up')||edge('down')){index=(index+(edge('down')?1:-1)+elements.length)%elements.length;focusControl(elements[index]);}
 const target=elements[index];
 if(edge('left')||edge('right')){
  const direction=edge('right')?1:-1;
  if(target instanceof HTMLSelectElement){target.selectedIndex=Math.max(0,Math.min(target.options.length-1,target.selectedIndex+direction));target.dispatchEvent(new Event('change'));}
  if(target instanceof HTMLInputElement&&(target.type==='range'||target.type==='number')){direction>0?target.stepUp():target.stepDown();target.dispatchEvent(new Event('input'));target.dispatchEvent(new Event('change'));}
 }
 if(edge('jump')){focusControl(target);if(target instanceof HTMLInputElement&&target.type==='checkbox'){target.checked=!target.checked;target.dispatchEvent(new Event('change'));}else if(target instanceof HTMLButtonElement||target.tagName==='SUMMARY')target.click();}
}
function readControllers(){
 let pads:(Gamepad|null)[]=[],unavailable=!navigator.getGamepads;
 try{pads=Array.from(navigator.getGamepads?.()??[]);}catch{unavailable=true;}
 const standard=pads.filter((p):p is Gamepad=>!!p?.connected&&p.mapping==='standard');
 return {pads,standard,unavailable,pad:standard.find(p=>p.index===activePadIndex)??standard[0]};
}
function pollController(dt:number){
 movement={forward:0,strafe:0,jump:false};controllerDown=false;controllerFast=false;
 const {pads,standard,unavailable}=readControllers();
 let pad=standard.find(p=>p.index===activePadIndex);
 if(!pad&&activePadIndex!==null){
  if(mode==='crew-replay')crewViewer.suspend();
  if(settings.controlScheme==='controller'&&mode==='playing'){paused();notice('CONTROLLER DISCONNECTED · RECONNECT TO RETURN',5);}
  activePadIndex=null;previousPad=null;
 }
 pad??=standard[0];
 const status=pad?`Connected · ${pad.id}`:unavailable?'This browser is not allowing controller access. Open the game directly in a browser with controller support.':pads.some(p=>p?.connected)?'This controller has no standard mapping. Use a standard Xbox / PlayStation compatible controller.':'Connect a controller and press a button to detect it.';
 if($('controller-status').textContent!==status)$('controller-status').textContent=status;
 const pauseMessage=settings.controlScheme==='controller'?pad?'Your run is paused. Press Start / Options or Return to resume.':`${status} ${waitingForController?'The game will continue once detected.':'Then press Return to resume.'} You can also choose keyboard controls in Settings.`:'Your run is paused.';
 if(!friends&&$('pause').querySelector('p')!.textContent!==pauseMessage)$('pause').querySelector('p')!.textContent=pauseMessage;
 if(!pad){if(settings.controlScheme==='controller'&&mode==='playing'){paused();waitingForController=!friends;}previousPad=null;return;}
 const state=controllerState(pad,settings.controllerDeadzone),previous=previousPad;previousPad=state;
 // Establish a baseline so the detection button cannot activate menus or
 // become a held gameplay action. Connection waits resume on a later frame.
 if(activePadIndex!==pad.index){activePadIndex=pad.index;if(settings.controlScheme==='controller')clearInput();return;}
 if(!state.jump)blockedPadJump=false;if(!state.fire)blockedPadFire=false;if(!state.homing)blockedPadHoming=false;
 if(document.hidden||!document.hasFocus())return;
 if(waitingForController&&settings.controlScheme==='controller'&&mode==='paused'&&!settingsOpen&&!profileOpen&&!leaderboardOpen&&!historyOpen&&!friendsOpen){resume();return;}
 if(mode==='crew-replay'){if(state.pause&&!previous?.pause)crewViewer.toggle();crewViewer.controllerMove(state,dt,settings.controllerSensitivity);if(crewViewer.camera!=='free'||crewViewer.root.contains(document.activeElement)||state.up||state.down||state.left||state.right||state.back)controllerMenu(state,previous);return;}
 if(controlMenuRoot()){
  if(state.pause&&!previous?.pause&&mode==='paused'&&!settingsOpen&&!profileOpen&&!leaderboardOpen&&!historyOpen&&!friendsOpen){resume();return;}
  controllerMenu(state,previous);return;
 }
 if(settings.controlScheme!=='controller'||mode!=='playing')return;
 if(!friends&&state.pause&&!previous?.pause){paused();return;}
 movement={forward:state.forward,strafe:state.strafe,jump:state.jump&&!blockedPadJump};controllerDown=state.descend;controllerFast=state.fast;
 yaw-=state.lookX*2.8*settings.controllerSensitivity*dt;
 const limit=spectator.position?Math.PI/2:1.5;pitch=Math.max(-limit,Math.min(limit,pitch-state.lookY*2.8*settings.controllerSensitivity*dt));
 if(!spectator.position){const jump=state.jump&&!blockedPadJump,fire=state.fire&&!blockedPadFire,homing=state.homing&&!blockedPadHoming;if(jump!==padJump){buttonEdges.push({button:'jump',held:jump});padJump=jump;}if(fire!==padFire){buttonEdges.push({button:'fire',held:fire});padFire=fire;}if(homing!==padHoming){buttonEdges.push({button:'homing',held:homing});padHoming=homing;}}
}

function setupSettings() {
  for(const name of ['sensitivity','mobileSensitivity','fov','volume','musicVolume','controllerSensitivity','controllerDeadzone'] as const) {
    const el=$<HTMLInputElement>(name);el.value=String(settings[name]);$(name+'-value').textContent=(name==='volume'||name==='musicVolume')?`${settings[name]}%`:String(settings[name]);
    el.oninput=()=>{settings[name]=Number(el.value);$(name+'-value').textContent=(name==='volume'||name==='musicVolume')?`${el.value}%`:el.value;saveStore('abyss-settings',settings);sound.setVolume(settings.volume/100);menuAudio.setVolume(settings.volume/100);music.setVolume(settings.musicVolume/100);renderer.configure(settings);};
  }
  const scheme=$<HTMLSelectElement>('control-scheme');scheme.value=settings.controlScheme;scheme.onchange=()=>{settings.controlScheme=scheme.value as ControlScheme;waitingForController=false;clearInput();saveStore('abyss-settings',settings);updateControlHints();};updateControlHints();
  const q=$<HTMLSelectElement>('quality');q.value=settings.quality;q.onchange=()=>{settings.quality=q.value;saveStore('abyss-settings',settings);renderer.configure(settings);};
  const sky=$<HTMLSelectElement>('sky-motion');sky.value=settings.skyMotion;sky.onchange=()=>{settings.skyMotion=sky.value==='reduced'?'reduced':'full';document.body.dataset.skyMotion=settings.skyMotion;saveStore('abyss-settings',settings);renderer.configure(settings);};
  const mist=$<HTMLInputElement>('volumetric-mist');mist.checked=settings.mist;mist.onchange=()=>{settings.mist=mist.checked;saveStore('abyss-settings',settings);renderer.configure(settings);};
  const cues=$<HTMLInputElement>('threat-cues');cues.checked=settings.threatCues;cues.onchange=()=>{settings.threatCues=cues.checked;saveStore('abyss-settings',settings);};
}
function openSettings() {if(friends&&mode==='playing')return;if(mode==='playing')paused();settingsOpen=true;clearInput();setupSettings();showPanels();}
function beginCrewLobby(host:boolean){
 beginCrew(host,true);
}
function beginCrew(host:boolean,lobby=false){
 crewReplayRequest++;crewReplayDownloading=false;crewViewer?.dispose();const crossed=entrance&&!lobby;stopHostClock();
 entrance=lobby;entranceRun=null;
 spectator.reset();
 $('pause').querySelector('p')!.textContent=lobby?'Walk into the seal to start the run for the whole crew.':'The crew run is live. Click return to capture your mouse.';
 resetDeathAnalysis(true);renderer.clear();sound.clear();recorder=null;replay=null;lastRun=null;practice=true;historyOpen=false;settingsOpen=false;friendsOpen=false;world=host?friends!.world:new World(1,{schedule:false});yaw=0;pitch=0;clearInput();accumulator=0;last=performance.now();renderer.topDown=false;mode='playing';(document.activeElement as HTMLElement|null)?.blur();showPanels();if(lobby)void sound.prepareEntrance(best);else if(crossed)void sound.collectDagger(best);else void sound.start();void captureMouse();notice(lobby?'WALK INTO THE SEAL TO START THE CREW RUN':'CREW RUN · RELEASE FIRE TO SHARE GEMS',4);if(host)startHostClock();
}
function roster(){
 crewBoard?.sessionChanged();
 const joined=!!friends;$('friends-browser').hidden=joined;$('friends-waiting').hidden=!joined;if(!friends)return;
 $('friends-room-name').textContent=friends.lobbyName;$('friends-player-count').textContent=friends.role==='guest'&&!friends.members.length?'CONNECTING…':`${friends.members.length} / 4 PLAYERS`;
 const list=$('friends-roster');list.replaceChildren();const local=friends.members.find(p=>p.id===friends!.localId);
 for(let i=0;i<4;i++){const member=friends.members[i];const card=document.createElement('div');card.className='crew-slot'+(member?.ready?' is-ready':'')+(!member?' empty':'');card.style.setProperty('--crew-color',['#cfdfa0','#8ed4dd','#e1bc8d','#c4a7df'][i]);const mark=document.createElement('div');mark.className='crew-avatar';mark.textContent=member?'◇':'+';const name=document.createElement('strong');name.textContent=member?member.name+(member.id===friends.localId?' · YOU':''):'OPEN SLOT';const role=document.createElement('small');role.textContent=member?(member.host?'HOST':'CREW'):'WAITING FOR A PLAYER';const badge=document.createElement('span');badge.className='crew-ready';badge.textContent=member?(friends.prelobby?'IN COURTYARD':member.ready?'✓ READY':'NOT READY'):'—';if(member&&crown.matchesName(member.name)){card.classList.add('is-sovereign');name.prepend(crownBadge());role.textContent='REIGNING CHAMPION · '+role.textContent;}card.append(mark,name,role,badge);list.append(card);}
 if(friends.prelobby){$('friends-ready-count').textContent=`${friends.members.length} / 4 IN THE COURTYARD`;$('friends-launch-hint').textContent='Any player can walk into the seal to start the run for everyone.';const ready=$<HTMLButtonElement>('friends-ready');ready.disabled=false;ready.classList.remove('is-ready');ready.textContent='RETURN TO COURTYARD →';$('friends-start').hidden=true;return;}
 const count=friends.members.filter(p=>p.ready).length;$('friends-ready-count').textContent=`${count} / ${friends.members.length} READY`;$('friends-launch-hint').textContent=friends.role==='host'?(friends.allReady?'The crew is ready. Start to enter the courtyard together.':'Waiting for every player to mark ready.'):'The host will send everyone to the courtyard when the crew is ready.';
 const ready=$<HTMLButtonElement>('friends-ready');ready.disabled=!local||friends.running;ready.classList.toggle('is-ready',!!local?.ready);ready.textContent=!local?'CONNECTING TO HOST…':local.ready?'READY ✓ · CLICK TO UNREADY':"I'M READY ✓";if(!local)$('friends-launch-hint').textContent='Establishing the host connection. Ready unlocks when your crew appears.';
 const start=$<HTMLButtonElement>('friends-start');start.hidden=friends.role!=='host';start.disabled=!friends.allReady||friends.running||!renderer.originalEnemies.ready||!renderer.originalWeapon.ready;
}
function renderLobbies(){
 const rooms=lobbyBrowser.list;$('friends-room-count').textContent=String(rooms.length);const list=$('friends-rooms');list.replaceChildren();
 if(!rooms.length){const empty=document.createElement('div');empty.className='lobby-empty';empty.innerHTML='<span>◇</span><strong>THE ARENA IS QUIET.</strong><p>No lobbies yet. Create one and let your friends join you.</p>';list.append(empty);return;}
 for(const room of rooms){const row=document.createElement('div');row.className='public-lobby';const icon=document.createElement('span');icon.className='room-icon';icon.textContent='◇';const info=document.createElement('div');const name=document.createElement('strong');name.textContent=room.name;const host=document.createElement('small');host.textContent=`HOSTED BY ${room.host}`;info.append(name,host);const count=document.createElement('span');count.className='room-count';count.textContent=`${room.players} / 4`;const join=document.createElement('button');join.className='join-lobby';join.textContent=room.state==='playing'?'IN GAME':room.players>=4?'FULL':'JOIN →';join.disabled=room.state!=='waiting'||room.players>=4;join.onclick=()=>{join.disabled=true;void joinLobby(room).catch(e=>{$('friends-status').textContent=String(e.message||e);friends?.close();friends=null;roster();renderLobbies();});};row.append(icon,info,count,join);list.append(row);}
}
function newSession(role:'host'|'guest'){
 const previous=friends;friends=null;previous?.close();lobbyCrewCount=1;receivedEpoch=-1;
 const configured=import.meta.env.VITE_WEBRTC_ICE_SERVERS;let ice:RTCIceServer[]|undefined;if(configured){ice=JSON.parse(configured);}
 const session=new FriendsSession(role,ice);crewBoard?.attach(session);session.setName($<HTMLInputElement>('friends-name').value);friends=session;
 session.onChange=()=>{if(friends!==session)return;roster();if(role==='guest'&&session.connected&&session.members.length)$('friends-status').textContent='Connected to your crew.';if(role==='host'&&session.running&&entrance)beginCrew(true);if(role==='guest'&&!session.connected&&world){if(mode==='crew-replay'&&crewViewer.player){notice('HOST LEFT · YOUR DOWNLOADED REPLAY REMAINS AVAILABLE',6);return;}home();friendsOpen=true;showPanels();roster();$('friends-status').textContent='The host left. Choose another lobby to play again.';}};
 session.onReplayReady=run=>{window.dispatchEvent(new CustomEvent('abyss-crew-run-finished',{detail:{run,session}}));updateCrewReplayActions();};
 session.onReplayProgress=progress=>{if(mode==='dead')$('crew-replay-download-status').textContent=`Preparing team replay… ${Math.round(progress*100)}%`;};
 session.onError=message=>{$('friends-status').textContent=message;notice(message,6);};
 session.onSnapshot=(snapshot:ArenaSnapshot)=>{if(friends!==session)return;lobbyCrewCount=snapshot.crew.length;if(snapshot.prelobby){if(!entrance||!world||snapshot.epoch!==receivedEpoch){receivedEpoch=snapshot.epoch;beginCrewLobby(false);}if(world)session.reconcile(world,snapshot);return;}if(!snapshot.running){crewReplayRequest++;crewReplayDownloading=false;crewViewer.dispose();spectator.reset();entrance=false;if(world){world=null;mode='menu';clearInput();document.exitPointerLock?.();renderer.clear();sound.clear();friendsOpen=true;showPanels();}roster();return;}if(snapshot.epoch!==receivedEpoch){receivedEpoch=snapshot.epoch;beginCrew(false);}if(world){session.reconcile(world,snapshot);if(mode!=='crew-replay')for(const effect of snapshot.effects??[]){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}}};
 session.onEffects=effects=>{if(friends!==session||!world||mode==='crew-replay')return;for(const effect of effects){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}};roster();return session;
}
async function joinLobby(room:PublicLobby){$('friends-status').textContent=`Joining ${room.name}…`;const session=newSession('guest');session.lobbyName=room.name;roster();await session.joinPublic(room);if(friends===session)$('friends-status').textContent=session.connected&&session.members.length?'Connected to your crew.':'Connecting to your crew…';}
function returnCrewLobby(){crewReplayRequest++;crewReplayDownloading=false;crewViewer.dispose();stopHostClock();spectator.reset();if(friends?.role!=='host')return;friends.returnToLobby();entrance=false;world=null;mode='menu';clearInput();document.exitPointerLock?.();renderer.clear();sound.clear();friendsOpen=true;settingsOpen=false;showPanels();roster();}
function setupFriends(){
 lobbyBrowser.onChange=renderLobbies;lobbyBrowser.onStatus=text=>$('friends-service').textContent=text;
 $('friends-open').onclick=()=>{friendsOpen=true;showPanels();roster();renderLobbies();if(!lobbyStarted){lobbyStarted=true;void lobbyBrowser.start();}};
 $('friends-refresh').onclick=()=>lobbyBrowser.refresh();$('friends-close').onclick=()=>{friendsOpen=false;if(friends&&world&&!friends.running)resume();else showPanels();};
 $('crew-lobby-room').onclick=()=>{paused();friendsOpen=true;showPanels();roster();};
 $('crew-lobby-leave').onclick=()=>home();
 $('friends-leave').onclick=()=>{home();friendsOpen=true;showPanels();roster();renderLobbies();$('friends-status').textContent='You left the lobby.';};
 $('friends-host').onclick=()=>{const button=$<HTMLButtonElement>('friends-host');button.disabled=true;$('friends-status').textContent='Creating your lobby…';const session=newSession('host');void session.hostPublic($<HTMLInputElement>('friends-lobby-name').value).then(()=>{$('friends-status').textContent='Lobby is live. Your friends can find it in Open lobbies.';roster();}).catch(e=>{$('friends-status').textContent=String(e.message||e);friends=null;session.close();roster();}).finally(()=>button.disabled=false);};
 $('friends-ready').onclick=()=>{if(!friends)return;if(friends.prelobby){friendsOpen=false;resume();return;}const local=friends.members.find(p=>p.id===friends!.localId);if(!local)return;const ready=!local.ready;friends.setReady(ready);if(!ready||settings.controlScheme==='mobile'||settings.controlScheme==='controller'){roster();return;}capturingMouse=true;void $('game').requestPointerLock().then(()=>{document.exitPointerLock?.();}).catch(()=>{}).finally(()=>{capturingMouse=false;});roster();};
 $('friends-start').onclick=()=>{if(friends?.role==='host'&&friends.allReady){friends.enterPrelobby();beginCrewLobby(true);}};
}
function init() {
  setupPwa();
  setupFullscreenMenu($<HTMLButtonElement>('fullscreen-toggle'),$('fullscreen-label'),$('fullscreen-status'));
  try {renderer=new GameRenderer($<HTMLCanvasElement>('game'),settings);}catch(error){$('error').hidden=false;$('error').textContent=`The arena could not initialize WebGL2. Enable hardware acceleration and use a current browser. ${error instanceof Error?error.message:''}`;return;}
  crewViewer=new CrewReplayViewer(renderer,sound,()=>settings.controlScheme,()=>settings.controlScheme==='mobile'?settings.mobileSensitivity:settings.sensitivity);setupCrewReplayActions();
  updateBest();showPanels();setupSettings();
  document.addEventListener('pointerdown',()=>music.unlock());
  document.addEventListener('keydown',()=>music.unlock());
  setupMenuAudio(menuAudio,()=>settings.volume/100);

  const start=$<HTMLButtonElement>('start');start.disabled=true;void renderer.prepare().then(()=>{start.disabled=!(renderer.originalEnemies.ready&&renderer.originalWeapon.ready);if(start.disabled){$('error').hidden=false;$('error').textContent='The original game assets could not load. '+renderer.originalEnemies.error+' '+renderer.originalWeapon.error;}}).catch(error=>{$('error').hidden=false;$('error').textContent='The arena could not prepare its graphics. '+String(error);});
  $('analysis-retry').onclick=()=>$('retry').click();$('analysis-skip').onclick=endDeathAnalysis;$('analysis-pause').onclick=()=>{analysisSuspended=!analysisSuspended;updateDeathAnalysis();};$('watch-death').onclick=startDeathAnalysis;
  $('start').onclick=()=>{if(friends){friendsOpen=true;showPanels();return;}startRun();};$('retry').onclick=()=>{if(friends){if(friends.role==='host')returnCrewLobby();return;}startRun(practice&&lastRun?lastRun.setup:DEFAULT_SETUP);};$('resume').onclick=resume;$('quit').onclick=home;$('home').onclick=home;
  $('settings-open').onclick=openSettings;$('pause-settings').onclick=openSettings;$('settings-close').onclick=()=>{settingsOpen=false;showPanels();};
  $('practice-start').onclick=()=>{if(friends){friendsOpen=true;showPanels();return;}startRun({time:Math.max(0,Math.min(1200,Number($<HTMLInputElement>('practice-time').value)||0)),level:Number($<HTMLSelectElement>('practice-level').value),reserve:Math.max(0,Math.min(1000,Number($<HTMLInputElement>('practice-homing').value)||0))});};
  $('replay-upload-retry').onclick=()=>void uploadPendingBest(true);
  $('replay-import').onclick=()=>$<HTMLInputElement>('replay-import-file').click();
  $<HTMLInputElement>('replay-import-file').onchange=async()=>{const input=$<HTMLInputElement>('replay-import-file'),file=input.files?.[0];if(!file)return;try{const run=await decodeReplay(file);run.saved=true;await saveRun(run);$('history-status').textContent='Replay imported and kept.';watchRun(run);}catch(error){$('history-status').textContent=error instanceof Error?error.message:'Could not import replay.';}finally{input.value='';}};
  const updateSharedLink=()=>{const sharedId=linkedReplay(location.hash);$('shared-replay-open').hidden=!sharedId;$('shared-replay-open').onclick=sharedId?()=>void watchShared(sharedId,$<HTMLButtonElement>('shared-replay-open')):null;};updateSharedLink();window.addEventListener('hashchange',updateSharedLink);
  $('history-open').onclick=()=>void openHistory();$('history-close').onclick=()=>{historyOpen=false;showPanels();};$('watch-last').onclick=()=>{if(lastRun)watchRun(lastRun);};$('replay-exit').onclick=home;$('replay-pause').onclick=()=>{if(replay?.done){seekReplay(0);sound.clear();}replayPaused=!replayPaused;if(replayPaused)sound.pause();else void sound.start();accumulator=0;$('replay-pause').textContent=replayPaused?'PLAY':'PAUSE';};
  $<HTMLInputElement>('replay-seek').oninput=()=>{if(replay){sound.clear();world=seekReplay(Number($<HTMLInputElement>('replay-seek').value));accumulator=0;}};
  document.addEventListener('pointerlockchange',()=>{if(settings.controlScheme!=='controller'&&settings.controlScheme!=='mobile'&&document.pointerLockElement!==$('game')&&!capturingMouse)paused();});
  document.addEventListener('visibilitychange',()=>{fpsStarted=null;fpsFrames=0;music.setHidden(document.hidden);if(document.hidden&&mode==='playing'){document.exitPointerLock?.();paused();}});
  window.addEventListener('blur',()=>{if(mode==='playing'){document.exitPointerLock?.();paused();}});
  window.addEventListener('keydown',e=>{if(mode==='crew-replay'){if(e.code==='Escape'){e.preventDefault();crewViewer.close();}return;}if(e.code==='Escape'){if(analysisActive){e.preventDefault();endDeathAnalysis();return;}if(friends?.running&&mode==='playing'){e.preventDefault();return;}if(profileOpen||settingsOpen||leaderboardOpen||historyOpen||friendsOpen){e.preventDefault();closeControlMenu();return;}if(mode==='playing'){e.preventDefault();paused();return;}}if(analysisActive&&e.code==='Space'){e.preventDefault();analysisSuspended=!analysisSuspended;updateDeathAnalysis();return;}if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(mode==='replay'&&e.code==='KeyM'){renderer.topDown=!renderer.topDown;return;}if(mode==='replay'&&(e.code==='ArrowLeft'||e.code==='ArrowRight')&&replay){sound.clear();world=seekReplay(replay.tick+(e.code==='ArrowLeft'?-1:1)*(e.ctrlKey?10:3)/STEP);accumulator=0;return;}if(!entrance&&!friends&&['Digit1','Digit2','Digit3','Digit4','Numpad1','Numpad2','Numpad3','Numpad4'].includes(e.code)&&(mode==='playing'||mode==='paused')&&world&&!settingsOpen){e.preventDefault();if(e.repeat)return;const level=Number(e.code.slice(-1));world.level=level;world.stats.collected=level===1?0:level===2?10:level===3?70:200;world.reserve=level===4?190:level>=2?50:0;practice=true;recorder=null;world.emit('upgrade',world.player.pos,level);notice(`WEAPON ${level} · UNRANKED TEST RUN`,4);updateHud();return;}if(e.code==='Space'&&mode==='playing')e.preventDefault();if(e.code==='KeyR'&&mode==='dead'&&!settingsOpen&&!profileOpen&&!leaderboardOpen&&!(e.target instanceof HTMLInputElement)){if(friends){if(friends.role==='host')returnCrewLobby();}else startRun(practice&&lastRun?lastRun.setup:DEFAULT_SETUP);return;}if(e.code==='Escape'&&leaderboardOpen){leaderboardOpen=false;showPanels();return;}if(e.code==='Escape'&&settingsOpen){settingsOpen=false;showPanels();return;}if(e.code==='Escape'&&settings.controlScheme==='controller'&&mode==='playing'){paused();return;}if(mode==='playing'&&!controlMenuRoot()&&settings.controlScheme!=='controller'&&settings.controlScheme!=='mobile'){if(!pressedKeys.has(e.code))pressedKeys.set(e.code,e.key.toLowerCase());keys.add(e.code);keys.add(pressedKeys.get(e.code)!);if(e.code==='Space'&&!e.repeat&&!spectator.position)buttonEdges.push({button:'jump',held:true});}});
  window.addEventListener('keyup',e=>{const letter=pressedKeys.get(e.code);pressedKeys.delete(e.code);keys.delete(e.code);if(letter&&!Array.from(pressedKeys.values()).includes(letter))keys.delete(letter);if(mode==='playing'&&settings.controlScheme!=='controller'&&settings.controlScheme!=='mobile'&&e.code==='Space')buttonEdges.push({button:'jump',held:false});});
  document.addEventListener('mousemove',e=>{if(settings.controlScheme==='controller'||settings.controlScheme==='mobile'||mode!=='playing'||document.pointerLockElement!==$('game'))return;yaw-=e.movementX*.002*settings.sensitivity;const limit=spectator.position?Math.PI/2:1.5;pitch=Math.max(-limit,Math.min(limit,pitch-e.movementY*.002*settings.sensitivity));});
  document.addEventListener('mousedown',e=>{if(settings.controlScheme==='controller'||settings.controlScheme==='mobile'||mode!=='playing'||spectator.position||document.pointerLockElement!==$('game'))return;if(e.button===0)buttonEdges.push({button:'fire',held:true});if(e.button===2){buttonEdges.push({button:'homing',held:true});if(world&&!world.homingUnlocked)notice(`HOMING AWAKENS AT ${world.homingUnlockGems} GEMS`,1.5);}});
  document.addEventListener('mouseup',e=>{if(settings.controlScheme==='controller'||settings.controlScheme==='mobile'||mode!=='playing'||spectator.position)return;if(e.button===0)buttonEdges.push({button:'fire',held:false});if(e.button===2)buttonEdges.push({button:'homing',held:false});});
  $('game').addEventListener('click',()=>{if(friends&&mode==='playing'&&!controlMenuRoot()&&settings.controlScheme!=='controller'&&settings.controlScheme!=='mobile'&&document.pointerLockElement!==$('game'))void captureMouse();});
  setupMobileControls();
  $('game').addEventListener('contextmenu',e=>e.preventDefault());
  // Read-only diagnostic surface for development smoke tests and frame profiling.
  if(import.meta.env.DEV) Object.defineProperty(window,'abyss',{get:()=>({mode,crewReplay:crewViewer?.diagnostics,crewRecording:friends?.replayDiagnostics,completedCrewReplay:friends?.completedReplay?{id:friends.completedReplay.id,ticks:friends.completedReplay.ticks}:null,menuRelics:renderer.menuRelics.diagnostics,sky:renderer.skyDiagnostics,mist:renderer.openingMist.diagnostics,deathHistory:deathHistory.diagnostics,deathSource:world?.deathSource,deathAnalysis:deathAnalysis?{active:analysisActive,remaining:deathAnalysis.remaining,duration:deathAnalysis.duration,impact:deathAnalysis.impact,viewTime:deathAnalysis.view.time,killerVisible:deathAnalysis.killerVisible,suspended:analysisSuspended}:null,entrance,entranceSeal:{...ENTRANCE_SEAL},viewport:gameViewport(),controls:settings.controlScheme,input:{...input},yaw,pitch,time:world?.time,position:world?{...world.player.pos}:null,spectating:!!spectator.position,cameraPosition:renderer.camera.position.toArray(),enemies:world?.enemies.length,enemyKinds:world?.enemies.map(e=>e.kind),wave:world?.wave,projectiles:world?.projectiles.length,stats:world?{...world.stats}:null,drawCalls:renderer.renderer.info.render.calls,originalAssets:renderer.originalWeapon.ready,originalEnemies:renderer.originalEnemies.ready,enemyAssetError:renderer.originalEnemies.error,originalAssetError:renderer.originalWeapon.error,handLevel:world?.level,projectileRendering:renderer.originalWeapon.projectileDiagnostics,projectileLighting:renderer.projectileLighting.diagnostics,friends:friends?{network:friends.diagnostics,role:friends.role,members:friends.members,allReady:friends.allReady,connected:friends.connected,epoch:friends.epoch,crew:world?.crew.map(p=>({id:p.id,alive:p.alive,cause:p.cause,life:p.life,respawnAt:p.respawnAt,protectedUntil:p.protectedUntil,position:p.player.pos})),running:friends.running,prelobby:friends.prelobby}:null,audio:sound.diagnostics,menuAudio:menuAudio.diagnostics,music:music.diagnostics})});
  updateControlHints();setupFriends();setupLeaderboard();
  crewBoard=new CrewLeaderboardUI({session:()=>friends,mode:()=>mode,watch:(run,onExit)=>watchCrewRun(run,0,onExit),solo:()=>{renderRankings();renderPersonalRanking();void refreshRankings();},history:()=>void openHistory()});
  setupWindowCloseButtons(()=>crown.dismissCoronation());
  requestAnimationFrame(frame);
}
init();

/** Rebuild cosmetic floor history while seeking, without replaying sounds or flashes. */
function seekReplay(tick:number){
 return replay!.seek(tick,w=>{for(const effect of w.effects)renderer.blood.effect(effect,w);renderer.blood.advance(w.time);},()=>renderer.blood.clear());
}
