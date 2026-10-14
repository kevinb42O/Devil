import {leaderboardDatabase,eligibleForLeaderboard} from './leaderboard';
import {type RecordedRun} from './replay';
import {encodeReplay,decodeReplay,MAX_REPLAY_BYTES,readBounded} from './replay-file';

export type SharedReplay={id:string;slot:number;run_id:string;survival_ms:number;ready:boolean;bytes:number};
const bucket='abyss-replays';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function replayLink(id:string){if(!uuid.test(id))throw Error('Invalid replay link.');const url=new URL(location.href);url.search='';url.hash=`replay=${id}`;return url.href;}
export function linkedReplay(hash:string){const id=new URLSearchParams(hash.replace(/^#/,'' )).get('replay');return id&&uuid.test(id)?id:null;}
function cloudError(error:{message:string;code?:string}){return Error(error.code==='PGRST202'?'Replay sharing is not available on the server yet. You can still export a file.':error.message);}
async function identity(){const db=leaderboardDatabase();const {data,error}=await db.auth.getSession();if(error)throw Error('Your player session is unavailable.');if(!data.session){const {error}=await db.auth.signInAnonymously();if(error)throw Error('Could not connect your player profile.');}return db;}
export async function ownReplays():Promise<SharedReplay[]>{const db=leaderboardDatabase();const {data:session}=await db.auth.getSession();if(!session.session)return [];const {data,error}=await db.rpc('abyss_own_replays');if(error)throw cloudError(error);return data??[];}
export async function removeSharedReplay(id:string){if(!uuid.test(id))throw Error('Invalid replay.');const db=await identity();const {error}=await db.storage.from(bucket).remove([`${id}.gz`]);if(error)throw cloudError(error);const result=await db.rpc('abyss_forget_replay',{p_id:id});if(result.error)throw cloudError(result.error);}
let uploading=false;
export async function shareReplay(run:RecordedRun,name:string,best=false):Promise<string>{
 if(uploading)throw Error('Another replay is uploading. Please wait.');uploading=true;
 try{
  if(best&&!eligibleForLeaderboard(run,false,false))throw Error('Only standard Survival can be attached to a score.');
  // Encode before signing in, deleting anything, or reserving space.
  const blob=await encodeReplay(run),db=await identity();let existing=await ownReplays();for(const unfinished of existing.filter(r=>r.run_id===run.id&&!r.ready)){await removeSharedReplay(unfinished.id);}existing=existing.filter(r=>r.run_id!==run.id||r.ready);const found=existing.find(r=>r.run_id===run.id&&r.ready);
  if(found&&(!best||found.slot===0))return found.id;
  const slot=best?0:[1,2,3].find(s=>!existing.some(r=>r.slot===s));if(slot===undefined)throw Error('Your three shared replay slots are full. Remove a shared replay to make room.');
  if(best){const old=existing.find(r=>r.slot===0);if(old?.ready&&old.survival_ms>=Math.round(run.time*1000))throw Error('This best already has a replay. Refresh the leaderboard to watch it.');if(old)await removeSharedReplay(old.id);}
  // A manually shared run can become the leaderboard replay without a duplicate upload.
  if(found){const {error}=await db.rpc('abyss_promote_replay',{p_id:found.id});if(error)throw cloudError(error);return found.id;}
  const {data:id,error}=await db.rpc('abyss_reserve_replay',{p_slot:slot,p_run_id:run.id,p_name:name.trim()||'Wanderer',p_rules:run.version,p_time_ms:Math.round(run.time*1000),p_kills:run.stats.kills,p_gems:run.stats.collected,p_practice:run.practice,p_bytes:blob.size});
  if(error)throw cloudError(error);
  try{const {error}=await db.storage.from(bucket).upload(`${id}.gz`,blob,{contentType:'application/gzip',cacheControl:'31536000',upsert:false});if(error)throw cloudError(error);const result=await db.rpc('abyss_finish_replay',{p_id:id});if(result.error)throw cloudError(result.error);return id;
  }catch(error){try{await removeSharedReplay(id);}catch{/* Reservation remains visible for removal/retry, preserving its budget. */}throw error;}
 }finally{uploading=false;}
}
async function localDatabase(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('abyss-replay-sharing',1);r.onupgradeneeded=()=>{r.result.createObjectStore('cache',{keyPath:'id'});r.result.createObjectStore('pending');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function local<T>(store:'cache'|'pending',mode:IDBTransactionMode,operation:(s:IDBObjectStore)=>IDBRequest):Promise<T>{const db=await localDatabase();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(store,mode),r=operation(tx.objectStore(store));tx.oncomplete=()=>resolve(r.result as T);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export type PendingReplay={run:RecordedRun;name:string};
export async function retainPendingReplay(run:RecordedRun,name:string){const db=await localDatabase();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('pending','readwrite'),s=tx.objectStore('pending'),r=s.get('best');r.onsuccess=()=>{if(!r.result||r.result.run.time<=run.time)s.put({run,name},'best');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export function pendingReplay(){return local<PendingReplay|undefined>('pending','readonly',s=>s.get('best'));}
export async function clearPendingReplay(runId:string){const db=await localDatabase();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('pending','readwrite'),s=tx.objectStore('pending'),r=s.get('best');r.onsuccess=()=>{if(r.result?.run.id===runId)s.delete('best');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
const downloads=new Map<string,Promise<RecordedRun>>();
export function downloadReplay(id:string):Promise<RecordedRun>{
 if(!uuid.test(id))return Promise.reject(Error('Invalid replay link.'));const active=downloads.get(id);if(active)return active;
 const task=loadReplay(id).finally(()=>downloads.delete(id));downloads.set(id,task);return task;
}
async function loadReplay(id:string):Promise<RecordedRun>{
 try{const cached=await local<{id:string;run:RecordedRun}|undefined>('cache','readonly',s=>s.get(id));if(cached)return cached.run;}catch{/* Network playback works without IndexedDB. */}
 const db=leaderboardDatabase(),{data,error}=await db.rpc('abyss_replay',{p_id:id});if(error)throw cloudError(error);const metadata=data?.[0];if(!metadata)throw Error('This replay is unavailable or was removed.');
 const url=db.storage.from(bucket).getPublicUrl(`${id}.gz`).data.publicUrl;const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok||!response.body)throw Error('The replay could not be downloaded. Try again.');
 const bytes=await readBounded(response.body,MAX_REPLAY_BYTES),run=await decodeReplay(new Blob([bytes as BlobPart]));
 if(bytes.length!==metadata.bytes||run.version!==metadata.rules||Math.round(run.time*1000)!==metadata.survival_ms||run.practice!==metadata.practice)throw Error('Replay does not match its shared record.');
 try{await local('cache','readwrite',s=>s.put({id,run,used:Date.now()}));const records=await local<{id:string;used:number}[]>('cache','readonly',s=>s.getAll());for(const r of records.sort((a,b)=>b.used-a.used).slice(10))await local('cache','readwrite',s=>s.delete(r.id));}catch{/* A full local cache must not stop playback. */}
 return run;
}
