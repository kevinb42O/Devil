import {randomId} from './id';
import {World,STEP,idleInput,type Input} from './simulation';
export const REPLAY_RULES_VERSION=6;
export type RunSetup={time:number;level:number;reserve:number};
export const DEFAULT_SETUP:RunSetup={time:0,level:1,reserve:0};
export function createRun(seed:number,setup:RunSetup=DEFAULT_SETUP,rulesVersion=REPLAY_RULES_VERSION,analogMovement=true,combatRevision=rulesVersion>=6?15:0){const w=new World(seed,{legacyHomingUnlock:combatRevision<15,legacyFinalHandUnlock:combatRevision<14,legacyGigapedeMotion:combatRevision<13,legacyPedeContact:combatRevision<13,legacyEnemyFloor:combatRevision<12,legacySpawnFixes:combatRevision<11,legacyFloorSweep:combatRevision<10,legacySpawnPlacement:combatRevision<7,legacySpawnRules:combatRevision<9,legacyEnemyBehavior:combatRevision<1,legacyCentipedeCycle:combatRevision<6,legacyCentipedeArc:combatRevision<8,legacyPedePursuit:combatRevision>=1&&combatRevision<5,legacyWeaponOrigin:combatRevision<2,legacyStreamRadius:combatRevision<3,legacyWideStream:combatRevision===3,legacyAnalogMovement:rulesVersion<6||!analogMovement,...(rulesVersion<6?{cameraProjectiles:rulesVersion===4,legacyTowerOrbit:true}:{})});w.startAt(setup.time,setup.level,setup.reserve);return w;}
export type RecordedInput={ticks:number;input:Input};
export type RecordedRun={format:'abyss-replay';version:number;combatRevision?:number;analogMovement?:boolean;id:string;created:number;seed:number;setup:RunSetup;frames:RecordedInput[];ticks:number;time:number;cause:string;stats:World['stats'];saved:boolean;practice:boolean};
const same=(a:Input,b:Input)=>a.forward===b.forward&&a.strafe===b.strafe&&a.yaw===b.yaw&&a.pitch===b.pitch&&a.jump===b.jump&&a.fire===b.fire&&a.homing===b.homing;
export class RunRecorder{
 private frames:RecordedInput[]=[];private ticks=0;
 constructor(readonly seed:number,readonly setup:RunSetup=DEFAULT_SETUP){}
 record(input:Input){const last=this.frames.at(-1);if(last&&same(last.input,input))last.ticks++;else this.frames.push({ticks:1,input:{...input}});this.ticks++;}
 finish(w:World):RecordedRun{return {format:'abyss-replay',version:REPLAY_RULES_VERSION,combatRevision:15,analogMovement:true,id:randomId(),created:Date.now(),seed:this.seed,setup:{...this.setup},frames:this.frames,ticks:this.ticks,time:w.time,cause:w.cause,stats:structuredClone(w.stats),saved:false,practice:this.setup.time!==0||this.setup.level!==1||this.setup.reserve!==0};}
}
export class ReplayPlayer{
 world:World;tick=0;lastInput:Input=idleInput();private frame=0;private remaining=0;
 constructor(readonly run:RecordedRun){if(run.format!=='abyss-replay'||![4,5,REPLAY_RULES_VERSION].includes(run.version))throw Error('Replay uses incompatible gameplay rules');this.world=createRun(run.seed,run.setup,run.version,run.analogMovement===true,run.version>=6?(run.combatRevision??0):0);}
 get done(){return this.tick>=this.run.ticks;}
 get input(){return this.run.frames[this.frame]?.input;}
 step(){if(this.done)return;if(!this.remaining)this.remaining=this.run.frames[this.frame].ticks;this.lastInput=this.run.frames[this.frame].input;this.world.step(this.lastInput,STEP);this.tick++;if(!--this.remaining)this.frame++;}
 seek(tick:number,onStep?:(world:World)=>void,onReset?:()=>void){const target=Math.max(0,Math.min(this.run.ticks,Math.round(tick)));if(target<this.tick){onReset?.();this.world=createRun(this.run.seed,this.run.setup,this.run.version,this.run.analogMovement===true,this.run.version>=6?(this.run.combatRevision??0):0);this.tick=0;this.frame=0;this.remaining=0;this.lastInput=idleInput();}while(this.tick<target){this.step();onStep?.(this.world);this.world.effects=[];}return this.world;}
}
/** Browser storage: retain ten recent runs, plus runs explicitly kept by the player. */
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('abyss-replays',1);request.onupgradeneeded=()=>request.result.createObjectStore('runs',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function listRuns():Promise<RecordedRun[]>{const db=await database();try{return await new Promise((resolve,reject)=>{const request=db.transaction('runs','readonly').objectStore('runs').getAll();request.onsuccess=()=>resolve((request.result as RecordedRun[]).sort((a,b)=>b.created-a.created));request.onerror=()=>reject(request.error);});}finally{db.close();}}
export async function saveRun(run:RecordedRun){const db=await database();try{await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('runs','readwrite');transaction.objectStore('runs').put(run);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);});}finally{db.close();}const old=(await listRuns()).filter(r=>!r.saved).slice(10);if(old.length){const db=await database();try{await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('runs','readwrite');for(const run of old)transaction.objectStore('runs').delete(run.id);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);});}finally{db.close();}}}
