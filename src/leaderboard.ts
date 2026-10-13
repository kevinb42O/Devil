import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {REPLAY_RULES_VERSION, type RecordedRun} from './replay';
export type LeaderboardRow={player_name:string;survival_ms:number;kills:number;gems:number;achieved_at:string};
let client:SupabaseClient|undefined;
export function leaderboardConfigured(){return !!(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);}
function database(){
 if(!leaderboardConfigured())throw Error('The public leaderboard is not connected yet.');
 return client??=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:'abyss-leaderboard-auth',detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
}
export async function loadLeaderboard():Promise<LeaderboardRow[]>{
 const {data,error}=await database().rpc('abyss_leaderboard',{p_rules:REPLAY_RULES_VERSION});
 if(error)throw Error('The leaderboard is unavailable. Try refreshing in a moment.');
 return data??[];
}
export function eligibleForLeaderboard(run:RecordedRun|null,practice:boolean,friends:boolean){return !!run&&!practice&&!friends&&!run.practice&&run.version===REPLAY_RULES_VERSION&&run.setup.time===0&&run.setup.level===1&&run.setup.reserve===0&&Number.isFinite(run.time)&&run.time>0;}
export async function publishScore(run:RecordedRun,name:string){
 const clean=name.trim();if(!clean||clean.length>24||/[\u0000-\u001f\u007f]/.test(clean))throw Error('Enter a name of 1–24 characters.');
 if(!eligibleForLeaderboard(run,false,false))throw Error('Only standard solo Survival runs can be published.');
 const db=database();const {data,error}=await db.auth.getSession();if(error)throw Error('Your leaderboard session is unavailable. Try again.');
 if(!data.session){const {error}=await db.auth.signInAnonymously();if(error)throw Error('Could not create your player session. Try again in a moment.');}
 const {error:submissionError}=await db.rpc('abyss_submit_score',{p_name:clean,p_time_ms:Math.round(run.time*1000),p_kills:run.stats.kills,p_gems:run.stats.collected,p_rules:run.version});
 if(submissionError)throw Error(submissionError.message.includes('wait')?'Please wait a few seconds before publishing again.':'Your score could not be published. Try again.');
}
