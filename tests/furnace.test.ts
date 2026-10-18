import test from 'node:test';import assert from 'node:assert/strict';
import {FURNACE_EMITTERS,furnaceAt} from '../src/furnace';
import {arenaRadius} from '../src/arena';
import {descentAt} from '../src/descent';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import manifestMain from '../src/furnace-flame-manifest.json';
import secondary from '../src/furnace-flame-secondary.json';
test('furnace fire follows its sky and the stone warms and cools without a timeline discontinuity',()=>{
 assert.deepEqual(furnaceAt(200),{fire:0,heat:0});assert.equal(furnaceAt(241).fire,0);assert.equal(furnaceAt(259).fire,1);assert.equal(furnaceAt(300).heat,1);assert.equal(furnaceAt(380).fire,0);assert.ok(furnaceAt(390).heat>0);assert.deepEqual(furnaceAt(410),{fire:0,heat:0});
 for(let t=220;t<420;t+=.1){const s=descentAt(t);assert.equal(furnaceAt(t).fire,s.chapter===2?s.blend:s.chapter===3?1-s.blend:0);}
});
test('every flame stays below/outside the playable deck with a clear gap, in both quality presets',()=>{
 for(const t of [241,259,300,362,380])for(const e of FURNACE_EMITTERS){assert.ok(Math.hypot(e.x,e.z)-e.width/2>arenaRadius(t)+6);assert.ok(e.y< -6);}
 assert.ok(FURNACE_EMITTERS.every(e=>e.y+e.height>0),'distant tongues rise into view');
 for(const count of [16,24]){const quadrants=[0,0,0,0];for(const e of FURNACE_EMITTERS.slice(0,count))quadrants[Number(e.x>0)+2*Number(e.z>0)]++;assert.ok(quadrants.every(c=>c>=2));}
});
test('selected real-flame atlas is intact and source/licence are recorded',()=>{
 for(const manifest of [manifestMain,secondary]){
 const bytes=readFileSync(new URL('../public/assets/environment/furnace/'+manifest.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);assert.equal(bytes.length,manifest.bytes);assert.equal(manifest.frames,64);assert.ok(manifest.bytes<1500000);assert.ok(manifest.source.license.includes('Stock Video Free'));
 }
});
