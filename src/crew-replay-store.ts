import {encodeCrewReplay,decodeCrewReplay,type RecordedCrewRun,type CrewReplayMember} from './crew-replay';
export type CrewUploadJob={registrationId:string;automatic:boolean;scoreConfirmed?:boolean;best?:boolean;replayId?:string;ready?:boolean;error?:string;attempts:number;retryAt:number};
export type StoredCrewReplay={id:string;created:number;time:number;roster:CrewReplayMember[];blob:Blob;kept:boolean;reason:string|null;owner:boolean;publicationRegistrationId?:string;job?:CrewUploadJob};
const LOCAL_BUDGET=128*1024*1024;
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('abyss-crew-recordings',1);r.onupgradeneeded=()=>{r.result.createObjectStore('runs',{keyPath:'id'});r.result.createObjectStore('cache',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function operation<T>(store:'runs'|'cache',mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest):Promise<T>{const db=await database();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(store,mode),r=fn(tx.objectStore(store));tx.oncomplete=()=>resolve(r.result as T);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function listCrewRuns(){return (await operation<StoredCrewReplay[]>('runs','readonly',s=>s.getAll())).sort((a,b)=>b.created-a.created);}
export function getCrewRun(id:string){return operation<StoredCrewReplay|undefined>('runs','readonly',s=>s.get(id));}
export async function putCrewRun(row:StoredCrewReplay){await operation('runs','readwrite',s=>s.put(row));}
export async function saveCrewRun(run:RecordedCrewRun,reason:string|null,owner:boolean,registrationId?:string,automatic=false){
 const old=await getCrewRun(run.id);if(old)return old;
 const blob=await encodeCrewReplay(run),row:StoredCrewReplay={id:run.id,created:run.created,time:run.time,roster:run.roster.map(p=>({...p})),blob,kept:false,reason,owner,publicationRegistrationId:registrationId,job:registrationId&&!reason?{registrationId,automatic,attempts:0,retryAt:0}:undefined};
 const rows=await listCrewRuns();let bytes=rows.reduce((n,r)=>n+r.blob.size,0)+blob.size,retained=rows.length+1;
 for(const candidate of rows.slice().reverse()){if(candidate.kept||candidate.job&&!candidate.job.ready)continue;if(bytes<=LOCAL_BUDGET&&retained<=10)break;await operation('runs','readwrite',s=>s.delete(candidate.id));bytes-=candidate.blob.size;retained--;}
 if(bytes>LOCAL_BUDGET)throw Error('Local team replay storage is full. Export this run or remove a kept replay.');
 await putCrewRun(row);return row;
}
export async function removeLocalCrewRun(id:string){const row=await getCrewRun(id);if(row?.job&&!row.job.ready)throw Error('Finish or cancel the pending publication before removing this recording.');await operation('runs','readwrite',s=>s.delete(id));}
export async function readCrewRun(row:StoredCrewReplay){return decodeCrewReplay(row.blob);}
export function cachedCrewReplay(id:string){return operation<{id:string;blob:Blob;used:number}|undefined>('cache','readonly',s=>s.get(id));}
export async function cacheCrewReplay(id:string,blob:Blob){await operation('cache','readwrite',s=>s.put({id,blob,used:Date.now()}));const rows=await operation<{id:string;blob:Blob;used:number}[]>('cache','readonly',s=>s.getAll());let total=0;for(const row of rows.sort((a,b)=>b.used-a.used)){total+=row.blob.size;if(total>64*1024*1024)await operation('cache','readwrite',s=>s.delete(row.id));}}

/** Update only a still-existing publication job; never recreate a cancelled job or overwrite Keep. */
export async function updateCrewJob(id:string,job:CrewUploadJob){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('runs','readwrite'),store=tx.objectStore('runs'),request=store.get(id);request.onsuccess=()=>{const row=request.result as StoredCrewReplay|undefined;if(row?.job?.registrationId===job.registrationId)store.put({...row,job:{...job}});};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
