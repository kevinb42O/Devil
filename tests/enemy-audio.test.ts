import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World,v} from '../src/simulation';
import {ENEMY_KINDS} from '../src/enemy-kinds';
import {ENEMY_CHATTER,enemyAudioPosition,selectEnemyAudio} from '../src/enemy-audio';

test('every enemy has a distinct recorded signature, mono PCM and explicit identity',()=>{
 const manifest=JSON.parse(readFileSync('public/assets/audio/remake/manifest.json','utf8'));
 const recipes=JSON.parse(readFileSync('assets/provenance/remake/audio/recipes.json','utf8'));
 assert.equal(new Set(Object.values(ENEMY_CHATTER)).size,22);
 const hashes=new Set(),identities=new Set();
 for(const kind of ENEMY_KINDS){const name=ENEMY_CHATTER[kind],item=manifest[name],recipe=recipes[name];
  assert.equal(item.role,'enemy-chatter');assert.equal(recipe.addedReverb,false);assert.equal(recipe.articulationSeconds[0],0);
  const wav=readFileSync('public/assets/audio/remake/'+item.file);assert.equal(wav.readUInt16LE(22),1);
  hashes.add(item.sha256);identities.add(recipe.identity);
 }
 assert.equal(hashes.size,22);assert.equal(identities.size,22);
});
test('dense swarm preserves immediate danger, rare types and all eight bearings',()=>{
 const w=new World(1,{schedule:false}),listener=v();
 for(let i=0;i<1000;i++){const a=i*.39;const e=w.spawn('skull',v(Math.cos(a)*20,2,Math.sin(a)*20));e.age=20;}
 const urgent=w.spawn('skull',v(0,1,-1));urgent.age=20;
 const rare=w.spawn('spider2',v(-24,1,0));rare.age=20;
 const selected=selectEnemyAudio(w.enemies,listener,()=>true);
 assert.equal(selected.length,28);assert(selected.some(c=>c.enemy===urgent));assert(selected.some(c=>c.enemy===rare));assert.equal(new Set(selected.map(c=>c.sector)).size,8);
 assert.equal(selected.find(c=>c.enemy===urgent)!.scale,1.05);assert(selected.filter(c=>c.enemy.kind==='skull'&&c.enemy!==urgent).every(c=>c.scale<1));assert(selected.find(c=>c.enemy===rare)!.scale>1);
});
test('nearest living segment anchors long enemies; dead, inactive and out of range sources are excluded',()=>{
 const w=new World(1,{schedule:false}),e=w.spawn('gigapede',v(40,2,0));e.segments=[{hp:10,pos:v(-2,1,0)},{hp:0,pos:v(0,0,0)}];
 assert.deepEqual(enemyAudioPosition(e,v()),v(-2,1,0));
 const dead=w.spawn('skull',v(1,0,0));dead.hp=0;
 w.spawn('skull',v(100,0,0));const hidden=w.spawn('spider',v(3,0,0));
 assert.deepEqual(selectEnemyAudio(w.enemies,v(),x=>x!==hidden).map(c=>c.enemy.id),[e.id]);
});
test('continuity prevents marginal voice churn but cannot displace immediate danger',()=>{
 const w=new World(1,{schedule:false});for(let i=0;i<35;i++)w.spawn('skull',v(10+i*.01,0,0));
 const retained=new Set(w.enemies.slice(-20).map(e=>e.id));const result=selectEnemyAudio(w.enemies,v(),()=>true,retained);
 for(const e of w.enemies.slice(0,8))assert(result.some(c=>c.enemy===e));
 assert(result.filter(c=>retained.has(c.enemy.id)).length>=19);
});

test('same-kind swarm chatter keeps a constant power budget',()=>{
 const w=new World(1,{schedule:false});
 for(let i=0;i<28;i++)w.spawn('skull',v(3,1,0));
 const selected=selectEnemyAudio(w.enemies,v(),()=>true);
 const power=selected.reduce((sum,c)=>sum+c.scale*c.scale,0);
 assert.ok(Math.abs(power-1.44)<1e-9,'adding identical voices must not multiply the noise floor');
});

 test('distant same-kind voices cannot erase an approaching enemy bearing',()=>{
 const w=new World(1,{schedule:false}),urgent=w.spawn('skull',v(0,1,-2));
 const alone=selectEnemyAudio(w.enemies,v(),()=>true)[0].scale;
 for(let i=0;i<27;i++)w.spawn('skull',v(20,1,i*.02));
 const selected=selectEnemyAudio(w.enemies,v(),()=>true),near=selected.find(c=>c.enemy===urgent)!;
 assert(near.scale/alone>.85,'nearest cue loses less than 1.2 dB in a full swarm');
 assert(selected.filter(c=>c.enemy!==urgent).every(c=>c.scale<near.scale/5));
 assert(Math.abs(selected.reduce((sum,c)=>sum+c.scale*c.scale,0)-1.44)<1e-9);
 });
