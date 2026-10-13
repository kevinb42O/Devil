import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './style.css';
import {leaderboardConfigured,loadLeaderboard,publishScore,eligibleForLeaderboard} from './leaderboard';
import { LobbyBrowser, type PublicLobby } from './lobbies';
import { FriendsSession, applySnapshot, type ArenaSnapshot } from './multiplayer';
import { GameRenderer } from './renderer';
import { Sound } from './audio';
import {RunRecorder,ReplayPlayer,createRun,listRuns,saveRun,DEFAULT_SETUP,type RunSetup,type RecordedRun} from './replay';
import {ENEMY_KINDS,isPede,isSpider} from './enemy-kinds';
import { World, STEP, idleInput, distance, TIMELINE, type Input } from './simulation';
const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
type Settings={sensitivity:number;fov:number;volume:number;quality:string;threatCues:boolean};
const defaults:Settings={sensitivity:1,fov:90,volume:55,quality:'high',threatCues:false};
function readStore<T>(key:string,fallback:T):T {try {const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function saveStore(key:string,value:unknown) {try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Play remains available with storage disabled. */}}
let settings={...defaults,...readStore<Partial<Settings>>('abyss-settings',{})};
settings.sensitivity=Math.max(.3,Math.min(3,Number(settings.sensitivity)||1));settings.fov=Math.max(75,Math.min(115,Number(settings.fov)||95));settings.volume=Math.max(0,Math.min(100,Number(settings.volume)||0));settings.quality=settings.quality==='low'?'low':'high';
let best=Math.max(0,Number(readStore('abyss-survival-v3-best',0))||0);
let renderer:GameRenderer;const sound=new Sound();sound.setVolume(settings.volume/100);
let mode:'menu'|'playing'|'paused'|'dead'|'replay'='menu';let world:World|null=null;let yaw=0,pitch=0;let input:Input=idleInput();let accumulator=0,last=performance.now(),hudTime=0;let settingsOpen=false;let noticeUntil=0,noticeText='',hitUntil=0;const keys=new Set<string>();
let leaderboardOpen=false;
let recorder:RunRecorder|null=null,replay:ReplayPlayer|null=null,lastRun:RecordedRun|null=null;let practice=false,historyOpen=false,replayPaused=false;
let friends:FriendsSession|null=null;let friendsOpen=false;let netTime=0;const lobbyBrowser=new LobbyBrowser();let lobbyStarted=false;let lobbyCrewCount=1;let receivedEpoch=-1;let lastSnapshotAt=0;
const buttonEdges:{button:'fire'|'homing';held:boolean}[]=[];let sampledFire=false,sampledHoming=false;let capturingMouse=false,captureTicket=0;
const format=(time:number)=>time.toFixed(3);
function updateBest() {$('best-menu').innerHTML=best?`${format(best)} <span>SECONDS</span>`:'— <span>SECONDS</span>';$('best-hud').textContent=format(best);}
function showPanels() {$('leaderboard').hidden=!leaderboardOpen;$('friends').hidden=!friendsOpen;$('crew-hud').hidden=!friends||mode==='menu';$('menu').hidden=mode!=='menu';$('hud').hidden=mode==='menu';$('replay-controls').hidden=mode!=='replay';$('history').hidden=!historyOpen;$('pause').hidden=mode!=='paused'||settingsOpen;$('death').hidden=mode!=='dead'||settingsOpen;$('settings').hidden=!settingsOpen;}
function clearInput() {buttonEdges.length=0;sampledFire=false;sampledHoming=false;keys.clear();input=idleInput();input.yaw=yaw;input.pitch=pitch;}
function notice(text:string,seconds=2.5) {noticeText=text;noticeUntil=performance.now()+seconds*1000;}
async function captureMouse() {
  const ticket=++captureTicket;capturingMouse=true;
  try {await $('game').requestPointerLock();}
  catch {if(ticket===captureTicket&&mode==='playing'){mode='paused';showPanels();notice('CLICK RETURN TO CAPTURE THE MOUSE');}}
  finally {if(ticket===captureTicket)capturingMouse=false;}
}
function startRun(setup:RunSetup=DEFAULT_SETUP) {
  if(!renderer.originalEnemies.ready||!renderer.originalWeapon.ready)return;
  renderer.clear();sound.clear();renderer.topDown=false;replay=null;const seed=crypto.getRandomValues(new Uint32Array(1))[0];world=createRun(seed,setup);recorder=new RunRecorder(seed,setup);practice=setup.time!==0||setup.level!==1||setup.reserve!==0;historyOpen=false;leaderboardOpen=false;
  if(import.meta.env.DEV){const preview=Number(new URLSearchParams(location.search).get('hand-preview'));if(preview>=1&&preview<=4){practice=true;world.level=preview;world.stats.collected=preview===1?0:preview===2?10:70;world.reserve=preview===4?150:preview===3?50:0;}}
  if(import.meta.env.DEV){const preview=new URLSearchParams(location.search).get('enemy-preview');const kinds=ENEMY_KINDS;if(kinds.includes(preview as typeof kinds[number])){practice=true;const kind=preview as typeof kinds[number];const y=kind==='leviathan'?15:kind==='orb'?5:kind==='squid'?3.3:kind==='squid2'?5.2:kind==='squid3'?7:kind==='spider'?1.65:kind==='centipede'?3:1;world.player.pos.z=-14;const e=world.spawn(kind,{x:0,y,z:-26});e.age=kind==='spider2'?9.5:kind==='leviathan'?9:kind==='orb'?7:isSpider(kind)||isPede(kind)||kind==='thorn'?3.5:1.2;if(isSpider(kind))e.headExposure=1;if(kind.startsWith('squid')){e.phase=Math.PI;}}}
  yaw=0;pitch=import.meta.env.DEV&&new URLSearchParams(location.search).get('enemy-preview')==='leviathan'?.6:0;clearInput();mode='playing';accumulator=0;last=performance.now();settingsOpen=false;showPanels();void sound.start();void captureMouse();notice('KEEP MOVING. RELEASE FIRE TO COLLECT.',4);
}
function resume() {if(!world)return;mode='playing';settingsOpen=false;accumulator=0;last=performance.now();showPanels();void sound.start();void captureMouse();}
function home() {leaderboardOpen=false;friends?.close();friends=null;friendsOpen=false;replay=null;recorder=null;renderer.topDown=false;historyOpen=false;mode='menu';world=null;settingsOpen=false;clearInput();document.exitPointerLock();renderer.clear();sound.clear();sound.pause();updateBest();showPanels();}
function paused() {if(mode!=='playing')return;if(friends){$('pause').querySelector('p')!.textContent='Your controls are released. The crew run continues.';}else $('pause').querySelector('p')!.textContent='Your run is paused.';mode='paused';accumulator=0;clearInput();sound.pause();showPanels();}
function death() {
  if(!world)return;mode='dead';clearInput();document.exitPointerLock();
  const record=!friends&&!practice&&world.time>best;if(record){best=world.time;saveStore('abyss-survival-v3-best',best);}
  $('death-time').textContent=format(world.time);$('retry').hidden=!!friends&&friends.role==='guest';$('retry').innerHTML=friends?'RETURN TO LOBBY <span>↗</span>':'DEFY IT AGAIN <span>↗</span>';$('death-cause').textContent=friends?'The crew fell. '+(friends.role==='host'?'Return to the lobby to ready up again.':'Waiting for the host to restart.'):`Taken by ${world.cause.toLowerCase()}.`;$('death-title').textContent=world.cause==='FALLEN'?'LOST BELOW.':'CONSUMED.';
  $('new-best').hidden=!record;$('stat-kills').textContent=String(world.stats.kills);$('stat-gems').textContent=String(world.stats.collected);$('stat-accuracy').textContent=`${Math.round(world.stats.hits/Math.max(1,world.stats.shots)*100)}%`;
  saveStore('abyss-last-run',{time:world.time,cause:world.cause,...world.stats});lastRun=friends?null:recorder?.finish(world)??null;$('watch-last').hidden=!!friends;$('retry').hidden=!!friends&&friends.role==='guest';if(lastRun)void saveRun(lastRun).catch(()=>notice('REPLAY STORAGE UNAVAILABLE'));recorder=null;$('publish-score').hidden=!leaderboardConfigured()||!eligibleForLeaderboard(lastRun,practice,!!friends);$<HTMLButtonElement>('publish-run').disabled=false;$('publish-status').textContent='';updateBest();showPanels();
}
function updateHud() {
  if(!world)return;const w=world;
  $('timer').textContent=format(w.time);$('gems').textContent=String(w.stats.collected);$('kills').textContent=String(w.stats.kills);
  $('level').textContent=['I','II','III','IV'][w.level-1];$('power-name').textContent=['AWAKENED','KINDLED','ASCENDANT','UNBOUND'][w.level-1];
  const progress=w.level===1?w.stats.collected/10:w.level===2?(w.stats.collected-10)/60:w.level===3?w.reserve/150:1;
  $('progress').style.width=`${Math.min(100,progress*100)}%`;
  $('homing').textContent=w.level>=3?`${w.reserve} HOMING DAGGERS IN RESERVE`:`HOMING LOCKED · ${70-w.stats.collected} GEMS`;
  $('collection').textContent=input.fire||input.homing?'FIRING · GEMS DRIFT AWAY':w.gems.length?'CALLING GEMS':'RELEASE FIRE TO CALL GEMS';
  $('collection').style.color=input.fire||input.homing?'#909c7e':'#d6e8ae';
  $('phase').textContent=friends?'FRIENDS':mode==='replay'?'REPLAY':practice?'PRACTICE':w.wave>=0?`WAVE ${w.wave+1}`:'SURVIVAL';
  $('notice').textContent=noticeText;$('notice').style.opacity=performance.now()<noticeUntil?'1':'0';$('hit-marker').style.opacity=performance.now()<hitUntil?'1':'0';
  const ring=$('threat-ring');ring.replaceChildren();
  if(settings.threatCues) {
    const threats=w.enemies.filter(e=>distance(e.pos,w.player.pos)<9&&e.age>1).sort((a,b)=>distance(a.pos,w.player.pos)-distance(b.pos,w.player.pos)).slice(0,5);
    for(const e of threats) {
      const angle=Math.atan2(e.pos.x-w.player.pos.x,-(e.pos.z-w.player.pos.z))+yaw;
      const dist=distance(e.pos,w.player.pos);const element=document.createElement('i');element.className='threat';
      const radius=Math.min(innerWidth,innerHeight)*.32;
      element.style.transform=`translate(${Math.sin(angle)*radius}px,${-Math.cos(angle)*radius}px) rotate(${angle}rad)`;element.style.opacity=String(Math.max(.2,1-dist/10));ring.append(element);
    }
  }
  const next=settings.threatCues?TIMELINE.find(e=>e.time>w.time&&e.time-w.time<1.5):undefined;
  if(next&&performance.now()>noticeUntil)notice(next.kind==='spider'?'A REAPER STIRS':isPede(next.kind)?'SOMETHING MOVES BELOW':'A SUMMONER APPROACHES',1);
}
function frame(now:number) {
  const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(.05,elapsed);last=now;
  if(mode==='playing'&&!settingsOpen)renderer.trackFrame(elapsed);
  if(!friends&&mode==='playing'&&world&&!settingsOpen) {
    input.forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);input.strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);input.jump=keys.has('Space');input.yaw=yaw;input.pitch=pitch;
    accumulator+=Math.min(.1,elapsed);let steps=0;
    while(accumulator>=STEP&&world.state==='playing'&&steps++<12) {const edge=buttonEdges.shift();if(edge){if(edge.button==='fire')sampledFire=edge.held;else sampledHoming=edge.held;}input.fire=sampledFire;input.homing=sampledHoming;recorder?.record(input);world.step(input);accumulator-=STEP;}
    sound.listener(world.player.pos,yaw,pitch);
    for(const effect of world.effects) {renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);if(effect.kind==='hit')hitUntil=now+90;if(effect.kind==='upgrade')notice(`ATTUNEMENT ${['','I','II','III','IV'][effect.amount||1]} · ${effect.amount===3?'HOMING UNLOCKED':'POWER RISES'}`,3);if(effect.kind==='death'){$('flash').style.opacity='1';setTimeout(()=>$('flash').style.opacity='0',170);}}
    world.effects=[];
    sound.update(world);
    if(world.state==='dead')death();
  }
  if(friends&&world&&friends.running){
    const active=mode==='playing'&&!settingsOpen;input.forward=active?((keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)):0;input.strafe=active?((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)):0;input.jump=active&&keys.has('Space');input.yaw=yaw;input.pitch=pitch;
    if(active&&friends.role==='guest'){for(const edge of buttonEdges.splice(0)){if(edge.button==='fire')sampledFire=edge.held;else sampledHoming=edge.held;friends.sendInput({...input,fire:sampledFire,homing:sampledHoming});}}input.fire=active&&sampledFire;input.homing=active&&sampledHoming;
    if(friends.role==='host'){accumulator+=dt;while(accumulator>=STEP&&world.state==='playing'){if(active&&Date.now()>=friends.startAt){const edge=buttonEdges.shift();if(edge){if(edge.button==='fire')sampledFire=edge.held;else sampledHoming=edge.held;}input.fire=sampledFire;input.homing=sampledHoming;}friends.step({...input});accumulator-=STEP;}world.selectCrew('host');for(const effect of world.effects){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);if(effect.kind==='hit')hitUntil=now+90;}world.effects=[];}
    netTime+=dt;if(netTime>=.05){netTime=0;if(friends.role==='host')friends.broadcast();else friends.sendInput({...input});}
    sound.listener(world.player.pos,yaw,pitch);if(active)sound.update(world);
    if(Date.now()<friends.startAt)notice(`CREW READY · STARTING IN ${Math.max(1,Math.ceil((friends.startAt-Date.now())/1000))}`,1);
    $('crew-hud').textContent=`FRIENDS · ${world.crew.length}/4 · ${friends.role==='host'?'HOST':'GUEST'}\n`+world.crew.map((p,i)=>`${i+1}. ${p.id===friends!.localId?'YOU':friends!.members.find(m=>m.id===p.id)?.name??'FRIEND '+(i+1)} · ${p.alive?'ALIVE':p.cause||'DEAD'}`).join('\n');
    const local=world.crew.find(p=>p.id===friends!.localId);if(local&&!local.alive&&world.state==='playing'){$('crew-hud').textContent+='\nYou died. Watch the crew until the next run.';}
    if(friends.role==='guest'&&now-lastSnapshotAt>3000){$('crew-hud').textContent+='\nWaiting for host connection…';clearInput();}
    if(world.state==='dead'&&mode!=='dead')death();
  }
  if(mode==='replay'&&replay){if(!replayPaused){accumulator+=Math.min(.1,elapsed);let steps=0;while(accumulator>=STEP&&!replay.done&&steps++<12){const view=replay.input;if(view){yaw=view.yaw;pitch=view.pitch;input={...view};}replay.step();accumulator-=STEP;}if(replay.done){replayPaused=true;sound.stopLoops();$('replay-pause').textContent='PLAY';}}world=replay.world;yaw=replay.lastInput.yaw;pitch=replay.lastInput.pitch;sound.listener(world.player.pos,yaw,pitch);if(!replayPaused)sound.update(world);for(const effect of world.effects){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}world.effects=[];$<HTMLInputElement>('replay-seek').value=String(replay.tick);$('replay-time').textContent=`${format(world.time)} / ${format(replay.run.time)}`;}
  hudTime+=dt;if(hudTime>.05&&world){updateHud();hudTime=0;}
  renderer.setCrewNames(friends?.members??[]);
  renderer.render(world,yaw,pitch,friends?dt:(mode==='paused'||settingsOpen)?0:dt,mode==='menu',Math.min(1,accumulator/STEP));
  requestAnimationFrame(frame);
}
function watchRun(run:RecordedRun){
 try{renderer.clear();replay=new ReplayPlayer(run);world=replay.world;recorder=null;mode='replay';historyOpen=false;settingsOpen=false;replayPaused=false;accumulator=0;renderer.topDown=false;document.exitPointerLock();sound.clear();void sound.start();const slider=$<HTMLInputElement>('replay-seek');slider.max=String(run.ticks);slider.value='0';$('replay-pause').textContent='PAUSE';showPanels();}catch(error){notice(error instanceof Error?error.message:'REPLAY UNAVAILABLE');}
}
async function openHistory(){
 historyOpen=true;showPanels();const list=$('history-list');list.replaceChildren();
 try{const runs=await listRuns();if(!runs.length){list.textContent='Your completed runs will appear here.';return;}
 for(const run of runs){const row=document.createElement('div');row.className='history-row';const title=document.createElement('span');title.textContent=`${format(run.time)} s · ${run.practice?'PRACTICE':run.cause} · ${run.stats.collected} gems`;const watch=document.createElement('button');watch.textContent='WATCH';watch.onclick=()=>watchRun(run);const keep=document.createElement('button');keep.textContent=run.saved?'KEPT':'KEEP';keep.onclick=()=>{run.saved=!run.saved;void saveRun(run).then(()=>openHistory());};const download=document.createElement('button');download.textContent='EXPORT';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(run)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`abyss-${run.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};row.append(title,watch,keep,download);list.append(row);}
 }catch{list.textContent='Replay storage is unavailable in this browser.';}
}
async function openLeaderboard(){
 leaderboardOpen=true;showPanels();const button=$<HTMLButtonElement>('leaderboard-refresh');if(button.disabled)return;button.disabled=true;
 const rows=$('leaderboard-rows');rows.replaceChildren();$('leaderboard-status').textContent='Loading public scores…';
 try{const scores=await loadLeaderboard();$('leaderboard-status').textContent=scores.length?`${scores.length} ranked ${scores.length===1?'player':'players'}`:'No scores yet. Finish a Survival run and publish yours.';
 for(const [index,score] of scores.entries()){const row=document.createElement('tr');for(const value of [index+1,score.player_name,format(score.survival_ms/1000),score.kills,score.gems]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}rows.append(row);}
 }catch(error){$('leaderboard-status').textContent=error instanceof Error?error.message:'The leaderboard is unavailable.';}finally{button.disabled=false;}
}
function setupLeaderboard(){
 $<HTMLInputElement>('leaderboard-name').value=readStore<string>('abyss-player-name','');
 $('leaderboard-open').onclick=()=>void openLeaderboard();$('death-leaderboard').onclick=()=>void openLeaderboard();$('leaderboard-refresh').onclick=()=>void openLeaderboard();$('leaderboard-close').onclick=()=>{leaderboardOpen=false;showPanels();};
 $('publish-score').onsubmit=event=>{event.preventDefault();const run=lastRun;if(!eligibleForLeaderboard(run,practice,!!friends)||!run)return;const button=$<HTMLButtonElement>('publish-run');if(button.disabled)return;button.disabled=true;const name=$<HTMLInputElement>('leaderboard-name').value.trim();$('publish-status').textContent='Publishing your run…';
 void publishScore(run,name).then(()=>{saveStore('abyss-player-name',name);if(lastRun===run){$('publish-status').textContent='Published. Your best time is on the public leaderboard.';$('publish-score').hidden=true;}}).catch(error=>{if(lastRun===run){$('publish-status').textContent=error instanceof Error?error.message:'Publishing failed. Try again.';button.disabled=false;}});
 };
}
function setupSettings() {
  for(const name of ['sensitivity','fov','volume'] as const) {
    const el=$<HTMLInputElement>(name);el.value=String(settings[name]);$(name+'-value').textContent=name==='volume'?`${settings[name]}%`:String(settings[name]);
    el.oninput=()=>{settings[name]=Number(el.value);$(name+'-value').textContent=name==='volume'?`${el.value}%`:el.value;saveStore('abyss-settings',settings);sound.setVolume(settings.volume/100);renderer.configure(settings);};
  }
  const q=$<HTMLSelectElement>('quality');q.value=settings.quality;q.onchange=()=>{settings.quality=q.value;saveStore('abyss-settings',settings);renderer.configure(settings);};
  const cues=$<HTMLInputElement>('threat-cues');cues.checked=settings.threatCues;cues.onchange=()=>{settings.threatCues=cues.checked;saveStore('abyss-settings',settings);};
}
function openSettings() {settingsOpen=true;setupSettings();showPanels();}
function beginCrew(host:boolean){
 $('pause').querySelector('p')!.textContent='The crew run is live. Click return to capture your mouse.';
 renderer.clear();sound.clear();recorder=null;replay=null;lastRun=null;practice=true;historyOpen=false;settingsOpen=false;friendsOpen=false;world=host?friends!.world:new World(1,{schedule:false});yaw=0;pitch=0;clearInput();accumulator=0;last=performance.now();renderer.topDown=false;mode='playing';showPanels();void sound.start();void captureMouse();notice('CREW RUN · RELEASE FIRE TO SHARE GEMS',4);
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
 session.onSnapshot=(snapshot:ArenaSnapshot)=>{if(friends!==session)return;lastSnapshotAt=performance.now();lobbyCrewCount=snapshot.crew.length;if(!snapshot.running){if(world){world=null;mode='menu';clearInput();document.exitPointerLock();renderer.clear();sound.clear();friendsOpen=true;showPanels();}roster();return;}if(snapshot.epoch!==receivedEpoch){receivedEpoch=snapshot.epoch;beginCrew(false);}if(world&&snapshot.tick>=world.tick){applySnapshot(world,snapshot,session.localId);for(const effect of snapshot.effects??[]){renderer.effect(effect,world,yaw,pitch);sound.play(effect,world);}roster();}};roster();return session;
}
async function joinLobby(room:PublicLobby){$('friends-status').textContent=`Joining ${room.name}…`;const session=newSession('guest');session.lobbyName=room.name;roster();await session.joinPublic(room);$('friends-status').textContent='Connecting to your crew…';}
function returnCrewLobby(){if(friends?.role!=='host')return;friends.returnToLobby();world=null;mode='menu';clearInput();document.exitPointerLock();renderer.clear();sound.clear();friendsOpen=true;settingsOpen=false;showPanels();roster();}
function setupFriends(){
 lobbyBrowser.onChange=renderLobbies;lobbyBrowser.onStatus=text=>$('friends-service').textContent=text;
 $('friends-open').onclick=()=>{friendsOpen=true;showPanels();roster();renderLobbies();if(!lobbyStarted){lobbyStarted=true;void lobbyBrowser.start();}};
 $('friends-refresh').onclick=()=>lobbyBrowser.refresh();$('friends-close').onclick=()=>{friendsOpen=false;showPanels();};
 $('friends-leave').onclick=()=>{home();friendsOpen=true;showPanels();roster();renderLobbies();$('friends-status').textContent='You left the lobby.';};
 $('friends-host').onclick=()=>{const button=$<HTMLButtonElement>('friends-host');button.disabled=true;$('friends-status').textContent='Creating your lobby…';const session=newSession('host');void session.hostPublic($<HTMLInputElement>('friends-lobby-name').value).then(()=>{$('friends-status').textContent='Lobby is live. Your friends can find it in Open lobbies.';roster();}).catch(e=>{$('friends-status').textContent=String(e.message||e);friends=null;session.close();roster();}).finally(()=>button.disabled=false);};
 $('friends-ready').onclick=()=>{if(!friends)return;const local=friends.members.find(p=>p.id===friends!.localId);if(!local)return;const ready=!local.ready;friends.setReady(ready);if(!ready)return;capturingMouse=true;void $('game').requestPointerLock().then(()=>{document.exitPointerLock();}).catch(()=>{}).finally(()=>{capturingMouse=false;});roster();};
 $('friends-start').onclick=()=>{if(friends?.role==='host'&&friends.allReady){friends.start();beginCrew(true);}};
}
function init() {
  try {renderer=new GameRenderer($<HTMLCanvasElement>('game'),settings);}catch(error){$('error').hidden=false;$('error').textContent=`The arena could not initialize WebGL2. Enable hardware acceleration and use a current desktop browser. ${error instanceof Error?error.message:''}`;return;}
  updateBest();showPanels();setupSettings();
  // Begin decoding on the first menu gesture, before a quick initial burst.
  document.addEventListener('pointerdown',()=>void sound.start(),{once:true});
  const start=$<HTMLButtonElement>('start');start.disabled=true;void renderer.prepare().then(()=>{start.disabled=!(renderer.originalEnemies.ready&&renderer.originalWeapon.ready);if(start.disabled){$('error').hidden=false;$('error').textContent='The original game assets could not load. '+renderer.originalEnemies.error+' '+renderer.originalWeapon.error;}}).catch(error=>{$('error').hidden=false;$('error').textContent='The arena could not prepare its graphics. '+String(error);});
  $('start').onclick=()=>{if(friends){friendsOpen=true;showPanels();return;}startRun();};$('retry').onclick=()=>{if(friends){if(friends.role==='host')returnCrewLobby();return;}startRun(practice&&lastRun?lastRun.setup:DEFAULT_SETUP);};$('resume').onclick=resume;$('quit').onclick=home;$('home').onclick=home;
  $('settings-open').onclick=openSettings;$('pause-settings').onclick=openSettings;$('settings-close').onclick=()=>{settingsOpen=false;showPanels();};
  $('practice-start').onclick=()=>{if(friends){friendsOpen=true;showPanels();return;}startRun({time:Math.max(0,Math.min(1200,Number($<HTMLInputElement>('practice-time').value)||0)),level:Number($<HTMLSelectElement>('practice-level').value),reserve:Math.max(0,Math.min(1000,Number($<HTMLInputElement>('practice-homing').value)||0))});};
  $('history-open').onclick=()=>void openHistory();$('history-close').onclick=()=>{historyOpen=false;showPanels();};$('watch-last').onclick=()=>{if(lastRun)watchRun(lastRun);};$('replay-exit').onclick=home;$('replay-pause').onclick=()=>{if(replay?.done){replay.seek(0);sound.clear();}replayPaused=!replayPaused;if(replayPaused)sound.pause();else void sound.start();accumulator=0;$('replay-pause').textContent=replayPaused?'PLAY':'PAUSE';};
  $<HTMLInputElement>('replay-seek').oninput=()=>{if(replay){sound.clear();world=replay.seek(Number($<HTMLInputElement>('replay-seek').value));accumulator=0;}};
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==$('game')&&!capturingMouse)paused();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing'){document.exitPointerLock();paused();}});
  window.addEventListener('blur',()=>{if(mode==='playing'){document.exitPointerLock();paused();}});
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(mode==='replay'&&e.code==='KeyM'){renderer.topDown=!renderer.topDown;return;}if(mode==='replay'&&(e.code==='ArrowLeft'||e.code==='ArrowRight')&&replay){sound.clear();world=replay.seek(replay.tick+(e.code==='ArrowLeft'?-1:1)*(e.ctrlKey?10:3)/STEP);accumulator=0;return;}if(!friends&&['Digit1','Digit2','Digit3','Digit4','Numpad1','Numpad2','Numpad3','Numpad4'].includes(e.code)&&(mode==='playing'||mode==='paused')&&world&&!settingsOpen){e.preventDefault();if(e.repeat)return;const level=Number(e.code.slice(-1));world.level=level;world.stats.collected=level===1?0:level===2?10:level===3?70:220;world.reserve=level===3?50:level===4?150:0;practice=true;recorder=null;world.emit('upgrade',world.player.pos,level);notice(`WEAPON ${level} · TEST MODE`,2);updateHud();return;}if(e.code==='Space'&&mode!=='menu')e.preventDefault();if(e.code==='KeyR'&&mode==='dead'&&!settingsOpen&&!leaderboardOpen&&!(e.target instanceof HTMLInputElement)){if(friends){if(friends.role==='host')returnCrewLobby();}else startRun(practice&&lastRun?lastRun.setup:DEFAULT_SETUP);return;}if(e.code==='Escape'&&leaderboardOpen){leaderboardOpen=false;showPanels();return;}if(e.code==='Escape'&&settingsOpen){settingsOpen=false;showPanels();return;}if(mode==='playing')keys.add(e.code);});
  window.addEventListener('keyup',e=>keys.delete(e.code));
  document.addEventListener('mousemove',e=>{if(mode!=='playing'||document.pointerLockElement!==$('game'))return;yaw-=e.movementX*.002*settings.sensitivity;pitch=Math.max(-1.5,Math.min(1.5,pitch-e.movementY*.002*settings.sensitivity));});
  document.addEventListener('mousedown',e=>{if(mode!=='playing'||document.pointerLockElement!==$('game'))return;if(e.button===0)buttonEdges.push({button:'fire',held:true});if(e.button===2){buttonEdges.push({button:'homing',held:true});if(world&&world.level<3)notice('HOMING AWAKENS AT 70 GEMS',1.5);}});
  document.addEventListener('mouseup',e=>{if(mode!=='playing')return;if(e.button===0)buttonEdges.push({button:'fire',held:false});if(e.button===2)buttonEdges.push({button:'homing',held:false});});
  $('game').addEventListener('contextmenu',e=>e.preventDefault());
  // Read-only diagnostic surface for development smoke tests and frame profiling.
  if(import.meta.env.DEV) Object.defineProperty(window,'abyss',{get:()=>({mode,time:world?.time,position:world?{...world.player.pos}:null,enemies:world?.enemies.length,enemyKinds:world?.enemies.map(e=>e.kind),wave:world?.wave,projectiles:world?.projectiles.length,stats:world?{...world.stats}:null,drawCalls:renderer.renderer.info.render.calls,originalAssets:renderer.originalWeapon.ready,originalEnemies:renderer.originalEnemies.ready,enemyAssetError:renderer.originalEnemies.error,originalAssetError:renderer.originalWeapon.error,handLevel:world?.level,projectileRendering:renderer.originalWeapon.projectileDiagnostics,projectileLighting:renderer.projectileLighting.diagnostics,friends:friends?{role:friends.role,members:friends.members,allReady:friends.allReady,connected:friends.connected,epoch:friends.epoch,crew:world?.crew.map(p=>({id:p.id,alive:p.alive,cause:p.cause,position:p.player.pos})),running:friends.running}:null,audio:sound.diagnostics})});
  setupFriends();setupLeaderboard();
  requestAnimationFrame(frame);
}
init();
