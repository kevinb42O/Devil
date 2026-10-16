import type {FriendsSession} from './multiplayer';
import type {ControlScheme} from './controls';
import './courtyard.css';
import {footballKickPose} from './courtyard-state';
import {nearDrawingRoom,MAX_INK} from './courtyard-drawing';

export class CourtyardUI{
 readonly root=document.createElement('section');private session:FriendsSession|null=null;private hold?:ReturnType<typeof setTimeout>;
 private loadedAt=0;private arm={left:false,right:false};
 private selectStarted:number|null=null;private selectCompleted=false;
 private assetsReady=false;
 private selectMeter=document.createElement('div');
 private drawingPanel=document.createElement('div');
 constructor(actions:{room:()=>void}){
  this.root.id='courtyard-hud';this.root.hidden=true;
  this.root.innerHTML='<div class="courtyard-room"><button id="courtyard-room">ROOM & CREW</button><span class="courtyard-count"></span></div><div class="courtyard-wait" hidden><strong>Waiting for your crew</strong><p></p></div><div class="courtyard-toolbar"><div class="courtyard-message" role="status"></div><div class="courtyard-buttons"><button id="courtyard-ready">READY UP</button><button id="courtyard-open">HOLD TO OPEN PIT</button><button id="courtyard-cancel">CLOSE PIT</button></div></div><div class="courtyard-kick-charge" hidden><span>KICK</span><progress max="1" value="0" aria-label="Kick power"></progress></div><div class="courtyard-touch-arms"><button aria-label="Hold left arm up">LEFT HAND</button><button aria-label="Hold right arm up">RIGHT HAND</button></div>';
  document.body.append(this.root);this.button('room').onclick=actions.room;
  this.drawingPanel.className='courtyard-drawing-controls';this.drawingPanel.hidden=true;
  this.drawingPanel.innerHTML='<strong>8 × 8 · TIC-TAC-TOE</strong><p class="drawing-help"></p><button id="courtyard-pencil">PICK UP PENCIL</button><button id="courtyard-drawing-clear">CLEAR BOARD</button>';
  this.root.append(this.drawingPanel);
  this.button('pencil').onclick=()=>this.session?.pencilAction();
  this.button('drawing-clear').onclick=()=>this.session?.pencilAction(true);
  this.selectMeter.className='courtyard-select-charge';this.selectMeter.hidden=true;
  this.selectMeter.innerHTML='<span>HOLD SELECT TO OPEN PIT · <b>5.0s</b></span><progress max="5" value="0" aria-label="Hold Select to open pit"></progress><div class="courtyard-select-reason" role="status"></div>';
  this.root.querySelector('.courtyard-toolbar')!.append(this.selectMeter);
  this.button('ready').onclick=()=>{const s=this.session,m=s?.members.find(m=>m.id===s.localId);if(s&&m)s.setReady(!m.ready);};
  const open=this.button('open');const release=()=>{if(this.hold)clearTimeout(this.hold);this.hold=undefined;open.classList.remove('is-holding');};
  open.onpointerdown=e=>{if(open.disabled)return;release();open.setPointerCapture(e.pointerId);open.classList.add('is-holding');this.hold=setTimeout(()=>{release();this.session?.openPit();},600);};
  open.onpointerup=release;open.onpointercancel=release;open.onlostpointercapture=release;
  open.onclick=e=>{if(e.detail===0&&!open.disabled)this.session?.openPit();};
  this.button('cancel').onclick=()=>this.session?.cancelDescent();
  this.root.querySelectorAll<HTMLButtonElement>('.courtyard-touch-arms button').forEach((b,i)=>{const key=i?'right':'left';b.onpointerdown=e=>{e.stopPropagation();b.setPointerCapture(e.pointerId);this.arm[key]=true;};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{this.arm[key]=false;};});
  window.addEventListener('blur',()=>{this.arm={left:false,right:false};release();this.resetSelect();});
 }
 resetSelect(){this.selectStarted=null;this.selectCompleted=false;this.selectMeter.hidden=true;}
 controllerSelect(held:boolean,wasHeld:boolean,now:number){
  const s=this.session,ready=this.button('ready');
  if(this.root.hidden||this.root.dataset.scheme!=='controller'||!s?.prelobby||s.courtyard?.phase!=='gathering'){this.resetSelect();return;}
  if(held&&!wasHeld){this.selectStarted=now;this.selectCompleted=false;}
  if(this.selectStarted===null)return;
  const elapsed=Math.max(0,now-this.selectStarted);
  if(!held){
   if(!this.selectCompleted&&elapsed<350&&!ready.hidden&&!ready.disabled)ready.click();
   this.resetSelect();return;
  }
  // A long press also readies an unready host; short taps still toggle on release.
  const host=s.role==='host',local=s.members.find(member=>member.id===s.localId);
  if(host&&elapsed>=350&&!local?.ready&&!ready.disabled)s.setReady(true);
  const blocked=!this.assetsReady?'Loading courtyard…':s.pitBlockedReason;
  this.selectMeter.hidden=!host||this.selectCompleted;
  this.selectMeter.querySelector('.courtyard-select-reason')!.textContent=blocked||'';
  this.selectMeter.querySelector('progress')!.value=Math.min(5,elapsed/1000);
  this.selectMeter.querySelector('b')!.textContent=(Math.max(0,5000-elapsed)/1000).toFixed(1)+'s';
  if(elapsed>=5000&&!this.selectCompleted&&host&&!blocked&&s.openPit()){
   this.selectCompleted=true;this.selectMeter.hidden=true;
  }
 }
 async copyInvite(){
  const s=this.session;if(!s?.room)return;const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('crew',s.room);
  const button=document.getElementById('courtyard-copy-invite');
  try{await navigator.clipboard.writeText(url.href);if(button)button.textContent='INVITE COPIED ✓';}catch{if(button)button.textContent='ROOM: '+s.room;}
 }
 button(id:string){return this.root.querySelector<HTMLButtonElement>('#courtyard-'+id)!;}
 get arms(){return {leftArm:this.arm.left,rightArm:this.arm.right};}
 update(s:FriendsSession|null,visible:boolean,scheme:ControlScheme,assetsReady:boolean,assetError:string){
  this.session=s;this.assetsReady=assetsReady&&!assetError;this.root.hidden=!visible||!s?.prelobby;
  if(this.root.hidden||scheme!=='controller')this.resetSelect();
  if(this.root.hidden){this.arm={left:false,right:false};if(this.hold)clearTimeout(this.hold);this.hold=undefined;this.button('open').classList.remove('is-holding');}
  if(!s?.prelobby)return;
  const c=s.courtyard,local=s.members.find(m=>m.id===s.localId);if(!c)return;
  const player=s.world?.crew?.find(p=>p.id===s.localId),d=c.drawing,pen=d?.pencils.find(p=>p.owner===s.localId);
  this.drawingPanel.hidden=!visible||!player||!nearDrawingRoom(player.player.pos);
  const binding=scheme==='controller'?' [X / SQUARE]':scheme==='mobile'?'':' [G]';
  this.button('pencil').textContent=(pen?'DROP PENCIL':'PICK UP PENCIL')+binding;
  this.button('pencil').disabled=c.phase!=='gathering'||!pen&&!d?.pencils.some(p=>!p.owner&&player&&Math.hypot(p.pos.x-player.player.pos.x,p.pos.z-player.player.pos.z)<=2.8);
  this.button('drawing-clear').hidden=s.role!=='host';this.button('drawing-clear').disabled=c.phase!=='gathering';this.button('drawing-clear').textContent='CLEAR BOARD'+(scheme==='controller'?' [Y / TRIANGLE]':scheme==='mobile'?'':' [T]');
  this.drawingPanel.querySelector('.drawing-help')!.textContent=(d?.ink.length??0)>=MAX_INK?'Board full · Ask the host to clear it':pen?(scheme==='controller'?'Look down at a nearby square · Hold either trigger to draw':scheme==='mobile'?'Drag on the right side to aim and draw':'Look down at a nearby square · Hold either mouse button to draw'):'Two giant pencils wait beside the board. Draw Xs and Os freely with your friends.';
  if(assetsReady&&local?.loaded!==s.epoch&&performance.now()-this.loadedAt>800){this.loadedAt=performance.now();s.markLoaded(s.epoch);}
  this.root.dataset.scheme=scheme;
  const kick=footballKickPose(c,s.localId,s.world?.tick??0),meter=this.root.querySelector<HTMLElement>('.courtyard-kick-charge')!;meter.hidden=!kick||kick.charge<=0;this.root.querySelector<HTMLProgressElement>('.courtyard-kick-charge progress')!.value=kick?.charge??0;
  const count=s.members.filter(m=>m.ready&&m.loaded===s.epoch).length;
  this.root.querySelector('.courtyard-count')!.textContent=`${count} / ${s.members.length} ready`;
  const gathering=c.phase==='gathering',blocked=s.pitBlockedReason,ready=this.button('ready'),open=this.button('open');
  ready.hidden=!gathering;ready.disabled=!local||local.loaded!==s.epoch||!!assetError||s.checkingSkin;
  ready.classList.toggle('is-ready',!!local?.ready);const key=scheme==='controller'?' [SELECT]':scheme==='qwerty'||scheme==='azerty'?' [F]':'';ready.textContent=local?.ready?'READY ✓ · UNREADY'+key:'READY UP'+key;
  open.textContent=scheme==='controller'?'HOLD SELECT · 5s · OPEN PIT':'HOLD TO OPEN PIT';
  open.hidden=s.role!=='host'||!gathering||!!blocked||!assetsReady;open.disabled=!!blocked||!assetsReady;
  this.button('cancel').hidden=s.role!=='host'||gathering;
  const below=c.committed.includes(s.localId),wait=this.root.querySelector<HTMLElement>('.courtyard-wait')!;wait.hidden=!below;
  wait.querySelector('p')!.textContent=s.members.filter(m=>!c.committed.includes(m.id)).map(m=>m.name).join(', ');
  const text=assetError||(!assetsReady?'Loading courtyard…':gathering?(local?.ready?(blocked||(s.role==='host'?'Crew ready · Open the pit when you’re ready':'Crew ready · Waiting for the host')):'Ready when you are'):c.phase==='opening'?'Pit unlocking…':below?`${c.committed.length} / ${c.participants.length} below`:'Pit open · Jump in');
  const message=this.root.querySelector('.courtyard-message')!;if(message.textContent!==text)message.textContent=text;
 }
}
