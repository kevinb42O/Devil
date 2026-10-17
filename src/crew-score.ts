import {MAX_CREW_PLAYERS} from './crew-config';
import type {RecordedCrewRun,CrewReplayMember} from './crew-replay';
export type CrewRegistration={id:string;key:string;state:string};
export type CrewScoreResult={id:string;best:boolean;timeMs:number};
export type CrewLeaderboardRow={rank:number;run_id:string;roster:CrewReplayMember[];survival_ms:number;kills:number;gems:number;achieved_at:string;replay_id:string|null};
export function crewEligibility(run:RecordedCrewRun,allowHistorical=false):string|null{
 if(run.roster.length<2||run.roster.length>MAX_CREW_PLAYERS)return 'Ranked multiplayer requires two to six players.';
 if(run.version!==1||(allowHistorical?![18,19,20,21].includes(run.combatRevision):![20,21].includes(run.combatRevision)))return 'This run uses unsupported gameplay rules.';
 const first=run.checkpoints[0]?.state,final=run.checkpoints.at(-1)?.state;
 if(!first||first.time!==0||first.tick!==0||first.options.schedule===false||first.options.invulnerable||Object.entries(first.options).some(([k,v])=>k.startsWith('legacy')&&v))return 'Only standard Survival starts can be ranked.';
 if(final?.state!=='dead'||run.cause!=='CREW LOST'||!Number.isInteger(run.ticks)||run.ticks<1||run.ticks>216000||Math.abs(run.time-run.ticks/120)>.001)return 'Only completed team wipes can be ranked.';
 if(run.events.some(e=>e.kind==='disconnect')||final.crew.some(p=>p.cause==='DISCONNECTED'))return 'A player left during this run. The replay is saved locally.';
 for(const frame of run.frames)if(frame.disconnected)return 'A player left during this run. The replay is saved locally.';
 return null;
}
export function sameRoster(a:CrewReplayMember[],b:CrewReplayMember[]){return a.length===b.length&&a.every((p,i)=>p.id===b[i].id&&p.name===b[i].name&&p.host===b[i].host);}
export function crewNames(roster:CrewReplayMember[]){return roster.map(p=>p.name).join(' · ');}

export function publicCrewRoster(roster:CrewReplayMember[]){return roster.map(({id,name,host})=>({id,name,host}));}

export function isCrewRoster(value:unknown):value is CrewReplayMember[]{
 if(!Array.isArray(value)||value.length<1||value.length>MAX_CREW_PLAYERS)return false;
 const ids=new Set<string>();let hosts=0;for(const p of value){if(!p||typeof p!=='object'||typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>24||/[\u0000-\u001f\u007f]/.test(p.name)||typeof p.host!=='boolean')return false;ids.add(p.id);if(p.host)hosts++;}return hosts===1;
}
