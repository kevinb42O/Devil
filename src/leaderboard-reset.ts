// One-time fresh start. Keep player identity, controls and publication preferences.
const RESET='2026-10-20';
export function resetLocalScores(){
 try{
  const key=`abyss-score-reset:${RESET}`;
  if(localStorage.getItem(key))return;
  for(const name of ['abyss-survival-v3-best','abyss-last-run','abyss-pending-score','abyss-pending-score-v7'])localStorage.removeItem(name);
  localStorage.setItem(key,'done');
 }catch{/* Gameplay remains available when browser storage is disabled. */}
}
const resets=new Map<string,Promise<void>>();
/** Gate every replay read/write so old recordings and upload jobs cannot race cleanup. */
export function resetReplayDatabase(name:string):Promise<void>{
 const pending=resets.get(name);if(pending)return pending;
 const task=(async()=>{
  const key=`abyss-replay-reset:${RESET}:${name}`;
  // If durable markers are unavailable, avoid deleting new recordings repeatedly.
  try{if(localStorage.getItem(key))return;}catch{return;}
  await new Promise<void>((resolve,reject)=>{
   const request=indexedDB.deleteDatabase(name);
   request.onsuccess=()=>resolve();
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(Error('Close other game tabs to finish the replay reset, then refresh.'));
  });
  localStorage.setItem(key,'done');
 })();
 resets.set(name,task);task.catch(()=>resets.delete(name));return task;
}
