import {leaderboardDatabase} from './leaderboard';
import {crewIdentity,crewServiceError,publishCrew} from './crew-leaderboard';
import {readBounded} from './replay-file';
import {decodeCrewReplay,type RecordedCrewRun,type CrewReplayMember} from './crew-replay';
import {sameRoster,publicCrewRoster} from './crew-score';
import {cachedCrewReplay,cacheCrewReplay,getCrewRun,listCrewRuns,updateCrewJob,readCrewRun,type StoredCrewReplay} from './crew-replay-store';
const bucket='abyss-crew-replays';const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type HostedCrewReplay={id:string;run_id:string;client_run_id:string;roster:CrewReplayMember[];ready:boolean;bytes:number;manual_slot:number|null;obsolete:boolean;expired:boolean};
export async function blobDigest(blob:Blob){const bytes=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function ownCrewReplays():Promise<HostedCrewReplay[]>{const db=leaderboardDatabase();if(!(await db.auth.getSession()).data.session)return [];const {data,error}=await db.rpc('abyss_crew_own_replays');if(error)throw crewServiceError(error);return data??[];}
export async function removeHostedCrewReplay(id:string){if(!uuid.test(id))throw Error('Invalid replay ID.');const db=await crewIdentity(),{error}=await db.storage.from(bucket).remove([`${id}.gz`]);if(error)throw crewServiceError(error);const result=await db.rpc('abyss_crew_forget_replay',{p_id:id});if(result.error)throw crewServiceError(result.error);}
export async function uploadCrewReplay(row:StoredCrewReplay,manual=false){
 if(row.blob.size>8*1024*1024)throw Error('This team recording exceeds the 8 MiB cloud limit. Local playback and export remain available.');
 if(manual&&!row.publicationRegistrationId&&!row.job?.registrationId)throw Error('Public replay sharing needs every teammate’s confirmation before combat. Export is available.');
 const run=await readCrewRun(row),db=await crewIdentity(),existing=await ownCrewReplays();
 const found=existing.find(r=>r.client_run_id===run.id);if(found?.ready)return found.id;
 if(found?.expired)await removeHostedCrewReplay(found.id);
 const digest=await blobDigest(row.blob);
 const {data:id,error}=await db.rpc('abyss_crew_reserve',{p_run:row.publicationRegistrationId??row.job?.registrationId??null,p_client_run:run.id,p_roster:publicCrewRoster(run.roster),p_ticks:run.ticks,p_time_ms:Math.round(run.time*1000),p_kills:run.stats.kills,p_gems:run.stats.collected,p_bytes:row.blob.size,p_digest:digest,p_manual:manual});if(error)throw crewServiceError(error);
 if(row.job){row.job.replayId=id;await updateCrewJob(row.id,row.job!);}
 // A previous attempt may have uploaded the immutable object but lost finish confirmation.
 const finish=await db.rpc('abyss_crew_finish_replay',{p_id:id});if(!finish.error)return id;
 const upload=await db.storage.from(bucket).upload(`${id}.gz`,row.blob,{contentType:'application/gzip',cacheControl:'31536000',upsert:false});
 if(upload.error&&String(upload.error.statusCode)!=='409'&&!upload.error.message.toLowerCase().includes('already exists'))throw crewServiceError(upload.error);
 const result=await db.rpc('abyss_crew_finish_replay',{p_id:id});if(result.error)throw crewServiceError(result.error);
 // Replacement is already ready before deleting any obsolete automatic recording.
 for(const old of (await ownCrewReplays()).filter(r=>r.obsolete&&r.ready&&r.id!==id))try{await removeHostedCrewReplay(old.id);}catch{/* Visible in hosted history for retry. */}
 return id as string;
}
const downloads=new Map<string,Promise<RecordedCrewRun>>();
export function downloadCrewReplay(id:string){if(!uuid.test(id))return Promise.reject(Error('Invalid replay link.'));const pending=downloads.get(id);if(pending)return pending;const task=load(id).finally(()=>downloads.delete(id));downloads.set(id,task);return task;}
async function load(id:string){
 const db=leaderboardDatabase(),{data,error}=await db.rpc('abyss_crew_replay',{p_id:id});if(error)throw crewServiceError(error);const meta=data?.[0];if(!meta)throw Error('This team replay is unavailable or was removed.');
 let cached:Awaited<ReturnType<typeof cachedCrewReplay>>;try{cached=await cachedCrewReplay(id);}catch{/* Download works without local cache. */}
 let blob=cached?.blob;
 if(!blob){const response=await fetch(db.storage.from(bucket).getPublicUrl(`${id}.gz`).data.publicUrl,{signal:AbortSignal.timeout(30000)});if(!response.ok||!response.body)throw Error('Could not download the team replay. Try again.');const bytes=await readBounded(response.body,8*1024*1024);blob=new Blob([bytes as BlobPart],{type:'application/gzip'});}
 if(blob.size!==meta.bytes||await blobDigest(blob)!==meta.digest)throw Error('Team replay failed its integrity check.');
 const run=await decodeCrewReplay(blob);if(run.id!==meta.client_run_id||run.combatRevision!==meta.rules||run.ticks!==meta.ticks||Math.round(run.time*1000)!==meta.survival_ms||run.stats.kills!==meta.kills||run.stats.collected!==meta.gems||!sameRoster(run.roster,meta.roster))throw Error('Team replay does not match its public record.');
 try{await cacheCrewReplay(id,blob);}catch{/* Cache is optional. */}return run;
}
/** Serial durable jobs prevent duplicate uploads and protect each run independently. */
export class CrewPublicationQueue{
 busy=false;error='';onChange=()=>{};private manualRetry=false;
 async flush(force=false,runId?:string){if(this.busy)return;this.busy=true;this.manualRetry=force;this.error='';this.onChange();try{
 for(const snapshot of await listCrewRuns()){
  if(runId&&snapshot.id!==runId)continue;
  const row=await getCrewRun(snapshot.id),job=row?.job;if(!row||!job||job.ready||!force&&(!job.automatic||job.retryAt>Date.now()))continue;
  try{const run=await readCrewRun(row);const result=await publishCrew(run,job.registrationId);job.scoreConfirmed=true;job.best=result.best;await updateCrewJob(row.id,row.job!);this.onChange();
   if(job.best){job.replayId=await uploadCrewReplay(row);}
   if(!job.best&&job.replayId){const old=(await ownCrewReplays()).find(r=>r.id===job.replayId&&r.obsolete);if(old)await removeHostedCrewReplay(old.id);job.replayId=undefined;}
   job.ready=true;job.error='';job.retryAt=0;await updateCrewJob(row.id,row.job!);
  }catch(error){job.error=error instanceof Error?error.message:'Publication failed.';job.attempts++;job.retryAt=Date.now()+Math.min(300000,15000*2**Math.min(job.attempts,5));await updateCrewJob(row.id,row.job!);}this.onChange();
 }
 }catch(error){this.error=error instanceof Error?error.message:'Local publication queue unavailable.';}finally{this.busy=false;this.manualRetry=false;this.onChange();}}
 get forcing(){return this.manualRetry;}
}
