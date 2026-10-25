import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ORIGINAL_EFFECTS_HEADROOM,roleMixGain,environmentMixGain} from '../src/audio-mix';
import {arenaReverbSend} from '../src/arena-reverb';
import original from '../src/original-audio-manifest.json';
import footsteps from '../src/footstep-audio-manifest.json';
import archived from '../src/remake-audio-manifest.json';
import {DAGGER_REWARDS} from '../src/original-audio-cues';

test('every original and composite keeps its recorded level without role compensation',()=>{
 assert.ok(ORIGINAL_EFFECTS_HEADROOM>0&&ORIGINAL_EFFECTS_HEADROOM<=1);
 for(const [name,asset] of Object.entries(original)){
  assert.equal(asset.gain,1,name);assert.equal(roleMixGain(asset.role),1,name);
  assert.deepEqual(arenaReverbSend(asset.role),{body:0,tail:0},name+' has no synthetic room');
 }
});
test('footstep metadata, gain and room send retain the explicitly preserved mix',()=>{
 for(const [name,asset] of Object.entries(footsteps))assert.deepEqual(asset,(archived as Record<string,unknown>)[name]);
 assert.equal(Object.keys(footsteps).length,24);assert.equal(roleMixGain('footstep'),5);
 assert.deepEqual(arenaReverbSend('footstep'),{body:.035,tail:0});
 assert.equal(environmentMixGain(false),.7);assert.equal(environmentMixGain(true),.4);
});
test('original preparation and layering have no replacement-bank or RMS gain dependency',()=>{
 for(const file of ['prepare-original-audio.py','build-original-hand-audio.py']){
  const source=readFileSync(new URL('../tools/'+file,import.meta.url),'utf8');
  assert.ok(!source.includes('audio/remake/manifest.json'),file);
  assert.ok(!source.includes("old['gain']")&&!source.includes("old['rms']"),file);
 }
});
test('extra-hand layers retain the requested source pairs at fixed equal weights',()=>{
 const catalog=original as Record<string,any>;
 for(const [tier,first,second] of [[5,1,2],[6,2,3],[7,3,4]]){
  assert.deepEqual(catalog['rapid'+tier].layers,['rapid'+first,'rapid'+second]);
  assert.deepEqual(catalog['rapid'+tier].layerWeights,[.5,.5]);
  assert.deepEqual(catalog['levelup'+tier].layers,[first===1?'leveldown':'levelup'+first,'levelup'+second]);
  assert.deepEqual(catalog['levelup'+tier].layerWeights,[.5,.5]);
 }
});
test('all native dagger unlock cues have an explicit milestone event',()=>{
 assert.deepEqual(DAGGER_REWARDS.map(x=>x.time),[60,120,250,500,1000]);
 assert.deepEqual(DAGGER_REWARDS.map(x=>x.name),['daggercollect1bronze','daggercollect2silver','daggercollect3gold','daggercollect4devil','daggercollect5']);
});

test('authored short composites actually contain the fixed 50/50 native samples',()=>{
 const pcm=(path:string)=>{
  const wav=readFileSync(new URL('../'+path,import.meta.url));
  for(let offset=12;offset+8<wav.length;){const size=wav.readUInt32LE(offset+4);if(wav.toString('ascii',offset,offset+4)==='data')return wav.subarray(offset+8,offset+8+size);offset+=8+size+(size%2);}
  throw Error('No PCM data in '+path);
 };
 for(const [name,pair] of [['shot5',['shot1','shot2']],['levelup5',['leveldown','levelup2']]] as const){
  const first=pcm('assets/original/devil-daggers/audio/'+pair[0]+'.wav');
  const second=pcm('assets/original/devil-daggers/audio/'+pair[1]+'.wav');
  const output=pcm('public/assets/audio/original/'+(original as Record<string,any>)[name].file);
  for(let i=0;i<output.length;i+=1994){
   const a=i<first.length?first.readInt16LE(i):0,b=i<second.length?second.readInt16LE(i):0;
   const expected=(a+b)*.5*32767/32768;
   assert.ok(Math.abs(output.readInt16LE(i)-expected)<=1,name+' sample '+i);
  }
 }
});
