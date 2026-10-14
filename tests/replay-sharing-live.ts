import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {RunRecorder,createRun} from '../src/replay.ts';import {idleInput} from '../src/simulation.ts';import {encodeReplay,decodeReplay} from '../src/replay-file.ts';
const env=Object.fromEntries(readFileSync('.env.production','utf8').split('\n').filter(l=>l.startsWith('VITE_')).map(l=>{const at=l.indexOf('=');return [l.slice(0,at),l.slice(at+1).replace(/^['"]|['"]$/g,'')];}));
const client=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const owner=client(),other=client();let id:string|undefined;
const ok=<T extends {error:unknown}>(result:T)=>{assert.equal(result.error,null,JSON.stringify(result.error));return result;};
try{
 ok(await owner.auth.signInAnonymously());ok(await other.auth.signInAnonymously());
 const setup={time:229,level:4,reserve:150},world=createRun(11,setup),recorder=new RunRecorder(11,setup);for(let i=0;i<120;i++){recorder.record(idleInput());world.step(idleInput());world.effects=[];}const run=recorder.finish(world),blob=await encodeReplay(run);
 const args={p_slot:1,p_run_id:run.id,p_name:'Replay integration test',p_rules:run.version,p_time_ms:Math.round(run.time*1000),p_kills:run.stats.kills,p_gems:run.stats.collected,p_practice:true,p_bytes:blob.size};
 assert.ok((await other.rpc('abyss_reserve_replay',{...args,p_slot:0,p_practice:false})).error,'cannot attach without owning an exact score');
 id=ok(await owner.rpc('abyss_reserve_replay',args)).data;
 assert.ok((await owner.rpc('abyss_reserve_replay',{...args,p_slot:2,p_run_id:'second'})).error,'upload rate limit');
 const path=`${id}.gz`;assert.ok((await other.storage.from('abyss-replays').upload(path,blob,{contentType:'application/gzip'})).error,'foreign upload blocked');
 ok(await owner.storage.from('abyss-replays').upload(path,blob,{contentType:'application/gzip',cacheControl:'31536000'}));
 assert.ok((await other.rpc('abyss_finish_replay',{p_id:id})).error,'foreign finalization blocked');
 ok(await owner.rpc('abyss_finish_replay',{p_id:id}));
 const publicClient=client(),metadata=ok(await publicClient.rpc('abyss_replay',{p_id:id})).data;assert.equal(metadata[0].bytes,blob.size);
 const url=owner.storage.from('abyss-replays').getPublicUrl(path).data.publicUrl;const response=await fetch(url);assert.equal(response.status,200);assert.deepEqual(await decodeReplay(await response.blob()),run);
 assert.ok((await publicClient.rpc('abyss_own_replays')).error,'anonymous ownership listing blocked');assert.ok((await publicClient.from('abyss_replays').select('*')).error,'raw account metadata is private');
 assert.equal(ok(await other.rpc('abyss_own_replays')).data.length,0,'owners isolated');
 ok(await publicClient.rpc('abyss_leaderboard_replays',{p_rules:6}));
 console.log('Live replay storage passed: reservation, compression, upload, public download, exact reconstruction, cross-owner denial, file-size cap, rate limit and private metadata.');
}finally{if(id){ok(await owner.storage.from('abyss-replays').remove([`${id}.gz`]));ok(await owner.rpc('abyss_forget_replay',{p_id:id}));console.log('Integration replay and reservation removed; existing highscores unchanged.');}}
