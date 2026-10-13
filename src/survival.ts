import {SURVIVAL_SPAWNS} from './survival-data';
import {type EnemyKind} from './enemy-kinds';
const TYPES:EnemyKind[]=['squid','squid2','centipede','spider','leviathan','gigapede','squid3','thorn','spider2','ghostpede'];
export type ScheduledSpawn={tick:number;time:number;kind:EnemyKind;wave:number};
const LOOP_START=SURVIVAL_SPAWNS.map(([type])=>type).lastIndexOf(-1);
/** 60 Hz float stepping follows the pinned community SpawnsView loop calculation. */
export function* survivalSchedule():Generator<ScheduledSpawn>{
 let time=0;
 for(const [type,delay] of SURVIVAL_SPAWNS.slice(0,LOOP_START)){
  time+=delay;if(type!==-1)yield {tick:Math.round(time*60),time,kind:TYPES[type],wave:-1};
 }
 let tick=Math.round(time*60);
 for(let wave=0;;wave++){
  let enemyTime=0,delay=0;
  for(const [type,wait] of SURVIVAL_SPAWNS.slice(LOOP_START)){
   delay=Math.fround(delay+wait);
   while(enemyTime<delay){tick++;enemyTime=Math.fround(enemyTime+Math.fround(1/60+1/60/8*wave));}
   if(type!==-1)yield {tick,time:tick/60,kind:type===5&&wave%3===2?'ghostpede':TYPES[type],wave};
  }
 }
}
export const TIMELINE:ScheduledSpawn[]=[];
for(const e of survivalSchedule()){if(e.wave>=0)break;TIMELINE.push(e);}
