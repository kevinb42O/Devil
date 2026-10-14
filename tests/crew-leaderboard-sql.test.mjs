import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const host='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
test('crew ranking SQL: independently confirmed identities, stable party best, exact replay, RLS and quota',{timeout:60000},async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant insert,select,delete on storage.objects to authenticated;`);
 for(const name of ['202610130001_leaderboard.sql','20261013171911_unique_nickname_leaderboard.sql','20261014173501_replay_sharing.sql','20261014212124_multiplayer_leaderboard.sql','20261014213750_crew_publication_recovery.sql','202610150001_six_player_crews.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query('insert into auth.users values ($1),($2),($3)',[host,guest,other]);
 const actor=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role '+(id?'authenticated':'anon'));};
 const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const roster=[{id:'host',name:'Kevin',host:true},{id:'peer',name:'Mira',host:false}],r=JSON.stringify(roster);
 await actor(null);await assert.rejects(()=>scalar('select public.abyss_crew_register($1,1,$2::jsonb) value',['session',r]),/permission denied/);
 await actor(host);const reg=await scalar('select public.abyss_crew_register($1,1,$2::jsonb) value',['session',r]);assert.equal(await scalar('select public.abyss_crew_lock($1) value',[reg.id]),false);
 await assert.rejects(()=>scalar('select public.abyss_crew_confirm($1,$2,$3,$4) value',[reg.id,reg.key,'peer','Mira']),/unique/,'host cannot occupy a second member identity');
 await actor(guest);await assert.rejects(()=>scalar('select public.abyss_crew_confirm($1,$2,$3,$4) value',[reg.id,reg.key,'peer','Wrong']),/match/);
 assert.equal(await scalar('select public.abyss_crew_confirm($1,$2,$3,$4) value',[reg.id,reg.key,'peer','Mira']),true);assert.equal(await scalar('select public.abyss_crew_confirm($1,$2,$3,$4) value',[reg.id,reg.key,'peer','Mira']),true);
 await assert.rejects(()=>scalar('select public.abyss_crew_lock($1) value',[reg.id]),/Only the host/);
 await actor(host);assert.equal(await scalar('select public.abyss_crew_lock($1) value',[reg.id]),true);
 await actor(guest);assert.equal(await scalar('select public.abyss_crew_revoke($1) value',[reg.id]),true);await actor(host);assert.equal(await scalar('select public.abyss_crew_lock($1) value',[reg.id]),false);await actor(guest);await scalar('select public.abyss_crew_confirm($1,$2,$3,$4) value',[reg.id,reg.key,'peer','Mira']);await actor(host);assert.equal(await scalar('select public.abyss_crew_lock($1) value',[reg.id]),true);
 const submit=()=>scalar('select public.abyss_crew_submit($1,$2,$3::jsonb,120,1000,3,4) value',[reg.id,'run-one',r]);assert.equal((await submit()).best,true);assert.equal((await submit()).best,true);
 await assert.rejects(()=>scalar('select public.abyss_crew_submit($1,$2,$3::jsonb,240,2000,3,4) value',[reg.id,'run-one',r]),/immutable/);
 const digest='a'.repeat(64),reserve=()=>scalar('select public.abyss_crew_reserve($1,$2,$3::jsonb,120,1000,3,4,128,$4,false) value',[reg.id,'run-one',r,digest]);const replay=await reserve();assert.equal(await reserve(),replay,'reservation retry is idempotent');
 await actor(other);await assert.rejects(()=>scalar('select public.abyss_crew_finish_replay($1) value',[replay]),/could not be confirmed/);await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('abyss-crew-replays',$1,$2,'{\"size\":128}')",[replay+'.gz',other]),/row-level security/);
 await actor(host);await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('abyss-crew-replays',$1,$2,'{\"size\":128}')",[replay+'.gz',host]);assert.equal(await scalar('select public.abyss_crew_finish_replay($1) value',[replay]),true);
 await actor(null);const board=(await db.query("select * from public.abyss_crew_board(2,'mira',0)")).rows;assert.equal(board.length,1);assert.equal(board[0].replay_id,replay);assert.deepEqual(board[0].roster,roster);assert.equal((await db.query("select * from public.abyss_crew_board(3,'',0)")).rows.length,0);await assert.rejects(()=>db.query('select * from public.abyss_crew_members'),/permission denied/);
 // Same authenticated identities, different host/order/names: one party best.
 await actor(guest);const switched=[{id:'host',name:'Mira renamed',host:true},{id:'new-peer',name:'Kevin renamed',host:false}],sr=JSON.stringify(switched),reg2=await scalar('select public.abyss_crew_register($1,2,$2::jsonb) value',['new-session',sr]);
 await actor(host);await scalar('select public.abyss_crew_confirm($1,$2,$3,$4) value',[reg2.id,reg2.key,'new-peer','Kevin renamed']);await actor(guest);await scalar('select public.abyss_crew_lock($1) value',[reg2.id]);const manualId=await scalar('select public.abyss_crew_reserve($1,$2,$3::jsonb,240,2000,5,6,128,$4,true) value',[reg2.id,'run-two',sr,digest]);await scalar('select public.abyss_crew_submit($1,$2,$3::jsonb,240,2000,5,6) value',[reg2.id,'run-two',sr]);await db.exec('reset role');await db.query('delete from public.abyss_crew_replays where id=$1',[manualId]);await actor(guest);
 await actor(null);const after=(await db.query("select * from public.abyss_crew_board(2,'',0)")).rows;assert.equal(after.length,1);assert.equal(after[0].run_id,reg2.id);assert.equal(after[0].replay_id,null,'new best must not show previous recording');
 await actor(host);assert.equal((await db.query('select * from public.abyss_crew_my_bests(2)')).rows[0].run_id,reg2.id);assert.equal((await db.query('select * from public.abyss_crew_own_replays()')).rows[0].obsolete,true);
 await assert.rejects(()=>scalar('select public.abyss_crew_forget_replay($1) value',[replay]),/file first/);await db.query("delete from storage.objects where bucket_id='abyss-crew-replays' and name=$1",[replay+'.gz']);await scalar('select public.abyss_crew_forget_replay($1) value',[replay]);
 // Six independently confirmed players can publish in their own party-size category.
 const six=Array.from({length:6},(_,i)=>({id:i===0?'host':'six-'+i,name:'Six Player '+i,host:i===0}));
 await db.exec('reset role');const extra=(await db.query('insert into auth.users select gen_random_uuid() from generate_series(1,5) returning id')).rows.map(row=>row.id);
 await actor(host);const sixReg=await scalar('select public.abyss_crew_register($1,1,$2::jsonb) value',['six-session',JSON.stringify(six)]);
 for(let i=1;i<6;i++){await actor(extra[i-1]);await scalar('select public.abyss_crew_confirm($1,$2,$3,$4) value',[sixReg.id,sixReg.key,six[i].id,six[i].name]);}
 await actor(host);assert.equal(await scalar('select public.abyss_crew_lock($1) value',[sixReg.id]),true);
 assert.equal((await scalar('select public.abyss_crew_submit($1,$2,$3::jsonb,120,1000,3,4) value',[sixReg.id,'six-run',JSON.stringify(six)])).best,true);
 await assert.rejects(()=>scalar('select public.abyss_crew_register($1,1,$2::jsonb) value',['seven-session',JSON.stringify([...six,{id:'seventh',name:'Seventh',host:false}])]),/Invalid party/);
 await actor(null);const sixBoard=(await db.query("select * from public.abyss_crew_board(6,'',0)")).rows;assert.equal(sixBoard.length,1);assert.deepEqual(sixBoard[0].roster,six);
 // Combined budget includes crew reservations when solo reserves.
 await db.exec('reset role');await db.query("insert into public.abyss_crew_replays(run_id,owner_id,bytes,digest,ready) values($1,$2,8388608,$3,true)",[reg2.id,guest,digest]);await db.exec("with identities as (insert into auth.users select gen_random_uuid() from generate_series(1,252) returning id) insert into public.abyss_replays(player_id,slot,run_id,player_name,rules,survival_ms,kills,gems,practice,bytes,ready) select id,1,'budget','Budget',6,1000,0,0,true,2097152,true from identities");
 await actor(other);await assert.rejects(()=>scalar("select public.abyss_reserve_replay(1,'limit','Limit',6,1000,0,0,true,128) value"),/storage is full/);
 await db.exec('reset role');
 // Inspect combined accounting in the actual function definition; exercised limit below with controlled aggregate.
 const def=(await db.query("select pg_get_functiondef('abyss_private.abyss_reserve_replay(integer,text,text,integer,integer,integer,integer,boolean,integer)'::regprocedure) d")).rows[0].d;assert.match(def,/abyss_crew_replays/);
 await actor(other);await assert.rejects(()=>scalar('select public.abyss_crew_reserve(null,$1,$2::jsonb,120,1000,0,0,128,$3,true) value',['forged',r,digest]),/confirmed party/);
 }finally{await db.close();}
});
