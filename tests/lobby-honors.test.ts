import test from 'node:test';
import assert from 'node:assert/strict';
import {lobbyPodiumRank} from '../src/lobby-honors';
const scores=['First','Second','Third','Fourth'].map(player_name=>({player_name,survival_ms:100,kills:0,gems:0,achieved_at:'2026-10-15'}));
test('lobby honors follow server order even when scores tie',()=>{
 assert.equal(lobbyPodiumRank(' FIRST ',scores),1);
 assert.equal(lobbyPodiumRank('second',scores),2);
 assert.equal(lobbyPodiumRank('Third',scores),3);
 assert.equal(lobbyPodiumRank('Fourth',scores),null);
 assert.equal(lobbyPodiumRank('Unknown',scores),null);
 assert.equal(lobbyPodiumRank('',scores),null);
 assert.equal(lobbyPodiumRank('First',[]),null);
 assert.equal(lobbyPodiumRank('First',[scores[1],scores[0]]),2);
});
