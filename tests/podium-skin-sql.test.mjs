import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
test('podium skin proofs require authenticated solo top three, bind room/peer and revoke on rank loss',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/202610130001_leaderboard.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/20261015200600_podium_ascendant_skin.sql',import.meta.url),'utf8'));
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
 for(let i=0;i<ids.length;i++){await db.query('insert into auth.users values($1)',[ids[i]]);await db.query("insert into public.abyss_scores(player_id,rules,player_name,survival_ms,kills,gems,achieved_at) values($1,6,$2,$3,1,1,'2026-10-15')",[ids[i],'Player '+i,4000-i*1000]);}
 const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role '+(id?'authenticated':'anon'));};
 const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const claim=()=>scalar("select public.abyss_claim_podium_skin('ROOM','peer') value");
 await actor(null);await assert.rejects(claim,/permission denied/);
 await actor(ids[3]);assert.equal(await claim(),null,'rank 4 never gets a proof');
 for(let i=0;i<3;i++){await actor(ids[i]);assert.equal((await claim()).rank,i+1);}
 await actor(ids[0]);const grant=await claim();assert.equal((await claim()).token,grant.token,'renewal in same room is idempotent');
 const verify=(room='ROOM',peer='peer')=>scalar('select public.abyss_verify_podium_skin($1,$2,$3) value',[grant.token,room,peer]);
 await actor(null);assert.equal(await verify(),1);assert.equal(await verify('OTHER'),null);assert.equal(await verify('ROOM','impostor'),null);
 assert.equal(await scalar("select public.abyss_verify_podium_skin(gen_random_uuid(),'ROOM','peer') value"),null);
 await assert.rejects(()=>db.query('select * from abyss_private.podium_skin_grants'),/permission denied/);
 await assert.rejects(()=>db.query('select abyss_private.podium_skin_rank($1)',[ids[0]]),/permission denied/);
 await actor(ids[1]);await assert.rejects(()=>db.query("select public.abyss_claim_podium_skin('bad room','peer')"),/Invalid lobby/);
 await db.exec('reset role');await db.query('update public.abyss_scores set survival_ms=500 where player_id=$1',[ids[0]]);
 await actor(null);assert.equal(await verify(),null,'rank loss invalidates existing proof');
 await db.exec('reset role');await db.query('update public.abyss_scores set survival_ms=5000 where player_id=$1',[ids[0]]);await db.exec("update abyss_private.podium_skin_grants set expires_at=now()-interval '1 second'");
 await actor(null);assert.equal(await verify(),null,'expired proofs fail closed');
 }finally{await db.close();}
});
