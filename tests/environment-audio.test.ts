import test from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {environmentMix} from '../src/environment-audio';
import {descentAt} from '../src/descent';
import manifest from '../src/environment-audio-manifest.json';

test('all eight environments have long local recordings',()=>{
 for(const [name,time] of [['space',0],['ash',35],['storm',80],['veil',150],['furnace',270],['cathedral',390],['depth',480],['heaven',504]] as const){
  assert.deepEqual(environmentMix(time).map(b=>b.name),[name]);
  assert.ok(manifest[name].duration>=120);
  assert.equal(manifest[name].gain,name==='storm'?.095:.18,'rain is quieter than the wind bed');
  assert.ok(manifest[name].rms>.06&&manifest[name].rms<.085,'sustained levels match across chapters');
  assert.ok(manifest[name].peak<=.4,'bounded ambience transients');
  assert.ok(manifest[name].minWindowRms>.025,'no near-silent three-second windows inside a chapter');
  assert.equal(statSync(new URL('../public/assets/audio/environment/'+manifest[name].file,import.meta.url)).size,manifest[name].bytes);
 }
});
test('ambience follows the sky continuously through every chapter and arbitrary seeks',()=>{
 for(let t=0;t<600;t+=.125){
  const mix=environmentMix(t),sky=descentAt(t);
  assert.ok(mix.length>=1&&mix.length<=2);
  assert.ok(Math.abs(mix.reduce((s,b)=>s+b.weight,0)-1)<.000001);
  assert.ok(Math.abs((mix.find(b=>b.name==='space')?.weight??0)-sky.cosmic)<.000001);
  assert.ok(Math.abs((mix.find(b=>b.name==='heaven')?.weight??0)-sky.beyond)<.000001);
 }
 for(const t of [21,30,51,69,126,144,241,259,362,380,454,472,492,498,510,528,1008]){
  const a=environmentMix(t-.0001),b=environmentMix(t+.0001);
  for(const name of Object.keys(manifest))assert.ok(Math.abs((a.find(b=>b.name===name)?.weight??0)-(b.find(b=>b.name===name)?.weight??0))<.0001);
 }
 assert.deepEqual(environmentMix(NaN),environmentMix(0));
});
