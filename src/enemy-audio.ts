import type {Enemy,Vec} from './simulation';
import type {EnemyKind} from './enemy-kinds';
import {hearingProfile} from './spatial-audio';

export const ENEMY_CHATTER:Record<EnemyKind,string>={skull:'chatterskull',skull2:'chatterskull2',skull3:'chatterskull3',skull4:'chatterskull4',transmuted1:'chatterskullblack',transmuted2:'chatterskull2black',transmuted3:'chatterskull3black',transmuted4:'chatterskull4black',squid:'chatterminisquid',squid2:'chattersquid',squid3:'chattersquidultra',spider:'chatterspider',spider2:'chattergigaspider',spiderling:'chatterspiderling',centipede:'chattercentipede',gigapede:'chattercentipede2',ghostpede:'chatterultrapede',leviathan:'chatterleviathan',orb:'eyearousedrone',thorn:'chatterthorn',egg:'eggdrone',egg2:'eggdrone2'};
/** Creature arrival and surface break-through are separate physical gestures. */
export const ENEMY_SPAWN:Partial<Record<EnemyKind,string>>={squid:'spawnminisquid',squid2:'spawnsquid',squid3:'spawnultrasquid',spider:'spawnspider',spider2:'spawngigaspider',centipede:'spawncentipede',gigapede:'spawncentipede2',ghostpede:'spawnultrapede',leviathan:'spawnleviathan',orb:'eyearouse',thorn:'thornemerge',egg:'spawnegg',egg2:'spawnegg2'};
export const ENEMY_EMERGE:Partial<Record<EnemyKind,string>>={centipede:'unburrowcentipede',gigapede:'unburrowgigapede',ghostpede:'unburrowghostpede'};
const squared=(a:Vec,b:Vec)=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;
/** A long creature is audible where its nearest living body passes the listener. */
export function enemyAudioPosition(enemy:Enemy,listener:Vec):Vec{
 let pos=enemy.pos,range=squared(pos,listener);
 if(enemy.kind==='centipede'||enemy.kind==='gigapede'||enemy.kind==='ghostpede')for(const segment of enemy.segments){
  if(segment.hp<=0)continue;const next=squared(segment.pos,listener);if(next<range){pos=segment.pos;range=next;}
 }
 return pos;
}
/** Protect immediate danger, then type and bearing diversity, within a fixed voice budget. */
export function selectEnemyAudio(enemies:readonly Enemy[],listener:Vec,active:(e:Enemy)=>boolean,retained:ReadonlySet<number>=new Set(),budget=28){
 const candidates=enemies.filter(e=>e.hp>0&&(active(e)||e.kind==='centipede')).map(enemy=>{
  const pos=enemyAudioPosition(enemy,listener),distance=Math.sqrt(squared(pos,listener));
  return {enemy,pos,distance,score:distance*(retained.has(enemy.id)?.85:1),sector:Math.floor((Math.atan2(pos.z-listener.z,pos.x-listener.x)+Math.PI)/(Math.PI/4))%8,scale:1};
 }).filter(c=>c.distance<hearingProfile(ENEMY_CHATTER[c.enemy.kind]).maxDistance).sort((a,b)=>a.score-b.score||a.enemy.id-b.enemy.id);
 const selected:typeof candidates=[],ids=new Set<number>();
 const add=(c:typeof candidates[number])=>{if(selected.length<budget&&!ids.has(c.enemy.id)){selected.push(c);ids.add(c.enemy.id);}};
 // Physical proximity wins over continuity for the eight most immediate threats.
 [...candidates].sort((a,b)=>a.distance-b.distance||a.enemy.id-b.enemy.id).slice(0,Math.min(8,budget)).forEach(add);
 const kinds=new Set<EnemyKind>();for(const c of candidates){if(kinds.has(c.enemy.kind))continue;kinds.add(c.enemy.kind);add(c);}
 const sectors=new Set<number>();for(const c of candidates){if(sectors.has(c.sector))continue;sectors.add(c.sector);add(c);}
 candidates.forEach(add);
 const counts=new Map<EnemyKind,number>();for(const c of selected)counts.set(c.enemy.kind,(counts.get(c.enemy.kind)??0)+1);
 for(const c of selected){const crowd=1/Math.sqrt(counts.get(c.enemy.kind)!);c.scale=1.2*crowd;}
 return selected;
}
