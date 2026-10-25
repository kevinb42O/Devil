import type {Effect} from './simulation';
import type {EnemyKind} from './enemy-kinds';
const variants=(name:string,count:number)=>Array.from({length:count},(_,i)=>`${name}${i+1}`);
/** Roles checked against the ddinfo source catalog, rather than filename guesses.
 * https://github.com/NoahStolk/ddinfo-web/blob/master/src/DevilDaggersInfo.Web.Server/Utils/AssetInfo/AudioAudio.cs
 * Mixer gains and hop timing remain calibrated browser-port behavior. */
export function jumpCue(e:Effect){
 const variant=e.jumpAudio??(e.amount===3?3:e.amount===2?2:1);
 return variant===0?undefined:`jump${variant}`;
}
export const pickupCue=(level:number)=>level===3?'gibcollectmagic':'gibcollect';
export function ricochetCues(e:Effect){
 const level=e.level??1;
 // The emitter preserves the firing level; amount distinguishes homing hits.
 const stem=(e.amount??1)>1?level>=4?'ricochetmagenta':'ricochetmagic':level>=3?'gigaricochet':level===2?'ricochetmed':'ricochet';
 return variants(stem,stem==='ricochetmagic'?4:5);
}
export const ENEMY_KILL:Partial<Record<EnemyKind,string|string[]>>={skull:variants('killskull',5),skull2:'killsuperskull',skull3:'killsuperskull2',skull4:'killsuperskull3',transmuted1:variants('killskullblack',4),transmuted2:'killsuperskullblack',transmuted3:'killsuperskull2black',transmuted4:'killsuperskull3',squid:'killminisquid',squid2:'killsquid',squid3:'killultrasquid',spider:'killspider',spider2:'killgigaspider',centipede:'killcentipede',gigapede:'killcentipede2',ghostpede:'ultrapedefall',leviathan:'killleviathan',orb:'killeye',thorn:'killthorn',egg:'eggburst',egg2:'eggburst',spiderling:variants('killspiderling',5)};
export const ENEMY_HIT:Partial<Record<EnemyKind,string>>={squid:'damagesquid',squid2:'damagesquid',squid3:'damagesquid',spider:'damagespider',spider2:'damagegigaspider',centipede:'damagecentipede',gigapede:'damagecentipede2',ghostpede:'damageultrapede',leviathan:'damagesquid',orb:'eyehit',thorn:'damagethorn'};
export function enemyDamageCue(e:Effect){
 if(e.crystalBreak){
  if(e.enemy==='squid2')return 'damagesquid2';
  if(e.enemy==='squid3')return 'damagesquid3';
  if(e.enemy==='leviathan')return 'damageleviathan';
 }
 return e.enemy?ENEMY_HIT[e.enemy]??'daggerhit1':'daggerhit1';
}
export const towerGushCue=(kind:EnemyKind)=>kind==='squid'?'spawnskulls2':kind==='squid2'?'spawnskulls':'spawnskulls3';
export const pierceCues=(level:number)=>variants(level>=4?'magentastuckenemy':'magicpierce',5);
/** Native large-body floor contacts; ordinary liquid droplets are not meat chunks. */
export function deathSplashCue(kind:string){
 return ({squid2:'splashgiga',centipede:'splashgiga2',gigapede:'splashgiga2',spider:'splashgiga3',squid3:'splashgiga4',spider2:'splashgiga5',ghostpede:'splashgiga6'} as Record<string,string>)[kind];
}

export const DAGGER_REWARDS=[
 {time:60,name:'daggercollect1bronze'},
 {time:120,name:'daggercollect2silver'},
 {time:250,name:'daggercollect3gold'},
 {time:500,name:'daggercollect4devil'},
 {time:1000,name:'daggercollect5'},
] as const;
