import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENEMY_SPAWN,ENEMY_EMERGE} from '../src/enemy-audio';
import {SOUND_NAMES} from '../src/audio';
import {World,idleInput,v} from '../src/simulation';

test('all emerging creatures have distinct physical arrival recordings and pedes have separate surface cues',()=>{
 const manifest=JSON.parse(readFileSync('public/assets/audio/remake/manifest.json','utf8'));
 const recipes=JSON.parse(readFileSync('assets/provenance/remake/audio/recipes.json','utf8'));
 const sources=JSON.parse(readFileSync('assets/provenance/remake/audio/sources.json','utf8'));
 const byFile=new Map(sources.map((r:any)=>[r.file,r.name]));
 const names=[...Object.values(ENEMY_SPAWN),...Object.values(ENEMY_EMERGE)];
 assert.equal(names.length,16);assert.equal(new Set(names).size,16);
 const hashes=new Set();
 for(const name of names){
  const asset=manifest[name],recipe=recipes[name];
  assert(SOUND_NAMES.includes(name));assert.equal(asset.role,'enemy-spawn');assert.equal(asset.loop,false);
  assert.equal(recipe.addedReverb,false);assert(recipe.identity.length>20);
  assert(asset.peak<=.89&&asset.rms*asset.gain<.065,name+' restrained level');
  assert.equal(readFileSync('public/assets/audio/remake/'+asset.file).readUInt16LE(22),1,name+' mono spatial source');
  assert(!hashes.has(asset.sha256),name+' unique waveform');hashes.add(asset.sha256);
  for(const file of recipe.sources)assert.doesNotMatch(String(byFile.get(file)),/String Riser|FUI |8.bit|GUN|EXPL|SCIWeap|LASR/i);
 }
 const power=(name:string)=>manifest[name].rms*manifest[name].gain;
 assert(power('spawnminisquid')<power('spawnsquid')&&power('spawnsquid')<power('spawnultrasquid'),'tower weight increases with tier after gain calibration');
 assert(manifest.spawngigaspider.duration>=8.8);
 assert(manifest.spawnleviathan.duration>=8.5);
 assert(manifest.spawnminisquid.duration<manifest.spawnsquid.duration&&manifest.spawnsquid.duration<manifest.spawnultrasquid.duration);
 for(const kind of ['centipede','gigapede','ghostpede'] as const)assert.notEqual(ENEMY_SPAWN[kind],ENEMY_EMERGE[kind]);
});
test('new physical digging sources preserve online provenance and precise excerpt metadata',()=>{
 const sources=JSON.parse(readFileSync('assets/provenance/remake/audio/sources.json','utf8'));
 for(const name of ['DIG002.wav','DIG043.wav','DIG056.wav']){
  const source=sources.find((r:any)=>r.name===name);assert(source);
  assert.match(source.url,/^https:\/\/gamesounds.xyz\//);assert.equal(source.library,'TheWorkRoom Audio Post - Digging');
  assert.equal(source.license,'Sonniss-GDC-2026-08-27');assert.equal(source.excerptDuration,16);assert(source.sourceByteRange[1]>source.sourceByteRange[0]);
 }
});
test('all three pedes emit a surface cue; ghostpede and legacy entrances no longer stay silent',()=>{
 for(const kind of ['centipede','gigapede','ghostpede'] as const){
  for(const legacyEnemyBehavior of [false,true]){
   const w=new World(4,{schedule:false,invulnerable:true,legacyEnemyBehavior});const enemy=w.spawn(kind,v(12,3,0));w.effects=[];
   for(let tick=0;tick<4*120;tick++)w.step(idleInput());
   const cues=w.effects.filter(e=>e.kind==='emerge'&&e.enemy===kind);
   assert.equal(cues.length,1,kind+' entrance, legacy='+legacyEnemyBehavior);
   assert.equal(enemy.hp>0,true);
  }
 }
});
