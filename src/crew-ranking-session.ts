import type {FriendsSession} from './multiplayer';
import type {RecordedCrewRun,CrewReplayMember} from './crew-replay';
import {leaderboardConfigured} from './leaderboard';
import {registerCrew,confirmCrew,lockCrew,revokeCrew} from './crew-leaderboard';
import {sameRoster,isCrewRoster,crewEligibility,type CrewRegistration} from './crew-score';
export type CrewPreferences={consent:boolean;automatic:boolean};
export function readCrewPreferences():CrewPreferences{try{const p=JSON.parse(localStorage.getItem('abyss-crew-publication')??'{}');return {consent:p?.consent===true,automatic:p?.automatic===true};}catch{return {consent:false,automatic:false};}}
export function writeCrewPreferences(p:CrewPreferences){try{localStorage.setItem('abyss-crew-publication',JSON.stringify(p));}catch{/* Current session still works. */}}
type Binding={epoch:number;registrationId?:string;roster:CrewReplayMember[];reason:string|null;automatic:boolean};
/** No auth identifiers or JWTs cross the peer channel; confirmations bind callers on the server. */
export class CrewRankingSession{
 status='Public party scores are optional. Replays are saved locally.';private token=0;private signature='';private registration:CrewRegistration|null=null;private registrationEpoch=-1;private roster:CrewReplayMember[]=[];private confirmed=new Set<string>();private preferences=new Map<string,boolean>();private working=false;private invitedAt=0;private prefSent='';private bindings=new Map<number,Binding>();private guestTask='';private lastRegistration='';private previousConsent=false;
 constructor(readonly session:FriendsSession,private prefs:()=>CrewPreferences,private changed:()=>void){
  session.onCrewControl=(peer,message)=>void this.receive(peer,message);
  session.beforeArenaStart=()=>{const roster=this.currentRoster(),ready=!!this.registration&&this.registration.state==='locked'&&this.registrationEpoch===session.epoch+1&&sameRoster(this.roster,roster);this.bindings.set(session.epoch+1,{epoch:session.epoch+1,registrationId:ready?this.registration!.id:undefined,roster,reason:ready?null:'This party was not fully confirmed for this arena run before combat. '+this.status,automatic:this.prefs().automatic});this.token++;return true;};
 }
 private currentRoster(){return (this.session.world?.crew??[]).map(p=>{const m=this.session.members.find(m=>m.id===p.id);return {id:p.id,name:m?.name??'Wanderer',host:m?.host??p.id==='host'};});}
 result(run:RecordedCrewRun){const binding=this.bindings.get(run.epoch),reason=crewEligibility(run);return {registrationId:binding?.registrationId,automatic:binding?.automatic??false,reason:reason??(binding?.registrationId&&sameRoster(binding.roster,run.roster)?null:binding?.reason??'This party was not confirmed for public ranking before combat. Local playback and export are available.')};}
 tick(){const s=this.session;if(s.closed||s.running)return;
  const prefs=this.prefs();if(this.previousConsent&&!prefs.consent&&this.lastRegistration)void revokeCrew(this.lastRegistration).catch(e=>this.setStatus(e.message));this.previousConsent=prefs.consent;const key=`${s.epoch}:${prefs.consent}:${s.localId}`;
  if(s.role==='guest'){if(key!==this.prefSent&&s.connected){s.sendCrewControl({type:'crew-ranking:consent',consent:prefs.consent,epoch:s.epoch});this.prefSent=key;}return;}
  this.preferences.set('host',prefs.consent);
  const roster=this.currentRoster(),sig=JSON.stringify({epoch:s.epoch,roster,consents:roster.map(m=>this.preferences.get(m.id)===true)});
  if(sig!==this.signature){this.signature=sig;this.token++;this.registration=null;this.roster=roster;this.confirmed.clear();this.working=false;this.invitedAt=0;}
  if(!leaderboardConfigured()){this.setStatus('Offline crew · public rankings are not connected.');return;}
  if(roster.length<2){this.setStatus('Two to four players are needed for a ranked party.');return;}
  if(!roster.every(m=>this.preferences.get(m.id)===true)){this.setStatus('Unranked until everyone enables public party scores and replays.');return;}
  if(this.registration?.state==='locked'){this.setStatus('Party confirmed · the next standard run can be ranked.');return;}
  if(!this.registration&&!this.working&&this.invitedAt<Date.now()-5000){this.working=true;this.invitedAt=Date.now();const token=this.token,nextEpoch=s.epoch+1;this.setStatus('Confirming the party for public ranking…');
   void registerCrew(s.id,nextEpoch,roster).then(reg=>{if(token!==this.token||s.running||s.closed)return;this.registration=reg;this.registrationEpoch=nextEpoch;this.lastRegistration=reg.id;this.confirmed.add('host');this.invite();}).catch(e=>{if(token===this.token)this.setStatus(e.message);}).finally(()=>{if(token===this.token)this.working=false;});
  }else if(this.registration&&this.invitedAt<Date.now()-2000){this.invite();}
 }
 private invite(){const r=this.registration;if(!r)return;this.invitedAt=Date.now();for(const member of this.roster.filter(p=>!p.host&&!this.confirmed.has(p.id)))this.session.sendCrewControl({type:'crew-ranking:invite',id:r.id,key:r.key,roster:this.roster,epoch:this.session.epoch},member.id);void this.lock();}
 private async lock(){const reg=this.registration;if(!reg||this.working||!this.roster.every(p=>this.confirmed.has(p.id)))return;this.working=true;const token=this.token;try{if(await lockCrew(reg.id)&&token===this.token&&!this.session.running){reg.state='locked';this.session.sendCrewControl({type:'crew-ranking:locked',id:reg.id,roster:this.roster,epoch:this.session.epoch,automatic:this.prefs().automatic});this.setStatus('Party confirmed · the next standard run can be ranked.');}}catch(e){if(token===this.token)this.setStatus(e instanceof Error?e.message:'Party confirmation failed.');}finally{if(token===this.token)this.working=false;}}
 private async receive(peer:string,value:unknown){if(!value||typeof value!=='object')return;const m=value as Record<string,any>,s=this.session;if(m.epoch!==s.epoch||s.running)return;
  if(s.role==='host'){
   if(m.type==='crew-ranking:consent'&&typeof m.consent==='boolean'){this.preferences.set(peer,m.consent);this.tick();}
   else if(m.type==='crew-ranking:confirmed'&&m.id===this.registration?.id&&this.roster.some(p=>p.id===peer)){this.confirmed.add(peer);await this.lock();}
  }else if(m.type==='crew-ranking:locked'&&peer==='host'&&this.prefs().consent&&typeof m.id==='string'&&isCrewRoster(m.roster)){
   if(sameRoster(m.roster,this.currentRoster()))this.bindings.set(s.epoch+1,{epoch:s.epoch+1,registrationId:m.id,roster:m.roster,reason:null,automatic:false});this.setStatus('Party confirmed · the next standard run can be ranked.');
  }else if(m.type==='crew-ranking:invite'&&peer==='host'&&this.prefs().consent&&typeof m.id==='string'&&typeof m.key==='string'&&/^[a-f0-9-]{36}$/i.test(m.id)&&/^[a-f0-9-]{36}$/i.test(m.key)&&isCrewRoster(m.roster)){
   const me=m.roster.find((p:CrewReplayMember)=>p.id===s.localId);if(!me||me.name!==s.name||me.host)return;
   if(this.guestTask===m.id)return;this.guestTask=m.id;try{await confirmCrew(m.id,m.key,s.localId,s.name);this.lastRegistration=m.id;if(!this.prefs().consent){await revokeCrew(m.id);return;}if(!s.running&&m.epoch===s.epoch){s.sendCrewControl({type:'crew-ranking:confirmed',id:m.id,epoch:s.epoch});this.setStatus('Your party membership is confirmed.');}}catch(e){this.setStatus(e instanceof Error?e.message:'Party confirmation failed.');}finally{this.guestTask='';}
  }
 }
 private setStatus(status:string){if(this.status===status)return;this.status=status;this.changed();}
}
