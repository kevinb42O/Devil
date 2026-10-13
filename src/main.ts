import {ENTRANCE_SPAWN,ENTRANCE_SEAL,touchesEntranceSeal} from './entrance-layout';
import {MobileControls} from './mobile-controls';
import {gameViewport,gamePoint} from './game-viewport';
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
import {DeathHistory,type DeathAnalysis,killerName} from './death-analysis';
import {leaderboardConfigured,loadLeaderboard,loadOwnScore,publishCandidate,scoreCandidate,eligibleForLeaderboard} from './leaderboard';
import {ScoreQueue,cleanNickname,type PendingScore,type OwnScore} from './score-queue';
import { LobbyBrowser, type PublicLobby } from './lobbies';
import { FriendsSession, type ArenaSnapshot } from './multiplayer';
import { GameRenderer } from './renderer';
import {SpectatorCamera} from './spectator';
const spectator=new SpectatorCamera();
import { Sound } from './audio';
import { Music } from './music';
import {RunRecorder,ReplayPlayer,createRun,listRuns,saveRun,DEFAULT_SETUP,type RunSetup,type RecordedRun} from './replay';
import {ENEMY_KINDS,isPede,isSpider} from './enemy-kinds';
import { World, STEP, idleInput, distance, TIMELINE, type Input } from './simulation';
const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
type Settings={sensitivity:number;mobileSensitivity:number;fov:number;volume:number;musicVolume:number;quality:string;threatCues:boolean;controlScheme:ControlScheme;controllerSensitivity:number;controllerDeadzone:number};
const touchDevice=navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches;
const mobileControls=new MobileControls();let mobileFullscreen=false,mobileOrientationLocked=false;
const defaults:Settings={sensitivity:1,mobileSensitivity:1,fov:90,volume:55,musicVolume:55,quality:touchDevice?'low':'high',threatCues:false,controlScheme:touchDevice?'mobile':'qwerty',controllerSensitivity:1,controllerDeadzone:.15};
function readStore<T>(key:string,fallback:T):T {try {const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function saveStore(key:string,value:unknown) {try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Play remains available with storage disabled. */}}
let settings={...defaults,...readStore<Partial<Settings>>('abyss-settings',{})};
settings.sensitivity=Math.max(.3,Math.min(3,Number(settings.sensitivity)||1));settings.fov=Math.max(75,Math.min(115,Number(settings.fov)||95));settings.volume=Math.max(0,Math.min(100,Number(settings.volume)||0));settings.quality=settings.quality==='low'?'low':'high';
settings.mobileSensitivity=Math.max(.3,Math.min(3,Number(settings.mobileSensitivity)||1));
settings.musicVolume=Math.max(0,Math.min(100,Number(settings.musicVolume)||0));
settings.controlScheme=['qwerty','azerty','controller','mobile'].includes(settings.controlScheme)?settings.controlScheme:'qwerty';
settings.controllerSensitivity=Math.max(.3,Math.min(3,Number(settings.controllerSensitivity)||1));settings.controllerDeadzone=Math.max(.05,Math.min(.4,Number(settings.controllerDeadzone)||.15));
document.body.dataset.controls=settings.controlScheme;
let best=Math.max(0,Number(readStore('abyss-survival-v3-best',0))||0);
let renderer:GameRenderer;const sound=new Sound();sound.setVolume(settings.volume/100);const music=new Music();music.setVolume(settings.musicVolume/100);
let entrance=false;let entranceRun:{seed:number;setup:RunSetup}|null=null;
const deathHistory=new DeathHistory();let deathAnalysis:DeathAnalysis|null=null;let analysisActive=false;let analysisSuspended=false;
let mode:'menu'|'playing'|'paused'|'dead'|'replay'='menu';let world:World|null=null;let yaw=0,pitch=0;let input:Input=idleInput();let accumulator=0,last=performance.now(),hudTime=0;let settingsOpen=false;let noticeUntil=0,noticeText='';const keys=new Set<string>();const pressedKeys=new Map<string,string>();
type PlayerProfile={name:string;automatic:boolean;configured:boolean};
const savedProfile=readStore<Partial<PlayerProfile>|null>('abyss-player-profile',{})??{};
const savedName=typeof savedProfile.name==='string'?savedProfile.name:readStore<unknown>('abyss-player-name','');
let profile:PlayerProfile={name:typeof savedName==='string'?savedName:'',automatic:savedProfile.automatic===true,configured:savedProfile.configured===true||(typeof savedName==='string'&&savedName.trim().length>0)};
let runNickname='',runAutomatic=false,profileOpen=false,profileAction:'start'|'edit'|'publish'='edit';
let leaderboardOpen=false,leaderboardScores:Awaited<ReturnType<typeof loadLeaderboard>>=[],ownScore:OwnScore|null=null;
const scoreQueue=new ScoreQueue(pending=>saveStore('abyss-pending-score',pending),publishCandidate,readStore<PendingScore|null>('abyss-pending-score',null));
let recorder:RunRecorder|null=null,replay:ReplayPlayer|null=null,lastRun:RecordedRun|null=null;let practice=false,historyOpen=false,replayPaused=false;
let friends:FriendsSession|null=null;let friendsOpen=false;const lobbyBrowser=new LobbyBrowser();let lobbyStarted=false;let lobbyCrewCount=1;let receivedEpoch=-1;let lastSnapshotAt=0;
const buttonEdges:{button:'fire'|'homing'|'jump';held:boolean}[]=[];let sampledFire=false,sampledHoming=false,sampledJump=false;let capturingMouse=false,captureTicket=0;
let previousPad:ReturnType<typeof controllerState>|null=null;let activePadIndex:number|null=null;let padFire=false,padHoming=false,padJump=false;
let movement={forward:0,strafe:0,jump:false},controllerDown=false,controllerFast=false;
let blockedPadJump=true,blockedPadFire=true,blockedPadHoming=true;
const format=(time:number)=>time.toFixed(3);
function updateBest() {$('best-menu').innerHTML=best?`${format(best)} <span>SECONDS</span>`:'— <span>SECONDS</span>';$('best-hud').textContent=format(best);}
function showPanels() {music.setScene(analysisActive?'silent':entrance?'entrance':mode==='menu'||mode==='paused'||mode==='dead'?'menu':'silent');$<HTMLButtonElement>('timer').disabled=!!friends||settings.controlScheme!=='mobile'||mode!=='playing';$('player-profile').hidden=!profileOpen;$('leaderboard').hidden=!leaderboardOpen;$('friends').hidden=!friendsOpen;$('crew-hud').hidden=!friends||mode==='menu';$('menu').hidden=mode!=='menu';$('hud').hidden=mode==='menu'||(entrance&&settings.controlScheme!=='mobile');$('replay-controls').hidden=mode!=='replay';$('history').hidden=!historyOpen;$('pause').hidden=mode!=='paused'||settingsOpen;$('death').hidden=mode!=='dead'||settingsOpen||analysisActive;$('death-analysis').hidden=!analysisActive;$('hud').hidden=analysisActive||$('hud').hidden;$('settings').hidden=!settingsOpen;document.querySelectorAll('.controller-focus').forEach(el=>{if(!(el as HTMLElement).getClientRects().length)el.classList.remove('controller-focus');});}
function syncSpectator(){
  const local=friends&&world?.crew.find(p=>p.id===friends!.localId);
  // A crew wipe freezes the free camera at its last position. Keep using it
  // behind the results panel so the view cannot snap to a corpse or show a hand.
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
  if(!renderer.originalEnemies.ready||!renderer.originalWeapon.ready)return;
  const previewParams=new URLSearchParams(location.search),previewHand=Number(previewParams.get('hand-preview'));const devPreview=import.meta.env.DEV&&((previewHand>=1&&previewHand<=4)||ENEMY_KINDS.includes(previewParams.get('enemy-preview') as typeof ENEMY_KINDS[number]));
  if(!devPreview&&setup.time===0&&setup.level===1&&setup.reserve===0&&!profile.configured){openProfile('start');return;}
  runNickname=profile.name;runAutomatic=profile.automatic;lastRun=null;resetDeathAnalysis();
  renderer.clear();sound.clear();renderer.topDown=false;replay=null;const seed=crypto.getRandomValues(new Uint32Array(1))[0];world=createRun(seed,setup);recorder=new RunRecorder(seed,setup);practice=setup.time!==0||setup.level!==1||setup.reserve!==0;historyOpen=false;leaderboardOpen=false;
  if(import.meta.env.DEV){const preview=Number(new URLSearchParams(location.search).get('hand-preview'));if(preview>=1&&preview<=4){practice=true;world.level=preview;world.stats.collected=preview===1?0:preview===2?10:70;world.reserve=preview===4?150:preview===3?50:0;}}
  if(import.meta.env.DEV){const preview=new URLSearchParams(location.search).get('enemy-preview');const kinds=ENEMY_KINDS;if(kinds.includes(preview as typeof kinds[number])){practice=true;const kind=preview as typeof kinds[number];const y=kind==='leviathan'?15:kind==='orb'?5:kind==='squid'?3.3:kind==='squid2'?5.2:kind==='squid3'?7:kind==='spider'?1.65:kind==='centipede'?3:1;world.player.pos.z=-14;const e=world.spawn(kind,{x:0,y,z:-26});e.age=kind==='spider2'?9.5:kind==='leviathan'?9:kind==='orb'?7:isSpider(kind)||isPede(kind)||kind==='thorn'?3.5:1.2;if(isSpider(kind))e.headExposure=1;if(kind.startsWith('squid')){e.phase=Math.PI;}}}
  entrance=!devPreview;entranceRun=entrance?{seed,setup:{...setup}}:null;
  if(entrance){world=new World(seed,{schedule:false});world.player.pos={...ENTRANCE_SPAWN};recorder=null;void sound.prepareEntrance(best);}
  yaw=0;pitch=import.meta.env.DEV&&new URLSearchParams(location.search).get('enemy-preview')==='leviathan'?.6:0;clearInput();(document.activeElement as HTMLElement|null)?.blur();mode='playing';accumulator=0;last=performance.now();settingsOpen=false;showPanels();if(!entrance)void sound.start();void captureMouse();if(!entrance){deathHistory.capture(world,yaw,pitch,true,input.fire||input.homing);notice('KEEP MOVING. RELEASE FIRE TO COLLECT.',4);}
}
function enterArena(){
  if(!entranceRun)return;const {seed,setup}=entranceRun;
  entrance=false;entranceRun=null;world=createRun(seed,setup);recorder=new RunRecorder(seed,setup);
  yaw=0;pitch=0;clearInput();deathHistory.reset();deathHistory.capture(world,yaw,pitch,true,input.fire||input.homing);renderer.clear();sound.clear();showPanels();void sound.collectDagger(best);notice('KEEP MOVING. RELEASE FIRE TO COLLECT.',4);
}
function resume() {music.unlock();if(!world||profileOpen||leaderboardOpen||historyOpen||friendsOpen)return;clearInput();(document.activeElement as HTMLElement|null)?.blur();mode='playing';settingsOpen=false;accumulator=0;last=performance.now();showPanels();if(entrance)void sound.prepareEntrance(best);else void sound.start();void captureMouse();}
function home() {resetDeathAnalysis(true);entrance=false;entranceRun=null;leaveMobileFullscreen();spectator.reset();leaderboardOpen=false;friends?.close();friends=null;friendsOpen=false;replay=null;recorder=null;renderer.topDown=false;historyOpen=false;mode='menu';world=null;settingsOpen=false;clearInput();document.exitPointerLock?.();renderer.clear();sound.clear();sound.pause();updateBest();showPanels();}
function paused() {
  if(mode!=='playing')return;
  // Browser interruptions release held controls, but multiplayer never pauses.
  if(friends){friends.releaseControls();clearInput();return;}
  mode='paused';accumulator=0;clearInput();document.exitPointerLock?.();sound.pause();showPanels();
}
function death() {
  if(!world)return;mode='dead';clearInput();document.exitPointerLock?.();
  const record=!friends&&!practice&&world.time>best;if(record){best=world.time;saveStore('abyss-survival-v3-best',best);}
  $('death-time').textContent=format(world.time);$('retry').hidden=!!friends&&friends.role==='guest';$('retry').innerHTML=friends?'RETURN TO LOBBY <span>↗</span>':'DEFY IT AGAIN <span>↗</span>';$('death-cause').textContent=friends?'The crew fell. '+(friends.role==='host'?'Return to the lobby to ready up again.':'Waiting for the host to restart.'):world.deathSource?`Killed by ${killerName(world.deathSource.kind)}.`:world.cause==='FALLEN'?'Fell into the abyss.':`Taken by ${world.cause.toLowerCase()}.`;$('death-title').textContent=world.cause==='FALLEN'?'LOST BELOW.':'CONSUMED.';
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
function updateHud() {
  if(!world)return;const w=world;
  $('timer').textContent=format(w.time);$('gems').textContent=String(w.stats.collected);$('kills').textContent=String(w.stats.kills);
  $('level').textContent=['I','II','III','IV'][w.level-1];$('power-name').textContent=['AWAKENED','KINDLED','ASCENDANT','UNBOUND'][w.level-1];
  const progress=w.level===1?w.stats.collected/10:w.level===2?(w.stats.collected-10)/60:w.level===3?w.reserve/150:1;
  $('progress').style.width=`${Math.min(100,progress*100)}%`;
  $('homing').textContent=w.level>=3?`${w.reserve} HOMING DAGGERS IN RESERVE`:`HOMING LOCKED · ${70-w.stats.collected} GEMS`;
  $('collection').textContent=spectator.position?'SPECTATING · FREE FLIGHT':input.fire||input.homing?'FIRING · GEMS DRIFT AWAY':w.gems.length?'CALLING GEMS':'RELEASE FIRE TO CALL GEMS';
  $('collection').style.color=input.fire||input.homing?'var(--muted)':'var(--bone)';
  $('phase').textContent=spectator.position?'SPECTATING':friends?'FRIENDS':mode==='replay'?'REPLAY':practice?'PRACTICE':w.wave>=0?`WAVE ${w.wave+1}`:'SURVIVAL';
  $('notice').textContent=noticeText;$('notice').style.opacity=performance.now()<noticeUntil?'1':'0';
  const ring=$('threat-ring');ring.replaceChildren();
  if(settings.threatCues&&!spectator.position) {
    const threats=w.enemies.filter(e=>distance(e.pos,w.player.pos)<9&&e.age>1).sort((a,b)=>distance(a.pos,w.player.pos)-distance(b.pos,w.player.pos)).slice(0,5);
    for(const e of threats) {
      const angle=Math.atan2(e.pos.x-w.player.pos.x,-(e.pos.z-w.player.pos.z))+yaw;
      const dist=distance(e.pos,w.player.pos);const element=document.createElement('i');element.className='threat';
      const viewport=gameViewport(),radius=Math.min(viewport.width,viewport.height)*.32;
      element.style.transform=`translate(${Math.sin(angle)*radius}px,${-Math.cos(angle)*radius}px) rotate(${angle}rad)`;element.style.opacity=String(Math.max(.2,1-dist/10));ring.append(element);
    }
  }
  const next=settings.threatCues&&!spectator.position?TIMELINE.find(e=>e.time>w.time&&e.time-w.time<1.5):undefined;
  if(next&&performance.now()>noticeUntil)notice(next.kind==='spider'?'A REAPER STIRS':isPede(next.kind)?'SOMETHING MOVES BELOW':'A SUMMONER APPROACHES',1);
}
function frame(now:number) {
  const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(.05,elapsed);last=now;
  music.update(dt);
  pollController(dt);
  if(settings.controlScheme==='mobile')sampleMobileInput();
  else if(settings.controlScheme!=='controller')movement=keyboardMovement(keys,settings.controlScheme);
  if(mode==='playing'&&!settingsOpen)renderer.trackFrame(elapsed);
  if(!friends&&mode==='playing'&&world&&!controlMenuRoot()) {
    input.forward=movement.forward;input.strafe=movement.strafe;input.jump=movement.jump;input.yaw=yaw;input.pitch=pitch;
    accumulator+=Math.min(.1,elapsed);let steps=0;
    while(accumulator>=STEP&&world.state==='playing'&&steps++<12) {const edge=buttonEdges.shift();if(edge){if(edge.button==='fire')sampledFire=edge.held;else if(edge.button==='homing')sampledHoming=edge.held;else sampledJump=edge.held;}input.fire=sampledFire;input.homing=sampledHoming;input.jump=sampledJump;if(entrance){world.stepEntrance(input);if(touchesEntranceSeal(world.player.pos))enterArena();}else{recorder?.record(input);world.step(input);deathHistory.capture(world,yaw,pitch,false,input.fire||input.homing);}accumulator-=STEP;}
    sound.listener(world.player.pos,yaw,pitch);
    for(const effect of world.effects) {renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);if(effect.kind==='upgrade')notice(`ATTUNEMENT ${['','I','II','III','IV'][effect.amount||1]} · ${effect.amount===3?'HOMING UNLOCKED':'POWER RISES'}`,3);if(effect.kind==='death'){$('flash').style.opacity='1';setTimeout(()=>$('flash').style.opacity='0',170);}}
    world.effects=[];
    if(entrance)sound.entrance(best,ENTRANCE_SEAL);else sound.update(world);
    if(world.state==='dead')death();
  }
  if(friends&&world&&friends.running){
    syncSpectator();
    const cameraActive=mode==='playing'&&!controlMenuRoot();
    if(cameraActive&&spectator.position)spectator.move(dt,yaw,pitch,movement.forward,movement.strafe,(movement.jump||keys.has('e')?1:0)-(controllerDown||keys.has('ControlLeft')||keys.has('ControlRight')||(settings.controlScheme==='qwerty'&&keys.has('q'))?1:0),controllerFast||keys.has('ShiftLeft')||keys.has('ShiftRight'));
    const active=cameraActive&&!spectator.position;input.forward=active?movement.forward:0;input.strafe=active?movement.strafe:0;input.jump=active&&movement.jump;input.yaw=yaw;input.pitch=pitch;
    input.fire=active&&sampledFire;input.homing=active&&sampledHoming;
    accumulator+=Math.min(.1,elapsed);let crewSteps=0;
    while(accumulator>=STEP&&world.state==='playing'&&crewSteps++<12){
      if(active&&Date.now()>=friends.startAt){const edge=buttonEdges.shift();if(edge){if(edge.button==='fire')sampledFire=edge.held;else if(edge.button==='homing')sampledHoming=edge.held;else sampledJump=edge.held;}}
      input.fire=active&&sampledFire;input.homing=active&&sampledHoming;input.jump=active&&sampledJump;
      if(friends.role==='host')friends.step({...input});else if(active)friends.predict(world,{...input});accumulator-=STEP;
    }
    if(friends.role==='host')world.selectCrew('host');
    for(const effect of world.effects){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}world.effects=[];
    syncSpectator();
    sound.listener(spectator.position??world.player.pos,yaw,pitch);if(cameraActive)sound.update(world);
    if(Date.now()<friends.startAt)notice(`CREW READY · STARTING IN ${Math.max(1,Math.ceil((friends.startAt-Date.now())/1000))}`,1);
    $('crew-hud').textContent=`FRIENDS · ${world.crew.length}/4 · ${friends.role==='host'?'HOST':'GUEST'}\n`+world.crew.map((p,i)=>`${i+1}. ${p.id===friends!.localId?'YOU':friends!.members.find(m=>m.id===p.id)?.name??'FRIEND '+(i+1)} · ${p.alive?'ALIVE':p.cause||'DEAD'}`).join('\n');
    const local=world.crew.find(p=>p.id===friends!.localId);if(local&&!local.alive&&world.state==='playing'){$('crew-hud').textContent+=settings.controlScheme==='mobile'?'\nSPECTATING':settings.controlScheme==='controller'?'\nSPECTATING · Left stick fly · Right stick look\nA / Cross up · LB / L1 down · L3 faster':`\nSPECTATING · ${settings.controlScheme==='azerty'?'ZQSD':'WASD'} fly · Mouse look\nSpace / E up · Ctrl down · Shift faster`;}
    if(friends.role==='guest'&&(now-lastSnapshotAt>1000||friends.diagnostics.predictionStalled)){$('crew-hud').textContent+='\nWaiting for host connection…';friends.releaseControls();clearInput();}
    if(world.state==='dead'&&mode!=='dead')death();
  }
  if(mode==='replay'&&replay){if(!replayPaused){accumulator+=Math.min(.1,elapsed);let steps=0;while(accumulator>=STEP&&!replay.done&&steps++<12){const view=replay.input;if(view){yaw=view.yaw;pitch=view.pitch;input={...view};}replay.step();accumulator-=STEP;}if(replay.done){replayPaused=true;sound.stopLoops();$('replay-pause').textContent='PLAY';}}world=replay.world;yaw=replay.lastInput.yaw;pitch=replay.lastInput.pitch;sound.listener(world.player.pos,yaw,pitch);if(!replayPaused)sound.update(world);for(const effect of world.effects){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}world.effects=[];$<HTMLInputElement>('replay-seek').value=String(replay.tick);$('replay-time').textContent=`${format(world.time)} / ${format(replay.run.time)}`;}
  hudTime+=dt;if(hudTime>.05&&world){updateHud();hudTime=0;}
  // Pointer-lock release can remove document focus while the replay is still
  // visible. Only visibility and explicit pause/menu state stop its clock.
  if(analysisActive&&deathAnalysis){if(!analysisSuspended&&!document.hidden&&!settingsOpen&&!profileOpen&&!leaderboardOpen)deathAnalysis.advance(dt);if(deathAnalysis.done)endDeathAnalysis();else updateDeathAnalysis();}
  renderer.setCrewNames(friends?.members??[]);
  // Frozen views show the completed tick; guests already have a sampled network view.
  const renderAlpha=friends?.role==='guest'||world?.state==='dead'||(!friends&&(mode==='paused'||settingsOpen))||(mode==='replay'&&replayPaused)?1:Math.min(1,accumulator/STEP);
  const analysis=analysisActive?deathAnalysis:null;
  renderer.setDeathGhost(analysis?.view.player.pos??null,analysis?.victimYaw,analysis?.impact,analysis?Math.max(0,analysis.elapsed-analysis.duration):0,analysis?.end);
  renderer.render(analysis?.view??(world&&friends?friends.presentation(world,now):world),analysis?.camera.yaw??yaw,analysis?.camera.pitch??pitch,analysis?dt:friends?dt:(mode==='paused'||settingsOpen)?0:dt,mode==='menu',analysis?1:renderAlpha,analysis?.camera.position??spectator.position,friends?.role==='guest',entrance,analysis?{...idleInput(),yaw:analysis.victimYaw,pitch:analysis.victimPitch,fire:analysis.victimFiring}:mode==='replay'?replay?.lastInput:null);
  if(analysis){const marker=renderer.projectDeathMarker(analysis.killerPosition,analysis.killerVisible);$('analysis-marker').hidden=!marker.visible;$('analysis-marker').style.left=`${marker.x}%`;$('analysis-marker').style.top=`${marker.y}%`;}
  requestAnimationFrame(frame);
}
function watchRun(run:RecordedRun){
 resetDeathAnalysis();
 entrance=false;entranceRun=null;
 try{renderer.clear();replay=new ReplayPlayer(run);world=replay.world;recorder=null;mode='replay';historyOpen=false;settingsOpen=false;replayPaused=false;accumulator=0;renderer.topDown=false;document.exitPointerLock?.();sound.clear();void sound.start();const slider=$<HTMLInputElement>('replay-seek');slider.max=String(run.ticks);slider.value='0';$('replay-pause').textContent='PAUSE';showPanels();}catch(error){notice(error instanceof Error?error.message:'REPLAY UNAVAILABLE');}
}
async function openHistory(){
 historyOpen=true;showPanels();const list=$('history-list');list.replaceChildren();
 try{const runs=await listRuns();if(!runs.length){list.textContent='Your completed runs will appear here.';return;}
 for(const run of runs){const row=document.createElement('div');row.className='history-row';const title=document.createElement('span');title.textContent=`${format(run.time)} s · ${run.practice?'PRACTICE':run.cause} · ${run.stats.collected} gems`;const watch=document.createElement('button');watch.textContent='WATCH';watch.onclick=()=>watchRun(run);const keep=document.createElement('button');keep.textContent=run.saved?'KEPT':'KEEP';keep.onclick=()=>{run.saved=!run.saved;void saveRun(run).then(()=>openHistory());};const download=document.createElement('button');download.textContent='EXPORT';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(run)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`abyss-${run.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};row.append(title,watch,keep,download);list.append(row);}
 }catch{list.textContent='Replay storage is unavailable in this browser.';}
}
function updatePlayerCard(){
 $('player-name').textContent=profile.name||'Unlisted player';$('player-sharing').textContent=scoreQueue.pending?(scoreQueue.busy?'Saving your best…':'Best saved here · waiting to publish'):profile.automatic?'New bests publish automatically':'Scores stay local until you publish';
 $<HTMLInputElement>('friends-name').value=profile.name||'Wanderer';
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
 const run=lastRun;if(eligibleForLeaderboard(run,practice,!!friends)&&run&&runAutomatic&&runNickname&&leaderboardConfigured()){scoreQueue.enqueue(scoreCandidate(run),runNickname);void scoreQueue.flush();}
 renderRunScore();
}
function publishCurrentRun(){
 const run=lastRun;if(eligibleForLeaderboard(run,practice,!!friends)&&run){
  if(!runNickname){openProfile('publish');return;}scoreQueue.enqueue(scoreCandidate(run),runNickname);
 }
 if(scoreQueue.pending)void scoreQueue.flush();
}
function renderRankings(){
 const list=$('leaderboard-rows'),search=$<HTMLInputElement>('leaderboard-search').value.trim().toLocaleLowerCase();list.replaceChildren();
 const scores=leaderboardScores.map((score,index)=>({score,rank:index+1})).filter(({score})=>score.player_name.toLocaleLowerCase().includes(search));
 for(const {score,rank} of scores){const row=document.createElement('tr');const isOwn=ownScore?.rank===rank&&ownScore.player_name===score.player_name&&ownScore.survival_ms===score.survival_ms&&ownScore.achieved_at===score.achieved_at;if(isOwn){row.className='your-score';row.setAttribute('aria-label','Your public best');}
 for(const value of [rank,score.player_name+(isOwn?' · YOU':''),format(score.survival_ms/1000),score.kills,score.gems]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}list.append(row);}
 $('leaderboard-status').textContent=search?`${scores.length} matching ${scores.length===1?'player':'players'} in the top 100`:leaderboardScores.length?`${leaderboardScores.length} ranked ${leaderboardScores.length===1?'player':'players'} · top 100`:'The arena is waiting for its first published score.';
 if(search&&!scores.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.textContent='No matching players. Try another nickname.';row.append(cell);list.append(row);}
}
function renderPersonalRanking(){
 const card=$('leaderboard-personal');card.replaceChildren();const name=document.createElement('strong');name.textContent=ownScore?`${ownScore.player_name} · YOUR PUBLIC BEST`:profile.name||'YOUR PLAYER PROFILE';const detail=document.createElement('span');detail.textContent=ownScore?`${format(ownScore.survival_ms/1000)} s · rank #${ownScore.rank}`:scoreQueue.pending?'Your best is saved here and waiting to publish.':'Complete standard Survival to set your first public best.';card.append(name,detail);
 if(scoreQueue.pending){const retry=document.createElement('button');retry.className='lobby-back';retry.textContent=scoreQueue.busy?'SAVING…':'RETRY SAVE';retry.disabled=scoreQueue.busy;retry.onclick=()=>void scoreQueue.flush();card.append(retry);}
}
async function syncPublicBest(){
 try{ownScore=await loadOwnScore();scoreQueue.remember(ownScore);renderPersonalRanking();}catch{/* Reading rankings still works if a player session cannot load. */}
}
async function openLeaderboard(){
 leaderboardOpen=true;showPanels();renderPersonalRanking();const button=$<HTMLButtonElement>('leaderboard-refresh');if(button.disabled)return;button.disabled=true;$('leaderboard-status').textContent='Connecting to the public leaderboard…';
 try{const [scores]=await Promise.all([loadLeaderboard(),syncPublicBest()]);leaderboardScores=scores;renderRankings();$('leaderboard-updated').textContent=`Updated ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
 }catch(error){$('leaderboard-status').textContent=error instanceof Error?error.message:'The leaderboard is unavailable. Your runs still work.';}finally{button.disabled=false;}
}
function setupLeaderboard(){
 updatePlayerCard();scoreQueue.onChange=()=>{updatePlayerCard();renderRunScore();ownScore=scoreQueue.confirmed;renderPersonalRanking();if(leaderboardOpen&&!scoreQueue.pending&&!scoreQueue.busy)void openLeaderboard();};
 $('profile-edit').onclick=()=>openProfile('edit');$('leaderboard-profile').onclick=()=>openProfile('edit');$('score-profile').onclick=()=>openProfile('publish');
 $('profile-cancel').onclick=()=>{profileOpen=false;showPanels();};$('profile-local').onclick=()=>{try{const typed=$<HTMLInputElement>('profile-name').value.trim();saveProfile(typed?cleanNickname(typed):'',false);profileOpen=false;showPanels();startRun();}catch(error){$('profile-error').textContent=error instanceof Error?error.message:'Choose a nickname.';}};
 $<HTMLInputElement>('friends-name').onchange=()=>{try{saveProfile(cleanNickname($<HTMLInputElement>('friends-name').value),profile.automatic);}catch(error){$('friends-status').textContent=error instanceof Error?error.message:'Choose a nickname.';}};
 $('profile-form').onsubmit=event=>{event.preventDefault();try{const name=cleanNickname($<HTMLInputElement>('profile-name').value);saveProfile(name,$<HTMLInputElement>('profile-auto').checked);profileOpen=false;showPanels();
 if(profileAction==='start')startRun();else if(profileAction==='publish'){runNickname=name;publishCurrentRun();}else if(mode==='dead'){runNickname=name;renderRunScore();}
 if(profile.automatic&&scoreQueue.pending)void scoreQueue.flush();
 }catch(error){$('profile-error').textContent=error instanceof Error?error.message:'Choose a nickname.';}};
 $('publish-run').onclick=publishCurrentRun;
 $('leaderboard-open').onclick=()=>void openLeaderboard();$('death-leaderboard').onclick=()=>void openLeaderboard();$('leaderboard-refresh').onclick=()=>void openLeaderboard();$('leaderboard-search').oninput=renderRankings;$('leaderboard-close').onclick=()=>{leaderboardOpen=false;showPanels();};
 if(leaderboardConfigured())void syncPublicBest();
 const retryPending=()=>{if(profile.automatic&&scoreQueue.pending&&!scoreQueue.busy&&leaderboardConfigured())void scoreQueue.flush();};
 window.addEventListener('online',retryPending);setInterval(retryPending,15000);retryPending();
}
function updateMobileLayout(){
 const {width,height,rotated}=gameViewport();document.body.dataset.mobileRotated=String(rotated);
 document.body.style.setProperty('--game-width',`${width}px`);document.body.style.setProperty('--game-height',`${height}px`);renderer?.resize();
}
async function enterMobileFullscreen(){
 try{
  if(!document.fullscreenElement&&document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen({navigationUI:'hide'});mobileFullscreen=true;}
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
 if(mobileFullscreen){mobileFullscreen=false;if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});}
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
 document.addEventListener('fullscreenchange',()=>{if(settings.controlScheme==='mobile'){updateMobileLayout();if(mobileFullscreen&&!document.fullscreenElement){mobileFullscreen=false;paused();}}});
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
 if(mode==='paused')return $('pause');if(mode==='dead')return analysisActive?$('death-analysis'):$('death');if(mode==='replay')return $('replay-controls');if(mode==='menu')return $('menu');return null;
}
function closeControlMenu(){
 if(profileOpen){profileOpen=false;showPanels();}else if(settingsOpen){settingsOpen=false;showPanels();}else if(leaderboardOpen){leaderboardOpen=false;showPanels();}else if(historyOpen){historyOpen=false;showPanels();}else if(friendsOpen){friendsOpen=false;showPanels();}else if(analysisActive)endDeathAnalysis();else if(mode==='replay')home();
}
function focusControl(element:HTMLElement){
 document.querySelectorAll('.controller-focus').forEach(el=>el.classList.remove('controller-focus'));element.classList.add('controller-focus');element.focus();element.scrollIntoView({block:'nearest'});
}
function controllerMenu(state:ReturnType<typeof controllerState>,previous:ReturnType<typeof controllerState>|null){
 const edge=(key:keyof typeof state)=>!!state[key]&&!previous?.[key];
 if(edge('back')){closeControlMenu();return;}
 const root=controlMenuRoot();if(!root)return;
 const elements=Array.from(root.querySelectorAll<HTMLElement>('button,input,select,summary')).filter(el=>el.getClientRects().length&&!el.matches(':disabled'));
 if(!elements.length)return;
 const defaultId=mode==='menu'&&root===$('menu')?'start':root===$('pause')?'resume':root===$('death')?'retry':root===$('death-analysis')?'analysis-retry':root===$('settings')?'control-scheme':root===$('replay-controls')?'replay-pause':'';
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
function pollController(dt:number){
 movement={forward:0,strafe:0,jump:false};controllerDown=false;controllerFast=false;
 let pads:(Gamepad|null)[]=[];try{pads=Array.from(navigator.getGamepads?.()??[]);}catch{/* API may be blocked by browser permissions. */}
 const standard=pads.filter((p):p is Gamepad=>!!p?.connected&&p.mapping==='standard');
 let pad=standard.find(p=>p.index===activePadIndex);
 if(!pad&&activePadIndex!==null){
  if(settings.controlScheme==='controller'&&mode==='playing'){paused();notice('CONTROLLER DISCONNECTED · RECONNECT TO RETURN',5);}
  activePadIndex=null;previousPad=null;
 }
 pad??=standard[0];
 const status=pad?`Connected · ${pad.id}`:pads.some(p=>p?.connected)?'This controller has no standard mapping. Use a standard Xbox / PlayStation compatible controller.':'Connect a controller and press a button to detect it.';
 if($('controller-status').textContent!==status)$('controller-status').textContent=status;
 if(!pad){if(settings.controlScheme==='controller'&&mode==='playing'){paused();notice('CONNECT A CONTROLLER OR CHOOSE KEYBOARD CONTROLS',5);}previousPad=null;return;}
 const state=controllerState(pad,settings.controllerDeadzone),previous=previousPad;previousPad=state;
 // Detecting or replacing a controller establishes a baseline; the wake-up
 // button must not also activate a menu or resume a run.
 if(activePadIndex!==pad.index){activePadIndex=pad.index;if(settings.controlScheme==='controller')clearInput();return;}
 if(!state.jump)blockedPadJump=false;if(!state.fire)blockedPadFire=false;if(!state.homing)blockedPadHoming=false;
 if(document.hidden||!document.hasFocus())return;
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
    el.oninput=()=>{settings[name]=Number(el.value);$(name+'-value').textContent=(name==='volume'||name==='musicVolume')?`${el.value}%`:el.value;saveStore('abyss-settings',settings);sound.setVolume(settings.volume/100);music.setVolume(settings.musicVolume/100);renderer.configure(settings);};
  }
  const scheme=$<HTMLSelectElement>('control-scheme');scheme.value=settings.controlScheme;scheme.onchange=()=>{settings.controlScheme=scheme.value as ControlScheme;clearInput();saveStore('abyss-settings',settings);updateControlHints();};updateControlHints();
  const q=$<HTMLSelectElement>('quality');q.value=settings.quality;q.onchange=()=>{settings.quality=q.value;saveStore('abyss-settings',settings);renderer.configure(settings);};
  const cues=$<HTMLInputElement>('threat-cues');cues.checked=settings.threatCues;cues.onchange=()=>{settings.threatCues=cues.checked;saveStore('abyss-settings',settings);};
}
function openSettings() {if(friends&&mode==='playing')return;if(mode==='playing')paused();settingsOpen=true;clearInput();setupSettings();showPanels();}
function beginCrew(host:boolean){
 entrance=false;entranceRun=null;
 spectator.reset();
 $('pause').querySelector('p')!.textContent='The crew run is live. Click return to capture your mouse.';
 resetDeathAnalysis(true);renderer.clear();sound.clear();recorder=null;replay=null;lastRun=null;practice=true;historyOpen=false;settingsOpen=false;friendsOpen=false;world=host?friends!.world:new World(1,{schedule:false});yaw=0;pitch=0;clearInput();accumulator=0;last=performance.now();renderer.topDown=false;mode='playing';(document.activeElement as HTMLElement|null)?.blur();showPanels();void sound.start();void captureMouse();notice('CREW RUN · RELEASE FIRE TO SHARE GEMS',4);
}
function roster(){
 const joined=!!friends;$('friends-browser').hidden=joined;$('friends-waiting').hidden=!joined;if(!friends)return;
 $('friends-room-name').textContent=friends.lobbyName;$('friends-player-count').textContent=`${friends.members.length} / 4 PLAYERS`;
 const list=$('friends-roster');list.replaceChildren();const local=friends.members.find(p=>p.id===friends!.localId);
 for(let i=0;i<4;i++){const member=friends.members[i];const card=document.createElement('div');card.className='crew-slot'+(member?.ready?' is-ready':'')+(!member?' empty':'');card.style.setProperty('--crew-color',['#cfdfa0','#8ed4dd','#e1bc8d','#c4a7df'][i]);const mark=document.createElement('div');mark.className='crew-avatar';mark.textContent=member?'◇':'+';const name=document.createElement('strong');name.textContent=member?member.name+(member.id===friends.localId?' · YOU':''):'OPEN SLOT';const role=document.createElement('small');role.textContent=member?(member.host?'HOST':'CREW'):'WAITING FOR A PLAYER';const badge=document.createElement('span');badge.className='crew-ready';badge.textContent=member?(member.ready?'✓ READY':'NOT READY'):'—';card.append(mark,name,role,badge);list.append(card);}
 const count=friends.members.filter(p=>p.ready).length;$('friends-ready-count').textContent=`${count} / ${friends.members.length} READY`;$('friends-launch-hint').textContent=friends.role==='host'?(friends.allReady?'The crew is ready. Start when you are.':'Waiting for every player to mark ready.'):'The host will start when everyone is ready.';
 const ready=$<HTMLButtonElement>('friends-ready');ready.disabled=!local||friends.running;ready.classList.toggle('is-ready',!!local?.ready);ready.textContent=local?.ready?'READY ✓ · CLICK TO UNREADY':"I'M READY ✓";
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
 const session=new FriendsSession(role,ice);session.setName($<HTMLInputElement>('friends-name').value);friends=session;
 session.onChange=()=>{if(friends!==session)return;roster();if(role==='guest'&&!session.connected&&world&&session.running){home();friendsOpen=true;showPanels();roster();$('friends-status').textContent='The host left. Choose another lobby to play again.';}};
 session.onError=message=>{$('friends-status').textContent=message;notice(message,6);};
 session.onSnapshot=(snapshot:ArenaSnapshot)=>{if(friends!==session)return;lastSnapshotAt=performance.now();lobbyCrewCount=snapshot.crew.length;if(!snapshot.running){spectator.reset();if(world){world=null;mode='menu';clearInput();document.exitPointerLock?.();renderer.clear();sound.clear();friendsOpen=true;showPanels();}roster();return;}if(snapshot.epoch!==receivedEpoch){receivedEpoch=snapshot.epoch;beginCrew(false);}if(world){session.reconcile(world,snapshot);for(const effect of snapshot.effects??[]){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}}};
 session.onEffects=effects=>{if(friends!==session||!world)return;for(const effect of effects){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}};roster();return session;
}
async function joinLobby(room:PublicLobby){$('friends-status').textContent=`Joining ${room.name}…`;const session=newSession('guest');session.lobbyName=room.name;roster();await session.joinPublic(room);$('friends-status').textContent='Connecting to your crew…';}
function returnCrewLobby(){spectator.reset();if(friends?.role!=='host')return;friends.returnToLobby();world=null;mode='menu';clearInput();document.exitPointerLock?.();renderer.clear();sound.clear();friendsOpen=true;settingsOpen=false;showPanels();roster();}
function setupFriends(){
 lobbyBrowser.onChange=renderLobbies;lobbyBrowser.onStatus=text=>$('friends-service').textContent=text;
 $('friends-open').onclick=()=>{friendsOpen=true;showPanels();roster();renderLobbies();if(!lobbyStarted){lobbyStarted=true;void lobbyBrowser.start();}};
 $('friends-refresh').onclick=()=>lobbyBrowser.refresh();$('friends-close').onclick=()=>{friendsOpen=false;showPanels();};
 $('friends-leave').onclick=()=>{home();friendsOpen=true;showPanels();roster();renderLobbies();$('friends-status').textContent='You left the lobby.';};
 $('friends-host').onclick=()=>{const button=$<HTMLButtonElement>('friends-host');button.disabled=true;$('friends-status').textContent='Creating your lobby…';const session=newSession('host');void session.hostPublic($<HTMLInputElement>('friends-lobby-name').value).then(()=>{$('friends-status').textContent='Lobby is live. Your friends can find it in Open lobbies.';roster();}).catch(e=>{$('friends-status').textContent=String(e.message||e);friends=null;session.close();roster();}).finally(()=>button.disabled=false);};
 $('friends-ready').onclick=()=>{if(!friends)return;const local=friends.members.find(p=>p.id===friends!.localId);if(!local)return;const ready=!local.ready;friends.setReady(ready);if(!ready||settings.controlScheme==='mobile'||settings.controlScheme==='controller'){roster();return;}capturingMouse=true;void $('game').requestPointerLock().then(()=>{document.exitPointerLock?.();}).catch(()=>{}).finally(()=>{capturingMouse=false;});roster();};
 $('friends-start').onclick=()=>{if(friends?.role==='host'&&friends.allReady){friends.start();beginCrew(true);}};
}
function init() {
  try {renderer=new GameRenderer($<HTMLCanvasElement>('game'),settings);}catch(error){$('error').hidden=false;$('error').textContent=`The arena could not initialize WebGL2. Enable hardware acceleration and use a current browser. ${error instanceof Error?error.message:''}`;return;}
  updateBest();showPanels();setupSettings();
  // Begin decoding on the first menu gesture, before a quick initial burst.
  document.addEventListener('pointerdown',()=>void sound.start(),{once:true});
  document.addEventListener('pointerdown',()=>music.unlock());
  document.addEventListener('keydown',()=>music.unlock());
  const start=$<HTMLButtonElement>('start');start.disabled=true;void renderer.prepare().then(()=>{start.disabled=!(renderer.originalEnemies.ready&&renderer.originalWeapon.ready);if(start.disabled){$('error').hidden=false;$('error').textContent='The original game assets could not load. '+renderer.originalEnemies.error+' '+renderer.originalWeapon.error;}}).catch(error=>{$('error').hidden=false;$('error').textContent='The arena could not prepare its graphics. '+String(error);});
  $('analysis-retry').onclick=()=>$('retry').click();$('analysis-skip').onclick=endDeathAnalysis;$('analysis-pause').onclick=()=>{analysisSuspended=!analysisSuspended;updateDeathAnalysis();};$('watch-death').onclick=startDeathAnalysis;
  $('start').onclick=()=>{if(friends){friendsOpen=true;showPanels();return;}startRun();};$('retry').onclick=()=>{if(friends){if(friends.role==='host')returnCrewLobby();return;}startRun(practice&&lastRun?lastRun.setup:DEFAULT_SETUP);};$('resume').onclick=resume;$('quit').onclick=home;$('home').onclick=home;
  $('settings-open').onclick=openSettings;$('pause-settings').onclick=openSettings;$('settings-close').onclick=()=>{settingsOpen=false;showPanels();};
  $('practice-start').onclick=()=>{if(friends){friendsOpen=true;showPanels();return;}startRun({time:Math.max(0,Math.min(1200,Number($<HTMLInputElement>('practice-time').value)||0)),level:Number($<HTMLSelectElement>('practice-level').value),reserve:Math.max(0,Math.min(1000,Number($<HTMLInputElement>('practice-homing').value)||0))});};
  $('history-open').onclick=()=>void openHistory();$('history-close').onclick=()=>{historyOpen=false;showPanels();};$('watch-last').onclick=()=>{if(lastRun)watchRun(lastRun);};$('replay-exit').onclick=home;$('replay-pause').onclick=()=>{if(replay?.done){seekReplay(0);sound.clear();}replayPaused=!replayPaused;if(replayPaused)sound.pause();else void sound.start();accumulator=0;$('replay-pause').textContent=replayPaused?'PLAY':'PAUSE';};
  $<HTMLInputElement>('replay-seek').oninput=()=>{if(replay){sound.clear();world=seekReplay(Number($<HTMLInputElement>('replay-seek').value));accumulator=0;}};
  document.addEventListener('pointerlockchange',()=>{if(settings.controlScheme!=='controller'&&settings.controlScheme!=='mobile'&&document.pointerLockElement!==$('game')&&!capturingMouse)paused();});
  document.addEventListener('visibilitychange',()=>{music.setHidden(document.hidden);if(document.hidden&&mode==='playing'){document.exitPointerLock?.();paused();}});
  window.addEventListener('blur',()=>{if(mode==='playing'){document.exitPointerLock?.();paused();}});
  window.addEventListener('keydown',e=>{if(e.code==='Escape'){if(analysisActive){e.preventDefault();endDeathAnalysis();return;}if(friends&&mode==='playing'){e.preventDefault();return;}if(profileOpen||settingsOpen||leaderboardOpen||historyOpen||friendsOpen){e.preventDefault();closeControlMenu();return;}if(mode==='playing'){e.preventDefault();paused();return;}}if(analysisActive&&e.code==='Space'){e.preventDefault();analysisSuspended=!analysisSuspended;updateDeathAnalysis();return;}if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(mode==='replay'&&e.code==='KeyM'){renderer.topDown=!renderer.topDown;return;}if(mode==='replay'&&(e.code==='ArrowLeft'||e.code==='ArrowRight')&&replay){sound.clear();world=seekReplay(replay.tick+(e.code==='ArrowLeft'?-1:1)*(e.ctrlKey?10:3)/STEP);accumulator=0;return;}if(!entrance&&!friends&&['Digit1','Digit2','Digit3','Digit4','Numpad1','Numpad2','Numpad3','Numpad4'].includes(e.code)&&(mode==='playing'||mode==='paused')&&world&&!settingsOpen){e.preventDefault();if(e.repeat)return;const level=Number(e.code.slice(-1));world.level=level;world.stats.collected=level===1?0:level===2?10:level===3?70:220;world.reserve=level===3?50:level===4?150:0;practice=true;recorder=null;world.emit('upgrade',world.player.pos,level);notice(`WEAPON ${level} · UNRANKED TEST RUN`,4);updateHud();return;}if(e.code==='Space'&&mode==='playing')e.preventDefault();if(e.code==='KeyR'&&mode==='dead'&&!settingsOpen&&!profileOpen&&!leaderboardOpen&&!(e.target instanceof HTMLInputElement)){if(friends){if(friends.role==='host')returnCrewLobby();}else startRun(practice&&lastRun?lastRun.setup:DEFAULT_SETUP);return;}if(e.code==='Escape'&&leaderboardOpen){leaderboardOpen=false;showPanels();return;}if(e.code==='Escape'&&settingsOpen){settingsOpen=false;showPanels();return;}if(e.code==='Escape'&&settings.controlScheme==='controller'&&mode==='playing'){paused();return;}if(mode==='playing'&&!controlMenuRoot()&&settings.controlScheme!=='controller'&&settings.controlScheme!=='mobile'){if(!pressedKeys.has(e.code))pressedKeys.set(e.code,e.key.toLowerCase());keys.add(e.code);keys.add(pressedKeys.get(e.code)!);if(e.code==='Space'&&!e.repeat&&!spectator.position)buttonEdges.push({button:'jump',held:true});}});
  window.addEventListener('keyup',e=>{const letter=pressedKeys.get(e.code);pressedKeys.delete(e.code);keys.delete(e.code);if(letter&&!Array.from(pressedKeys.values()).includes(letter))keys.delete(letter);if(mode==='playing'&&settings.controlScheme!=='controller'&&settings.controlScheme!=='mobile'&&e.code==='Space')buttonEdges.push({button:'jump',held:false});});
  document.addEventListener('mousemove',e=>{if(settings.controlScheme==='controller'||settings.controlScheme==='mobile'||mode!=='playing'||document.pointerLockElement!==$('game'))return;yaw-=e.movementX*.002*settings.sensitivity;const limit=spectator.position?Math.PI/2:1.5;pitch=Math.max(-limit,Math.min(limit,pitch-e.movementY*.002*settings.sensitivity));});
  document.addEventListener('mousedown',e=>{if(settings.controlScheme==='controller'||settings.controlScheme==='mobile'||mode!=='playing'||spectator.position||document.pointerLockElement!==$('game'))return;if(e.button===0)buttonEdges.push({button:'fire',held:true});if(e.button===2){buttonEdges.push({button:'homing',held:true});if(world&&world.level<3)notice('HOMING AWAKENS AT 70 GEMS',1.5);}});
  document.addEventListener('mouseup',e=>{if(settings.controlScheme==='controller'||settings.controlScheme==='mobile'||mode!=='playing'||spectator.position)return;if(e.button===0)buttonEdges.push({button:'fire',held:false});if(e.button===2)buttonEdges.push({button:'homing',held:false});});
  $('game').addEventListener('click',()=>{if(friends&&mode==='playing'&&!controlMenuRoot()&&settings.controlScheme!=='controller'&&settings.controlScheme!=='mobile'&&document.pointerLockElement!==$('game'))void captureMouse();});
  setupMobileControls();
  $('game').addEventListener('contextmenu',e=>e.preventDefault());
  // Read-only diagnostic surface for development smoke tests and frame profiling.
  if(import.meta.env.DEV) Object.defineProperty(window,'abyss',{get:()=>({mode,deathHistory:deathHistory.diagnostics,deathSource:world?.deathSource,deathAnalysis:deathAnalysis?{active:analysisActive,remaining:deathAnalysis.remaining,duration:deathAnalysis.duration,impact:deathAnalysis.impact,viewTime:deathAnalysis.view.time,killerVisible:deathAnalysis.killerVisible,suspended:analysisSuspended}:null,entrance,entranceSeal:{...ENTRANCE_SEAL},viewport:gameViewport(),controls:settings.controlScheme,input:{...input},yaw,pitch,time:world?.time,position:world?{...world.player.pos}:null,spectating:!!spectator.position,cameraPosition:renderer.camera.position.toArray(),enemies:world?.enemies.length,enemyKinds:world?.enemies.map(e=>e.kind),wave:world?.wave,projectiles:world?.projectiles.length,stats:world?{...world.stats}:null,drawCalls:renderer.renderer.info.render.calls,originalAssets:renderer.originalWeapon.ready,originalEnemies:renderer.originalEnemies.ready,enemyAssetError:renderer.originalEnemies.error,originalAssetError:renderer.originalWeapon.error,handLevel:world?.level,projectileRendering:renderer.originalWeapon.projectileDiagnostics,projectileLighting:renderer.projectileLighting.diagnostics,friends:friends?{network:friends.diagnostics,role:friends.role,members:friends.members,allReady:friends.allReady,connected:friends.connected,epoch:friends.epoch,crew:world?.crew.map(p=>({id:p.id,alive:p.alive,cause:p.cause,position:p.player.pos})),running:friends.running}:null,audio:sound.diagnostics,music:music.diagnostics})});
  updateControlHints();setupFriends();setupLeaderboard();
  requestAnimationFrame(frame);
}
init();

/** Rebuild cosmetic floor history while seeking, without replaying sounds or flashes. */
function seekReplay(tick:number){
 return replay!.seek(tick,w=>{for(const effect of w.effects)renderer.blood.effect(effect,w);renderer.blood.advance(w.time);},()=>renderer.blood.clear());
}
