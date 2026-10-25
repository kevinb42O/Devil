import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOUND_NAMES} from '../src/audio';
import {REMAKE_AUDIO,remakeAudioUrl,remakeAudioAsset} from '../src/remake-audio';
import footsteps from '../src/remake-audio-manifest.json';
import originals from '../src/original-audio-manifest.json';
import {ALL_FOOTSTEP_SOUNDS} from '../src/footstep-audio';
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
test('all 275 extracted originals are verified and available in the shipped bank',()=>{
 const source=JSON.parse(readFileSync(new URL('../assets/original/devil-daggers/audio/manifest.json',import.meta.url),'utf8'));
 const shipped=JSON.parse(readFileSync(new URL('../public/assets/audio/original/manifest.json',import.meta.url),'utf8'));
 assert.equal(source.files.length,275);assert.equal(shipped.sourceHash,source.sourceHash);
 for(const entry of source.files){
  const raw=readFileSync(new URL('../assets/original/devil-daggers/audio/'+entry.name+'.wav',import.meta.url));
  assert.equal(hash(raw),entry.sha256,entry.name);
  const asset=shipped.files[entry.name];assert.equal(asset.sourceSha256,entry.sha256);
  const data=readFileSync(new URL('../public/assets/audio/original/'+asset.file,import.meta.url));
  assert.equal(hash(data),asset.sha256,entry.name);assert.equal(hash(data),entry.sha256,entry.name+' byte-identical original WAV');assert.equal(data.length,asset.bytes);
 }
});
test('all gameplay and menu cues use originals except the unchanged footstep banks',()=>{
 for(const name of [...SOUND_NAMES,'crew-countdown','football-goal','menutheme','menuatmos','uihover','uiclick','uislider']){
  const asset=remakeAudioAsset(name);assert.ok(asset.duration>0&&asset.gain>0,name);
  assert.equal(remakeAudioUrl(name),'/assets/audio/'+(asset.role==='footstep'?'remake/':'original/')+asset.file);
  if(asset.role!=='footstep'){assert.ok(name in originals,name);assert.equal(asset.gain,1,name+' recorded level');}
 }
 for(const name of ALL_FOOTSTEP_SOUNDS)assert.deepEqual(REMAKE_AUDIO[name],(footsteps as Record<string,unknown>)[name]);
 for(let tier=5;tier<=7;tier++){
  const first=tier-4,second=first+1;
  const catalog=originals as Record<string,any>;
  assert.deepEqual(catalog['rapid'+tier].layers,['rapid'+first,'rapid'+second]);
  assert.deepEqual(catalog['levelup'+tier].layers,[first===1?'leveldown':'levelup'+first,'levelup'+second]);
  assert.equal(catalog['rapid'+tier].file,catalog['seekrapid'+tier].file);
 }
});

test('layered hand recordings have intact files and headroom',()=>{
 const shipped=JSON.parse(readFileSync(new URL('../public/assets/audio/original/manifest.json',import.meta.url),'utf8'));
 assert.equal(Object.keys(shipped.composites).length,24);
 for(const [name,asset] of Object.entries(shipped.composites) as [string,any][]){
  const data=readFileSync(new URL('../public/assets/audio/original/'+asset.file,import.meta.url));
  assert.equal(hash(data),asset.sha256,name);assert.ok(asset.rms>0&&asset.peak<=1,name);
  assert.equal(asset.layers.length,2);assert.equal(asset.bytes,data.length);
 }
});
