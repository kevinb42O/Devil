import {leaderboardConfigured,leaderboardDatabase} from './leaderboard';
import {isPodiumRank,type PodiumRank} from './player-skins';
export type PodiumSkinGrant={token:string;rank:PodiumRank};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function claimPodiumSkin(room:string,peer:string):Promise<PodiumSkinGrant|null>{
 if(!leaderboardConfigured())return null;
 const db=leaderboardDatabase(),{data:session}=await db.auth.getSession();if(!session.session)return null;
 const {data,error}=await db.rpc('abyss_claim_podium_skin',{p_room:room,p_peer:peer});
 if(error)throw Error('The exclusive skin could not be verified. Try again in a moment.');
 return data&&uuid.test(data.token)&&isPodiumRank(data.rank)?{token:data.token,rank:data.rank}:null;
}
export async function verifyPodiumSkin(token:unknown,room:string,peer:string):Promise<PodiumRank|null>{
 if(typeof token!=='string'||!uuid.test(token)||!leaderboardConfigured())return null;
 const {data,error}=await leaderboardDatabase().rpc('abyss_verify_podium_skin',{p_token:token,p_room:room,p_peer:peer});
 if(error)throw Error('The exclusive skin could not be verified. Try again in a moment.');
 return isPodiumRank(data)?data:null;
}
