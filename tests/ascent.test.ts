import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ascentAt,createAscentState} from '../src/ascent-state';
import {AscentRush} from '../src/ascent-rush';
import manifest from '../src/ascent-audio-manifest.json';

test('launch accelerates, coasts smoothly, and only appears on the upward escape',()=>{
 assert.ok(ascentAt(481.5).charge>0);assert.equal(ascentAt(481.5).amount,0);
 assert.ok(ascentAt(484).speed<ascentAt(488).speed);assert.ok(ascentAt(488).length>ascentAt(484).length);
 assert.ok(ascentAt(491).speed>ascentAt(492).speed);assert.equal(ascentAt(494).amount,0);
 for(const t of [0,30,144,380,472,504,510,519,528,750])assert.equal(ascentAt(t).amount,0);
 for(const t of [482,482.65,490,490.2,493,493.4]){
  const a=ascentAt(t-.00001),b=ascentAt(t+.00001);
  for(const key of ['amount','distance','length','shock'] as const)assert.ok(Math.abs(a[key]-b[key])<.005,`${key} at ${t}`);
 }
 for(const t of [481,484,486,490,493])assert.deepEqual(ascentAt(t),ascentAt(t+510));
 const out=createAscentState();ascentAt(1000,out);assert.deepEqual(ascentAt(486,out),ascentAt(486));
});
test('rush is batched, reversible and completely disabled with reduced motion',()=>{
 const rush=new AscentRush(new THREE.Scene()),camera=new THREE.PerspectiveCamera();
 rush.configure('high');rush.update(camera,486);assert.equal(rush.group.visible,true);assert.equal(rush.diagnostics.streaks,640);
 const distance=rush.diagnostics.distance;rush.update(camera,490);rush.update(camera,486);assert.equal(rush.diagnostics.distance,distance);
 rush.configure('low',true);rush.update(camera,486);assert.equal(rush.group.visible,false);assert.equal(rush.uniforms.rushAmount.value,0);
 rush.configure('low');rush.update(camera,996);assert.equal(rush.group.visible,true);assert.equal(rush.diagnostics.streaks,240);
 rush.update(camera,1008);assert.equal(rush.group.visible,false);
 rush.update(camera,486,false);assert.equal(rush.group.visible,false);
 assert.equal(rush.group.children.length,4);
});
test('the mastered launch sound matches its provenance and remains bounded',()=>{
 const data=readFileSync(new URL('../public/assets/audio/environment/'+manifest.file,import.meta.url));
 assert.equal(data.length,manifest.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),manifest.sha256);
 assert.equal(manifest.duration,14);assert.ok(manifest.rms>.08&&manifest.rms<.18);assert.ok(manifest.peak<.7);
 const sources=JSON.parse(readFileSync(new URL('../assets/provenance/ascent-audio/sources.json',import.meta.url),'utf8'));
 assert.equal(sources.length,1);assert.equal(sources[0].key,'booster');assert.ok(sources.every((s:{license:string;page:string;sha256:string})=>s.license==='CC0-1.0'&&s.page.startsWith('https://freesound.org/')&&s.sha256.length===64));
});
