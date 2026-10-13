/** Durable best-score outbox. Gameplay never waits on the network. */
export type ScoreCandidate={id:string;timeMs:number;kills:number;gems:number;rules:number};
export type OwnScore={player_name:string;survival_ms:number;kills:number;gems:number;achieved_at:string;rank:number};
export type PendingScore={score:ScoreCandidate;name:string};
export function cleanNickname(name:string){const clean=name.trim();if(!clean||clean.length>24||/[\u0000-\u001f\u007f]/.test(clean))throw Error('Choose a nickname of 1–24 characters.');return clean;}
export class ScoreQueue {
 pending:PendingScore|null=null;confirmed:OwnScore|null=null;busy=false;error='';onChange=()=>{};
 constructor(private persist:(pending:PendingScore|null)=>void,private send:(pending:PendingScore)=>Promise<OwnScore>,saved:PendingScore|null=null){
  if(saved&&typeof saved.name==='string'&&saved.score&&typeof saved.score.id==='string'&&saved.score.rules===6&&Number.isInteger(saved.score.timeMs)&&saved.score.timeMs>0&&saved.score.timeMs<=86400000&&[saved.score.kills,saved.score.gems].every(n=>Number.isInteger(n)&&n>=0&&n<=10000000)){
   try{this.pending={score:{...saved.score},name:cleanNickname(saved.name)};}catch{/* Ignore damaged local storage. */}
  }
 }
 remember(score:OwnScore|null){if(score&&(!this.confirmed||score.survival_ms>=this.confirmed.survival_ms))this.confirmed=score;this.onChange();}
 enqueue(score:ScoreCandidate,name:string){
  const clean=cleanNickname(name);
  if(score.timeMs<=(this.confirmed?.survival_ms??0))return false;
  if(!this.pending||score.timeMs>this.pending.score.timeMs){this.pending={score:{...score},name:clean};this.persist(this.pending);this.error='';this.onChange();}
  return true;
 }
 async flush(){
  if(this.busy||!this.pending)return;this.busy=true;this.error='';this.onChange();
  try{while(this.pending){const job:PendingScore=this.pending;const result=await this.send(job);this.remember(result);
   // A better run may have finished while this request was in flight.
   if(this.pending.score.timeMs<=result.survival_ms){this.pending=null;this.persist(null);}
   else if(this.pending===job)throw Error('The server did not confirm this score. Try again.');
  }}catch(error){this.error=error instanceof Error?error.message:'Connection interrupted. Try again.';}
  finally{this.busy=false;this.onChange();}
 }
}
