import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('instant scoring checks server elapsed time, ticket ownership, retries and obvious abuse',{timeout:60000},async()=>{
 const db=new PGlite(),player='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant insert,select,delete on storage.objects to authenticated;`);
  const cheater='2a3b73ad-a1fd-418b-a6f5-20b311bc2562';
  await db.query('insert into auth.users values($1)',[cheater]);
  for(const file of readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
   if(file==='20261017223000_verified_solo_scores.sql')await db.query("insert into public.abyss_scores(player_id,rules,player_name,survival_ms,kills,gems) values($1,7,'fuck your vibecoded game',5020208,0,0)",[cheater]);
   if(file.endsWith('_fresh_leaderboards.sql')){
    assert.equal((await db.query('select quarantined from public.abyss_scores where player_id=$1',[cheater])).rows[0].quarantined,true);
    await db.query('insert into abyss_private.solo_tickets(player_id) values($1)',[cheater]);
   }
   await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  for(const table of ['public.abyss_scores','public.abyss_replays','public.abyss_crew_bests','public.abyss_crew_replays','public.abyss_crew_members','public.abyss_crew_runs','abyss_private.solo_tickets','abyss_private.solo_submissions','abyss_private.replay_limits','abyss_private.crew_limits','abyss_private.podium_skin_grants'])assert.equal((await db.query('select count(*)::int as total from '+table)).rows[0].total,0,table+' is empty after reset');
  assert.equal((await db.query('select count(*)::int as total from auth.users')).rows[0].total,1,'identity retained');
  assert.equal((await db.query('select count(*)::int as total from storage.buckets')).rows[0].total,2,'replay buckets retained');
  assert.equal((await db.query('select abyss_private.podium_skin_rank($1) value',[cheater])).rows[0].value,null);
  await db.query('insert into auth.users values($1),($2)',[player,other]);
  const scalar=async(q,args=[])=>(await db.query(q,args)).rows[0].value;
  const actor=async(role,id='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
  const begin=()=>scalar('select public.abyss_begin_solo() value');
  const submit=(ticket,time=1000,kills=0,gems=0)=>db.query("select public.abyss_submit_solo($1,'Player',$2,$3,$4)",[ticket,time,kills,gems]);
  await actor('anon');await assert.rejects(begin,/permission denied/);
  for(const rpc of ['abyss_leaderboard','abyss_leaderboard_replays'])assert.equal((await db.query(`select * from public.${rpc}(7)`)).rows.length,0,'quarantined incident is hidden from public scores');
  await actor('authenticated',cheater);assert.equal((await db.query('select * from public.abyss_my_score(7)')).rows.length,0);
  await actor('authenticated',player);
  await assert.rejects(()=>db.query("select public.abyss_submit_score('Fake',5020208,0,0,7)"),/registered run/);
  await assert.rejects(()=>db.query("select public.abyss_queue_solo('old','Fake',1000,'YWJj')"),/permission denied/);
  await assert.rejects(()=>db.query("select public.abyss_decide_solo(gen_random_uuid(),true,1000,0,0,'')"),/permission denied/);
  await assert.rejects(()=>submit(null),/Invalid/);
  const ticket=await begin();
  await assert.rejects(()=>db.query('select * from abyss_private.solo_tickets'),/permission denied/);
  await assert.rejects(()=>submit(ticket,5020208,100,10),/duration/);
  await assert.rejects(()=>submit(ticket,1000,1000000,0),/sanity/);
  await assert.rejects(()=>submit(ticket,1000,0,1000000),/sanity/);
  await actor('authenticated',other);await assert.rejects(()=>submit(ticket),/registered run/);
  await actor('authenticated',player);await submit(ticket);await submit(ticket);
  await assert.rejects(()=>submit(ticket,2000),/already been used/);
  await actor('anon');assert.equal((await db.query('select * from public.abyss_leaderboard(7)')).rows[0].survival_ms,1000,'accepted score is visible immediately, with no verifier or polling');
  await actor('authenticated',player);const long=await begin();await db.exec('reset role');await db.query("update abyss_private.solo_tickets set started_at=clock_timestamp()-interval '2 hours' where id=$1",[long]);
  await actor('authenticated',player);await assert.rejects(()=>submit(long,5020208,0,0),/sanity/,'reported abuse is rejected even after waiting out its duration');
  await submit(long,600000,100,50);const lower=await begin();await submit(lower);
  assert.equal((await db.query('select * from public.abyss_my_score(7)')).rows[0].survival_ms,600000,'a shorter run cannot lower the public best');
  const expired=await begin();await db.exec('reset role');await db.query("update abyss_private.solo_tickets set started_at=clock_timestamp()-interval '25 hours' where id=$1",[expired]);
  await actor('authenticated',player);await assert.rejects(()=>submit(expired),/duration/);
 }finally{await db.close();}
});
