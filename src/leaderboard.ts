import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {cleanNickname,type ScoreCandidate,type PendingScore,type OwnScore} from './score-queue';
import {REPLAY_RULES_VERSION, type RecordedRun} from './replay';
export type LeaderboardRow={player_name:string;survival_ms:number;kills:number;gems:number;achieved_at:string;replay_id?:string|null};
let client:SupabaseClient|undefined;
export function leaderboardConfigured(){return !!(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);}
export function leaderboardDatabase(){
 if(!leaderboardConfigured())throw Error('The public leaderboard is not connected yet.');
 return client??=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:'abyss-leaderboard-auth',detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
}
export async function loadLeaderboard():Promise<LeaderboardRow[]>{
 const db=leaderboardDatabase();let {data,error}=await db.rpc('abyss_leaderboard_replays',{p_rules:REPLAY_RULES_VERSION});
 // Scores remain available while a deployment's replay migration is pending.
 if(error?.code==='PGRST202')({data,error}=await db.rpc('abyss_leaderboard',{p_rules:REPLAY_RULES_VERSION}));
 if(error)throw Error('The leaderboard is unavailable. Try refreshing in a moment.');
 return data??[];
}
export function eligibleForLeaderboard(run:RecordedRun|null,practice:boolean,friends:boolean){return !!run&&!practice&&!friends&&!run.practice&&run.version===REPLAY_RULES_VERSION&&run.setup.time===0&&run.setup.level===1&&run.setup.reserve===0&&Number.isFinite(run.time)&&run.time>0;}
export function scoreCandidate(run:RecordedRun):ScoreCandidate{return {id:run.id,timeMs:Math.round(run.time*1000),kills:run.stats.kills,gems:run.stats.collected,rules:run.version};}
export async function loadOwnScore():Promise<OwnScore|null>{
 const db=leaderboardDatabase();const {data:session,error:sessionError}=await db.auth.getSession();if(sessionError)throw Error('Your player session could not be loaded.');if(!session.session)return null;
 const {data,error}=await db.rpc('abyss_my_score',{p_rules:REPLAY_RULES_VERSION});if(error)throw Error('Your public best could not be loaded.');return data?.[0]??null;
}
export async function publishCandidate(job:PendingScore):Promise<OwnScore>{
 const clean=cleanNickname(job.name),score=job.score;
 const db=leaderboardDatabase();const {data,error}=await db.auth.getSession();if(error)throw Error('Your player session is unavailable. Try again.');
 if(!data.session){const {error}=await db.auth.signInAnonymously();if(error)throw Error('Could not connect your player profile. Your score is saved here for retry.');}
 const {error:submissionError}=await db.rpc('abyss_submit_score',{p_name:clean,p_time_ms:score.timeMs,p_kills:score.kills,p_gems:score.gems,p_rules:score.rules});
 if(submissionError)throw Error(submissionError.message.includes('wait')?'The score service needs a few seconds. We will retry automatically.':'Could not reach the score service. Your best run is saved here for retry.');
 const confirmed=await loadOwnScore();if(!confirmed)throw Error('Waiting for score confirmation. We will retry automatically.');return confirmed;
}
export async function publishScore(run:RecordedRun,name:string){
 if(!eligibleForLeaderboard(run,false,false))throw Error('Only standard solo Survival runs can be published.');
 return publishCandidate({score:scoreCandidate(run),name});
}
