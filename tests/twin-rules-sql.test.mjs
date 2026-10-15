import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('expanded rules preserve historical scores and isolate explicit v20 crew registration',{timeout:60000},async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant insert,select,delete on storage.objects to authenticated;`);
 const migrations=new URL('../supabase/migrations/',import.meta.url);for(const file of readdirSync(migrations).sort())await db.exec(readFileSync(new URL(file,migrations),'utf8'));
 const host='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users values($1),($2)',[host,guest]);
 const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role '+(id?'authenticated':'anon'));};const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 await actor(host);await db.query("select public.abyss_submit_score('Host',5000,10,10,6)");await db.query("select public.abyss_submit_score('Host',3000,10,10,7)");await assert.rejects(()=>db.query("select public.abyss_submit_score('Host',3000,10,10,8)"),/Invalid/);
 assert.equal((await db.query('select * from public.abyss_leaderboard(6)')).rows[0].survival_ms,5000);assert.equal((await db.query('select * from public.abyss_leaderboard(7)')).rows[0].survival_ms,3000);
 const roster=JSON.stringify([{id:'host',name:'Host',host:true},{id:'peer',name:'Guest',host:false}]);
 const old=await scalar("select public.abyss_crew_register('old',1,$1::jsonb) value",[roster]);const fresh=await scalar("select public.abyss_crew_register_v20('new',1,$1::jsonb) value",[roster]);
 await assert.rejects(()=>scalar("select public.abyss_crew_register_v20('old',1,$1::jsonb) value",[roster]),/different gameplay/);
 for(const r of [old,fresh]){await actor(guest);await scalar("select public.abyss_crew_confirm($1,$2,'peer','Guest') value",[r.id,r.key]);await actor(host);assert.equal(await scalar('select public.abyss_crew_lock($1) value',[r.id]),true);}
 await assert.rejects(()=>scalar("select public.abyss_crew_submit_v20($1,'bad',$2::jsonb,120,1000,2,3) value",[old.id,roster]),/different gameplay/);
 await scalar("select public.abyss_crew_submit($1,'old-run',$2::jsonb,240,2000,2,3) value",[old.id,roster]);await scalar("select public.abyss_crew_submit_v20($1,'new-run',$2::jsonb,120,1000,2,3) value",[fresh.id,roster]);
 await actor(null);assert.equal((await db.query("select * from public.abyss_crew_board(2,'',0)")).rows[0].survival_ms,2000);assert.equal((await db.query("select * from public.abyss_crew_board_v20(2,'',0)")).rows[0].survival_ms,1000);
 await assert.rejects(()=>scalar("select public.abyss_crew_register_v20('anon',1,$1::jsonb) value",[roster]),/permission denied/);
 await actor(host);const id=await scalar("select public.abyss_reserve_replay(1,'test-v7','Host',7,3000,10,10,true,128) value");assert.ok(id);
 const checks=(await db.query("select has_function_privilege('anon','public.abyss_crew_register_v20(text,integer,jsonb)','execute') forbidden, has_function_privilege('anon','public.abyss_crew_board_v20(integer,text,integer)','execute') allowed")).rows[0];assert.equal(checks.forbidden,false);assert.equal(checks.allowed,true);
 }finally{await db.close();}
});
