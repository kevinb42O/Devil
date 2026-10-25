import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distanceEnvelope,hearingProfile} from '../src/spatial-audio';
import {ENEMY_CHATTER,selectEnemyAudio} from '../src/enemy-audio';
import {World,v} from '../src/simulation';
import {remakeAudioAsset} from '../src/remake-audio';

test('only the preserved footsteps retain the authored finite-distance envelope',()=>{
 const profile=hearingProfile('footstep-stone1','footstep');assert.deepEqual(profile,{refDistance:2,maxDistance:20});
 let previous=1;for(let d=0;d<=40;d+=.1){const value=distanceEnvelope(d,20);assert(value<=previous+1e-12&&value>=0);previous=value;}
 assert.equal(distanceEnvelope(20,20),0);assert.equal(distanceEnvelope(0,20),1);
});
test('every native enemy uses the ordinary inverse-distance profile and recorded level',()=>{
 for(const name of Object.values(ENEMY_CHATTER)){
  assert.deepEqual(hearingProfile(name),{refDistance:1,maxDistance:10000});
  assert.equal(remakeAudioAsset(name).gain,1,name);
 }
});
test('voice-budget selection uses full 3D distance without per-species cutoff tuning',()=>{
 for(const [kind,name] of Object.entries(ENEMY_CHATTER)){
  const w=new World(1,{schedule:false}),range=hearingProfile(name).maxDistance;
  const e=w.spawn(kind as keyof typeof ENEMY_CHATTER,v(0,range,0));e.segments=[];e.pos=v(0,range,0);
  assert.equal(selectEnemyAudio(w.enemies,v(),()=>true).length,0);
  e.pos.y=range-.1;const selected=selectEnemyAudio(w.enemies,v(),()=>true);
  assert.equal(selected.length,1);assert.equal(selected[0].scale,1);
 }
});
