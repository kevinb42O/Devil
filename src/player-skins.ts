export const ASCENDANT_SKIN='ascendant' as const;
export type PodiumRank=1|2|3;
export type PlayerSkin=typeof ASCENDANT_SKIN;
export function isPodiumRank(value:unknown):value is PodiumRank{return value===1||value===2||value===3;}
export function isPlayerSkin(value:unknown):value is PlayerSkin{return value===ASCENDANT_SKIN;}
export const PODIUM_METALS=['#f5c76f','#c2dce9','#d99363'] as const;

/** The authenticated personal best must agree with the freshly loaded solo board. */
export function podiumSkinEligibility(own:{rank:number;player_name:string;survival_ms:number;achieved_at:string}|null,scores:{player_name:string;survival_ms:number;achieved_at:string}[]):PodiumRank|null{
 if(!own||!isPodiumRank(own.rank))return null;
 const row=scores[own.rank-1];
 return row&&row.player_name===own.player_name&&row.survival_ms===own.survival_ms&&row.achieved_at===own.achieved_at?own.rank:null;
}
