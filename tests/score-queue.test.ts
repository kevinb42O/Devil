import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ScoreQueue,cleanNickname,type PendingScore,type OwnScore} from '../src/score-queue';
const candidate=(timeMs:number)=>({id:String(timeMs),timeMs,kills:1,gems:2,rules:6});
const confirmation=(time:number):OwnScore=>({player_name:'Player',survival_ms:time,kills:1,gems:2,achieved_at:'2026-10-13',rank:2});
test('a second higher best is published after the first succeeds',async()=>{
 const sent:number[]=[];let persisted:PendingScore|null=null;const q=new ScoreQueue(job=>persisted=job,async job=>{sent.push(job.score.timeMs);return confirmation(job.score.timeMs);});
 q.enqueue(candidate(1000),'Player');await q.flush();assert.equal(q.confirmed?.survival_ms,1000);
 q.enqueue(candidate(2000),'Player');await q.flush();assert.deepEqual(sent,[1000,2000]);assert.equal(q.confirmed?.survival_ms,2000);assert.equal(persisted,null);
 assert.equal(q.enqueue(candidate(1500),'Player'),false);assert.equal(q.pending,null);
});
test('a new higher run during an in-flight publication survives the old completion',async()=>{
 let resolve!:(score:OwnScore)=>void;const sent:number[]=[];let persisted:PendingScore|null=null;
 const q=new ScoreQueue(job=>persisted=job,async job=>{sent.push(job.score.timeMs);if(sent.length===1)return new Promise<OwnScore>(r=>resolve=r);return confirmation(job.score.timeMs);});
 q.enqueue(candidate(1000),'First name');const saving=q.flush();q.enqueue(candidate(2000),'Second name');resolve(confirmation(1000));await saving;
 assert.deepEqual(sent,[1000,2000]);assert.equal(q.confirmed?.survival_ms,2000);assert.equal(persisted,null);
});
test('network failure retains a score through reload and retries without a new run',async()=>{
 let saved:PendingScore|null=null;const first=new ScoreQueue(job=>saved=job,async()=>{throw Error('Offline');});
 first.enqueue(candidate(3000),'Player');await first.flush();assert.equal(first.error,'Offline');assert.equal((saved as PendingScore|null)?.score.timeMs,3000);
 const reloaded=new ScoreQueue(job=>saved=job,async job=>confirmation(job.score.timeMs),saved);await reloaded.flush();assert.equal(saved,null);assert.equal(reloaded.confirmed?.survival_ms,3000);
});
test('only one flush runs at a time and pending lower runs cannot replace a better one',async()=>{
 let resolve!:(score:OwnScore)=>void;let calls=0;const q=new ScoreQueue(()=>{},async()=>{calls++;return new Promise<OwnScore>(r=>resolve=r);});
 q.enqueue(candidate(3000),'Player');q.enqueue(candidate(1000),'Player');const saving=q.flush();await q.flush();assert.equal(calls,1);resolve(confirmation(3000));await saving;
});
test('server-confirmed best prevents duplicate or stale publication',async()=>{
 const q=new ScoreQueue(()=>{},async job=>confirmation(job.score.timeMs));q.remember(confirmation(5000));q.remember(confirmation(2000));assert.equal(q.confirmed?.survival_ms,5000);assert.equal(q.enqueue(candidate(4000),'Player'),false);
});
test('nicknames retain spaces and reject blank or control-character names',()=>{
 assert.equal(cleanNickname('  Player One  '),'Player One');for(const name of ['', '  ', 'a'.repeat(25), 'Player\nOne'])assert.throws(()=>cleanNickname(name));
});

test('expanded-rules pending score survives reload with its rules identity',async()=>{let saved:PendingScore|null=null;const q=new ScoreQueue(job=>saved=job,async()=>{throw Error('offline');});q.enqueue({...candidate(4000),rules:7},'Player');await q.flush();const sent:number[]=[];const restored=new ScoreQueue(job=>saved=job,async job=>{sent.push(job.score.rules);return confirmation(job.score.timeMs);},saved);await restored.flush();assert.deepEqual(sent,[7]);assert.equal(saved,null);});

test('server-issued run ticket survives durable queue reload and retries',async()=>{
 let saved:PendingScore|null=null;const ticket='11111111-1111-4111-8111-111111111111';
 const first=new ScoreQueue(job=>saved=job,async()=>{throw Error('offline');});first.enqueue({...candidate(4000),rules:7,ticket},'Player');await first.flush();
 let received='';const restored=new ScoreQueue(job=>saved=job,async job=>{received=job.score.ticket??'';return confirmation(job.score.timeMs);},saved);await restored.flush();
 assert.equal(received,ticket);assert.equal(saved,null);
});
