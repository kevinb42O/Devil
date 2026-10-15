import {leaderboardDatabase} from './leaderboard';
import type {RecordedCrewRun,CrewReplayMember} from './crew-replay';
import {crewEligibility,publicCrewRoster,type CrewRegistration,type CrewLeaderboardRow,type CrewScoreResult} from './crew-score';
export function crewServiceError(error:{message:string;code?:string}){return Error(error.code==='PGRST202'?'Multiplayer rankings are not available on the server yet. Your replay is saved locally.':error.message);}
export async function crewIdentity(){const db=leaderboardDatabase(),{data,error}=await db.auth.getSession();if(error)throw Error('Your player profile is unavailable.');if(!data.session){const {error}=await db.auth.signInAnonymously();if(error)throw Error('Could not connect your player profile. Offline crew play remains available.');}return db;}
export async function registerCrew(session:string,epoch:number,roster:CrewReplayMember[]):Promise<CrewRegistration>{const db=await crewIdentity(),{data,error}=await db.rpc('abyss_crew_register_v20',{p_session:session,p_epoch:epoch,p_roster:roster});if(error)throw crewServiceError(error);return data;}
export async function confirmCrew(id:string,key:string,player:string,name:string){const db=await crewIdentity(),{error}=await db.rpc('abyss_crew_confirm',{p_id:id,p_key:key,p_player:player,p_name:name});if(error)throw crewServiceError(error);}
export async function lockCrew(id:string){const db=await crewIdentity(),{data,error}=await db.rpc('abyss_crew_lock',{p_id:id});if(error)throw crewServiceError(error);return data===true;}
export async function publishCrew(run:RecordedCrewRun,id:string):Promise<CrewScoreResult>{const reason=crewEligibility(run,true);if(reason)throw Error(reason);const db=await crewIdentity(),{data,error}=await db.rpc(run.combatRevision>=20?'abyss_crew_submit_v20':'abyss_crew_submit',{p_id:id,p_client_run:run.id,p_roster:publicCrewRoster(run.roster),p_ticks:run.ticks,p_time_ms:Math.round(run.time*1000),p_kills:run.stats.kills,p_gems:run.stats.collected});if(error)throw crewServiceError(error);return data;}
export async function loadCrewLeaderboard(size:number,search='',offset=0):Promise<CrewLeaderboardRow[]>{const {data,error}=await leaderboardDatabase().rpc('abyss_crew_board_v20',{p_size:size,p_search:search,p_offset:offset});if(error)throw crewServiceError(error);return data??[];}
export async function loadOwnCrewBests(size:number):Promise<CrewLeaderboardRow[]>{const db=leaderboardDatabase(),session=await db.auth.getSession();if(!session.data.session)return [];const {data,error}=await db.rpc('abyss_crew_my_bests_v20',{p_size:size});if(error)throw crewServiceError(error);return data??[];}

export async function revokeCrew(id:string){const db=await crewIdentity(),{error}=await db.rpc('abyss_crew_revoke',{p_id:id});if(error)throw crewServiceError(error);}

export async function loadCrewHistory(rules:number,size:number,search='',offset=0):Promise<CrewLeaderboardRow[]>{
 const {data,error}=await leaderboardDatabase().rpc('abyss_crew_board_history',{p_rules:rules,p_size:size,p_search:search,p_offset:offset});
 if(error)throw crewServiceError(error);return data??[];
}
