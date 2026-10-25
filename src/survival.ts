import {SURVIVAL_SPAWNS} from './survival-data';
import {isSpider,type EnemyKind} from './enemy-kinds';
const TYPES:EnemyKind[]=['squid','squid2','centipede','spider','leviathan','gigapede','squid3','thorn','spider2','ghostpede'];
export type ScheduledSpawn={tick:number;time:number;kind:EnemyKind;wave:number;spiderGroup?:{index:number;count:number}};
const LOOP_START=SURVIVAL_SPAWNS.map(([type])=>type).lastIndexOf(-1);
/** 60 Hz float stepping follows the pinned community SpawnsView loop calculation. */
export function* legacySurvivalSchedule():Generator<ScheduledSpawn>{
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
/** Original replay ticks use a float32 countdown with overshoot carried into
 * the next delay and wave. Resetting a timer each wave gradually delays spawns. */
export function* survivalSchedule():Generator<ScheduledSpawn>{
 let index=0,wave=-1,remaining=Math.fround(SURVIVAL_SPAWNS[0][1]);
 const step=Math.fround(1/60);
 for(let tick=0;;tick++){
  const rate=Math.fround(step+Math.fround(Math.fround(step/8)*Math.max(0,wave)));
  remaining=Math.fround(remaining-rate);
  if(remaining>0)continue;
  const batch:ScheduledSpawn[]=[];
  while(remaining<=0){
   const type=SURVIVAL_SPAWNS[index][0];
   if(type!==-1)batch.push({tick,time:tick/60,kind:type===5&&wave%3===2?'ghostpede':TYPES[type],wave});
   index++;
   if(index===SURVIVAL_SPAWNS.length){index=LOOP_START;wave++;}
   if(index===LOOP_START&&wave<0)wave=0;
   remaining=Math.fround(remaining+SURVIVAL_SPAWNS[index][1]);
  }
  // Consecutive spiders born on one tick share an evenly spaced formation.
  for(let first=0;first<batch.length;){
   let end=first+1;
   if(isSpider(batch[first].kind))while(end<batch.length&&isSpider(batch[end].kind))end++;
   if(end-first>1)for(let i=first;i<end;i++)batch[i].spiderGroup={index:i-first,count:end-first};
   first=end;
  }
  yield* batch;
 }
}
export const TIMELINE:ScheduledSpawn[]=[];
for(const e of survivalSchedule()){if(e.wave>=0)break;TIMELINE.push(e);}
