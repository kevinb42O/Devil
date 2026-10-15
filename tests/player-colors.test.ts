import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_COLORS,isPlayerColor,playerColor} from '../src/player-colors';
import {FriendsSession} from '../src/multiplayer';
import {encodeState,decodeState} from '../src/network-state';
import {CrewRunRecorder,validateCrewReplay} from '../src/crew-replay';
import {idleInput} from '../src/simulation';

test('palette accepts only stable IDs and safely falls back for legacy data',()=>{
 assert.equal(new Set(PLAYER_COLORS.map(p=>p.id)).size,PLAYER_COLORS.length);
 for(const color of PLAYER_COLORS){assert.ok(isPlayerColor(color.id));assert.match(color.hex,/^#[0-9a-f]{6}$/);}
 for(const bad of [undefined,null,'#fff','<script>',{},3]){assert.equal(isPlayerColor(bad),false);assert.equal(playerColor(bad).id,'crimson');}
});
test('host color survives snapshots, courtyard, return and restart; changes lock during play',()=>{
 const host=new FriendsSession('host');try{
 assert.equal(host.setColor('jade'),true);assert.equal(host.setColor('invalid'),false);
 const snapshot=decodeState(encodeState(host.snapshot()!,1,0),new Map())!.snapshot;
 assert.equal(snapshot.members[0].color,'jade');host.setReady(true);host.enterPrelobby();
 assert.equal(host.setColor('violet'),true);assert.equal(host.members[0].ready,false);host.setColor('jade');
 host.markLoaded(host.epoch);host.setReady(true);host.openPit();assert.equal(host.setColor('frost'),false);host.returnToLobby();
 assert.equal(host.members[0].color,'jade');assert.equal(host.setColor('violet'),true);
 host.start();assert.equal(host.members[0].color,'violet');
 }finally{host.close();}
});
test('recorded team replay retains optional color without changing simulation',()=>{
 const host=new FriendsSession('host');try{
 host.setColor('frost');host.start();const w=host.world!;
 const recorder=new CrewRunRecorder(1,w,host.members,'color-test',1);
 const before=w.crew.map(p=>({id:p.id,alive:p.alive,life:p.life,cause:p.cause}));
 w.crew[0].alive=false;w.crew[0].cause='DISCONNECTED';w.crew[0].respawnAt=null;w.stepCrew(new Map([['host',idleInput()]]));recorder.record(w,new Map(),new Set(),before);
 w.state='dead';const run=recorder.finish(w)!;assert.equal(run.roster[0].color,'frost');validateCrewReplay(run);
 delete run.roster[0].color;validateCrewReplay(run);
 (run.roster[0] as any).color='invalid';assert.throws(()=>validateCrewReplay(run));
 }finally{host.close();}
});
