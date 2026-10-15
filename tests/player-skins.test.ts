import {test} from 'node:test';import assert from 'node:assert/strict';
import {podiumSkinEligibility} from '../src/player-skins';
import {FriendsSession} from '../src/multiplayer';
import {encodeState,decodeState} from '../src/network-state';
import {CrewRunRecorder,validateCrewReplay} from '../src/crew-replay';
const token='11111111-1111-4111-8111-111111111111';
test('only an authenticated top-three personal best matching the solo board unlocks the option',()=>{
 const row={player_name:'Champion',survival_ms:100,achieved_at:'today'};
 assert.equal(podiumSkinEligibility(null,[row]),null);
 assert.equal(podiumSkinEligibility({...row,rank:1},[row]),1);
 assert.equal(podiumSkinEligibility({...row,rank:4},[row,row,row,row]),null);
 assert.equal(podiumSkinEligibility({...row,rank:1,survival_ms:99},[row]),null);
 assert.equal(podiumSkinEligibility({...row,rank:1},[]),null);
});
test('verified skin travels in snapshots and replay metadata, allows gathering customization, color removes it',async()=>{
 const host=new FriendsSession('host',[],async()=>2);try{
 host.room='ROOM';assert.equal(await host.setSkin(token),true);assert.equal(host.members[0].skinRank,2);
 const s=decodeState(encodeState(host.snapshot()!,1,0),new Map())!.snapshot;assert.equal(s.members[0].skin,'ascendant');assert.equal('token' in s.members[0],false);
 host.enterPrelobby();assert.equal(await host.setSkin(token),true);host.markLoaded(host.epoch);host.setReady(true);assert.equal(host.openPit(),true);assert.equal(await host.setSkin(token),false);host.courtyard!.phase='collecting';host.courtyard!.committed=['host'];host.start(true);
 const w=host.world!,recorder=new CrewRunRecorder(1,w,host.members,'skin-test',1);w.crew[0].alive=false;w.crew[0].cause='DISCONNECTED';w.crew[0].respawnAt=null;
 const before=w.crew.map(p=>({id:p.id,alive:p.alive,life:p.life,cause:p.cause}));w.stepCrew(new Map());recorder.record(w,new Map(),new Set(),before);
 const run=recorder.finish(w)!;validateCrewReplay(run);assert.equal(run.roster[0].skin,'ascendant');assert.equal(run.roster[0].skinRank,2);assert.equal(JSON.stringify(run.roster).includes(token),false);
 (run.roster[0] as any).skinRank=4;assert.throws(()=>validateCrewReplay(run));
 host.returnToLobby();host.setColor('jade');assert.equal(host.members[0].skin,undefined);assert.equal(host.members[0].color,'jade');
 }finally{host.close();}
});
test('verification blocks launch, failed proofs clear cosmetics, stale requests cannot undo a color choice',async()=>{
 let resolve!:(rank:1|null)=>void;const host=new FriendsSession('host',[],()=>new Promise(r=>resolve=r));try{
 host.setReady(true);const pending=host.setSkin(token);assert.equal(host.allReady,false);assert.equal(host.checkingSkin,true);
 host.setColor('frost');resolve(1);assert.equal(await pending,false);assert.equal(host.members[0].skin,undefined);assert.equal(host.allReady,false);host.setReady(true);assert.equal(host.allReady,true);
 const denied=host.setSkin(token);resolve(null);assert.equal(await denied,false);assert.equal(host.members[0].skin,undefined);
 }finally{host.close();}
});
