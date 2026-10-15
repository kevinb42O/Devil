import type {FriendsSession} from './multiplayer';
import type {ControlScheme} from './controls';
import './courtyard.css';
import {footballKickPose} from './courtyard-state';

export class CourtyardUI{
 readonly root=document.createElement('section');private session:FriendsSession|null=null;private hold?:ReturnType<typeof setTimeout>;
 private loadedAt=0;private arm={left:false,right:false};
 constructor(actions:{room:()=>void}){
  this.root.id='courtyard-hud';this.root.hidden=true;
  this.root.innerHTML='<div class="courtyard-room"><button id="courtyard-room">ROOM & CREW</button><span class="courtyard-count"></span></div><div class="courtyard-wait" hidden><strong>Waiting for your crew</strong><p></p></div><div class="courtyard-toolbar"><div class="courtyard-message" role="status"></div><div class="courtyard-buttons"><button id="courtyard-ready">READY UP</button><button id="courtyard-open">HOLD TO OPEN PIT</button><button id="courtyard-cancel">CLOSE PIT</button></div></div><div class="courtyard-kick-charge" hidden><span>KICK</span><progress max="1" value="0" aria-label="Kick power"></progress></div><div class="courtyard-touch-arms"><button aria-label="Hold left arm up">LEFT HAND</button><button aria-label="Hold right arm up">RIGHT HAND</button></div>';
  document.body.append(this.root);this.button('room').onclick=actions.room;
  this.button('ready').onclick=()=>{const s=this.session,m=s?.members.find(m=>m.id===s.localId);if(s&&m)s.setReady(!m.ready);};
  const open=this.button('open');const release=()=>{if(this.hold)clearTimeout(this.hold);this.hold=undefined;open.classList.remove('is-holding');};
  open.onpointerdown=e=>{if(open.disabled)return;release();open.setPointerCapture(e.pointerId);open.classList.add('is-holding');this.hold=setTimeout(()=>{release();this.session?.openPit();},600);};
  open.onpointerup=release;open.onpointercancel=release;open.onlostpointercapture=release;
  open.onclick=e=>{if(e.detail===0&&!open.disabled)this.session?.openPit();};
  this.button('cancel').onclick=()=>this.session?.cancelDescent();
  this.root.querySelectorAll<HTMLButtonElement>('.courtyard-touch-arms button').forEach((b,i)=>{const key=i?'right':'left';b.onpointerdown=e=>{e.stopPropagation();b.setPointerCapture(e.pointerId);this.arm[key]=true;};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{this.arm[key]=false;};});
  window.addEventListener('blur',()=>{this.arm={left:false,right:false};release();});
 }
 async copyInvite(){
  const s=this.session;if(!s?.room)return;const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('crew',s.room);
  const button=document.getElementById('courtyard-copy-invite');
  try{await navigator.clipboard.writeText(url.href);if(button)button.textContent='INVITE COPIED ✓';}catch{if(button)button.textContent='ROOM: '+s.room;}
 }
 button(id:string){return this.root.querySelector<HTMLButtonElement>('#courtyard-'+id)!;}
 get arms(){return {leftArm:this.arm.left,rightArm:this.arm.right};}
 update(s:FriendsSession|null,visible:boolean,scheme:ControlScheme,assetsReady:boolean,assetError:string){
  this.session=s;this.root.hidden=!visible||!s?.prelobby;
  if(this.root.hidden){this.arm={left:false,right:false};if(this.hold)clearTimeout(this.hold);this.hold=undefined;this.button('open').classList.remove('is-holding');}
  if(!s?.prelobby)return;
  const c=s.courtyard,local=s.members.find(m=>m.id===s.localId);if(!c)return;
  if(assetsReady&&local?.loaded!==s.epoch&&performance.now()-this.loadedAt>800){this.loadedAt=performance.now();s.markLoaded(s.epoch);}
  this.root.dataset.scheme=scheme;
  const kick=footballKickPose(c,s.localId,s.world?.tick??0),meter=this.root.querySelector<HTMLElement>('.courtyard-kick-charge')!;meter.hidden=!kick||kick.charge<=0;this.root.querySelector<HTMLProgressElement>('.courtyard-kick-charge progress')!.value=kick?.charge??0;
  const count=s.members.filter(m=>m.ready&&m.loaded===s.epoch).length;
  this.root.querySelector('.courtyard-count')!.textContent=`${count} / ${s.members.length} ready`;
  const gathering=c.phase==='gathering',blocked=s.pitBlockedReason,ready=this.button('ready'),open=this.button('open');
  ready.hidden=!gathering;ready.disabled=!local||local.loaded!==s.epoch||!!assetError||s.checkingSkin;
  ready.classList.toggle('is-ready',!!local?.ready);const key=scheme==='qwerty'||scheme==='azerty'?' [F]':'';ready.textContent=local?.ready?'READY ✓ · UNREADY'+key:'READY UP'+key;
  open.hidden=s.role!=='host'||!gathering||!!blocked||!assetsReady;open.disabled=!!blocked||!assetsReady;
  this.button('cancel').hidden=s.role!=='host'||gathering;
  const below=c.committed.includes(s.localId),wait=this.root.querySelector<HTMLElement>('.courtyard-wait')!;wait.hidden=!below;
  wait.querySelector('p')!.textContent=s.members.filter(m=>!c.committed.includes(m.id)).map(m=>m.name).join(', ');
  const text=assetError||(!assetsReady?'Loading courtyard…':gathering?(local?.ready?(blocked||(s.role==='host'?'Crew ready · Open the pit when you’re ready':'Crew ready · Waiting for the host')):'Ready when you are'):c.phase==='opening'?'Pit unlocking…':below?`${c.committed.length} / ${c.participants.length} below`:'Pit open · Jump in');
  const message=this.root.querySelector('.courtyard-message')!;if(message.textContent!==text)message.textContent=text;
 }
}
