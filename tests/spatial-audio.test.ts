import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHATTER_TRIM,distanceEnvelope,hearingProfile} from '../src/spatial-audio';
import {ENEMY_CHATTER,selectEnemyAudio} from '../src/enemy-audio';
import {World,v} from '../src/simulation';

test('finite hearing envelope is continuous, monotonic and exactly silent at and beyond range',()=>{
 for(const name of Object.keys(CHATTER_TRIM)){
  const {maxDistance}=hearingProfile(name);let previous=1;
  for(let distance=0;distance<=maxDistance*2;distance+=.1){const gain=distanceEnvelope(distance,maxDistance);assert(gain<=previous+1e-12);assert(gain>=0);previous=gain;}
  assert.equal(distanceEnvelope(0,maxDistance),1);
  assert.equal(distanceEnvelope(maxDistance,maxDistance),0);
  assert.equal(distanceEnvelope(maxDistance+100,maxDistance),0);
  assert(distanceEnvelope(maxDistance-.001,maxDistance)<1e-7);
 }
});
test('chatter sustained levels stay in a narrow authored band without erasing threat tiers',()=>{
 const manifest=JSON.parse(readFileSync('public/assets/audio/remake/manifest.json','utf8'));
 for(const name of Object.values(ENEMY_CHATTER)){
  const asset=manifest[name],level=asset.rms*asset.gain*CHATTER_TRIM[name];
  assert(level>=.021&&level<=.057,name+' balanced RMS '+level);
 }
});
test('each enemy leaves the selection at its own full 3D hearing boundary',()=>{
 for(const [kind,name] of Object.entries(ENEMY_CHATTER)){
  const w=new World(1,{schedule:false});const range=hearingProfile(name).maxDistance;
  const enemy=w.spawn(kind as keyof typeof ENEMY_CHATTER,v(0,range,0));enemy.segments=[];enemy.pos=v(0,range,0);
  assert.equal(selectEnemyAudio(w.enemies,v(),()=>true).length,0,kind+' vertical cutoff');
  enemy.pos.y=range-.1;assert.equal(selectEnemyAudio(w.enemies,v(),()=>true).length,1,kind+' near boundary');
 }
});
